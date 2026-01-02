import React, { useState, useEffect } from 'react';
import { initXRay, getXRay } from './xray-sdk/index';
import CompetitorSelectionDemo from './demo/CompetitorSelectionDemo';
import ListingOptimizationDemo from './demo/ListingOptimizationDemo';
import ProductCategorizationDemo from './demo/ProductCategorizationDemo';
import './App.css';

function App() {
  const [xrayInitialized, setXrayInitialized] = useState(false);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [queryResults, setQueryResults] = useState(null);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('competitor-selection');

  useEffect(() => {
    // Initialize X-Ray SDK
    initXRay({
      apiUrl: 'http://localhost:3001/api',
      enabled: true,
      metadata: {
        environment: 'demo',
        version: '1.0.0',
      },
    });
    setXrayInitialized(true);
    loadRuns();
  }, []);

  const loadRuns = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/runs?limit=50');
      const data = await response.json();
      setRuns(data.runs || []);
    } catch (err) {
      console.error('Failed to load runs:', err);
    }
  };

  const handleRunDemo = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedRun(null);

    try {
      let result;

      if (selectedAlgorithm === 'competitor-selection') {
        const demo = new CompetitorSelectionDemo();
        const sellerProduct = {
          id: 'seller_prod_123',
          sellerId: 'seller_456',
          title: 'Wireless Phone Charger Stand',
          category: 'Electronics',
          brand: 'TechBrand',
          price: 29.99,
          attributes: ['wireless', 'fast charging', 'stand', 'phone'],
        };
        result = await demo.findCompetitor(sellerProduct);

      } else if (selectedAlgorithm === 'listing-optimization') {
        const demo = new ListingOptimizationDemo();
        const currentListing = {
          productId: 'prod_789',
          sellerId: 'seller_456',
          title: 'Basic Phone Charger',
          category: 'Electronics',
          keywords: ['charger', 'phone', 'cable'],
          bullets: [
            'Fast charging capability',
            'Compatible with most phones',
          ],
          description: 'A simple phone charger for everyday use.',
          images: ['img1.jpg', 'img2.jpg'],
        };
        result = await demo.optimizeListing(currentListing);

      } else if (selectedAlgorithm === 'product-categorization') {
        const demo = new ProductCategorizationDemo();
        const product = {
          id: 'prod_456',
          sellerId: 'seller_789',
          title: 'Wireless Phone Charger Stand with Fast Charging',
          category: 'Electronics',
          brand: 'TechBrand',
          price: 29.99,
          attributes: ['wireless', 'fast charging', 'stand', 'phone', 'Qi compatible'],
          description: 'A premium wireless charging stand for smartphones with fast charging support and Qi compatibility.',
        };
        result = await demo.categorizeProduct(product);
      }

      // Flush any pending events
      await getXRay().flush();

      setResult(result);
      setTimeout(loadRuns, 500); // Reload runs after a short delay
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewRun = async (runId) => {
    try {
      setError(null);
      const response = await fetch(`http://localhost:3001/api/runs/${runId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const run = await response.json();
      console.log('Loaded run:', run);
      setSelectedRun(run);
    } catch (err) {
      console.error('Error loading run:', err);
      setError(`Failed to load run: ${err.message}`);
    }
  };

  const handleQueryFilterElimination = async () => {
    try {
      setError(null);
      const response = await fetch('http://localhost:3001/api/query/filter-elimination?threshold=90');
      const data = await response.json();
      setQueryResults({
        type: 'filter-elimination',
        title: 'Runs with Filter Elimination >90%',
        data: data,
      });
    } catch (err) {
      setError(`Query failed: ${err.message}`);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>X-Ray SDK Demo</h1>
        <p>Debugging Multi-Step Algorithmic Systems</p>
      </header>

      <main className="App-main">
        {!xrayInitialized ? (
          <div>Initializing X-Ray SDK...</div>
        ) : (
          <>
            <section className="demo-section">
              <h2>Run Demo Pipeline</h2>
              <p>Select an algorithm and simulate its pipeline to see X-Ray in action</p>
              
              <div className="algorithm-selector">
                <label htmlFor="algorithm-select">
                  <strong>Select Algorithm:</strong>
                </label>
                <select
                  id="algorithm-select"
                  value={selectedAlgorithm}
                  onChange={(e) => setSelectedAlgorithm(e.target.value)}
                  disabled={loading}
                  className="algorithm-dropdown"
                >
                  <option value="competitor-selection">Competitor Selection</option>
                  <option value="listing-optimization">Listing Optimization</option>
                  <option value="product-categorization">Product Categorization</option>
                </select>
              </div>

              <button onClick={handleRunDemo} disabled={loading} className="run-demo-button">
                {loading ? 'Running...' : `Run ${selectedAlgorithm.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Demo`}
              </button>

              {error && (
                <div className="error">
                  <strong>Error:</strong> {error}
                </div>
              )}

              {result && (
                <div className="result">
                  <h3>
                    {selectedAlgorithm === 'competitor-selection' && 'Selected Competitor:'}
                    {selectedAlgorithm === 'listing-optimization' && 'Optimized Listing:'}
                    {selectedAlgorithm === 'product-categorization' && 'Selected Category:'}
                  </h3>
                  <pre>{JSON.stringify(result, null, 2)}</pre>
                </div>
              )}
            </section>

            <section className="runs-section">
              <div className="runs-header">
                <h2>Recent Runs ({runs.length})</h2>
                <button onClick={loadRuns}>Refresh</button>
                <button onClick={handleQueryFilterElimination}>
                  Query: Filter Elimination &gt;90%
                </button>
              </div>

              <div className="runs-list">
                {runs.length === 0 ? (
                  <p>No runs yet. Run the demo to create one!</p>
                ) : (
                  runs.map(run => (
                    <div key={run.runId} className="run-card">
                      <div className="run-header">
                        <span className="run-id">{run.runId}</span>
                        <span className={`status status-${run.status}`}>{run.status}</span>
                      </div>
                      <div className="run-info">
                        <div><strong>Pipeline:</strong> {run.pipeline}</div>
                        <div><strong>Steps:</strong> {run.steps.length}</div>
                        {run.duration && (
                          <div><strong>Duration:</strong> {run.duration}ms</div>
                        )}
                        <div><strong>Started:</strong> {new Date(run.startTime).toLocaleString()}</div>
                      </div>
                      <button onClick={() => handleViewRun(run.runId)}>
                        View Details
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            {queryResults && (
              <section className="query-results-section">
                <div className="query-results-header">
                  <h2>{queryResults.title}</h2>
                  <button onClick={() => setQueryResults(null)}>Close</button>
                </div>
                <div className="query-results-content">
                  <div className="query-summary">
                    <strong>Found {queryResults.data.count} matches</strong> across all pipelines
                  </div>
                  {queryResults.data.matches && queryResults.data.matches.length > 0 ? (
                    <div className="query-matches">
                      {queryResults.data.matches.map((match, idx) => (
                        <div key={idx} className="query-match-card">
                          <div className="match-header">
                            <span className="match-pipeline">{match.pipeline}</span>
                            <span className="match-elimination-rate">
                              {match.eliminationRate.toFixed(1)}% eliminated
                            </span>
                          </div>
                          <div className="match-details">
                            <div><strong>Run:</strong> {match.runId}</div>
                            <div><strong>Step:</strong> {match.stepName}</div>
                            <div className="match-numbers">
                              <span className="number-badge in">{match.candidatesIn} in</span>
                              <span className="number-badge out">{match.candidatesOut} out</span>
                              <span className="number-badge filtered">{match.filteredOut} filtered</span>
                            </div>
                          </div>
                          <button 
                            className="view-match-button"
                            onClick={() => handleViewRun(match.runId)}
                          >
                            View Run Details
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No matches found.</p>
                  )}
                </div>
              </section>
            )}

            {selectedRun && (
              <div className="dialog-overlay" onClick={() => setSelectedRun(null)}>
                <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="dialog-header">
                    <h2>Run Details: {selectedRun.runId}</h2>
                    <button 
                      className="dialog-close-btn" 
                      onClick={() => setSelectedRun(null)}
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div className="dialog-content">
                    <section className="run-details in-dialog">
                      <div className="run-detail-section">
                        <h3>Overview</h3>
                        <pre>{JSON.stringify({
                          runId: selectedRun.runId,
                          pipeline: selectedRun.pipeline,
                          status: selectedRun.status,
                          duration: selectedRun.duration,
                          stepCount: selectedRun.steps ? selectedRun.steps.length : 0,
                          input: selectedRun.input,
                          output: selectedRun.output,
                        }, null, 2)}</pre>
                      </div>

                      <div className="run-detail-section">
                        <h3>Pipeline Steps ({selectedRun.steps ? selectedRun.steps.length : 0})</h3>
                        {selectedRun.steps && selectedRun.steps.length > 0 ? (
                          <div className="steps-timeline">
                            {selectedRun.steps.map((step, idx) => (
                              <div key={step.stepId || idx} className="step-timeline-item">
                                <div className="step-number">{idx + 1}</div>
                                <div className="step-content">
                                  <div className="step-title-row">
                                    <h4 className="step-title">{step.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h4>
                                    <div className="step-badges">
                                      <span className={`step-type-badge step-type-${step.type}`}>{step.type}</span>
                                      {step.duration && (
                                        <span className="step-duration-badge">{step.duration}ms</span>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {step.reasoning && (
                                    <div className="step-reasoning-box">
                                      <span className="reasoning-icon">💭</span>
                                      {step.reasoning}
                                    </div>
                                  )}

                                  <div className="step-metrics">
                                    {step.output && (
                                      <div className="metric-card">
                                        <div className="metric-label">Output</div>
                                        <div className="metric-value">
                                          {typeof step.output === 'object' ? (
                                            Object.entries(step.output).map(([key, value]) => (
                                              <div key={key} className="metric-item">
                                                <strong>{key}:</strong> {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                              </div>
                                            ))
                                          ) : (
                                            String(step.output)
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {step.candidates && (
                                      <div className="metric-card">
                                        <div className="metric-label">
                                          Candidates {step.candidates._summarized 
                                            ? `(${step.candidates.total} total)`
                                            : `(${step.candidates.length})`}
                                        </div>
                                        <div className="metric-value">
                                          {step.candidates._summarized ? (
                                            <div className="summary-info">
                                              <div>Showing {step.candidates.sampleSize} of {step.candidates.total} items</div>
                                              {step.candidates.sample && step.candidates.sample.length > 0 && (
                                                <details className="candidates-details">
                                                  <summary>View Sample ({step.candidates.sample.length} items)</summary>
                                                  <div className="candidates-list">
                                                    {step.candidates.sample.slice(0, 5).map((item, i) => (
                                                      <div key={i} className="candidate-item">
                                                        {typeof item === 'object' ? (
                                                          <div className="candidate-object">
                                                            {Object.entries(item).slice(0, 3).map(([k, v]) => (
                                                              <span key={k} className="candidate-field">{k}: {String(v).substring(0, 30)}</span>
                                                            ))}
                                                          </div>
                                                        ) : (
                                                          String(item)
                                                        )}
                                                      </div>
                                                    ))}
                                                  </div>
                                                </details>
                                              )}
                                            </div>
                                          ) : (
                                            <div className="candidates-list">
                                              {step.candidates.slice(0, 5).map((item, i) => (
                                                <div key={i} className="candidate-item">
                                                  {typeof item === 'object' ? (
                                                    <div className="candidate-object">
                                                      {Object.entries(item).slice(0, 3).map(([k, v]) => (
                                                        <span key={k} className="candidate-field">{k}: {String(v).substring(0, 30)}</span>
                                                      ))}
                                                    </div>
                                                  ) : (
                                                    String(item)
                                                  )}
                                                </div>
                                              ))}
                                              {step.candidates.length > 5 && (
                                                <div className="more-items">+ {step.candidates.length - 5} more...</div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {step.filtered && (
                                      <div className="metric-card filtered-card">
                                        <div className="metric-label">
                                          Filtered Out {step.filtered._summarized 
                                            ? `(${step.filtered.total} total)`
                                            : `(${step.filtered.length})`}
                                        </div>
                                        <div className="metric-value">
                                          {step.filtered._summarized ? (
                                            <div className="summary-info">
                                              <div>Showing {step.filtered.sampleSize} of {step.filtered.total} filtered items</div>
                                              {step.filtered.sample && step.filtered.sample.length > 0 && (
                                                <details className="filtered-details">
                                                  <summary>View Sample with Reasons</summary>
                                                  <div className="filtered-list">
                                                    {step.filtered.sample.slice(0, 5).map((item, i) => (
                                                      <div key={i} className="filtered-item">
                                                        {item.candidate && (
                                                          <div className="filtered-candidate">
                                                            {typeof item.candidate === 'object' ? (
                                                              <div>
                                                                {item.candidate.id || item.candidate.title || 'Item'}
                                                              </div>
                                                            ) : (
                                                              String(item.candidate)
                                                            )}
                                                          </div>
                                                        )}
                                                        {item.reasons && (
                                                          <div className="filter-reasons">
                                                            {Array.isArray(item.reasons) ? (
                                                              item.reasons.map((reason, rIdx) => (
                                                                <span key={rIdx} className="reason-tag">{reason}</span>
                                                              ))
                                                            ) : (
                                                              <span className="reason-tag">{item.reasons}</span>
                                                            )}
                                                          </div>
                                                        )}
                                                      </div>
                                                    ))}
                                                  </div>
                                                </details>
                                              )}
                                            </div>
                                          ) : (
                                            <div className="filtered-list">
                                              {step.filtered.slice(0, 5).map((item, i) => (
                                                <div key={i} className="filtered-item">
                                                  {item.candidate && (
                                                    <div className="filtered-candidate">
                                                      {typeof item.candidate === 'object' ? (
                                                        <div>
                                                          {item.candidate.id || item.candidate.title || 'Item'}
                                                        </div>
                                                      ) : (
                                                        String(item.candidate)
                                                      )}
                                                    </div>
                                                  )}
                                                  {item.reasons && (
                                                    <div className="filter-reasons">
                                                      {Array.isArray(item.reasons) ? (
                                                        item.reasons.map((reason, rIdx) => (
                                                          <span key={rIdx} className="reason-tag">{reason}</span>
                                                        ))
                                                      ) : (
                                                        <span className="reason-tag">{item.reasons}</span>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                              {step.filtered.length > 5 && (
                                                <div className="more-items">+ {step.filtered.length - 5} more...</div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {step.input && Object.keys(step.input).length > 0 && (
                                    <details className="step-input-details">
                                      <summary>View Input Data</summary>
                                      <pre className="input-data">{JSON.stringify(step.input, null, 2)}</pre>
                                    </details>
                                  )}
                                </div>
                                {idx < selectedRun.steps.length - 1 && (
                                  <div className="step-connector">↓</div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p>No steps recorded for this run.</p>
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
