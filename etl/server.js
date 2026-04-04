/**
 * Sentinel ETL — Cloud Run HTTP Server Wrapper
 *
 * Wraps the ETL pipeline as an HTTP-triggered service for Cloud Run + Cloud Scheduler.
 * POST /run  → Executes the full ETL pipeline
 * GET  /     → Health check / status
 */

const http = require('http');
const crypto = require('crypto');

const { fetchOceanRates, getCircuitStatus: xenetaStatus } = require('./adapters/xeneta');
const { fetchVesselPositions, fetchPortCongestion, getCircuitStatus: mtStatus } = require('./adapters/marinetraffic');

let BigQuery;
try {
  ({ BigQuery } = require('@google-cloud/bigquery'));
} catch { BigQuery = null; }

const PORT = parseInt(process.env.PORT, 10) || 8080;
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'ha-sentinel-core-v21';
const DATASET_ID = process.env.BQ_DATASET_ID || 'sentinel_warehouse';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  ETL PIPELINE                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

async function runETLPipeline() {
  const runId = crypto.randomUUID();
  const startTime = Date.now();

  _log('info', `━━━ Sentinel ETL Pipeline START ━━━`, { runId });

  const tenants = await getActiveTenants();
  _log('info', `Active tenants: ${tenants.length}`, { runId });

  const results = { total: tenants.length, success: 0, partial: 0, failed: 0, details: [] };

  for (const tenant of tenants) {
    const tenantStart = Date.now();
    const tenantResult = { tenantId: tenant.tenant_id, adapters: {}, errors: [] };

    try {
      // Extract + Load: Ocean Rates
      const rates = await fetchOceanRates({
        tenantId: tenant.tenant_id,
        origin: tenant.default_origin || 'CNSHA',
        destination: tenant.default_destination || 'USLAX',
        containerType: tenant.container_type || '40HC',
      });
      tenantResult.adapters.xeneta = { source: rates.source, rows: rates.data?.length || 0 };

      if (rates.data?.length > 0) {
        await loadToBigQuery('ocean_rates', rates.data.map(r => ({
          ...r, tenant_id: tenant.tenant_id, ingested_at: new Date().toISOString(),
          run_id: runId, data_source: rates.source,
        })));
      }

      // Extract + Load: Vessel Positions
      const vessels = await fetchVesselPositions({
        tenantId: tenant.tenant_id,
        portCode: tenant.primary_port || 'USLAX',
      });
      tenantResult.adapters.marinetraffic_vessels = { source: vessels.source, rows: vessels.data?.length || 0 };

      if (vessels.data?.length > 0) {
        await loadToBigQuery('vessel_positions', vessels.data.map(v => ({
          ...v, tenant_id: tenant.tenant_id, ingested_at: new Date().toISOString(),
          run_id: runId, data_source: vessels.source,
        })));
      }

      // Extract + Load: Port Congestion
      const ports = await fetchPortCongestion({
        tenantId: tenant.tenant_id,
        portCode: tenant.primary_port || 'USLAX',
      });
      tenantResult.adapters.marinetraffic_ports = { source: ports.source, rows: ports.data?.length || 0 };

      if (ports.data?.length > 0) {
        await loadToBigQuery('port_congestion', ports.data.map(p => ({
          ...p, tenant_id: tenant.tenant_id, ingested_at: new Date().toISOString(),
          run_id: runId, data_source: ports.source,
        })));
      }

      const allLive = Object.values(tenantResult.adapters).every(a => a.source === 'live');
      if (allLive) results.success++; else results.partial++;

    } catch (err) {
      tenantResult.errors.push(err.message);
      results.failed++;
      _log('error', `Tenant ${tenant.tenant_id} failed`, { runId, error: err.message });
    }

    tenantResult.elapsedMs = Date.now() - tenantStart;
    results.details.push(tenantResult);
  }

  const totalElapsed = Date.now() - startTime;
  _log('info', `━━━ Sentinel ETL Pipeline COMPLETE ━━━`, {
    runId, totalElapsedMs: totalElapsed,
    results: { total: results.total, success: results.success, partial: results.partial, failed: results.failed },
    circuitBreakers: { xeneta: xenetaStatus(), marinetraffic: mtStatus() },
  });

  return { runId, totalElapsedMs: totalElapsed, ...results };
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  HELPERS                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

async function getActiveTenants() {
  const envTenants = process.env.ACTIVE_TENANTS;
  if (envTenants) {
    try { return JSON.parse(envTenants); } catch { /* ignore */ }
  }
  return [{
    tenant_id: 'ha-sentinel-demo',
    company_name: 'High Archytech (Demo)',
    default_origin: 'CNSHA',
    default_destination: 'USLAX',
    container_type: '40HC',
    primary_port: 'USLAX',
  }];
}

async function loadToBigQuery(tableName, rows) {
  if (!BigQuery) {
    _log('warn', `BigQuery SDK unavailable. Skipping LOAD for ${tableName}.`);
    return;
  }
  const bq = new BigQuery({ projectId: PROJECT_ID });
  const table = bq.dataset(DATASET_ID).table(tableName);
  try {
    await table.insert(rows, { skipInvalidRows: false, ignoreUnknownValues: false });
    _log('info', `LOAD: ${rows.length} rows → ${DATASET_ID}.${tableName}`);
  } catch (err) {
    if (err.name === 'PartialFailureError') {
      _log('warn', `Partial LOAD for ${tableName}: ${err.errors?.length || 0} rows failed.`);
    } else {
      _log('error', `LOAD failed for ${tableName}: ${err.message}`);
      throw err;
    }
  }
}

function _log(level, message, extra = {}) {
  const entry = { severity: level.toUpperCase(), component: 'etl/server', message, ...extra, timestamp: new Date().toISOString() };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  HTTP SERVER                                                               */
/* ═══════════════════════════════════════════════════════════════════════════ */

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'healthy',
      service: 'sentinel-etl',
      circuitBreakers: { xeneta: xenetaStatus(), marinetraffic: mtStatus() },
      timestamp: new Date().toISOString(),
    }));
  }

  if (req.method === 'POST' && (req.url === '/run' || req.url === '/')) {
    try {
      const result = await runETLPipeline();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'completed', ...result }));
    } catch (err) {
      _log('error', `ETL pipeline error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'failed', error: err.message }));
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 404, message: 'Not found. Use POST /run to trigger ETL.' }));
});

server.listen(PORT, '0.0.0.0', () => {
  _log('info', `Sentinel ETL server listening on port ${PORT}`);
});
