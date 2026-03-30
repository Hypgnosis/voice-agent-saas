import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

// ─── Validation Helpers ─────────────────────────────────────────────────────
/**
 * Sanitizes an event_type_id value. Cal.com IDs are strictly numeric integers.
 * Returns the stringified integer if valid, or '' if empty/invalid.
 */
function sanitizeEventTypeId(raw) {
    if (raw === undefined || raw === null || raw === '') return '';
    const parsed = parseInt(String(raw).trim(), 10);
    if (isNaN(parsed) || parsed <= 0) return '';
    return String(parsed);
}

/** Trims a string value, returns '' for falsy inputs. */
function sanitizeString(val) {
    if (!val) return '';
    return String(val).trim();
}

// ─── Allowed nested integration keys ────────────────────────────────────────
// Only these keys may be written into the integrations map.
// Any other keys sent by the client are silently dropped.
const ALLOWED_INTEGRATION_KEYS = {
    calendar_api_key: sanitizeString,
    calendar_id:      sanitizeString,
    event_type_id:    sanitizeEventTypeId,
};

export async function PUT(request, { params }) {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase not configured' }, { status: 503 });
        }

        const bid = params.bid || (await params).bid;
        const data = await request.json();

        if (!bid) {
             return NextResponse.json({ error: 'Missing business ID' }, { status: 400 });
        }

        const docRef = adminDb.collection('businesses').doc(bid);
        const doc = await docRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: 'Business not found' }, { status: 404 });
        }

        // ── Flat field allowlist ────────────────────────────────────────────
        const updateData = {};
        const allowedFields = ["name", "slug", "description", "knowledge_base", "greeting",
                  "voice_en", "voice_es", "language", "phone_number", "whatsapp_number", "whatsapp_number_id", "active", "timezone"];

        for (let field of allowedFields) {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        }

        // ── Secure nested integrations extraction ───────────────────────────
        // Only explicitly allowlisted keys are extracted from the client payload.
        // Each value runs through its own sanitizer before hitting Firestore.
        // Raw client data never passes through — prevents mass-assignment attacks.
        if (data.integrations && typeof data.integrations === 'object') {
            for (const [key, sanitizer] of Object.entries(ALLOWED_INTEGRATION_KEYS)) {
                if (data.integrations[key] !== undefined) {
                    updateData[`integrations.${key}`] = sanitizer(data.integrations[key]);
                }
            }
        }

        if (Object.keys(updateData).length > 0) {
            await docRef.update(updateData);
        }

        return NextResponse.json({ id: bid, ...doc.data(), ...updateData });

    } catch (e) {
        console.error('PUT /api/businesses/[bid] error:', e);
        return NextResponse.json({ error: 'Database error', details: e.message }, { status: 500 });
    }
}
