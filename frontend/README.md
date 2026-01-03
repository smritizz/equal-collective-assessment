# X-Ray Frontend

React-based UI for visualizing and exploring X-Ray pipeline runs.

## Features

- Interactive demo of three different algorithmic pipelines:
  - Competitor Selection
  - Listing Optimization
  - Product Categorization
- Real-time visualization of pipeline execution
- Detailed step-by-step inspection
- Cross-pipeline queries

## Development

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm start
```

Runs on `http://localhost:3000`

### Build for Production

```bash
npm run build
```

## Structure

- `src/xray-sdk/` - X-Ray SDK client library
- `src/demo/` - Demo pipeline implementations
- `src/App.js` - Main React application
- `public/` - Static assets

## Configuration

The frontend connects to the backend API at `http://localhost:3001/api` by default. This can be configured in `src/App.js` when initializing the X-Ray SDK.

