/**
 * Secret Manager Accessor — GCP-native secret retrieval with local fallback.
 * 
 * In production (Cloud Run Jobs), uses the @google-cloud/secret-manager SDK.
 * Locally, falls back to process.env for development ergonomics.
 *
 * @module etl/lib/secret-manager
 */

let SecretManagerServiceClient;
try {
  ({ SecretManagerServiceClient } = require('@google-cloud/secret-manager'));
} catch {
  // SDK not installed locally — will use env fallback
  SecretManagerServiceClient = null;
}

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'ha-sentinel-core-v21';

// In-memory cache to avoid redundant API calls within the same ETL run
const secretCache = new Map();

/**
 * Retrieve a secret value.
 * Priority: cache → Secret Manager SDK → process.env fallback.
 *
 * @param {string} secretName - e.g., 'XENETA_API_KEY'
 * @returns {Promise<string|null>}
 */
async function getSecret(secretName) {
  // 1. Check cache
  if (secretCache.has(secretName)) {
    return secretCache.get(secretName);
  }

  // 2. Attempt Secret Manager SDK (production)
  if (SecretManagerServiceClient) {
    try {
      const client = new SecretManagerServiceClient();
      const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;
      const [version] = await client.accessSecretVersion({ name });
      const value = version.payload.data.toString('utf8');
      secretCache.set(secretName, value);
      console.log(JSON.stringify({
        severity: 'INFO',
        component: 'secret-manager',
        message: `Secret "${secretName}" retrieved from Secret Manager.`,
      }));
      return value;
    } catch (err) {
      console.warn(JSON.stringify({
        severity: 'WARNING',
        component: 'secret-manager',
        message: `Secret Manager lookup failed for "${secretName}": ${err.message}. Falling back to env.`,
      }));
    }
  }

  // 3. Fallback to environment variable
  const envValue = process.env[secretName] || null;
  if (envValue) {
    secretCache.set(secretName, envValue);
    console.log(JSON.stringify({
      severity: 'INFO',
      component: 'secret-manager',
      message: `Secret "${secretName}" loaded from environment variable.`,
    }));
  } else {
    console.warn(JSON.stringify({
      severity: 'WARNING',
      component: 'secret-manager',
      message: `Secret "${secretName}" not found in Secret Manager or environment.`,
    }));
  }
  return envValue;
}

module.exports = { getSecret };
