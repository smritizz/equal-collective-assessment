# X-Ray Backend

Node.js/Express API server for ingesting and querying X-Ray pipeline run data.

## Features

- Event ingestion endpoint for SDK
- Rich query API for runs and steps
- Cross-pipeline queries
- Pipeline statistics

## Development

### Install Dependencies

```bash
npm install
```

### Start Server

```bash
npm start
```

Runs on `http://localhost:3001`

The server uses `nodemon` for hot reloading during development.

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Data Ingestion
- `POST /api/ingest` - Ingest events from SDK

### Run Queries
- `GET /api/runs` - List runs with optional filters
- `GET /api/runs/:runId` - Get specific run details

### Step Queries
- `GET /api/steps` - Query steps across runs

### Cross-Pipeline Queries
- `GET /api/query/filter-elimination` - Find runs with high filter elimination rates

### Pipeline Management
- `GET /api/pipelines` - List all pipelines
- `GET /api/pipelines/:pipeline/stats` - Get pipeline statistics

## Storage

Currently uses in-memory storage for demo purposes. For production use, replace with a proper database (PostgreSQL, MongoDB, etc.).

## Configuration

- `PORT` - Server port (default: 3001)
- Configured via environment variables or `.env` file

