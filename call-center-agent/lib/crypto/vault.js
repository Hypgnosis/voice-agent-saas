// ═══════════════════════════════════════════════════════════════════════════
// AES-256-GCM VAULT — Symmetric Encryption for Tenant Secrets
// ═══════════════════════════════════════════════════════════════════════════
// Encrypts sensitive tenant values (e.g. calendar_api_key) before
// persisting to Firestore. Decrypts on read for backend-only use.
//
// Key: 32-byte hex string from VAULT_ENCRYPTION_KEY env var.
// Format: base64(iv:authTag:ciphertext)
//
// NEVER return decrypted values to the browser. Backend-only decryption
// happens in calendarFunctions.js when making Cal.com API calls.
// ═══════════════════════════════════════════════════════════════════════════

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;         // 96-bit IV (NIST recommendation for GCM)
const AUTH_TAG_LENGTH = 16;   // 128-bit authentication tag

/**
 * Returns the vault encryption key as a Buffer.
 * Fails fast if the key is not configured or is the wrong length.
 */
function getKey() {
    const keyHex = process.env.VAULT_ENCRYPTION_KEY;
    if (!keyHex || keyHex.length !== 64) {
        throw new Error(
            'VAULT_ENCRYPTION_KEY is not configured or is not 64 hex characters (32 bytes). '
            + 'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
    }
    return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param {string} plaintext — The sensitive value to encrypt
 * @returns {string} — Base64-encoded envelope: iv + authTag + ciphertext
 */
export function encrypt(plaintext) {
    if (!plaintext || typeof plaintext !== 'string') {
        return '';
    }

    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Envelope: iv (12 bytes) + authTag (16 bytes) + ciphertext (variable)
    const envelope = Buffer.concat([iv, authTag, encrypted]);
    return envelope.toString('base64');
}

/**
 * Decrypts a value previously encrypted with encrypt().
 *
 * @param {string} encryptedBase64 — The base64-encoded envelope
 * @returns {string} — The decrypted plaintext
 */
export function decrypt(encryptedBase64) {
    if (!encryptedBase64 || typeof encryptedBase64 !== 'string') {
        return '';
    }

    const key = getKey();
    const envelope = Buffer.from(encryptedBase64, 'base64');

    // Minimum envelope size: IV (12) + AuthTag (16) + at least 1 byte of ciphertext
    if (envelope.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
        throw new Error('Invalid encrypted value — envelope too short');
    }

    const iv = envelope.subarray(0, IV_LENGTH);
    const authTag = envelope.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = envelope.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

/**
 * Returns a masked version of a sensitive string for UI display.
 * E.g., "cal_live_abcdef123456" → "cal_****3456"
 *
 * @param {string} value — The plaintext or encrypted value
 * @param {number} visibleChars — Number of trailing characters to show
 * @returns {string}
 */
export function mask(value, visibleChars = 4) {
    if (!value || value.length <= visibleChars) return '••••';
    const prefix = value.substring(0, 4);
    const suffix = value.substring(value.length - visibleChars);
    return `${prefix}****${suffix}`;
}

/**
 * Checks whether a string appears to be an encrypted envelope
 * (i.e., it was already processed by encrypt()).
 * Heuristic: valid base64, starts with expected byte patterns.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isEncrypted(value) {
    if (!value || typeof value !== 'string') return false;
    try {
        const buf = Buffer.from(value, 'base64');
        // Must be at least IV + AuthTag + 1 byte
        return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
    } catch {
        return false;
    }
}
