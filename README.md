# X-Ray SDK - Debugging Multi-Step Algorithmic Systems

X-Ray is a debugging system for multi-step, non-deterministic algorithmic pipelines. Unlike traditional tracing tools that answer "what happened," X-Ray answers "why did the system make this decision?"

## Overview

This project includes:
- **X-Ray SDK**: A lightweight JavaScript library for instrumenting pipelines
- **X-Ray API**: Node.js/Express server for ingesting and querying X-Ray data
- **React Demo App**: Interactive UI demonstrating X-Ray in action with a competitor selection pipeline

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design, data model rationale, and API specifications.

See [QUERYABILITY.md](./QUERYABILITY.md) for comprehensive explanation of cross-pipeline queryability, conventions, and how the system handles variability across different use cases.

## Setup Instructions

### Prerequisites

- Node.js 14+ and npm
- Two terminal windows (one for API server, one for React app)

### 1. Install Dependencies

```bash
# Install React app dependencies
npm install

# Install API server dependencies
cd api
npm install
cd ..
```

### 2. Start the API Server

In the first terminal:

```bash
cd api
npm start
```

The API server will run on `http://localhost:3001`

### 3. Start the React App

In the second terminal (from the project root):

```bash
npm start
```

The React app will open at `http://localhost:3000`

### 4. Run the Demo

1. Click "Run Competitor Selection Demo" in the React app
2. Watch the pipeline execute (simulated with delays)
3. View the run details to see all steps, candidates, and reasoning
4. Try the "Query: Filter Elimination >90%" button to see cross-run queries

## Approach

### Core Design Principles

1. **Run-Centric Model**: All steps belong to a run, enabling end-to-end traceability from output back to input.

2. **Step Independence**: Steps are stored independently, not just nested in runs. This enables efficient cross-run queries like "show all filtering steps that eliminated >90% of candidates."

3. **Flexible Schema**: No rigid schema enforcement—developers define what's meaningful for their pipeline. The SDK accepts any object structure.

4. **Intelligent Summarization**: Large arrays (e.g., 5,000 candidates) are automatically summarized to balance completeness with storage costs. Developers control limits per step.

5. **Non-Blocking**: SDK operations are async and never block pipeline execution. If the API is unavailable, the pipeline continues normally.

### Key Features

- **Minimal Instrumentation**: Get useful debugging info with just 3-4 SDK calls
- **Full Instrumentation**: Record detailed context at each step (candidates, filtered items, reasoning)
- **Cross-Pipeline Queries**: Convention-based approach enables queries across different pipeline types
- **Graceful Degradation**: Pipeline continues even if X-Ray backend is unavailable

### SDK Usage Example

```javascript
import { initXRay } from './xray-sdk';

// Initialize
const xray = initXRay({ apiUrl: 'http://localhost:3001/api' });

// Start a run
const runId = xray.startRun({
  pipeline: 'competitor-selection',
  input: { product: 'Wireless Phone Charger' },
});

// Record a step
xray.recordStep({
  name: 'keyword-generation',
  type: 'llm',
  input: { product },
  output: { keywords: ['wireless', 'charger', ...] },
  reasoning: 'Generated keywords from product title',
});

// End run
xray.endRun({ status: 'success', output: result });
```

## Project Structure

```
assessment/
├── src/
│   ├── xray-sdk/
│   │   └── index.js          # X-Ray SDK library
│   ├── demo/
│   │   └── CompetitorSelectionDemo.js  # Demo pipeline
│   ├── App.js                # React UI
│   └── App.css
├── api/
│   ├── server.js             # Express API server
│   └── package.json
├── ARCHITECTURE.md           # Detailed architecture document
└── README.md                 # This file
```

## API Endpoints

- `GET /health` - Health check, returns `{status, timestamp}`
- `POST /api/ingest` - Accepts `{events: []}` array from SDK, returns `{success, processed}`
- `GET /api/runs` - Query runs with filters (pipeline, status, time range, step count), returns paginated runs array
- `GET /api/runs/:runId` - Get single run by ID, returns run object with all steps
- `GET /api/steps` - Query steps across runs (by runId, name, type, pipeline), returns paginated steps array
- `GET /api/query/filter-elimination` - Find filter steps eliminating >X% candidates (threshold, pipeline params), returns matches array
- `GET /api/pipelines` - List all pipeline names, returns `{pipelines: []}`
- `GET /api/pipelines/:pipeline/stats` - Get statistics for specific pipeline, returns `{totalRuns, successCount, errorCount, avgDuration, avgStepCount}`

## Known Limitations

1. **In-Memory Storage**: The demo uses in-memory storage. Production would need a database (PostgreSQL, MongoDB, etc.).

2. **No Authentication**: The API has no authentication/authorization. Production would need security layers.

3. **No Retry Logic**: Failed API calls are logged but not retried. Production would use a message queue (RabbitMQ, Kafka).

4. **Limited Query Language**: Query endpoints are fixed. Production would benefit from a flexible query language.

5. **No Data Retention**: All data persists indefinitely. Production would need retention policies.

## Future Improvements

- Replace in-memory storage with database
- Add message queue for reliability
- Implement data retention and archiving
- Add full-text search on reasoning fields
- Build comprehensive dashboard UI
- Add TypeScript types
- Create framework integrations (Express middleware, React hooks)
- Add metrics and alerting
- Implement horizontal scaling

See [ARCHITECTURE.md](./ARCHITECTURE.md) "What Next?" section for detailed roadmap.

## Testing

The demo includes a simulated competitor selection pipeline that:
1. Generates keywords (LLM step)
2. Searches for 5,000 candidate products
3. Filters down to ~30 based on price, rating, reviews, category
4. Evaluates relevance with LLM
5. Ranks and selects the best match

Each step is instrumented with X-Ray, showing how debugging works in practice.

## License

This is an assessment project.
