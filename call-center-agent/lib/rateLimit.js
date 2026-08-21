import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Check if Upstash env vars exist before creating the Redis client.
// Without this, the app would crash on startup if credentials are not yet added.
const isRedisConfigured = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const redis = isRedisConfigured ? new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
}) : null;

export const rateLimiter = isRedisConfigured
    ? new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(60, "1 m"), // 60 requests per window
          analytics: true,
          // Optional prefix for separation in Redis
          prefix: "@upstash/ratelimit/sovereign-agent",
      })
    : {
          // Fallback if Redis is not configured (e.g. during local dev without Upstash)
          limit: async (identifier) => {
              console.warn(`⚠️ Rate Limiter Bypassed: Redis not configured. Key: ${identifier}`);
              return { success: true, pending: Promise.resolve() };
          }
      };

/**
 * Validates the rate limit for a specific identifier.
 * @param {string} identifier - Unique key to rate limit (e.g., patient phone, business id)
 * @returns {Promise<{ success: boolean, reset?: number, limit?: number, remaining?: number }>}
 */
export async function checkRateLimit(identifier) {
    return await rateLimiter.limit(identifier);
}
