// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS DETAIL API — Zero-Trust Tenant-Scoped Updates
// ═══════════════════════════════════════════════════════════════════════════
// Protected by Firebase ID Token + business ownership verification.
// client_pin has been REMOVED from the allowlist.
// calendar_api_key is encrypted before persistence.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyBusinessAccess, handleAuthError } from '@/lib/auth/verifySession';
import { encrypt } from '@/lib/crypto/vault';

export const dynamic = 'force-dynamic';

// ─── Validation Helpers ─────────────────────────────────────────────────────
function sanitizeEventTypeId(raw) {
    if (raw === undefined || raw === null || raw === '') return '';
    const parsed = parseInt(String(raw).trim(), 10);
    if (isNaN(parsed) || parsed <= 0) return '';
    return String(parsed);
}

function sanitizeString(val) {
    if (!val) return '';
    return String(val).trim();
}

// Only these keys may be written into the integrations map.
const ALLOWED_INTEGRATION_KEYS = {
    calendar_api_key: sanitizeString,
    calendar_id: sanitizeString,
    event_type_id: sanitizeEventTypeId,
    gemini_api_key: sanitizeString,
    whatsapp_access_token: sanitizeString,
};

// Keys that must be vault-encrypted before persistence — never store these
// as plaintext, they're live credentials billed/rate-limited per tenant.
const ENCRYPTED_INTEGRATION_KEYS = new Set(['calendar_api_key', 'gemini_api_key', 'whatsapp_access_token']);

export async function PUT(request, { params }) {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase not configured' }, { status: 503 });
        }

        const bid = params.bid || (await params).bid;
        if (!bid) {
            return NextResponse.json({ error: 'Missing business ID' }, { status: 400 });
        }

        // Zero-Trust: verify the caller owns this business
        const session = await verifyBusinessAccess(request, bid);

        const docRef = adminDb.collection('businesses').doc(bid);
        const doc = await docRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: 'Business not found' }, { status: 404 });
        }

        const data = await request.json();

        // ── Flat field allowlist (client_pin REMOVED) ──────────────────────
        const updateData = {};
        const allowedFields = [
            "name", "slug", "description", "knowledge_base", "greeting",
            "voice_en", "voice_es", "language", "phone_number",
            "whatsapp_number", "whatsapp_number_id", "active", "timezone"
        ];

        for (let field of allowedFields) {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        }

        // ── Secure nested integrations extraction ──────────────────────────
        if (data.integrations && typeof data.integrations === 'object') {
            for (const [key, sanitizer] of Object.entries(ALLOWED_INTEGRATION_KEYS)) {
                if (data.integrations[key] !== undefined) {
                    let value = sanitizer(data.integrations[key]);

                    // Encrypt sensitive keys before persisting
                    if (ENCRYPTED_INTEGRATION_KEYS.has(key) && value) {
                        value = encrypt(value);
                    }

                    updateData[`integrations.${key}`] = value;
                }
            }
        }

        if (Object.keys(updateData).length > 0) {
            await docRef.update(updateData);
        }

        // Return only safe metadata — never return raw secrets
        return NextResponse.json({
            id: bid,
            updated: Object.keys(updateData),
            success: true,
        });

    } catch (error) {
        return handleAuthError(error);
    }
}
