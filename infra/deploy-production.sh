#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Sentinel Engine — Production Deployment Script (Task 3)
#
# Deploys both the Cloud Function (inference) and Cloud Run Job (ETL)
# with proper service accounts, memory limits, and security settings.
#
# Usage:
#   chmod +x infra/deploy-production.sh
#   ./infra/deploy-production.sh
#
# Prerequisites:
#   - gcloud CLI authenticated with project owner/editor
#   - Service accounts already provisioned (via infra/provision-iam.sh)
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-ha-sentinel-core-v21}"
REGION="${GCP_REGION:-us-central1}"

ETL_SA="sentinel-etl-sa@${PROJECT_ID}.iam.gserviceaccount.com"
INFERENCE_SA="sentinel-inference-sa@${PROJECT_ID}.iam.gserviceaccount.com"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Sentinel Engine — Production Deployment               ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║   Project:   ${PROJECT_ID}"
echo "║   Region:    ${REGION}"
echo "║   ETL SA:    ${ETL_SA}"
echo "║   Inf SA:    ${INFERENCE_SA}"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Deploy Inference Cloud Function ──────────────────────────────────
echo "━━━ Step 1: Deploying Inference Cloud Function ━━━"

gcloud functions deploy sentinel-inference \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --service-account="${INFERENCE_SA}" \
  --region="${REGION}" \
  --source=./functions \
  --entry-point=sentinelInference \
  --memory=512MiB \
  --timeout=60s \
  --min-instances=0 \
  --max-instances=10 \
  --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},BQ_DATASET_ID=sentinel_warehouse" \
  --project="${PROJECT_ID}" \
  --quiet

echo "✅ Inference Cloud Function deployed."
echo ""

# ─── Step 2: Deploy ETL Cloud Run Job ─────────────────────────────────────────
echo "━━━ Step 2: Deploying ETL Cloud Run Job ━━━"

gcloud run jobs deploy sentinel-etl-job \
  --source=./etl \
  --service-account="${ETL_SA}" \
  --region="${REGION}" \
  --task-timeout=600s \
  --max-retries=1 \
  --memory=1Gi \
  --cpu=1 \
  --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},BQ_DATASET_ID=sentinel_warehouse" \
  --project="${PROJECT_ID}" \
  --quiet

echo "✅ ETL Cloud Run Job deployed."
echo ""

# ─── Step 3: Create Cloud Scheduler trigger for ETL ───────────────────────────
echo "━━━ Step 3: Setting up ETL schedule (every 6 hours) ━━━"

gcloud scheduler jobs create http sentinel-etl-schedule \
  --location="${REGION}" \
  --schedule="0 */6 * * *" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/sentinel-etl-job:run" \
  --http-method=POST \
  --oauth-service-account-email="${ETL_SA}" \
  --project="${PROJECT_ID}" \
  --quiet 2>/dev/null || \
  echo "  ℹ️  Scheduler job already exists or scheduler API not enabled."

echo ""

# ─── Step 4: Verify Deployments ──────────────────────────────────────────────
echo "━━━ Step 4: Verifying Deployments ━━━"

echo "  Inference Function:"
gcloud functions describe sentinel-inference \
  --gen2 \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="table(name,state,serviceConfig.uri)" 2>/dev/null || \
  echo "  ⚠️  Could not verify function (may need additional permissions)"

echo ""
echo "  ETL Job:"
gcloud run jobs describe sentinel-etl-job \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="table(metadata.name,status.conditions[0].type,status.conditions[0].status)" 2>/dev/null || \
  echo "  ⚠️  Could not verify job (may need additional permissions)"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   ✅ DEPLOYMENT COMPLETE                                ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║   Inference:  gcloud functions call sentinel-inference  ║"
echo "║   ETL:        gcloud run jobs execute sentinel-etl-job  ║"
echo "╚══════════════════════════════════════════════════════════╝"
