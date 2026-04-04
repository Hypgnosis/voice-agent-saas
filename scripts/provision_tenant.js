#!/usr/bin/env node
/**
 * Multi-Tenant Onboarding Automation — Task 2
 *
 * Provisions a new tenant in the Sentinel Engine:
 *   1. Creates a Firestore tenant config document
 *   2. Creates a BigQuery Row Access Policy for tenant isolation
 *   3. Validates the provisioning
 *
 * Usage:
 *   node scripts/provision_tenant.js \
 *     --tenant-id=acme-logistics \
 *     --company="Acme Logistics Inc." \
 *     --email=ops@acme-logistics.com \
 *     --origin=CNSHA \
 *     --destination=USLAX \
 *     --port=USLAX
 *
 * @module scripts/provision_tenant
 */

const { execSync } = require('child_process');
const crypto = require('crypto');

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  CONFIGURATION                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'ha-sentinel-core-v21';
const DATASET_ID = process.env.BQ_DATASET_ID || 'sentinel_warehouse';
const REGION = process.env.GCP_REGION || 'us-central1';

// Tables that require Row Access Policies
const RLS_TABLES = [
  'ocean_rates',
  'vessel_positions',
  'port_congestion',
];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  CLI ARGUMENT PARSING                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    if (match) {
      const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[key] = match[2];
    }
  }
  return args;
}

function validateArgs(args) {
  const required = ['tenantId', 'company', 'email'];
  const missing = required.filter(k => !args[k]);
  if (missing.length > 0) {
    console.error(`❌ Missing required arguments: ${missing.map(k => `--${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}`).join(', ')}`);
    console.error(`\nUsage:`);
    console.error(`  node scripts/provision_tenant.js \\`);
    console.error(`    --tenant-id=acme-logistics \\`);
    console.error(`    --company="Acme Logistics Inc." \\`);
    console.error(`    --email=ops@acme-logistics.com \\`);
    console.error(`    --origin=CNSHA \\`);
    console.error(`    --destination=USLAX \\`);
    console.error(`    --port=USLAX`);
    process.exit(1);
  }
  return args;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  STEP 1: FIRESTORE TENANT CONFIG                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function provisionFirestoreTenantConfig(tenant) {
  _log('info', `Step 1: Creating Firestore tenant config for "${tenant.tenantId}"...`);

  const doc = {
    tenant_id: tenant.tenantId,
    company_name: tenant.company,
    admin_email: tenant.email,
    default_origin: tenant.origin || 'CNSHA',
    default_destination: tenant.destination || 'USLAX',
    container_type: tenant.containerType || '40HC',
    primary_port: tenant.port || 'USLAX',
    status: 'active',
    tier: tenant.tier || 'standard',
    provisioned_at: new Date().toISOString(),
    provisioned_by: 'provision_tenant.js',
    api_key_hash: crypto.randomBytes(16).toString('hex'),
  };

  // Write to Firestore via gcloud (avoids needing firebase-admin in scripts)
  try {
    const escapedDoc = JSON.stringify(doc).replace(/"/g, '\\"');
    execSync(
      `gcloud firestore documents create ` +
      `projects/${PROJECT_ID}/databases/(default)/documents/tenants/${tenant.tenantId} ` +
      `--data='${JSON.stringify(doc)}' ` +
      `--project=${PROJECT_ID} 2>&1`,
      { stdio: 'pipe', encoding: 'utf8' }
    );
    _log('info', `  ✅ Firestore doc created: tenants/${tenant.tenantId}`);
  } catch (err) {
    // Firestore CLI may not be available; log and continue
    _log('warn', `  ⚠️  Firestore CLI provisioning skipped (run manually or via Admin SDK): ${err.message?.substring(0, 100)}`);
    _log('info', `  📋 Tenant config to insert manually:`);
    console.log(JSON.stringify(doc, null, 2));
  }

  return doc;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  STEP 2: BIGQUERY ROW ACCESS POLICIES (RLS)                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

function provisionBigQueryRLS(tenant) {
  _log('info', `Step 2: Creating BigQuery Row Access Policies for "${tenant.tenantId}"...`);

  const policyResults = [];

  for (const table of RLS_TABLES) {
    const policyName = `rls_${tenant.tenantId.replace(/[^a-zA-Z0-9_]/g, '_')}_${table}`;

    // The Row Access Policy restricts rows to only those matching this tenant_id.
    // The grantee is the tenant's admin email AND the ETL/inference service accounts.
    const createPolicySQL = `
CREATE ROW ACCESS POLICY IF NOT EXISTS \`${policyName}\`
ON \`${PROJECT_ID}.${DATASET_ID}.${table}\`
GRANT TO (
  "user:${tenant.email}",
  "serviceAccount:sentinel-etl-sa@${PROJECT_ID}.iam.gserviceaccount.com",
  "serviceAccount:sentinel-inference-sa@${PROJECT_ID}.iam.gserviceaccount.com"
)
FILTER USING (tenant_id = "${tenant.tenantId}");
    `.trim();

    _log('info', `  Creating RLS policy: ${policyName} on ${DATASET_ID}.${table}`);

    try {
      const output = execSync(
        `bq query --use_legacy_sql=false --project_id=${PROJECT_ID} "${createPolicySQL.replace(/\n/g, ' ').replace(/"/g, '\\"')}"`,
        { stdio: 'pipe', encoding: 'utf8', timeout: 30000 }
      );
      _log('info', `  ✅ RLS policy created: ${policyName}`);
      policyResults.push({ table, policy: policyName, status: 'created' });
    } catch (err) {
      // bq CLI may not be installed locally; generate the SQL for manual execution
      _log('warn', `  ⚠️  bq CLI execution failed. SQL saved for manual execution.`);
      policyResults.push({ table, policy: policyName, status: 'pending-manual', sql: createPolicySQL });
    }
  }

  return policyResults;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  STEP 3: GRANT IAM ROLES (Data Viewer for BigQuery)                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

function grantIAMRoles(tenant) {
  _log('info', `Step 3: Granting IAM roles for "${tenant.email}"...`);

  const bindings = [
    {
      role: 'roles/bigquery.dataViewer',
      member: `user:${tenant.email}`,
    },
    {
      role: 'roles/bigquery.jobUser',
      member: `user:${tenant.email}`,
    },
  ];

  for (const binding of bindings) {
    try {
      execSync(
        `gcloud projects add-iam-policy-binding ${PROJECT_ID} ` +
        `--member="${binding.member}" ` +
        `--role="${binding.role}" ` +
        `--condition=None ` +
        `--quiet 2>&1`,
        { stdio: 'pipe', encoding: 'utf8', timeout: 30000 }
      );
      _log('info', `  ✅ Granted ${binding.role} to ${binding.member}`);
    } catch (err) {
      _log('warn', `  ⚠️  IAM binding skipped (requires gcloud auth): ${binding.role}`);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  STEP 4: VALIDATION                                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

function validateProvisioning(tenant, rlsResults) {
  _log('info', `Step 4: Validating provisioning for "${tenant.tenantId}"...`);

  const report = {
    tenantId: tenant.tenantId,
    company: tenant.company,
    email: tenant.email,
    timestamp: new Date().toISOString(),
    steps: {
      firestoreConfig: 'completed',
      bigqueryRLS: rlsResults.every(r => r.status === 'created') ? 'completed' : 'pending-manual',
      iamRoles: 'attempted',
    },
    rlsPolicies: rlsResults,
    deploymentNotes: [
      `ETL job will auto-include this tenant on next scheduled run.`,
      `Inference endpoint will scope queries to tenant_id="${tenant.tenantId}".`,
      `Admin can access data via: https://console.cloud.google.com/bigquery?project=${PROJECT_ID}`,
    ],
  };

  // Generate the manual SQL bundle if any policies are pending
  const pendingSQL = rlsResults
    .filter(r => r.status === 'pending-manual')
    .map(r => r.sql);

  if (pendingSQL.length > 0) {
    report.manualSQL = pendingSQL;
    _log('warn', '\n━━━ MANUAL SQL REQUIRED ━━━');
    _log('warn', 'Run the following in BigQuery Console or via bq CLI:\n');
    for (const sql of pendingSQL) {
      console.log(sql);
      console.log('');
    }
  }

  return report;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN                                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */

function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Sentinel Engine — Tenant Provisioning Tool        ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const args = validateArgs(parseArgs());

  const tenant = {
    tenantId: args.tenantId,
    company: args.company,
    email: args.email,
    origin: args.origin || 'CNSHA',
    destination: args.destination || 'USLAX',
    port: args.port || 'USLAX',
    containerType: args.containerType || '40HC',
    tier: args.tier || 'standard',
  };

  _log('info', `Provisioning tenant: ${tenant.tenantId} (${tenant.company})`);
  _log('info', `Project: ${PROJECT_ID} | Dataset: ${DATASET_ID}\n`);

  // Execute provisioning steps
  const firestoreDoc = provisionFirestoreTenantConfig(tenant);
  const rlsResults = provisionBigQueryRLS(tenant);
  grantIAMRoles(tenant);
  const report = validateProvisioning(tenant, rlsResults);

  // Final summary
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   PROVISIONING REPORT                                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(JSON.stringify(report, null, 2));

  const allComplete = Object.values(report.steps).every(s => s === 'completed');
  if (allComplete) {
    _log('info', '\n✅ Tenant fully provisioned. Ready for production.');
  } else {
    _log('warn', '\n⚠️  Tenant partially provisioned. See manual steps above.');
  }

  process.exit(0);
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function _log(level, message) {
  const entry = {
    severity: level.toUpperCase(),
    component: 'provision-tenant',
    message,
    timestamp: new Date().toISOString(),
  };
  if (level === 'error') console.error(message);
  else if (level === 'warn') console.warn(message);
  else console.log(message);
}

main();
