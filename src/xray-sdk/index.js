// X-Ray SDK - Debug multi-step algorithmic systems by capturing decisions, not just logs

class XRaySDK {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || 'http://localhost:3001/api';
    this.enabled = config.enabled !== false;
    this.runId = null;
    this.steps = [];
    this.metadata = config.metadata || {};
    this.onError = config.onError || (() => {});
    this.batchSize = config.batchSize || 10;
    this.pendingEvents = [];
  }

  // Start tracking a new pipeline run
  startRun(context) {
    if (!this.enabled) return null;

    this.runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.steps = [];
    this.startTime = Date.now();

    const runContext = {
      runId: this.runId,
      pipeline: context.pipeline,
      input: context.input,
      metadata: { ...this.metadata, ...context.metadata },
      timestamp: new Date().toISOString(),
    };

    // Send start event asynchronously
    this._sendEvent('run_start', runContext).catch(this.onError);

    return this.runId;
  }

  // Record a step with its inputs, outputs, and reasoning
  recordStep(step) {
    if (!this.enabled || !this.runId) return null;

    const stepId = `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stepData = {
      stepId,
      runId: this.runId,
      name: step.name,
      type: step.type,
      input: step.input,
      output: step.output,
      candidates: this._summarizeIfLarge(step.candidates, step.candidateLimit),
      filtered: this._summarizeIfLarge(step.filtered, step.filteredLimit),
      metadata: step.metadata || {},
      reasoning: step.reasoning,
      timestamp: new Date().toISOString(),
      duration: step.duration || null,
    };

    this.steps.push(stepData);

    // Send step event asynchronously
    this._sendEvent('step', stepData).catch(this.onError);

    return stepId;
  }

  endRun(result = {}) {
    if (!this.enabled || !this.runId) return;

    const runData = {
      runId: this.runId,
      output: result.output,
      status: result.status || 'success',
      error: result.error,
      duration: Date.now() - this.startTime,
      stepCount: this.steps.length,
      timestamp: new Date().toISOString(),
    };

    this._sendEvent('run_end', runData).catch(this.onError);

    // Reset state
    const completedRunId = this.runId;
    this.runId = null;
    this.steps = [];

    return completedRunId;
  }

  // Summarize large arrays to keep storage reasonable
  // Developer controls the limit per step
  _summarizeIfLarge(array, limit = 100) {
    if (!array || !Array.isArray(array)) return array;
    if (array.length <= limit) return array;

    return {
      _summarized: true,
      total: array.length,
      sample: array.slice(0, limit),
      sampleSize: limit,
      // Store summary statistics if applicable
      summary: this._computeSummary(array),
    };
  }

  _computeSummary(array) {
    if (!array || array.length === 0) return null;

    // Try to extract numeric fields for statistics
    const firstItem = array[0];
    if (typeof firstItem === 'object' && firstItem !== null) {
      const summary = {};
      Object.keys(firstItem).forEach(key => {
        const values = array.map(item => item[key]).filter(v => typeof v === 'number');
        if (values.length > 0) {
          summary[key] = {
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((a, b) => a + b, 0) / values.length,
          };
        }
      });
      return Object.keys(summary).length > 0 ? summary : null;
    }
    return null;
  }

  // Batch events for efficiency - don't spam the API
  async _sendEvent(eventType, data) {
    if (!this.enabled) return;

    const event = {
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
    };

    this.pendingEvents.push(event);

    // Batch events for efficiency
    if (this.pendingEvents.length >= this.batchSize) {
      await this._flushEvents();
    }
  }

  async _flushEvents() {
    if (this.pendingEvents.length === 0) return;

    const events = [...this.pendingEvents];
    this.pendingEvents = [];

    try {
      const response = await fetch(`${this.apiUrl}/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
    } catch (error) {
      // Silently fail - don't break the pipeline
      this.onError(error);
    }
  }

  // Call this at the end of your pipeline to make sure everything gets sent
  async flush() {
    await this._flushEvents();
  }
}

// Create singleton instance
let defaultInstance = null;

/**
 * Initialize the X-Ray SDK
 * @param {Object} config - Configuration options
 * @returns {XRaySDK} SDK instance
 */
export function initXRay(config = {}) {
  defaultInstance = new XRaySDK(config);
  return defaultInstance;
}

/**
 * Get the default SDK instance
 * @returns {XRaySDK} SDK instance
 */
export function getXRay() {
  if (!defaultInstance) {
    defaultInstance = new XRaySDK();
  }
  return defaultInstance;
}

export default XRaySDK;

