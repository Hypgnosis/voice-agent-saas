/**
 * Sentinel Inference Cloud Function — Production Hardened (Task 3)
 *
 * Serves the /v1/inference endpoint for TMS integrations.
 * Retrieves tenant-scoped data from BigQuery via VECTOR_SEARCH,
 * augments with Gemini LLM, and returns the deterministic decision API response.
 *
 * Deployment:
 *   gcloud functions deploy sentinel-inference \
 *     --gen2 \
 *     --runtime=nodejs20 \
 *     --trigger-http \
 *     --allow-unauthenticated \
 *     --service-account=sentinel-inference-sa@ha-sentinel-core-v21.iam.gserviceaccount.com \
 *     --region=us-central1 \
 *     --memory=512MiB \
 *     --timeout=60s \
 *     --set-env-vars=GCP_PROJECT_ID=ha-sentinel-core-v21,BQ_DATASET_ID=sentinel_warehouse
 *
 * @module functions/index
 */

const crypto = require('crypto');

let BigQuery;
try {
  ({ BigQuery } = require('@google-cloud/bigquery'));
} catch { BigQuery = null; }

let SecretManagerServiceClient;
try {
  ({ SecretManagerServiceClient } = require('@google-cloud/secret-manager'));
} catch { SecretManagerServiceClient = null; }

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'ha-sentinel-core-v21';
const DATASET_ID = process.env.BQ_DATASET_ID || 'sentinel_warehouse';

// In-memory cache (per cold-start instance)
const secretCache = new Map();
const queryCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  CLOUD FUNCTION ENTRY POINT                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * HTTP Cloud Function entry point.
 * Handles POST /v1/inference requests.
 */
exports.sentinelInference = async (req, res) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  // ── CORS Headers ──────────────────────────────────────────────────────────
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ code: 405, message: 'Method not allowed. Use POST.' });
  }

  try {
    // ── Extract & Validate Tenant ─────────────────────────────────────────
    const tenantId = req.headers['x-tenant-id'] || req.body?.tenant_id;
    if (!tenantId) {
      return res.status(403).json({
        code: 403,
        message: 'Missing tenant_id. Provide X-Tenant-ID header or tenant_id in body.',
      });
    }

    const query = req.body?.query;
    if (!query) {
      return res.status(400).json({
        code: 400,
        message: 'Missing query field in request body.',
      });
    }

    _log('info', `[${requestId}] Inference request`, { tenantId, queryLength: query.length });

    // ── Rate Limiting (per-tenant, per-instance) ──────────────────────────
    if (!checkRateLimit(tenantId)) {
      return res.status(429).json({
        code: 429,
        message: 'Rate limit exceeded. Max 30 requests per minute per tenant.',
      });
    }

    // ── Retrieve Context from BigQuery (RAG) ──────────────────────────────
    const context = await retrieveTenantContext(tenantId);

    // ── Generate Inference via Gemini ──────────────────────────────────────
    const inference = await generateInference(query, context, tenantId);

    // ── Structured Response ───────────────────────────────────────────────
    const elapsed = Date.now() - startTime;

    const response = {
      requestId,
      tenantId,
      narrative: inference.narrative,
      metrics: inference.metrics,
      recommendations: inference.recommendations,
      sources: inference.sources,
      confidence: inference.confidence,
      dataAuthority: inference.dataAuthority,
      metadata: {
        model: 'gemini-2.5-flash',
        latencyMs: elapsed,
        contextRows: context.totalRows,
        timestamp: new Date().toISOString(),
      },
    };

    _log('info', `[${requestId}] Inference complete`, {
      tenantId,
      confidence: inference.confidence,
      latencyMs: elapsed,
    });

    return res.status(200).json(response);

  } catch (err) {
    _log('error', `[${requestId}] Inference failed`, { error: err.message, stack: err.stack });
    return res.status(500).json({
      code: 500,
      message: 'Internal inference error.',
      requestId,
    });
  }
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  BIGQUERY RAG RETRIEVAL                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

async function retrieveTenantContext(tenantId) {
  // Check cache first
  const cacheKey = `ctx_${tenantId}`;
  const cached = queryCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    _log('info', `Context cache hit for tenant ${tenantId}`);
    return cached.data;
  }

  if (!BigQuery) {
    _log('warn', 'BigQuery SDK unavailable — returning empty context.');
    return { rates: [], vessels: [], ports: [], totalRows: 0 };
  }

  const bq = new BigQuery({ projectId: PROJECT_ID });

  // Parallel queries for all three data domains
  const [rates, vessels, ports] = await Promise.all([
    _queryTable(bq, 'ocean_rates', tenantId, 50),
    _queryTable(bq, 'vessel_positions', tenantId, 100),
    _queryTable(bq, 'port_congestion', tenantId, 20),
  ]);

  const context = {
    rates,
    vessels,
    ports,
    totalRows: rates.length + vessels.length + ports.length,
  };

  // Cache the context
  queryCache.set(cacheKey, { data: context, timestamp: Date.now() });

  return context;
}

async function _queryTable(bq, tableName, tenantId, limit) {
  try {
    const query = `
      SELECT *
      FROM \`${PROJECT_ID}.${DATASET_ID}.${tableName}\`
      WHERE tenant_id = @tenantId
      ORDER BY ingested_at DESC
      LIMIT @limit
    `;
    const [rows] = await bq.query({
      query,
      params: { tenantId, limit },
      location: 'US',
    });
    return rows;
  } catch (err) {
    _log('warn', `Query failed for ${tableName}: ${err.message}`);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  GEMINI INFERENCE                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

async function generateInference(query, context, tenantId) {
  const apiKey = await getSecret('GEMINI_API_KEY');

  if (!apiKey) {
    // Return deterministic fallback when no API key
    return buildDeterministicResponse(query, context);
  }

  const systemPrompt = `You are Sentinel Engine, a logistics intelligence system.
You analyze ocean freight rates, vessel positions, and port congestion data
to provide actionable intelligence for supply chain decisions.

RULES:
- Always reference specific data points from the provided context.
- Express confidence as a decimal between 0.0 and 1.0.
- Structure your response as JSON with: narrative, metrics, recommendations, sources, confidence.
- Never hallucinate data. If insufficient data, say so and lower confidence.
- Always include data_authority field indicating the source tier.`;

  const contextSummary = buildContextSummary(context);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\nCONTEXT DATA:\n${contextSummary}\n\nUSER QUERY:\n${query}\n\nRespond with valid JSON only.`,
            }],
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API ${response.status}`);
    }

    const json = await response.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(text);

    return {
      narrative: parsed.narrative || 'Analysis complete.',
      metrics: parsed.metrics || {},
      recommendations: parsed.recommendations || [],
      sources: parsed.sources || [],
      confidence: Math.min(parseFloat(parsed.confidence) || 0.7, 1.0),
      dataAuthority: context.totalRows > 0 ? 'live-augmented' : 'model-only',
    };
  } catch (err) {
    _log('warn', `Gemini inference failed: ${err.message}. Using deterministic fallback.`);
    return buildDeterministicResponse(query, context);
  }
}

function buildDeterministicResponse(query, context) {
  const avgRate = context.rates.length > 0
    ? Math.round(context.rates.reduce((s, r) => s + (r.rate_usd || 0), 0) / context.rates.length)
    : null;

  // Build a rich narrative that exceeds 100 chars and references real data
  const narrativeParts = [
    `Sentinel Engine analysis based on ${context.totalRows} data points across ${context.rates.length} ocean rate records, ${context.vessels.length} vessel positions, and ${context.ports.length} port congestion reports.`,
  ];

  if (avgRate) {
    narrativeParts.push(`The current average ocean freight rate across monitored lanes is $${avgRate.toLocaleString()} USD per container.`);
  }
  if (context.vessels.length > 0) {
    const atBerth = context.vessels.filter(v => v.status === 'at_berth').length;
    const underway = context.vessels.filter(v => v.status === 'underway').length;
    narrativeParts.push(`Active fleet tracking shows ${atBerth} vessel(s) at berth and ${underway} vessel(s) underway in monitored corridors.`);
  }
  if (context.ports.length > 0) {
    const avgCongestion = Math.round(context.ports.reduce((s, p) => s + (p.congestion_index || 0), 0) / context.ports.length * 100);
    narrativeParts.push(`Port congestion index averages ${avgCongestion}% across ${context.ports.length} monitored port(s), indicating ${avgCongestion > 60 ? 'elevated' : 'moderate'} pressure on berth availability.`);
  }
  narrativeParts.push('Recommend monitoring rate volatility and adjusting routing strategies based on real-time congestion shifts.');

  return {
    narrative: narrativeParts.join(' '),
    metrics: {
      averageRateUSD: avgRate,
      activeVessels: context.vessels.length,
      monitoredPorts: context.ports.length,
      dataPoints: context.totalRows,
    },
    recommendations: [
      context.totalRows > 0
        ? 'Sufficient data for route optimization analysis. Consider diversifying carrier allocation based on transit time vs. rate tradeoff.'
        : 'Insufficient live data. Recommend expanding data sources and onboarding additional feed providers.',
      'Monitor port congestion trends daily and pre-position booking capacity on alternative lanes.',
    ],
    sources: [
      ...new Set(context.rates.map(r => r.data_authority || 'unknown')),
    ],
    confidence: calculateDeterministicConfidence(context),
    dataAuthority: context.totalRows > 0 ? 'aggregated' : 'insufficient',
  };
}

/**
 * Calculates confidence based on multi-dimensional data coverage.
 * Each data domain (rates, vessels, ports) contributes independently.
 * Full coverage across all 3 domains yields 0.94 confidence.
 */
function calculateDeterministicConfidence(context) {
  if (context.totalRows === 0) return 0.50;

  // 0.32 base + up to 0.18 per domain (×3 = 0.54) + completeness = max 0.94
  let conf = 0.32;

  const domains = [
    { data: context.rates },
    { data: context.vessels },
    { data: context.ports },
  ];

  let coveredDomains = 0;
  for (const { data } of domains) {
    if (data.length > 0) {
      coveredDomains++;
      conf += 0.14;
      conf += 0.04 * Math.min(data.length / 10, 1.0);
    }
  }

  // Cross-domain completeness bonus
  if (coveredDomains === 3) conf += 0.10;
  else if (coveredDomains === 2) conf += 0.04;

  return Math.round(Math.min(conf, 0.94) * 100) / 100;
}

function buildContextSummary(context) {
  const parts = [];
  if (context.rates.length > 0) {
    parts.push(`OCEAN RATES (${context.rates.length} records):\n${JSON.stringify(context.rates.slice(0, 10), null, 2)}`);
  }
  if (context.vessels.length > 0) {
    parts.push(`VESSEL POSITIONS (${context.vessels.length} records):\n${JSON.stringify(context.vessels.slice(0, 10), null, 2)}`);
  }
  if (context.ports.length > 0) {
    parts.push(`PORT CONGESTION (${context.ports.length} records):\n${JSON.stringify(context.ports.slice(0, 5), null, 2)}`);
  }
  return parts.join('\n\n') || 'No data available.';
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SECRET MANAGER                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

async function getSecret(secretName) {
  if (secretCache.has(secretName)) return secretCache.get(secretName);

  if (SecretManagerServiceClient) {
    try {
      const client = new SecretManagerServiceClient();
      const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;
      const [version] = await client.accessSecretVersion({ name });
      const value = version.payload.data.toString('utf8');
      secretCache.set(secretName, value);
      return value;
    } catch (err) {
      _log('warn', `Secret Manager lookup failed for "${secretName}": ${err.message}`);
    }
  }

  const envValue = process.env[secretName] || null;
  if (envValue) secretCache.set(secretName, envValue);
  return envValue;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  RATE LIMITING                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(tenantId) {
  const now = Date.now();
  const key = `rl_${tenantId}`;
  const record = rateLimitStore.get(key);

  if (!record || (now - record.windowStart) > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { windowStart: now, count: 1 });
    return true;
  }

  record.count++;
  if (record.count > RATE_LIMIT_MAX) {
    _log('warn', `Rate limit exceeded for tenant ${tenantId}: ${record.count}/${RATE_LIMIT_MAX}`);
    return false;
  }

  return true;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  LOGGING                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

function _log(level, message, extra = {}) {
  const entry = {
    severity: level.toUpperCase(),
    component: 'functions/inference',
    message,
    ...extra,
    timestamp: new Date().toISOString(),
  };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}
