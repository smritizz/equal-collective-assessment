# X-Ray SDK Architecture

## Overview

X-Ray is a debugging system for multi-step, non-deterministic algorithmic pipelines. Unlike traditional tracing tools that answer "what happened," X-Ray answers "why did the system make this decision?"

## Data Model

### Core Entities

```
Run
├── runId (string, unique)
├── pipeline (string) - e.g., "competitor-selection"
├── input (object) - Initial input data
├── output (object) - Final output
├── status (string) - "running" | "success" | "error"
├── startTime (ISO timestamp)
├── endTime (ISO timestamp)
├── duration (number, ms)
├── metadata (object) - Custom metadata
└── steps (array<Step>)

Step
├── stepId (string, unique)
├── runId (string) - Foreign key to Run
├── name (string) - e.g., "keyword-generation"
├── type (string) - "llm" | "filter" | "search" | "rank" | "transform"
├── input (object) - Step input
├── output (object) - Step output
├── candidates (array | SummarizedArray) - Items considered
├── filtered (array | SummarizedArray) - Items filtered out
├── metadata (object) - Step-specific metadata
├── reasoning (string) - Human-readable explanation
├── timestamp (ISO timestamp)
└── duration (number, ms)

SummarizedArray
├── _summarized (boolean, true)
├── total (number) - Total count
├── sample (array) - Sample of items
├── sampleSize (number) - Size of sample
└── summary (object) - Statistical summary (optional)
```

### Data Model Rationale

**Why this structure?**

1. **Run-centric design**: All steps belong to a run, enabling end-to-end traceability. This mirrors how developers think about debugging—starting from a failed output and tracing back through steps.

2. **Step as first-class entity**: Steps are stored independently, not just nested in runs. This enables cross-run queries like "show all filtering steps that eliminated >90% of candidates."

3. **Flexible input/output**: Using generic objects allows any pipeline to instrument without schema constraints. The SDK doesn't enforce structure—developers define what's meaningful.

4. **Summarization for scale**: Large arrays (candidates, filtered items) are automatically summarized when exceeding limits. This balances completeness with storage costs.

**Alternatives considered:**

- **Nested-only model**: Steps only stored within runs. Rejected because it prevents efficient cross-run queries.
- **Event-sourcing**: Store raw events, reconstruct runs. Rejected for complexity—most queries need run/step structure.
- **Strict schema**: Enforce typed inputs/outputs. Rejected for flexibility—different pipelines have different data shapes.

**What would break with different choices?**

- Without summarization: Storage costs explode with large candidate sets (e.g., 5,000 candidates × 1,000 runs = millions of records).
- Without step independence: Cross-run queries require scanning all runs, inefficient at scale.
- Without flexible schema: Each new pipeline type requires SDK changes.

## System Design

### Architecture Diagram

```
┌─────────────────┐
│  Developer Code │
│  (Pipeline)     │
└────────┬────────┘
         │
         │ Uses SDK
         ▼
┌─────────────────┐
│   X-Ray SDK     │
│  - startRun()   │
│  - recordStep() │
│  - endRun()     │
└────────┬────────┘
         │
         │ HTTP POST /api/ingest
         │ (batched, async)
         ▼
┌─────────────────┐
│   X-Ray API     │
│  - /ingest      │
│  - /runs        │
│  - /steps       │
│  - /query/*     │
└────────┬────────┘
         │
         │ Stores
         ▼
┌─────────────────┐
│   Storage       │
│  (In-memory for │
│   demo, DB in   │
│   production)   │
└─────────────────┘
```

### SDK Design

**Core API:**

```javascript
// Initialize
const xray = initXRay({ apiUrl, enabled, metadata });

// Start a run
const runId = xray.startRun({ pipeline, input, metadata });

// Record a step
const stepId = xray.recordStep({
  name, type, input, output,
  candidates, filtered, reasoning
});

// End run
xray.endRun({ status, output, error });
```

**Key design decisions:**

1. **Singleton pattern**: Default instance via `getXRay()` for convenience, but supports multiple instances.
2. **Async, non-blocking**: All API calls are async and don't block pipeline execution.
3. **Graceful degradation**: If API is unavailable, SDK continues silently (configurable error handler).
4. **Batching**: Events batched before sending to reduce API calls.

### API Design

**Endpoints:**

```
POST /api/ingest
  Body: { events: [{ type, data, timestamp }] }
  Response: { success: true, processed: number }

GET /api/runs
  Query params: pipeline, status, startTime, endTime, minSteps, maxSteps, limit, offset
  Response: { runs: [...], total, limit, offset }

GET /api/runs/:runId
  Response: { runId, pipeline, input, output, steps: [...], ... }

GET /api/steps
  Query params: runId, name, type, pipeline, limit, offset
  Response: { steps: [...], total, limit, offset }

GET /api/query/filter-elimination
  Query params: threshold (default 90), pipeline
  Response: { matches: [...], count: number }

GET /api/pipelines
  Response: { pipelines: [...] }

GET /api/pipelines/:pipeline/stats
  Response: { pipeline, stats: { totalRuns, successCount, ... } }
```

## Debugging Walkthrough

**Scenario**: A competitor selection run returns a bad match—a phone case matched against a laptop stand.

**Debugging process:**

1. **Identify the run**: Query `/api/runs?pipeline=competitor-selection&status=success` and find the problematic run by output.

2. **Examine the run**: GET `/api/runs/{runId}` to see:
   - Input: `{ product: "Wireless Phone Charger Stand", ... }`
   - Output: `{ competitor: { title: "Laptop Stand", ... } }`
   - Steps: 5 steps recorded

3. **Trace through steps**:
   - **Step 1 (keyword-generation)**: Check if keywords are relevant. If keywords include "laptop" or "stand" incorrectly, that's the issue.
   - **Step 2 (candidate-search)**: Review sample candidates. Are phone charger candidates present? If not, search failed.
   - **Step 3 (filtering)**: Check filtered items. Were good candidates filtered out? Look at `filtered` array and reasons.
   - **Step 4 (relevance-evaluation)**: Review LLM reasoning. Did it incorrectly score a laptop stand as relevant?
   - **Step 5 (ranking-selection)**: Check top candidates. Was the laptop stand actually the highest-scored? If so, ranking logic may be wrong.

4. **Query for patterns**: Use `/api/query/filter-elimination?threshold=90` to see if filtering is too aggressive across runs.

**What they'd see:**

- Each step shows input, output, candidates considered, items filtered, and reasoning.
- Summarized arrays show sample + total count, so they can see if good candidates were filtered.
- Cross-step comparison: "Step 3 filtered 4,970 items, leaving 30. Step 4 evaluated those 30 and selected the laptop stand."

## Queryability

> **For detailed explanation of cross-pipeline queryability, conventions, and extensibility, see [QUERYABILITY.md](./QUERYABILITY.md)**

### Cross-Pipeline Queries

**Challenge**: Different pipelines have different step names/types, but we want queries like "show all runs where filtering eliminated >90% of candidates."

**Solution**: Convention-based approach:

1. **Step type convention**: Steps that filter should use `type: "filter"`. Steps that rank use `type: "rank"`. This enables type-based queries.

2. **Data shape convention**: Filter steps should include:
   - `candidates`: Items before filtering
   - `filtered`: Items filtered out
   - `output.passed` or `output.filtered`: Counts

3. **Query API**: `/api/query/filter-elimination` understands these conventions and works across pipelines.

**Example query implementation:**

```javascript
// Find all filter steps
const filterSteps = steps.filter(s => s.type === 'filter');

// For each, compute elimination rate
filterSteps.forEach(step => {
  const totalIn = step.candidates._summarized 
    ? step.candidates.total 
    : step.candidates.length;
  const totalFiltered = step.filtered._summarized
    ? step.filtered.total
    : step.filtered.length;
  const eliminationRate = totalFiltered / (totalIn + totalFiltered);
  // ...
});
```

**Constraints on developers:**

- Use standard step types (`filter`, `rank`, `llm`, `search`, `transform`).
- For filter steps, include `candidates` and `filtered` arrays.
- For rank steps, include `candidates` array with items in ranked order.

**Variability handling:**

- Custom step types allowed, but cross-pipeline queries may not work.
- Developers can add custom metadata for pipeline-specific queries.
- Query API can be extended with new endpoint patterns.

## Performance & Scale

### The 5,000 → 30 Problem

**Problem**: A step takes 5,000 candidates, filters to 30. Storing all 5,000 with rejection reasons is expensive.

**Solution**: Configurable summarization with developer control.

**How it works:**

1. **Automatic summarization**: SDK automatically summarizes arrays exceeding `candidateLimit` or `filteredLimit` (default 100).

2. **Developer control**: Developers can set limits per step:
   ```javascript
   xray.recordStep({
     candidates: largeArray,
     candidateLimit: 50,  // Only store 50
     filtered: filteredArray,
     filteredLimit: 200,  // Store 200 filtered items
   });
   ```

3. **What gets stored**:
   - Sample: First N items (configurable)
   - Total count
   - Statistical summary (min/max/avg for numeric fields)

**Trade-offs:**

- **Completeness vs. Storage**: Storing all 5,000 = high storage, full visibility. Summarizing = lower storage, partial visibility.
- **Who decides**: Developer decides via limits. System provides defaults (100) but allows override.
- **Query impact**: Summarized data still supports queries (e.g., "elimination rate >90%") but detailed analysis of filtered items is limited.

**Production considerations:**

- Use database with compression for large JSON fields.
- Consider separate storage tier for detailed data (hot vs. cold).
- Allow developers to mark steps as "high importance" to store more detail.

## Developer Experience

### Minimal Instrumentation

**What's the minimum to get something useful?**

```javascript
const xray = initXRay({ apiUrl: 'http://localhost:3001/api' });

// Start run
const runId = xray.startRun({
  pipeline: 'my-pipeline',
  input: initialInput,
});

// Record key steps
xray.recordStep({
  name: 'main-processing',
  type: 'transform',
  input: { data: input },
  output: { result: output },
});

// End run
xray.endRun({ status: 'success', output });
```

**Result**: Basic trace showing input → output with one step. Useful for "did this run?" and "what was the input/output?"

### Full Instrumentation

**What does full instrumentation look like?**

```javascript
// Start with metadata
const runId = xray.startRun({
  pipeline: 'competitor-selection',
  input: sellerProduct,
  metadata: { sellerId, productId, version: 'v2' },
});

// Record each step with context
xray.recordStep({
  name: 'keyword-generation',
  type: 'llm',
  input: { product: product.title },
  output: { keywords, count: keywords.length },
  reasoning: 'Generated keywords from title and category',
  duration: elapsedTime,
});

xray.recordStep({
  name: 'filtering',
  type: 'filter',
  input: { candidateCount: 5000, filters: {...} },
  output: { passed: 30, filtered: 4970 },
  candidates: passedItems,
  filtered: filteredItems,
  candidateLimit: 50,
  filteredLimit: 100,
  reasoning: 'Applied price, rating, and category filters',
});

xray.endRun({
  status: 'success',
  output: bestMatch,
});
```

**Result**: Complete visibility into decision-making at each step.

### Backend Unavailability

**What happens if X-Ray API is down?**

1. **SDK continues**: All SDK methods are non-blocking and async. If API calls fail, they're caught and logged (via `onError` handler).

2. **Pipeline unaffected**: The instrumented pipeline continues executing normally. X-Ray is purely observational.

3. **Graceful degradation**: 
   - Events are queued in `pendingEvents`
   - Failed batches are logged but not retried (to avoid blocking)
   - Developer can call `xray.flush()` manually to retry

4. **Configuration option**: `enabled: false` completely disables X-Ray for testing/development.

**Production recommendation**: Use a message queue (e.g., RabbitMQ, Kafka) between SDK and API for reliability.

## Real-World Application

**Example**: A recommendation system I worked on had a multi-step pipeline:
1. Candidate generation (collaborative filtering)
2. Content-based filtering
3. Business rule application
4. Diversity re-ranking
5. Final selection

**Problem**: When recommendations were poor, debugging required:
- Checking logs across 5 services
- Correlating timestamps manually
- Guessing which step failed

**How X-Ray would help**: 
- Single run view showing all 5 steps
- See which candidates were filtered and why
- Compare reasoning across steps
- Query for patterns (e.g., "when does diversity ranking eliminate top candidates?")

**Retrofit approach**:
- Wrap each step function with X-Ray calls
- Minimal code changes (add ~3 lines per step)
- No changes to business logic

## What Next?

**If shipping for real-world use:**

1. **Storage**: Replace in-memory with PostgreSQL/MongoDB. Add indexes on `runId`, `pipeline`, `step.type`, timestamps.

2. **Reliability**: Add message queue (RabbitMQ/Kafka) between SDK and API. Implement retry logic with exponential backoff.

3. **Performance**: 
   - Add caching for frequently accessed runs
   - Implement data retention policies (archive old runs)
   - Add compression for large JSON fields

4. **Queryability**: 
   - Add full-text search on `reasoning` fields
   - Implement more query endpoints (e.g., "runs with errors in LLM steps")
   - Add aggregation queries (e.g., "average step duration by type")

5. **Developer Experience**:
   - Add TypeScript types
   - Create framework integrations (Express middleware, React hooks)
   - Build UI dashboard (beyond this demo)

6. **Observability**:
   - Add metrics (runs/sec, API latency)
   - Add alerts (high error rates, slow steps)
   - Integrate with monitoring tools (Datadog, New Relic)

7. **Security**:
   - Add authentication/authorization
   - Encrypt sensitive data in transit and at rest
   - Add rate limiting

8. **Scale**:
   - Horizontal scaling for API (load balancer)
   - Sharding by pipeline or time
   - Consider event-sourcing for very high volume

