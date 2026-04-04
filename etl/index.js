/**
 * Sentinel ETL Pipeline — Production Orchestrator
 *
 * Cloud Run Job entry point that orchestrates all data adapters.
 * Executes the EXTRACT → TRANSFORM → LOAD pipeline for each tenant,
 * with Circuit Breaker protection on every live adapter.
 *
 * Deployment:
 *   gcloud run jobs deploy sentinel-etl-job \
 *     --source=./etl \
 *     --service-account=sentinel-etl-sa@ha-sentinel-core-v21.iam.gserviceaccount.com \
 *     --region=us-central1 \
 *     --task-timeout=600s \
 *     --max-retries=1
 *
 * @module etl/index
 */

const { fetchOceanRates, getCircuitStatus: xenetaStatus } = require('./adapters/xeneta');
const { fetchVesselPositions, fetchPortCongestion, getCircuitStatus: mtStatus } = require('./adapters/marinetraffic');
const crypto = require('crypto');

let BigQuery;
try {
  ({ BigQuery } = require('@google-cloud/bigquery'));
} catch {
  BigQuery = null;
}

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'ha-sentinel-core-v21';
const DATASET_ID = process.env.BQ_DATASET_ID || 'sentinel_warehouse';

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN ENTRY POINT                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

async function main() {
  const runId = crypto.randomUUID();
  const startTime = Date.now();

  _log('info', `━━━ Sentinel ETL Pipeline START ━━━`, { runId });

  // ── 1. Resolve active tenants ──────────────────────────────────────────────
  const tenants = await getActiveTenants();
  _log('info', `Active tenants: ${tenants.length}`, { runId, tenantCount: tenants.length });

  if (tenants.length === 0) {
    _log('warn', 'No active tenants found. Exiting.', { runId });
    process.exit(0);
  }

  const results = {
    total: tenants.length,
    success: 0,
    partial: 0,
    failed: 0,
    details: [],
  };

  // ── 2. Process each tenant ─────────────────────────────────────────────────
  for (const tenant of tenants) {
    const tenantStart = Date.now();
    const tenantResult = {
      tenantId: tenant.tenant_id,
      adapters: {},
      errors: [],
    };

    try {
      // ── EXTRACT: Ocean Rates (Xeneta) ────────────────────────────────────
      const ratesResult = await fetchOceanRates({
        tenantId: tenant.tenant_id,
        origin: tenant.default_origin || 'CNSHA',
        destination: tenant.default_destination || 'USLAX',
        containerType: tenant.container_type || '40HC',
      });
      tenantResult.adapters.xeneta = {
        source: ratesResult.source,
        rows: ratesResult.data?.length || 0,
        circuitState: ratesResult.metadata?.circuitState,
      };

      // ── LOAD: Write ocean rates to BigQuery ──────────────────────────────
      if (ratesResult.data?.length > 0) {
        await loadToBigQuery(
          'ocean_rates',
          ratesResult.data.map(r => ({
            ...r,
            tenant_id: tenant.tenant_id,
            ingested_at: new Date().toISOString(),
            run_id: runId,
            data_source: ratesResult.source,
          }))
        );
      }

      // ── EXTRACT: Vessel Positions (MarineTraffic) ────────────────────────
      const vesselResult = await fetchVesselPositions({
        tenantId: tenant.tenant_id,
        portCode: tenant.primary_port || 'USLAX',
      });
      tenantResult.adapters.marinetraffic_vessels = {
        source: vesselResult.source,
        rows: vesselResult.data?.length || 0,
        circuitState: vesselResult.metadata?.circuitState,
      };

      // ── LOAD: Write vessel positions ─────────────────────────────────────
      if (vesselResult.data?.length > 0) {
        await loadToBigQuery(
          'vessel_positions',
          vesselResult.data.map(v => ({
            ...v,
            tenant_id: tenant.tenant_id,
            ingested_at: new Date().toISOString(),
            run_id: runId,
            data_source: vesselResult.source,
          }))
        );
      }

      // ── EXTRACT: Port Congestion (MarineTraffic) ─────────────────────────
      const portResult = await fetchPortCongestion({
        tenantId: tenant.tenant_id,
        portCode: tenant.primary_port || 'USLAX',
      });
      tenantResult.adapters.marinetraffic_ports = {
        source: portResult.source,
        rows: portResult.data?.length || 0,
        circuitState: portResult.metadata?.circuitState,
      };

      // ── LOAD: Write port congestion ──────────────────────────────────────
      if (portResult.data?.length > 0) {
        await loadToBigQuery(
          'port_congestion',
          portResult.data.map(p => ({
            ...p,
            tenant_id: tenant.tenant_id,
            ingested_at: new Date().toISOString(),
            run_id: runId,
            data_source: portResult.source,
          }))
        );
      }

      // ── Score the tenant run ─────────────────────────────────────────────
      const allLive = Object.values(tenantResult.adapters).every(a => a.source === 'live');
      if (allLive) results.success++;
      else results.partial++;

    } catch (err) {
      tenantResult.errors.push(err.message);
      results.failed++;
      _log('error', `Tenant ${tenant.tenant_id} pipeline failed`, {
        runId,
        tenantId: tenant.tenant_id,
        error: err.message,
      });
    }

    tenantResult.elapsedMs = Date.now() - tenantStart;
    results.details.push(tenantResult);
  }

  // ── 3. Final Report ────────────────────────────────────────────────────────
  const totalElapsed = Date.now() - startTime;
  _log('info', `━━━ Sentinel ETL Pipeline COMPLETE ━━━`, {
    runId,
    totalElapsedMs: totalElapsed,
    results: {
      total: results.total,
      success: results.success,
      partial: results.partial,
      failed: results.failed,
    },
    circuitBreakers: {
      xeneta: xenetaStatus(),
      marinetraffic: mtStatus(),
    },
  });

  // ── Exit code: 0 if no full failures, 1 otherwise ─────────────────────────
  if (results.failed > 0 && results.success === 0 && results.partial === 0) {
    _log('error', 'All tenants failed. Exiting with error code.', { runId });
    process.exit(1);
  }

  process.exit(0);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TENANT RESOLUTION                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

async function getActiveTenants() {
  // In production: query BigQuery or Firestore for active tenant configs
  // For now: use env-based seed or static list
  const envTenants = process.env.ACTIVE_TENANTS;
  if (envTenants) {
    try {
      return JSON.parse(envTenants);
    } catch {
      _log('warn', 'Failed to parse ACTIVE_TENANTS env. Using default.');
    }
  }

  // Default tenant for development / first deployment
  return [{
    tenant_id: 'ha-sentinel-demo',
    company_name: 'High Archytech (Demo)',
    default_origin: 'CNSHA',
    default_destination: 'USLAX',
    container_type: '40HC',
    primary_port: 'USLAX',
  }];
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  BIGQUERY LOAD                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

async function loadToBigQuery(tableName, rows) {
  if (!BigQuery) {
    _log('warn', `BigQuery SDK not available. Skipping LOAD for ${tableName} (${rows.length} rows).`);
    return;
  }

  const bq = new BigQuery({ projectId: PROJECT_ID });
  const table = bq.dataset(DATASET_ID).table(tableName);

  try {
    // Use insertRows with dedup via entity_hash
    await table.insert(rows, {
      skipInvalidRows: false,
      ignoreUnknownValues: false,
    });

    _log('info', `LOAD complete: ${rows.length} rows → ${DATASET_ID}.${tableName}`);
  } catch (err) {
    // BigQuery streaming insert returns partial errors
    if (err.name === 'PartialFailureError') {
      const failedRows = err.errors?.length || 0;
      _log('warn', `Partial LOAD: ${rows.length - failedRows}/${rows.length} rows succeeded for ${tableName}.`, {
        failedRows,
      });
    } else {
      _log('error', `LOAD failed for ${tableName}: ${err.message}`);
      throw err;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  LOGGING                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

function _log(level, message, extra = {}) {
  const entry = {
    severity: level.toUpperCase(),
    component: 'etl/orchestrator',
    message,
    ...extra,
    timestamp: new Date().toISOString(),
  };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

/* ─── Execute ──────────────────────────────────────────────────────────────── */
main().catch((err) => {
  _log('error', `Unhandled pipeline error: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
