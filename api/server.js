// X-Ray API - Ingest and query pipeline run data

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory storage (in production, use a database)
const runs = new Map(); // runId -> run data
const steps = new Map(); // stepId -> step data
const runsByPipeline = new Map(); // pipeline -> [runIds]

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Ingest events from the SDK
app.post('/api/ingest', (req, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'events must be an array' });
    }

    events.forEach(event => {
      const { type, data } = event;

      switch (type) {
        case 'run_start':
          runs.set(data.runId, {
            runId: data.runId,
            pipeline: data.pipeline,
            input: data.input,
            metadata: data.metadata,
            startTime: data.timestamp,
            steps: [],
            status: 'running',
          });

          // Index by pipeline
          if (!runsByPipeline.has(data.pipeline)) {
            runsByPipeline.set(data.pipeline, []);
          }
          runsByPipeline.get(data.pipeline).push(data.runId);
          break;

        case 'step':
          steps.set(data.stepId, data);

          // Add step to run
          const run = runs.get(data.runId);
          if (run) {
            run.steps.push(data);
          }
          break;

        case 'run_end':
          const runToEnd = runs.get(data.runId);
          if (runToEnd) {
            runToEnd.status = data.status;
            runToEnd.output = data.output;
            runToEnd.error = data.error;
            runToEnd.duration = data.duration;
            runToEnd.endTime = data.timestamp;
          }
          break;
      }
    });

    res.json({ success: true, processed: events.length });
  } catch (error) {
    console.error('Ingest error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific run by ID
app.get('/api/runs/:runId', (req, res) => {
  const { runId } = req.params;
  const run = runs.get(runId);

  if (!run) {
    return res.status(404).json({ error: 'Run not found' });
  }

  // Steps are already stored as full objects in run.steps array
  // Just return the run with steps (they're already complete)
  const enrichedRun = {
    ...run,
    steps: run.steps || [],
  };

  res.json(enrichedRun);
});

// Query runs with filters
app.get('/api/runs', (req, res) => {
  const {
    pipeline,
    status,
    startTime,
    endTime,
    minSteps,
    maxSteps,
    limit = 100,
    offset = 0,
  } = req.query;

  let results = Array.from(runs.values());

  // Filter by pipeline
  if (pipeline) {
    results = results.filter(run => run.pipeline === pipeline);
  }

  // Filter by status
  if (status) {
    results = results.filter(run => run.status === status);
  }

  // Filter by time range
  if (startTime) {
    results = results.filter(run => run.startTime >= startTime);
  }
  if (endTime) {
    results = results.filter(run => run.startTime <= endTime);
  }

  // Filter by step count
  if (minSteps) {
    results = results.filter(run => run.steps.length >= parseInt(minSteps));
  }
  if (maxSteps) {
    results = results.filter(run => run.steps.length <= parseInt(maxSteps));
  }

  // Sort by start time (newest first)
  results.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  // Paginate
  const total = results.length;
  const paginated = results.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  res.json({
    runs: paginated,
    total,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

// Query steps across runs
app.get('/api/steps', (req, res) => {
  const {
    runId,
    name,
    type,
    pipeline,
    limit = 100,
    offset = 0,
  } = req.query;

  let results = Array.from(steps.values());

  // Filter by runId
  if (runId) {
    results = results.filter(step => step.runId === runId);
  }

  // Filter by step name
  if (name) {
    results = results.filter(step => step.name === name);
  }

  // Filter by step type
  if (type) {
    results = results.filter(step => step.type === type);
  }

  // Filter by pipeline (requires joining with runs)
  if (pipeline) {
    const pipelineRunIds = new Set(runsByPipeline.get(pipeline) || []);
    results = results.filter(step => pipelineRunIds.has(step.runId));
  }

  // Sort by timestamp
  results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Paginate
  const total = results.length;
  const paginated = results.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  res.json({
    steps: paginated,
    total,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

// Find runs where filtering eliminated >X% of candidates
// This is the cross-pipeline query example
app.get('/api/query/filter-elimination', (req, res) => {
  const { threshold = 90, pipeline } = req.query;
  const thresholdPercent = parseFloat(threshold) / 100;

  const allRuns = pipeline
    ? Array.from(runs.values()).filter(r => r.pipeline === pipeline)
    : Array.from(runs.values());

  const matchingRuns = [];

  allRuns.forEach(run => {
    run.steps.forEach(step => {
      // Look for filter-type steps with candidates and filtered data
      if (step.type === 'filter' && step.candidates && step.filtered) {
        const totalCandidates = step.candidates._summarized
          ? step.candidates.total
          : step.candidates.length;

        const totalFiltered = step.filtered._summarized
          ? step.filtered.total
          : step.filtered.length;

        const totalInput = totalCandidates + totalFiltered;
        if (totalInput > 0) {
          const eliminationRate = totalFiltered / totalInput;
          if (eliminationRate >= thresholdPercent) {
            matchingRuns.push({
              runId: run.runId,
              pipeline: run.pipeline,
              stepId: step.stepId,
              stepName: step.name,
              eliminationRate: eliminationRate * 100,
              candidatesIn: totalCandidates,
              candidatesOut: totalInput - totalFiltered,
              filteredOut: totalFiltered,
            });
          }
        }
      }
    });
  });

  res.json({ matches: matchingRuns, count: matchingRuns.length });
});

// Get stats for a specific pipeline
app.get('/api/pipelines/:pipeline/stats', (req, res) => {
  const { pipeline } = req.params;
  const pipelineRuns = Array.from(runs.values()).filter(r => r.pipeline === pipeline);

  if (pipelineRuns.length === 0) {
    return res.json({
      pipeline,
      totalRuns: 0,
      stats: null,
    });
  }

  const stats = {
    totalRuns: pipelineRuns.length,
    successCount: pipelineRuns.filter(r => r.status === 'success').length,
    errorCount: pipelineRuns.filter(r => r.status === 'error').length,
    avgDuration: pipelineRuns
      .filter(r => r.duration)
      .reduce((sum, r) => sum + r.duration, 0) / pipelineRuns.filter(r => r.duration).length,
    avgStepCount: pipelineRuns.reduce((sum, r) => sum + r.steps.length, 0) / pipelineRuns.length,
  };

  res.json({ pipeline, stats });
});

// List all pipelines
app.get('/api/pipelines', (req, res) => {
  const pipelines = Array.from(runsByPipeline.keys());
  res.json({ pipelines });
});

// Start server
app.listen(PORT, () => {
  console.log(`X-Ray API server running on http://localhost:${PORT}`);
});

module.exports = app;

