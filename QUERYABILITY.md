# Cross-Pipeline Queryability Design

## The Challenge

X-Ray needs to support queries like **"Show me all runs where filtering eliminated >90% of candidates"** across completely different pipelines:

- **Competitor Selection**: Filters products by price, rating, category
- **Listing Optimization**: Filters content variations by quality score
- **Product Categorization**: Filters category matches by confidence
- **Recommendation Engine**: Filters items by user preferences
- **Content Moderation**: Filters posts by safety scores
- **Fraud Detection**: Filters transactions by risk scores

Each pipeline has different:
- Step names (`filtering`, `quality-filter`, `category-filter`, `safety-check`)
- Data structures (products, content, categories, transactions)
- Filter criteria (price ranges, quality scores, confidence thresholds)

Yet we want **one query** to work across all of them.

## Solution: Convention-Based Architecture

### 1. Standard Step Types

**Core Convention**: Use semantic step types, not pipeline-specific names.

```javascript
// ✅ GOOD - Uses standard type
xray.recordStep({
  name: 'price-filter',  // Pipeline-specific name is fine
  type: 'filter',        // Standard type enables cross-pipeline queries
  // ...
});

// ❌ BAD - Custom type breaks queries
xray.recordStep({
  name: 'price-filter',
  type: 'price-filtering',  // Custom type won't be found by queries
  // ...
});
```

**Standard Types:**
- `filter` - Steps that eliminate items based on criteria
- `rank` - Steps that order/score items
- `llm` - Steps using language models
- `search` - Steps that retrieve candidates
- `transform` - Steps that modify data structure
- `validate` - Steps that check validity
- `aggregate` - Steps that combine data

### 2. Data Shape Conventions

**For Filter Steps:**

```javascript
xray.recordStep({
  type: 'filter',
  // REQUIRED: Items before filtering
  candidates: [...],  // Array of items considered
  
  // REQUIRED: Items filtered out (with reasons)
  filtered: [
    { candidate: {...}, reasons: ['price_out_of_range'] },
    { candidate: {...}, reasons: ['low_rating'] },
  ],
  
  // OPTIONAL: Summary counts in output
  output: {
    passed: 30,
    filtered: 4970,
  },
});
```

**Why this works:**
- Query looks for `type === 'filter'` (works across pipelines)
- Query checks `candidates` and `filtered` arrays (standard fields)
- Query computes: `eliminationRate = filtered.length / (candidates.length + filtered.length)`
- Works regardless of what `candidates` contains (products, content, categories, etc.)

### 3. Flexible Data Structures

**Key Insight**: The query doesn't care what's *inside* the candidates array, only that it exists and has a length.

```javascript
// Competitor Selection - candidates are products
candidates: [
  { id: 'prod_1', price: 29.99, rating: 4.5, ... },
  { id: 'prod_2', price: 15.00, rating: 2.1, ... },
]

// Listing Optimization - candidates are content variations
candidates: [
  { id: 'var_1', qualityScore: 0.95, wordCount: 200, ... },
  { id: 'var_2', qualityScore: 0.45, wordCount: 50, ... },
]

// Product Categorization - candidates are category matches
candidates: [
  { categoryId: 'cat_123', confidence: 0.92, ... },
  { categoryId: 'cat_456', confidence: 0.65, ... },
]
```

**All work with the same query** because:
1. They're all arrays
2. They all have `length` or `_summarized.total`
3. The query only needs counts, not content

### 4. Summarization Support

**Handles Large Datasets:**

```javascript
// Even with 5,000 candidates summarized to 100 samples
candidates: {
  _summarized: true,
  total: 5000,        // Query uses this
  sample: [...],       // For debugging only
  sampleSize: 100,
}

// Query still works:
const totalCandidates = candidates._summarized 
  ? candidates.total 
  : candidates.length;
```

### 5. Query API Implementation

**Current Implementation:**

```javascript
// GET /api/query/filter-elimination?threshold=90&pipeline=competitor-selection

app.get('/api/query/filter-elimination', (req, res) => {
  const { threshold = 90, pipeline } = req.query;
  
  // Get all runs (optionally filtered by pipeline)
  const allRuns = pipeline
    ? runs.filter(r => r.pipeline === pipeline)
    : runs;  // Cross-pipeline if no filter
  
  const matches = [];
  
  allRuns.forEach(run => {
    run.steps.forEach(step => {
      // Convention 1: Look for type === 'filter'
      if (step.type === 'filter' && step.candidates && step.filtered) {
        
        // Convention 2: Handle summarized arrays
        const totalCandidates = step.candidates._summarized
          ? step.candidates.total
          : step.candidates.length;
        
        const totalFiltered = step.filtered._summarized
          ? step.filtered.total
          : step.filtered.length;
        
        // Convention 3: Compute elimination rate
        const totalInput = totalCandidates + totalFiltered;
        const eliminationRate = totalFiltered / totalInput;
        
        if (eliminationRate >= threshold / 100) {
          matches.push({
            runId: run.runId,
            pipeline: run.pipeline,  // Shows which pipeline
            stepName: step.name,     // Pipeline-specific name
            eliminationRate: eliminationRate * 100,
            // ...
          });
        }
      }
    });
  });
  
  return matches;  // Works across all pipelines!
});
```

## Handling Variability

### Different Pipeline Structures

**Example 1: Competitor Selection**
```javascript
// Step 1: Search (type: 'search')
xray.recordStep({
  name: 'candidate-search',
  type: 'search',
  output: { candidates: 5000 },
  candidates: [...],  // Products
});

// Step 2: Filter (type: 'filter')
xray.recordStep({
  name: 'filtering',
  type: 'filter',
  candidates: [...],  // 5000 products
  filtered: [...],     // 4970 filtered out
});
```

**Example 2: Listing Optimization**
```javascript
// Step 1: Generate (type: 'llm')
xray.recordStep({
  name: 'content-generation',
  type: 'llm',
  output: { variations: 200 },
  candidates: [...],  // Content variations
});

// Step 2: Filter (type: 'filter')
xray.recordStep({
  name: 'quality-filter',
  type: 'filter',
  candidates: [...],  // 200 variations
  filtered: [...],     // 180 filtered out (low quality)
});
```

**Example 3: Product Categorization**
```javascript
// Step 1: Match (type: 'search')
xray.recordStep({
  name: 'category-matching',
  type: 'search',
  output: { matches: 50 },
  candidates: [...],  // Category matches
});

// Step 2: Filter (type: 'filter')
xray.recordStep({
  name: 'confidence-filter',
  type: 'filter',
  candidates: [...],  // 50 matches
  filtered: [...],    // 45 filtered out (low confidence)
});
```

**All three work with the same query** because they all:
- Use `type: 'filter'`
- Include `candidates` and `filtered` arrays
- Follow the same data shape convention

### Custom Metadata for Pipeline-Specific Queries

**For pipeline-specific queries, use metadata:**

```javascript
// Competitor Selection - add price-specific metadata
xray.recordStep({
  type: 'filter',
  candidates: [...],
  filtered: [...],
  metadata: {
    filterCriteria: {
      priceRange: [10, 100],
      minRating: 3.5,
    },
  },
});

// Listing Optimization - add quality-specific metadata
xray.recordStep({
  type: 'filter',
  candidates: [...],
  filtered: [...],
  metadata: {
    filterCriteria: {
      minQualityScore: 0.7,
      minWordCount: 100,
    },
  },
});
```

**Pipeline-specific query:**
```javascript
// GET /api/query/filter-elimination?threshold=90&metadata.filterCriteria.minRating=3.5
// This would require a more advanced query endpoint
```

## Developer Constraints & Guidelines

### Required Conventions

1. **Use Standard Step Types**
   - ✅ `filter`, `rank`, `llm`, `search`, `transform`
   - ❌ Custom types like `price-filter`, `quality-check`

2. **Filter Steps Must Include**
   - `candidates`: Array of items before filtering
   - `filtered`: Array of items filtered out (with reasons if possible)
   - `type: 'filter'`

3. **Rank Steps Must Include**
   - `candidates`: Array in ranked order
   - `type: 'rank'`

4. **Handle Summarization**
   - Use `candidateLimit` and `filteredLimit` for large arrays
   - Query will work with summarized data

### Optional but Recommended

1. **Include Reasoning**
   ```javascript
   reasoning: 'Applied price, rating, and category filters'
   ```

2. **Include Output Counts**
   ```javascript
   output: { passed: 30, filtered: 4970 }
   ```

3. **Include Filter Reasons**
   ```javascript
   filtered: [
     { candidate: {...}, reasons: ['price_out_of_range', 'low_rating'] }
   ]
   ```

## Extensibility for Future Use Cases

### Adding New Query Types

**Pattern for new queries:**

1. **Define Convention**: What step type? What fields needed?
2. **Implement Query**: Follow same pattern as filter-elimination
3. **Document Convention**: Update docs with requirements

**Example: "Show runs where ranking changed top candidate"**

```javascript
// Convention: rank steps must include candidates array
// Query looks for type === 'rank' and checks if first candidate
// in candidates array matches final output

app.get('/api/query/ranking-changes', (req, res) => {
  const matches = [];
  
  runs.forEach(run => {
    run.steps.forEach(step => {
      if (step.type === 'rank' && step.candidates && run.output) {
        const topRanked = step.candidates[0];
        const finalSelected = run.output.selected;
        
        if (topRanked.id !== finalSelected.id) {
          matches.push({
            runId: run.runId,
            pipeline: run.pipeline,
            topRanked: topRanked,
            finalSelected: finalSelected,
          });
        }
      }
    });
  });
  
  return matches;
});
```

### Supporting Custom Step Types

**For pipelines that need custom types:**

```javascript
// Custom type for specialized pipeline
xray.recordStep({
  type: 'fraud-detection',  // Custom type
  // ...
});

// Custom query endpoint for this type
app.get('/api/query/fraud-patterns', (req, res) => {
  // Looks for type === 'fraud-detection'
  // Pipeline-specific logic
});
```

**Trade-off**: Custom types work, but won't be found by standard cross-pipeline queries.

## Real-World Examples

### Example 1: E-commerce Competitor Selection
```javascript
xray.recordStep({
  name: 'product-filtering',
  type: 'filter',
  candidates: [/* 5000 products */],
  filtered: [/* 4970 products */],
  reasoning: 'Filtered by price range, rating, and category match',
});
```

### Example 2: Content Moderation
```javascript
xray.recordStep({
  name: 'safety-filter',
  type: 'filter',
  candidates: [/* 10000 posts */],
  filtered: [/* 9500 posts */],
  reasoning: 'Filtered posts with safety score < 0.8',
});
```

### Example 3: Medical Diagnosis
```javascript
xray.recordStep({
  name: 'symptom-filter',
  type: 'filter',
  candidates: [/* 500 conditions */],
  filtered: [/* 450 conditions */],
  reasoning: 'Filtered conditions not matching patient symptoms',
});
```

**All queryable with:**
```
GET /api/query/filter-elimination?threshold=90
```

Returns matches from all three pipelines!

## Summary

**How Cross-Pipeline Queries Work:**

1. **Semantic Types**: `type: 'filter'` works across all pipelines
2. **Standard Fields**: `candidates` and `filtered` arrays are universal
3. **Flexible Content**: Query doesn't care what's inside arrays, only counts
4. **Summarization Support**: Works with summarized large datasets
5. **Pipeline Identity**: Results include `pipeline` field to identify source

**Developer Requirements:**

- Use standard step types (`filter`, `rank`, etc.)
- Include required fields (`candidates`, `filtered` for filter steps)
- Follow data shape conventions
- Use metadata for pipeline-specific data

**Result:**

One query works across millions of different use cases, as long as they follow the conventions!

