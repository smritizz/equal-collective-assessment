# How Cross-Pipeline Queries Work

## The Problem We're Solving

So here's the thing - we need to support queries like **"show me all runs where filtering eliminated >90% of candidates"** but across totally different pipelines. Like, think about it:

- **Competitor Selection**: filtering products by price, rating, category
- **Listing Optimization**: filtering content variations by quality score  
- **Product Categorization**: filtering category matches by confidence
- **Recommendation Engine**: filtering items by user preferences
- **Content Moderation**: filtering posts by safety scores
- **Fraud Detection**: filtering transactions by risk scores

Each pipeline has completely different stuff going on:
- Different step names (`filtering`, `quality-filter`, `category-filter`, `safety-check`)
- Different data (products vs content vs categories vs transactions)
- Different filter rules (price ranges vs quality scores vs confidence thresholds)

But we still want **one query** that works everywhere. That's the challenge.

## The Solution: Just Use Conventions

### Standard Step Types Are Your Friend

**The key idea**: use semantic step types, not pipeline-specific names. It's pretty simple.

```javascript
// ✅ This works great
xray.recordStep({
  name: 'price-filter',  // name can be whatever
  type: 'filter',        // type is standardized - this is what matters
  // ...
});

// ❌ Don't do this
xray.recordStep({
  name: 'price-filter',
  type: 'price-filtering',  // custom types break cross-pipeline queries
  // ...
});
```

**Standard types we're using:**
- `filter` - when you're eliminating items based on some criteria
- `rank` - when you're ordering/scoring things
- `llm` - when you're calling a language model
- `search` - when you're retrieving candidates from somewhere
- `transform` - when you're modifying data structure
- `validate` - checking if stuff is valid
- `aggregate` - combining data

### Data Shape Conventions (For Filter Steps)

Here's what filter steps should look like:

```javascript
xray.recordStep({
  type: 'filter',
  // Items before filtering (required)
  candidates: [...],  
  
  // Items you filtered out, with reasons why (required)
  filtered: [
    { candidate: {...}, reasons: ['price_out_of_range'] },
    { candidate: {...}, reasons: ['low_rating'] },
  ],
  
  // Optional summary counts
  output: {
    passed: 30,
    filtered: 4970,
  },
});
```

**Why this works so well:**
- The query just looks for `type === 'filter'` (boom, works everywhere)
- It checks for `candidates` and `filtered` arrays (standard fields)
- Then it computes: `eliminationRate = filtered.length / (candidates.length + filtered.length)`
- Doesn't matter what's actually *in* the candidates array - products, content, categories, whatever

### The Magic: Flexible Data Structures

This is the cool part - the query doesn't actually care what's inside your candidates array, just that it exists and has a length.

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

**They all work with the same query** because:
1. They're all just arrays
2. They all have `.length` (or `._summarized.total` for big ones)
3. The query only cares about counts, not the actual content

### Handling Large Datasets

Sometimes you've got like 5,000 candidates and you don't want to store all that. No problem:

```javascript
// Summarized version
candidates: {
  _summarized: true,
  total: 5000,        // this is what the query uses
  sample: [...],       // just for debugging
  sampleSize: 100,
}

// Query adapts automatically:
const totalCandidates = candidates._summarized 
  ? candidates.total 
  : candidates.length;
```

Easy.

### The Query Implementation

Here's what the actual query looks like:

```javascript
// GET /api/query/filter-elimination?threshold=90&pipeline=competitor-selection

app.get('/api/query/filter-elimination', (req, res) => {
  const { threshold = 90, pipeline } = req.query;
  
  // optionally filter by pipeline, or search all of them
  const allRuns = pipeline
    ? runs.filter(r => r.pipeline === pipeline)
    : runs;
  
  const matches = [];
  
  allRuns.forEach(run => {
    run.steps.forEach(step => {
      // look for the 'filter' type (convention #1)
      if (step.type === 'filter' && step.candidates && step.filtered) {
        
        // handle both regular and summarized arrays (convention #2)
        const totalCandidates = step.candidates._summarized
          ? step.candidates.total
          : step.candidates.length;
        
        const totalFiltered = step.filtered._summarized
          ? step.filtered.total
          : step.filtered.length;
        
        // compute the elimination rate (convention #3)
        const totalInput = totalCandidates + totalFiltered;
        const eliminationRate = totalFiltered / totalInput;
        
        if (eliminationRate >= threshold / 100) {
          matches.push({
            runId: run.runId,
            pipeline: run.pipeline,  // so you know where it came from
            stepName: step.name,
            eliminationRate: eliminationRate * 100,
            // ...
          });
        }
      }
    });
  });
  
  return matches;  // works across all pipelines!
});
```

## Examples from Different Pipelines

Let me show you how this plays out in practice.

**Competitor Selection:**
```javascript
// Step 1: Search
xray.recordStep({
  name: 'candidate-search',
  type: 'search',
  output: { candidates: 5000 },
  candidates: [...],  // products
});

// Step 2: Filter
xray.recordStep({
  name: 'filtering',
  type: 'filter',
  candidates: [...],  // 5000 products
  filtered: [...],     // 4970 filtered out
});
```

**Listing Optimization:**
```javascript
// Step 1: Generate variations
xray.recordStep({
  name: 'content-generation',
  type: 'llm',
  output: { variations: 200 },
  candidates: [...],  // content variations
});

// Step 2: Filter by quality
xray.recordStep({
  name: 'quality-filter',
  type: 'filter',
  candidates: [...],  // 200 variations
  filtered: [...],     // 180 filtered out
});
```

**Product Categorization:**
```javascript
// Step 1: Match categories
xray.recordStep({
  name: 'category-matching',
  type: 'search',
  output: { matches: 50 },
  candidates: [...],  // category matches
});

// Step 2: Filter by confidence
xray.recordStep({
  name: 'confidence-filter',
  type: 'filter',
  candidates: [...],  // 50 matches
  filtered: [...],    // 45 filtered out
});
```

All three work with the same query because they follow the conventions:
- `type: 'filter'`
- `candidates` and `filtered` arrays
- Same data shape

### Pipeline-Specific Queries

If you need pipeline-specific stuff, just throw it in metadata:

```javascript
// Competitor Selection
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

// Listing Optimization
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

Then you can query on that metadata if you want (though you'd need a more advanced query endpoint for that).

## Rules to Follow

### You Have To Do These Things

1. **Use the standard step types**
   - Good: `filter`, `rank`, `llm`, `search`, `transform`
   - Bad: custom types like `price-filter` or `quality-check`

2. **Filter steps need these fields**
   - `candidates`: array of items before filtering
   - `filtered`: array of filtered items (ideally with reasons)
   - `type: 'filter'`

3. **Rank steps need these fields**
   - `candidates`: array in ranked order
   - `type: 'rank'`

4. **Handle big arrays properly**
   - Use `candidateLimit` and `filteredLimit` to summarize
   - Queries will work either way

### You Should Probably Do These Too

1. **Add reasoning strings**
   ```javascript
   reasoning: 'Applied price, rating, and category filters'
   ```

2. **Add output counts**
   ```javascript
   output: { passed: 30, filtered: 4970 }
   ```

3. **Explain why things got filtered**
   ```javascript
   filtered: [
     { candidate: {...}, reasons: ['price_out_of_range', 'low_rating'] }
   ]
   ```

## Adding New Query Types

Want to add a new cross-pipeline query? Here's the pattern:

1. **Define the convention**: what step type? what fields?
2. **Write the query**: follow the same pattern as filter-elimination
3. **Document it**: update the docs

**Example: finding runs where ranking changed the top candidate**

```javascript
// Convention: rank steps must have a candidates array
// Query checks if first candidate matches the final output

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

### What About Custom Step Types?

You can use them if you really want:

```javascript
// Custom type for specialized stuff
xray.recordStep({
  type: 'fraud-detection',
  // ...
});

// Custom query endpoint
app.get('/api/query/fraud-patterns', (req, res) => {
  // looks for type === 'fraud-detection'
  // your custom logic here
});
```

**Trade-off**: this works fine, but standard cross-pipeline queries won't find it. So only do this if you really need pipeline-specific behavior.

## Real Examples

**E-commerce:**
```javascript
xray.recordStep({
  name: 'product-filtering',
  type: 'filter',
  candidates: [/* 5000 products */],
  filtered: [/* 4970 products */],
  reasoning: 'Filtered by price range, rating, and category match',
});
```

**Content Moderation:**
```javascript
xray.recordStep({
  name: 'safety-filter',
  type: 'filter',
  candidates: [/* 10000 posts */],
  filtered: [/* 9500 posts */],
  reasoning: 'Filtered posts with safety score < 0.8',
});
```

**Medical Diagnosis:**
```javascript
xray.recordStep({
  name: 'symptom-filter',
  type: 'filter',
  candidates: [/* 500 conditions */],
  filtered: [/* 450 conditions */],
  reasoning: 'Filtered conditions not matching patient symptoms',
});
```

**All queryable with the same endpoint:**
```
GET /api/query/filter-elimination?threshold=90
```

You'll get matches from all three pipelines. Pretty cool.

## TL;DR

**How it works:**

1. Use semantic types like `type: 'filter'` - works everywhere
2. Use standard fields like `candidates` and `filtered` - universal convention
3. Content inside arrays can be whatever - query just counts them
4. Handles summarization automatically for big datasets
5. Results include `pipeline` field so you know where stuff came from

**What you need to do:**

- Use standard step types (`filter`, `rank`, etc.)
- Include the required fields (`candidates`, `filtered` for filters)
- Follow the data shape conventions
- Put pipeline-specific stuff in metadata

**The payoff:**

One query works across completely different pipelines. As long as you follow the conventions, everything just works. That's the whole idea.
