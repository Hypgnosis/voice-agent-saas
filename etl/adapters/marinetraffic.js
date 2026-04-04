/**
 * MarineTraffic Adapter — PRODUCTION
 *
 * Three-tier data resolution via Circuit Breaker:
 *   1. LIVE  → MarineTraffic AIS API (vessel positions + port congestion)
 *   2. CACHE → BigQuery last-24h tenant-scoped data
 *   3. STATIC → Curated benchmark feed (safe-mode default)
 *
 * @module etl/adapters/marinetraffic
 */

const { CircuitBreaker } = require('../lib/circuit-breaker');
const { getSecret } = require('../lib/secret-manager');
const { getCachedData } = require('../lib/bigquery-cache');
const { getStaticFeed } = require('../lib/static-feeds');
const crypto = require('crypto');

// ── Circuit Breaker Instance ──────────────────────────────────────────────────
const breaker = new CircuitBreaker('marinetraffic', {
  failureThreshold: 3,
  cooldownMs: 90_000,    // 90s cooldown (MT rate limits are stricter)
  timeoutMs: 20_000,     // 20s per API call
});

const MT_BASE_URL = 'https://services.marinetraffic.com/api';
const BQ_VESSEL_TABLE = 'vessel_positions';
const BQ_PORT_TABLE = 'port_congestion';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  VESSEL POSITIONS                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch real-time vessel positions from MarineTraffic.
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} [params.portCode] - Filter by port UN/LOCODE
 * @param {string[]} [params.mmsiList] - Filter by specific vessel MMSIs
 * @returns {Promise<{data: Array, source: string, metadata: object}>}
 */
async function fetchVesselPositions(params) {
  const { tenantId, portCode, mmsiList } = params;
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  _log('info', `[${requestId}] Fetching vessel positions`, { tenantId, portCode });

  const result = await breaker.call(
    () => _fetchLiveVessels({ portCode, mmsiList }),
    () => _vesselFallbackChain(tenantId)
  );

  const elapsed = Date.now() - startTime;

  return {
    ...result,
    metadata: {
      adapter: 'marinetraffic',
      domain: 'vessel_positions',
      requestId,
      tenantId,
      source: result.source,
      elapsedMs: elapsed,
      circuitState: breaker.getStatus().state,
      timestamp: new Date().toISOString(),
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PORT CONGESTION                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch port congestion metrics from MarineTraffic.
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.portCode - Target port UN/LOCODE
 * @returns {Promise<{data: Array, source: string, metadata: object}>}
 */
async function fetchPortCongestion(params) {
  const { tenantId, portCode } = params;
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  _log('info', `[${requestId}] Fetching port congestion`, { tenantId, portCode });

  const result = await breaker.call(
    () => _fetchLivePortCongestion({ portCode }),
    () => _portFallbackChain(tenantId)
  );

  const elapsed = Date.now() - startTime;

  return {
    ...result,
    metadata: {
      adapter: 'marinetraffic',
      domain: 'port_congestion',
      requestId,
      tenantId,
      portCode,
      source: result.source,
      elapsedMs: elapsed,
      circuitState: breaker.getStatus().state,
      timestamp: new Date().toISOString(),
    },
  };
}

/* ─── Live API Calls ───────────────────────────────────────────────────────── */

async function _fetchLiveVessels({ portCode, mmsiList }) {
  const apiKey = await getSecret('MARINETRAFFIC_API_KEY');
  if (!apiKey) {
    throw new Error('MARINETRAFFIC_API_KEY not available — Secret Manager returned null.');
  }

  const params = new URLSearchParams({
    v: '8',
    output: 'json',
    protocol: 'jsono',
  });
  if (portCode) params.set('port_target_id', portCode);
  if (mmsiList?.length) params.set('mmsi', mmsiList.join(','));

  const url = `${MT_BASE_URL}/exportvessels/${apiKey}?${params}`;

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json', 'X-Client': 'sentinel-etl/1.0' },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)');
    throw new Error(`MarineTraffic API ${response.status}: ${body}`);
  }

  const json = await response.json();

  // Normalize to canonical schema
  const vessels = (Array.isArray(json) ? json : json.data || []).map((v) => ({
    mmsi: v.MMSI || v.mmsi,
    vessel_name: v.SHIPNAME || v.vessel_name || 'UNKNOWN',
    lat: parseFloat(v.LAT || v.lat || 0),
    lon: parseFloat(v.LON || v.lon || 0),
    speed_knots: parseFloat(v.SPEED || v.speed || 0) / 10,
    heading: parseFloat(v.HEADING || v.heading || 0),
    status: _mapNavigationStatus(v.STATUS || v.status),
    port: v.PORT || v.port || portCode || null,
    data_authority: 'marinetraffic-live',
    entity_hash: _computeHash(v),
  }));

  return vessels;
}

async function _fetchLivePortCongestion({ portCode }) {
  const apiKey = await getSecret('MARINETRAFFIC_API_KEY');
  if (!apiKey) {
    throw new Error('MARINETRAFFIC_API_KEY not available — Secret Manager returned null.');
  }

  const url = `${MT_BASE_URL}/expectedarrivals/${apiKey}?` + new URLSearchParams({
    port_target_id: portCode,
    output: 'json',
    protocol: 'jsono',
  });

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json', 'X-Client': 'sentinel-etl/1.0' },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)');
    throw new Error(`MarineTraffic Port API ${response.status}: ${body}`);
  }

  const json = await response.json();
  const arrivals = Array.isArray(json) ? json : json.data || [];

  return [{
    port_code: portCode,
    port_name: arrivals[0]?.PORT_NAME || portCode,
    avg_wait_hours: _estimateWaitHours(arrivals),
    vessel_queue: arrivals.length,
    congestion_level: _classifyCongestion(arrivals.length),
    data_authority: 'marinetraffic-live',
    confidence: 0.90,
    entity_hash: _computeHash({ portCode, count: arrivals.length }),
  }];
}

/* ─── Fallback Chains ──────────────────────────────────────────────────────── */

async function _vesselFallbackChain(tenantId) {
  const cache = await getCachedData(tenantId, BQ_VESSEL_TABLE, { maxAgeHours: 24, limit: 200 });
  if (cache.data?.length > 0) return cache;

  _log('warn', `No BigQuery vessel cache for tenant ${tenantId}. Using static feed.`);
  return getStaticFeed('vessel_positions');
}

async function _portFallbackChain(tenantId) {
  const cache = await getCachedData(tenantId, BQ_PORT_TABLE, { maxAgeHours: 24, limit: 50 });
  if (cache.data?.length > 0) return cache;

  _log('warn', `No BigQuery port cache for tenant ${tenantId}. Using static feed.`);
  return getStaticFeed('port_congestion');
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function _mapNavigationStatus(code) {
  const statuses = {
    0: 'UNDERWAY_ENGINE', 1: 'AT_ANCHOR', 2: 'NOT_UNDER_COMMAND',
    3: 'RESTRICTED_MANEUVERABILITY', 5: 'MOORED', 7: 'FISHING',
    8: 'UNDERWAY_SAILING', 15: 'NOT_DEFINED',
  };
  return statuses[parseInt(code)] || 'NOT_DEFINED';
}

function _classifyCongestion(vesselCount) {
  if (vesselCount > 30) return 'CRITICAL';
  if (vesselCount > 15) return 'HIGH';
  if (vesselCount > 5) return 'MODERATE';
  return 'LOW';
}

function _estimateWaitHours(arrivals) {
  if (!arrivals.length) return 0;
  // Rough estimate based on queue depth (6h per vessel in dense ports)
  return Math.round(arrivals.length * 2.5);
}

function _computeHash(record) {
  const payload = JSON.stringify(record);
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
}

function _log(level, message, extra = {}) {
  const entry = {
    severity: level.toUpperCase(),
    component: 'adapter/marinetraffic',
    message,
    ...extra,
    timestamp: new Date().toISOString(),
  };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

function getCircuitStatus() {
  return breaker.getStatus();
}

module.exports = {
  fetchVesselPositions,
  fetchPortCongestion,
  getCircuitStatus,
};
