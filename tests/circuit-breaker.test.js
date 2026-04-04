/**
 * Circuit Breaker Unit Tests
 * 
 * Validates the three-state machine (CLOSED → OPEN → HALF_OPEN → CLOSED)
 * and the fallback chain execution.
 *
 * Run: node tests/circuit-breaker.test.js
 */

const { CircuitBreaker, STATES } = require('../etl/lib/circuit-breaker');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

async function testClosedToOpenTransition() {
  console.log('\n── Test: CLOSED → OPEN after threshold failures ──');
  const cb = new CircuitBreaker('test-adapter', { failureThreshold: 2, cooldownMs: 100 });

  const failFn = () => Promise.reject(new Error('API down'));
  const fallbackFn = () => Promise.resolve({ data: ['fallback'], source: 'fallback-cache' });

  assert(cb.state === STATES.CLOSED, 'Initial state is CLOSED');

  // First failure
  await cb.call(failFn, fallbackFn);
  assert(cb.state === STATES.CLOSED, 'Still CLOSED after 1 failure');
  assert(cb.failureCount === 1, 'Failure count is 1');

  // Second failure → trips to OPEN
  await cb.call(failFn, fallbackFn);
  assert(cb.state === STATES.OPEN, 'OPEN after 2 failures (threshold=2)');
  assert(cb.failureCount === 2, 'Failure count is 2');
}

async function testOpenShortCircuit() {
  console.log('\n── Test: OPEN state short-circuits to fallback ──');
  const cb = new CircuitBreaker('test-adapter', { failureThreshold: 1, cooldownMs: 60000 });

  let liveCalled = false;
  const liveFn = () => { liveCalled = true; return Promise.resolve('live-data'); };
  const fallbackFn = () => Promise.resolve({ data: ['cached'], source: 'fallback-cache' });

  // Trip the breaker
  await cb.call(() => Promise.reject(new Error('fail')), fallbackFn);
  assert(cb.state === STATES.OPEN, 'Breaker is OPEN');

  // Next call should NOT call the live function
  const result = await cb.call(liveFn, fallbackFn);
  assert(!liveCalled, 'Live function was NOT called (short-circuited)');
  assert(result.source === 'fallback-cache', 'Result came from fallback');
}

async function testHalfOpenRecovery() {
  console.log('\n── Test: HALF_OPEN → CLOSED after successful probe ──');
  const cb = new CircuitBreaker('test-adapter', { failureThreshold: 1, cooldownMs: 50 });

  const fallbackFn = () => Promise.resolve({ data: ['cached'], source: 'fallback-cache' });

  // Trip the breaker
  await cb.call(() => Promise.reject(new Error('fail')), fallbackFn);
  assert(cb.state === STATES.OPEN, 'Breaker is OPEN');

  // Wait for cooldown
  await new Promise(r => setTimeout(r, 100));

  // Next call should probe (HALF_OPEN) and succeed
  const result = await cb.call(
    () => Promise.resolve('recovered-data'),
    fallbackFn
  );
  assert(cb.state === STATES.CLOSED, 'Breaker reset to CLOSED after probe success');
  assert(result.source === 'live', 'Probe returned live data');
  assert(result.data === 'recovered-data', 'Data is from the live call');
}

async function testFallbackChainOrder() {
  console.log('\n── Test: Fallback returns correct structure ──');
  const cb = new CircuitBreaker('test-adapter', { failureThreshold: 1, cooldownMs: 60000 });

  const fallbackFn = () => Promise.resolve({ data: [{ rate: 2500 }], source: 'fallback-cache' });

  // Trip and verify fallback structure
  const result = await cb.call(() => Promise.reject(new Error('API error')), fallbackFn);
  assert(result.data[0].rate === 2500, 'Fallback data is correct');
  assert(result.source === 'fallback-cache', 'Source indicates cache');
}

async function testTimeoutProtection() {
  console.log('\n── Test: Timeout triggers fallback ──');
  const cb = new CircuitBreaker('test-adapter', { failureThreshold: 1, timeoutMs: 50 });

  const slowFn = () => new Promise(r => setTimeout(() => r('too-slow'), 500));
  const fallbackFn = () => Promise.resolve({ data: [], source: 'fallback-static' });

  const result = await cb.call(slowFn, fallbackFn);
  assert(result.source === 'fallback-static', 'Timed-out call fell back to static');
}

async function testStatusSnapshot() {
  console.log('\n── Test: getStatus() returns observability snapshot ──');
  const cb = new CircuitBreaker('snap-test', { failureThreshold: 2 });

  const status = cb.getStatus();
  assert(status.adapter === 'snap-test', 'Adapter name in status');
  assert(status.state === 'CLOSED', 'State in status');
  assert(status.failureCount === 0, 'Failure count in status');
  assert(status.lastFailureTime === null, 'No failure time initially');
}

/* ─── Runner ───────────────────────────────────────────────────────────────── */
(async () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Circuit Breaker — Test Suite           ║');
  console.log('╚══════════════════════════════════════════╝');

  await testClosedToOpenTransition();
  await testOpenShortCircuit();
  await testHalfOpenRecovery();
  await testFallbackChainOrder();
  await testTimeoutProtection();
  await testStatusSnapshot();

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  process.exit(failed > 0 ? 1 : 0);
})();
