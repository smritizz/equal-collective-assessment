const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3001;

const runs = new Map();
const steps = new Map();
const runsByPipeline = new Map();

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

          if (!runsByPipeline.has(data.pipeline)) {
            runsByPipeline.set(data.pipeline, []);
          }
          runsByPipeline.get(data.pipeline).push(data.runId);
          break;

        case 'step':
          steps.set(data.stepId, data);

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

app.get('/api/runs/:runId', (req, res) => {
  const { runId } = req.params;
  const run = runs.get(runId);

  if (!run) {
    return res.status(404).json({ error: 'Run not found' });
  }

  const enrichedRun = {
    ...run,
    steps: run.steps || [],
  };

  res.json(enrichedRun);
});

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

  if (pipeline) {
    results = results.filter(run => run.pipeline === pipeline);
  }

  if (status) {
    results = results.filter(run => run.status === status);
  }

  if (startTime) {
    results = results.filter(run => run.startTime >= startTime);
  }
  if (endTime) {
    results = results.filter(run => run.startTime <= endTime);
  }

  if (minSteps) {
    results = results.filter(run => run.steps.length >= parseInt(minSteps));
  }
  if (maxSteps) {
    results = results.filter(run => run.steps.length <= parseInt(maxSteps));
  }

  results.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  const total = results.length;
  const paginated = results.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  res.json({
    runs: paginated,
    total,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

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

  if (runId) {
    results = results.filter(step => step.runId === runId);
  }

  if (name) {
    results = results.filter(step => step.name === name);
  }

  if (type) {
    results = results.filter(step => step.type === type);
  }

  if (pipeline) {
    const pipelineRunIds = new Set(runsByPipeline.get(pipeline) || []);
    results = results.filter(step => pipelineRunIds.has(step.runId));
  }

  results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const total = results.length;
  const paginated = results.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  res.json({
    steps: paginated,
    total,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

app.get('/api/query/filter-elimination', (req, res) => {
  const { threshold = 90, pipeline } = req.query;
  const thresholdPercent = parseFloat(threshold) / 100;

  const allRuns = pipeline
    ? Array.from(runs.values()).filter(r => r.pipeline === pipeline)
    : Array.from(runs.values());

  const matchingRuns = [];

  allRuns.forEach(run => {
    run.steps.forEach(step => {
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

app.get('/api/pipelines', (req, res) => {
  const pipelines = Array.from(runsByPipeline.keys());
  res.json({ pipelines });
});

app.listen(PORT, () => {
  console.log(`X-Ray API server running on http://localhost:${PORT}`);
});

module.exports = app;

