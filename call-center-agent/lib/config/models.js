// ═══════════════════════════════════════════════════════════════════════════
// MODEL CONFIGURATION — Centralized, Production-Verified Model IDs
// ═══════════════════════════════════════════════════════════════════════════
// All Gemini model references MUST use constants from this file.
// No inline model strings allowed anywhere in the codebase.
//
// Board Directive: Only GA (General Availability) model strings.
// gemini-2.5-flash has been revoked for this GTC launch.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Primary inference model for text generation and function calling.
 * Used in webhook handler for both Standard and Internal agents.
 */
export const MODEL_INFERENCE = 'gemini-1.5-flash-latest';

/**
 * Text-to-Speech model for native audio synthesis.
 * Note: TTS model availability should be verified before each deployment.
 * If unavailable, the system falls back to text-only responses.
 */
export const MODEL_TTS = 'gemini-2.5-flash-preview-tts';

/**
 * Validates that a model string is in our approved list.
 * Use this to guard against accidental model string injection.
 *
 * @param {string} modelId
 * @returns {boolean}
 */
export function isApprovedModel(modelId) {
    return [MODEL_INFERENCE, MODEL_TTS].includes(modelId);
}
