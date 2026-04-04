/**
 * Circuit Breaker — Enterprise Pattern for Live Adapter Resilience
 * 
 * States:
 *   CLOSED   → Normal operation. Calls pass through to the live adapter.
 *   OPEN     → Failure threshold exceeded. All calls short-circuit to fallback.
 *   HALF_OPEN → Cooldown expired. One probe call is allowed to test recovery.
 *
 * @module etl/lib/circuit-breaker
 */

const STATES = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

class CircuitBreaker {
  /**
   * @param {string} name - Adapter identifier (e.g., 'xeneta', 'marinetraffic')
   * @param {object} opts
   * @param {number} [opts.failureThreshold=3] - Consecutive failures before OPEN
   * @param {number} [opts.cooldownMs=60000] - Time in OPEN state before HALF_OPEN probe
   * @param {number} [opts.timeoutMs=10000] - Per-call timeout
   */
  constructor(name, opts = {}) {
    this.name = name;
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.cooldownMs = opts.cooldownMs ?? 60_000;
    this.timeoutMs = opts.timeoutMs ?? 10_000;

    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  /**
   * Execute `fn` through the circuit breaker.
   * Returns { data, source } where source is 'live' | 'fallback-cache' | 'fallback-static'.
   *
   * @param {Function} fn - The live adapter fetch function (async)
   * @param {Function} fallbackFn - Fallback function returning cached or static data
   * @returns {Promise<{data: any, source: string}>}
   */
  async call(fn, fallbackFn) {
    // ── OPEN: short-circuit to fallback ──
    if (this.state === STATES.OPEN) {
      if (this._cooldownExpired()) {
        this.state = STATES.HALF_OPEN;
        this._log('info', 'Cooldown expired. Transitioning to HALF_OPEN for probe call.');
      } else {
        this._log('warn', `Circuit OPEN — bypassing live call for ${this.name}.`);
        return this._executeFallback(fallbackFn, 'circuit-open');
      }
    }

    // ── CLOSED / HALF_OPEN: attempt live call ──
    try {
      const data = await this._withTimeout(fn(), this.timeoutMs);
      this._onSuccess();
      return { data, source: 'live' };
    } catch (err) {
      this._onFailure(err);
      return this._executeFallback(fallbackFn, err.message);
    }
  }

  /* ─── Internal Helpers ─────────────────────────────────────────────── */

  _onSuccess() {
    if (this.state === STATES.HALF_OPEN) {
      this._log('info', `Probe succeeded. Resetting circuit to CLOSED.`);
    }
    this.failureCount = 0;
    this.state = STATES.CLOSED;
    this.successCount++;
  }

  _onFailure(err) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this._log('error', `Call failed (${this.failureCount}/${this.failureThreshold}): ${err.message}`);

    if (this.failureCount >= this.failureThreshold) {
      this.state = STATES.OPEN;
      this._log('warn', `Failure threshold reached. Circuit is now OPEN.`);
    }
  }

  _cooldownExpired() {
    if (!this.lastFailureTime) return false;
    return (Date.now() - this.lastFailureTime) >= this.cooldownMs;
  }

  async _executeFallback(fallbackFn, reason) {
    this._log('info', `Executing fallback (reason: ${reason}).`);
    try {
      const result = await fallbackFn();
      return result; // fallbackFn returns { data, source } directly
    } catch (fallbackErr) {
      this._log('error', `Fallback also failed: ${fallbackErr.message}`);
      return { data: null, source: 'fallback-failed' };
    }
  }

  _withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
      promise
        .then((val) => { clearTimeout(timer); resolve(val); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });
  }

  _log(level, message) {
    const entry = {
      severity: level.toUpperCase(),
      component: 'circuit-breaker',
      adapter: this.name,
      state: this.state,
      failureCount: this.failureCount,
      message,
      timestamp: new Date().toISOString(),
    };
    // Cloud Run / Cloud Functions structured logging
    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  /** Returns a snapshot of the breaker's health for observability. */
  getStatus() {
    return {
      adapter: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
        ? new Date(this.lastFailureTime).toISOString()
        : null,
    };
  }
}

module.exports = { CircuitBreaker, STATES };
