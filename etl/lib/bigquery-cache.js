/**
 * BigQuery Cache Layer — Provides 24-hour tenant-scoped data fallback.
 *
 * When a live adapter fails, this module retrieves the most recent data
 * from BigQuery for the given tenant_id and data domain, acting as the
 * "warm cache" tier of the Circuit Breaker fallback chain.
 *
 * @module etl/lib/bigquery-cache
 */

let BigQuery;
try {
  ({ BigQuery } = require('@google-cloud/bigquery'));
} catch {
  BigQuery = null;
}

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'ha-sentinel-core-v21';
const DATASET_ID = process.env.BQ_DATASET_ID || 'sentinel_warehouse';

/**
 * Fetch the most recent records from BigQuery for a specific tenant and domain.
 *
 * @param {string} tenantId - The tenant identifier
 * @param {string} tableName - Target table (e.g., 'ocean_rates', 'vessel_positions')
 * @param {object} [opts]
 * @param {number} [opts.maxAgeHours=24] - Maximum data age in hours
 * @param {number} [opts.limit=100] - Maximum rows to return
 * @returns {Promise<{data: Array, source: string}>}
 */
async function getCachedData(tenantId, tableName, opts = {}) {
  const maxAgeHours = opts.maxAgeHours ?? 24;
  const limit = opts.limit ?? 100;

  if (!BigQuery) {
    console.warn(JSON.stringify({
      severity: 'WARNING',
      component: 'bigquery-cache',
      message: 'BigQuery SDK not available — returning empty cache result.',
    }));
    return { data: [], source: 'cache-unavailable' };
  }

  const bq = new BigQuery({ projectId: PROJECT_ID });
  const query = `
    SELECT *
    FROM \`${PROJECT_ID}.${DATASET_ID}.${tableName}\`
    WHERE tenant_id = @tenantId
      AND ingested_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @maxAgeHours HOUR)
    ORDER BY ingested_at DESC
    LIMIT @limit
  `;

  try {
    const [rows] = await bq.query({
      query,
      params: { tenantId, maxAgeHours, limit },
      location: 'US',
    });

    if (rows.length > 0) {
      console.log(JSON.stringify({
        severity: 'INFO',
        component: 'bigquery-cache',
        tenantId,
        tableName,
        rowsReturned: rows.length,
        message: `Cache hit: ${rows.length} rows from last ${maxAgeHours}h.`,
      }));
      return { data: rows, source: 'fallback-cache' };
    } else {
      console.log(JSON.stringify({
        severity: 'INFO',
        component: 'bigquery-cache',
        tenantId,
        tableName,
        message: `Cache miss: no data within ${maxAgeHours}h window.`,
      }));
      return { data: [], source: 'cache-miss' };
    }
  } catch (err) {
    console.error(JSON.stringify({
      severity: 'ERROR',
      component: 'bigquery-cache',
      tenantId,
      tableName,
      message: `BigQuery cache query failed: ${err.message}`,
    }));
    return { data: [], source: 'cache-error' };
  }
}

module.exports = { getCachedData };
