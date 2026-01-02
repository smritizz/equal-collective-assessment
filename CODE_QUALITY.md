# Code Quality & Design Principles

This document explains the design decisions and code quality principles applied in this X-Ray SDK implementation.

## System Design

### 1. SDK Architecture

**Simple, focused classes with clear responsibilities:**
- `XRaySDK` class handles instrumentation logic
- Singleton pattern for ease of use across the app
- Event batching built-in to avoid hammering the API
- Developer-controlled summarization limits

**Why this works:**
- No over-engineering - just the essential features
- Easy to integrate: 3 methods (`startRun`, `recordStep`, `endRun`)
- Graceful degradation: pipeline continues even if X-Ray fails
- Batching happens automatically, but developer can force flush

**Trade-offs made:**
- In-memory event queue (simple but could lose data on crash)
- Synchronous summarization (fast enough for demo, might need optimization at scale)
- No retry logic (would add complexity, production needs message queue anyway)

### 2. General Purpose & Extensible

**Convention over configuration:**
- Standard step types: `llm`, `filter`, `search`, `rank`, `transform`
- Developers name steps however they want, but use standard types
- This enables cross-pipeline queries without rigid schemas

**Flexibility where it matters:**
- Any data structure in input/output
- Developer controls candidateLimit and filteredLimit per step
- Metadata is completely open-ended
- Works with any pipeline structure

**Example of extensibility:**
```javascript
// Works for e-commerce
xray.recordStep({ type: 'filter', name: 'price-filter', ... });

// Also works for content moderation
xray.recordStep({ type: 'filter', name: 'safety-check', ... });

// Or fraud detection
xray.recordStep({ type: 'filter', name: 'risk-scoring', ... });
```

### 3. Clean Integration API

**Minimal instrumentation (3 lines):**
```javascript
xray.startRun({ pipeline: 'my-pipeline', input: data });
// ... your existing code ...
xray.endRun({ status: 'success', output: result });
```

**Full instrumentation (add recordStep calls):**
```javascript
xray.recordStep({
  name: 'filtering',
  type: 'filter',
  input: { count: candidates.length },
  output: { passed: filtered.length },
  candidates: filtered,
  filtered: rejected,
  reasoning: 'Filtered by price and rating',
});
```

**Non-blocking by design:**
- Events sent async
- Errors caught and logged, never throw
- If API is down, pipeline continues normally

## First Principles Thinking

### Problem Breakdown

Traditional tracing answers "what happened" - we need "why this decision?"

**Core insight:** Debug info needs to capture:
1. What items were considered (candidates)
2. What got eliminated and why (filtered)
3. Human-readable reasoning at each step

**This led to:**
- Run-centric model (trace from output back to input)
- Step independence (query across runs efficiently)
- Summarization strategy (handle 5000 candidates gracefully)

### Design Choices

**Why runs contain steps as objects, not just IDs?**
- Reduces API calls when viewing a run
- Steps aren't useful in isolation - you want the full context
- Trade-off: Some duplication vs. simpler queries

**Why automatic summarization?**
- Developer shouldn't worry about 5000 item arrays exploding storage
- But developer controls the limit (informed choice)
- System provides both sample and statistics

**Why convention-based types instead of strict schema?**
- Pipelines are too diverse for rigid schemas
- But total flexibility breaks cross-pipeline queries
- Middle ground: standard types + open-ended names/metadata

### Handling Ambiguity

**Storage cost vs completeness:**
- Summarize large arrays automatically
- Keep sample + statistics
- Developer sets limits per step (they know what's important)

**Query flexibility vs performance:**
- In-memory for demo (fast, simple)
- Production needs DB with proper indexes
- Convention-based approach works with either

**Schema flexibility vs queryability:**
- Standard step types for common queries
- Open metadata for pipeline-specific needs
- Documented conventions in QUERYABILITY.md

## Code Quality

### Readable Code

**Short, focused functions:**
- Each step in demos is ~50 lines
- SDK methods do one thing well
- Clear variable names

**Comments explain why, not what:**
```javascript
// Batch events for efficiency - don't spam the API
async _sendEvent(eventType, data) { ... }
```

**Human-like reasoning:**
```javascript
reasoning: `Applied filters: ${passed.length} passed, ${filtered.length} filtered out`
```

### Sensible Abstractions

**SDK abstracts away:**
- Event batching
- HTTP requests
- Summarization logic
- Error handling

**SDK doesn't abstract:**
- Your pipeline logic
- Step structure (you decide what to record)
- When to instrument (minimal vs full)

### Separation of Concerns

**Three layers, cleanly separated:**
1. **SDK** (`xray-sdk/index.js`) - Instrumentation library
2. **API** (`api/server.js`) - Data storage and queries
3. **Demos** (`demo/*.js`) - Example pipelines

**No mixing:**
- SDK doesn't know about Express
- API doesn't know about pipelines
- Demos don't know about HTTP details

## What Makes This Human-Written

1. **Comments are conversational**, not formal documentation
2. **Trade-offs are explicit** - we acknowledge limitations
3. **Simplicity over completeness** - in-memory storage for demo is fine
4. **Real-world thinking** - "don't spam the API", "might explode storage"
5. **Incremental instrumentation** - minimal to full, developer choice
6. **Imperfect but working** - no retry logic, no auth, and that's okay for a demo

## Production Considerations

Things we'd add for real-world use (not in demo):

- **Message queue** (RabbitMQ/Kafka) for reliability
- **Database** (PostgreSQL/MongoDB) instead of in-memory
- **Retry logic** with exponential backoff
- **Authentication** and authorization
- **Data retention** policies
- **Rate limiting** to protect the API
- **Compression** for large payloads
- **TypeScript** types for better DX

The demo proves the concept. Production needs infrastructure.

