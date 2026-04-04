/**
 * Xeneta Adapter — PRODUCTION
 * 
 * Three-tier data resolution via Circuit Breaker:
 *   1. LIVE  → Xeneta Shipping Index (XSI) API
 *   2. CACHE → BigQuery last-24h tenant-scoped data
 *   3. STATIC → Curated benchmark feed (safe-mode default)
 *
 * Architecture:
 *   - Secret retrieval via GCP Secret Manager (falls back to env)
 *   - Tenant-scoped BigQuery cache for fallback isolation
 *   - Static feed as deterministic last resort
 *   - Structured JSON logging for Cloud Run observability
 *
 * @module etl/adapters/xeneta
 */

const { CircuitBreaker } = require('../lib/circuit-breaker');
const { getSecret } = require('../lib/secret-manager');
const { getCachedData } = require('../lib/bigquery-cache');
const { getStaticFeed } = require('../lib/static-feeds');
const crypto = require('crypto');

// ── Circuit Breaker Instance ──────────────────────────────────────────────────
const breaker = new CircuitBreaker('xeneta', {
  failureThreshold: 3,
  cooldownMs: 60_000,    // 1 minute cooldown
  timeoutMs: 15_000,     // 15s per API call
});

const XENETA_BASE_URL = 'https://api.xeneta.com/v4';
const BQ_TABLE = 'ocean_rates';

/**
 * Fetch ocean freight rates from Xeneta for a given tenant and route.
 *
 * @param {object} params
 * @param {string} params.tenantId - Tenant identifier for multi-tenant isolation
 * @param {string} params.origin - Origin port UN/LOCODE (e.g., 'CNSHA')
 * @param {string} params.destination - Destination port UN/LOCODE (e.g., 'USLAX')
 * @param {string} [params.containerType='40HC'] - Container type
 * @returns {Promise<{data: Array, source: string, metadata: object}>}
 */
async function fetchOceanRates(params) {
  const { tenantId, origin, destination, containerType = '40HC' } = params;

  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  _log('info', `[${requestId}] Starting ocean rate fetch`, { tenantId, origin, destination, containerType });

  // ── Execute through Circuit Breaker ──────────────────────────────────────
  const result = await breaker.call(
    // Primary: Live Xeneta API call
    () => _fetchLiveRates({ origin, destination, containerType }),

    // Fallback chain: BigQuery cache → Static feed
    () => _fallbackChain(tenantId)
  );

  const elapsed = Date.now() - startTime;

  _log('info', `[${requestId}] Fetch complete`, {
    tenantId,
    source: result.source,
    rowCount: result.data?.length ?? 0,
    elapsedMs: elapsed,
  });

  return {
    ...result,
    metadata: {
      adapter: 'xeneta',
      requestId,
      tenantId,
      route: `${origin}-${destination}`,
      containerType,
      source: result.source,
      elapsedMs: elapsed,
      circuitState: breaker.getStatus().state,
      timestamp: new Date().toISOString(),
    },
  };
}

/* ─── Live API Call ─────────────────────────────────────────────────────────── */

async function _fetchLiveRates({ origin, destination, containerType }) {
  const apiKey = await getSecret('XENETA_API_KEY');

  if (!apiKey) {
    throw new Error('XENETA_API_KEY not available — Secret Manager returned null.');
  }

  const url = `${XENETA_BASE_URL}/rates/ocean?` + new URLSearchParams({
    origin,
    destination,
    container_type: containerType,
    date_range: 'LAST_30_DAYS',
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'X-Client': 'sentinel-etl/1.0',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)');
    throw new Error(`Xeneta API ${response.status}: ${body}`);
  }

  const json = await response.json();

  // ── Normalize response to canonical schema ────────────────────────────────
  const rates = (json.rates || json.data || []).map((r) => ({
    origin: r.origin || origin,
    destination: r.destination || destination,
    container_type: r.container_type || containerType,
    rate_usd: r.mean || r.rate || r.price,
    currency: r.currency || 'USD',
    transit_days: r.transit_time || null,
    carrier: r.carrier || 'MARKET_AVG',
    valid_from: r.valid_from || r.date_from || null,
    valid_to: r.valid_to || r.date_to || null,
    data_authority: 'xeneta-live',
    confidence: 0.95,
    entity_hash: _computeHash(r),
  }));

  return rates;
}

/* ─── Fallback Chain ───────────────────────────────────────────────────────── */

async function _fallbackChain(tenantId) {
  // Tier 2: BigQuery cache (last 24h of this tenant's data)
  const cache = await getCachedData(tenantId, BQ_TABLE, { maxAgeHours: 24, limit: 100 });
  if (cache.data && cache.data.length > 0) {
    return cache; // { data, source: 'fallback-cache' }
  }

  // Tier 3: Static benchmark feed (deterministic safe-mode)
  _log('warn', `No BigQuery cache for tenant ${tenantId}. Using static feed.`);
  return getStaticFeed('ocean_rates'); // { data, source: 'fallback-static' }
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function _computeHash(record) {
  const payload = JSON.stringify(record);
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

function _log(level, message, extra = {}) {
  const entry = {
    severity: level.toUpperCase(),
    component: 'adapter/xeneta',
    message,
    ...extra,
    timestamp: new Date().toISOString(),
  };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

/** Expose circuit breaker status for health checks. */
function getCircuitStatus() {
  return breaker.getStatus();
}

module.exports = {
  fetchOceanRates,
  getCircuitStatus,
};
