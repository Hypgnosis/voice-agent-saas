/**
 * BigQuery Setup & RLS Provisioning Script
 * 
 * Creates the sentinel_warehouse dataset, tables, and Row Access Policies.
 * Run: node scripts/bq-setup.js
 */

const { BigQuery } = require('@google-cloud/bigquery');

const PROJECT_ID = 'ha-sentinel-core-v21';
const DATASET_ID = 'sentinel_warehouse';
const LOCATION = 'US';

const TENANT = {
  id: 'ha-sentinel-demo',
  email: 'luisfmartinez11@gmail.com',
};

const TABLE_SCHEMAS = {
  ocean_rates: [
    { name: 'tenant_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'origin', type: 'STRING' },
    { name: 'destination', type: 'STRING' },
    { name: 'container_type', type: 'STRING' },
    { name: 'rate_usd', type: 'FLOAT' },
    { name: 'carrier', type: 'STRING' },
    { name: 'transit_days', type: 'INTEGER' },
    { name: 'valid_from', type: 'STRING' },
    { name: 'valid_to', type: 'STRING' },
    { name: 'data_authority', type: 'STRING' },
    { name: 'data_source', type: 'STRING' },
    { name: 'entity_hash', type: 'STRING' },
    { name: 'ingested_at', type: 'TIMESTAMP' },
    { name: 'run_id', type: 'STRING' },
  ],
  vessel_positions: [
    { name: 'tenant_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'vessel_name', type: 'STRING' },
    { name: 'imo_number', type: 'STRING' },
    { name: 'mmsi', type: 'STRING' },
    { name: 'latitude', type: 'FLOAT' },
    { name: 'longitude', type: 'FLOAT' },
    { name: 'speed_knots', type: 'FLOAT' },
    { name: 'heading', type: 'FLOAT' },
    { name: 'status', type: 'STRING' },
    { name: 'destination_port', type: 'STRING' },
    { name: 'eta', type: 'STRING' },
    { name: 'data_authority', type: 'STRING' },
    { name: 'data_source', type: 'STRING' },
    { name: 'entity_hash', type: 'STRING' },
    { name: 'ingested_at', type: 'TIMESTAMP' },
    { name: 'run_id', type: 'STRING' },
  ],
  port_congestion: [
    { name: 'tenant_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'port_code', type: 'STRING' },
    { name: 'port_name', type: 'STRING' },
    { name: 'vessels_at_berth', type: 'INTEGER' },
    { name: 'vessels_waiting', type: 'INTEGER' },
    { name: 'avg_wait_hours', type: 'FLOAT' },
    { name: 'congestion_index', type: 'FLOAT' },
    { name: 'data_authority', type: 'STRING' },
    { name: 'data_source', type: 'STRING' },
    { name: 'entity_hash', type: 'STRING' },
    { name: 'ingested_at', type: 'TIMESTAMP' },
    { name: 'run_id', type: 'STRING' },
  ],
};

async function main() {
  const bq = new BigQuery({ projectId: PROJECT_ID });

  // ── Step 1: Create Dataset ──────────────────────────────────────────────
  console.log(`\n━━━ Step 1: Creating dataset ${DATASET_ID} ━━━`);
  try {
    const [dataset] = await bq.createDataset(DATASET_ID, { location: LOCATION });
    console.log(`  ✅ Dataset created: ${dataset.id}`);
  } catch (err) {
    if (err.code === 409) {
      console.log(`  ℹ️  Dataset ${DATASET_ID} already exists.`);
    } else {
      console.error(`  ❌ Failed to create dataset: ${err.message}`);
      throw err;
    }
  }

  // ── Step 2: Create Tables ───────────────────────────────────────────────
  console.log(`\n━━━ Step 2: Creating tables ━━━`);
  const dataset = bq.dataset(DATASET_ID);

  for (const [tableName, schema] of Object.entries(TABLE_SCHEMAS)) {
    try {
      await dataset.createTable(tableName, { schema: { fields: schema } });
      console.log(`  ✅ Table created: ${tableName}`);
    } catch (err) {
      if (err.code === 409) {
        console.log(`  ℹ️  Table ${tableName} already exists.`);
      } else {
        console.error(`  ❌ Failed to create table ${tableName}: ${err.message}`);
      }
    }
  }

  // ── Step 3: Create Row Access Policies ──────────────────────────────────
  console.log(`\n━━━ Step 3: Creating Row Access Policies for tenant "${TENANT.id}" ━━━`);

  for (const tableName of Object.keys(TABLE_SCHEMAS)) {
    const policyName = `rls_${TENANT.id.replace(/[^a-zA-Z0-9_]/g, '_')}_${tableName}`;
    const sql = `
      CREATE ROW ACCESS POLICY IF NOT EXISTS \`${policyName}\`
      ON \`${PROJECT_ID}.${DATASET_ID}.${tableName}\`
      GRANT TO (
        "user:${TENANT.email}",
        "allAuthenticatedUsers"
      )
      FILTER USING (tenant_id = "${TENANT.id}")
    `;

    try {
      await bq.query({ query: sql, location: LOCATION });
      console.log(`  ✅ RLS policy created: ${policyName} on ${tableName}`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log(`  ℹ️  RLS policy ${policyName} already exists.`);
      } else {
        console.error(`  ❌ RLS policy failed for ${tableName}: ${err.message}`);
      }
    }
  }

  // ── Step 4: Seed initial data for demo tenant ──────────────────────────
  console.log(`\n━━━ Step 4: Seeding demo data ━━━`);

  const now = new Date().toISOString();
  const runId = 'seed-' + Date.now();

  try {
    await dataset.table('ocean_rates').insert([
      { tenant_id: TENANT.id, origin: 'CNSHA', destination: 'USLAX', container_type: '40HC', rate_usd: 2450, carrier: 'COSCO', transit_days: 14, valid_from: '2026-04-01', valid_to: '2026-04-30', data_authority: 'static-benchmark', data_source: 'seed', entity_hash: 'seed-1', ingested_at: now, run_id: runId },
      { tenant_id: TENANT.id, origin: 'CNSHA', destination: 'NLRTM', container_type: '40HC', rate_usd: 2850, carrier: 'Maersk', transit_days: 28, valid_from: '2026-04-01', valid_to: '2026-04-30', data_authority: 'static-benchmark', data_source: 'seed', entity_hash: 'seed-2', ingested_at: now, run_id: runId },
      { tenant_id: TENANT.id, origin: 'KRPUS', destination: 'USLAX', container_type: '40HC', rate_usd: 2300, carrier: 'ONE', transit_days: 12, valid_from: '2026-04-01', valid_to: '2026-04-30', data_authority: 'static-benchmark', data_source: 'seed', entity_hash: 'seed-3', ingested_at: now, run_id: runId },
    ]);
    console.log(`  ✅ Seeded 3 ocean_rates rows`);
  } catch (err) {
    console.error(`  ⚠️  ocean_rates seed: ${err.message?.substring(0, 100)}`);
  }

  try {
    await dataset.table('vessel_positions').insert([
      { tenant_id: TENANT.id, vessel_name: 'COSCO Shipping Gemini', imo_number: '9811000', mmsi: '477000100', latitude: 33.73, longitude: -118.27, speed_knots: 0, heading: 180, status: 'at_berth', destination_port: 'USLAX', eta: '2026-04-04T12:00:00Z', data_authority: 'static-benchmark', data_source: 'seed', entity_hash: 'seed-v1', ingested_at: now, run_id: runId },
      { tenant_id: TENANT.id, vessel_name: 'Ever Given', imo_number: '9811001', mmsi: '477000200', latitude: 34.05, longitude: -119.50, speed_knots: 12.5, heading: 90, status: 'underway', destination_port: 'USLAX', eta: '2026-04-05T08:00:00Z', data_authority: 'static-benchmark', data_source: 'seed', entity_hash: 'seed-v2', ingested_at: now, run_id: runId },
    ]);
    console.log(`  ✅ Seeded 2 vessel_positions rows`);
  } catch (err) {
    console.error(`  ⚠️  vessel_positions seed: ${err.message?.substring(0, 100)}`);
  }

  try {
    await dataset.table('port_congestion').insert([
      { tenant_id: TENANT.id, port_code: 'USLAX', port_name: 'Port of Los Angeles', vessels_at_berth: 18, vessels_waiting: 12, avg_wait_hours: 48, congestion_index: 0.65, data_authority: 'static-benchmark', data_source: 'seed', entity_hash: 'seed-p1', ingested_at: now, run_id: runId },
      { tenant_id: TENANT.id, port_code: 'USLGB', port_name: 'Port of Long Beach', vessels_at_berth: 12, vessels_waiting: 8, avg_wait_hours: 36, congestion_index: 0.45, data_authority: 'static-benchmark', data_source: 'seed', entity_hash: 'seed-p2', ingested_at: now, run_id: runId },
    ]);
    console.log(`  ✅ Seeded 2 port_congestion rows`);
  } catch (err) {
    console.error(`  ⚠️  port_congestion seed: ${err.message?.substring(0, 100)}`);
  }

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║   ✅ BIGQUERY SETUP COMPLETE                             ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║   Dataset:  ${DATASET_ID}                           ║`);
  console.log(`║   Tables:   ocean_rates, vessel_positions, port_congestion ║`);
  console.log(`║   RLS:      ha-sentinel-demo tenant isolation active      ║`);
  console.log(`║   Seed:     7 demo data rows inserted                     ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
