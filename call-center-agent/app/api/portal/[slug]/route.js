// ═══════════════════════════════════════════════════════════════════════════
// PORTAL API — Zero-Trust Tenant-Scoped Configuration
// ═══════════════════════════════════════════════════════════════════════════
// Replaces the deprecated HMAC token + slug pattern.
// Every request is authenticated via Firebase ID Token and scoped to
// the tenant's owned businesses. Cross-tenant access is impossible.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifySession, handleAuthError } from '@/lib/auth/verifySession';
import { encrypt, mask, isEncrypted, decrypt } from '@/lib/crypto/vault';

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

const ALLOWED_INTEGRATION_KEYS = {
    calendar_api_key: sanitizeString,
    calendar_id: sanitizeString,
    event_type_id: sanitizeEventTypeId,
};

// ─── Tenant Resolution ──────────────────────────────────────────────────────
/**
 * Finds the business by slug AND verifies the authenticated user owns it.
 * Returns { doc, data } or throws 403/404.
 */
async function resolveOwnedBusiness(slug, session) {
    if (!adminDb) {
        throw Object.assign(new Error('Database unavailable'), { status: 503, isAuthError: true });
    }

    const snapshot = await adminDb
        .collection('businesses')
        .where('slug', '==', slug)
        .limit(1)
        .get();

    if (snapshot.empty) {
        throw Object.assign(new Error('Agent not found'), { status: 404, isAuthError: true });
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // Zero-Trust: verify ownership (admin bypasses)
    if (session.role !== 'admin') {
        if (data.owner_uid !== session.uid && !session.tenant_ids.includes(doc.id)) {
            throw Object.assign(
                new Error('Access denied — you do not own this resource'),
                { status: 403, isAuthError: true }
            );
        }
    }

    return { doc, data };
}


// ─── GET: Fetch business data ───────────────────────────────────────────────
export async function GET(request, { params }) {
    try {
        const session = await verifySession(request);
        const { slug } = await params;
        const { doc, data } = await resolveOwnedBusiness(slug, session);

        // Return ONLY what the client dashboard needs
        // NEVER return raw secrets — mask the calendar_api_key
        const calendarApiKey = data.integrations?.calendar_api_key || '';
        let maskedKey = '';
        if (calendarApiKey) {
            // If it's encrypted, decrypt first then mask for display
            const raw = isEncrypted(calendarApiKey) ? decrypt(calendarApiKey) : calendarApiKey;
            maskedKey = mask(raw);
        }

        return NextResponse.json({
            id: doc.id,
            name: data.name,
            slug: data.slug,
            description: data.description || '',
            greeting: data.greeting || '',
            knowledge_base: data.knowledge_base || '',
            timezone: data.timezone || 'America/Merida',
            integrations: {
                calendar_api_key_masked: maskedKey,
                calendar_id: data.integrations?.calendar_id || '',
                event_type_id: data.integrations?.event_type_id || '',
            },
            active: data.active ?? true,
        });
    } catch (error) {
        return handleAuthError(error);
    }
}


// ─── PUT: Update business data ──────────────────────────────────────────────
export async function PUT(request, { params }) {
    try {
        const session = await verifySession(request);
        const { slug } = await params;
        const { doc } = await resolveOwnedBusiness(slug, session);

        const { checkRateLimit } = await import('@/lib/rateLimit');
        const rateLimitResult = await checkRateLimit(`portal_update_${doc.id}`);
        if (!rateLimitResult.success) {
            return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
        }

        const body = await request.json();

        // Build sanitized update — clients can ONLY update these fields:
        const updateData = {};

        // Allowed direct fields
        const ALLOWED_DIRECT_FIELDS = ['description', 'greeting', 'knowledge_base', 'timezone'];
        for (const key of ALLOWED_DIRECT_FIELDS) {
            if (body[key] !== undefined) {
                updateData[key] = sanitizeString(body[key]);
            }
        }

        // Allowed integration fields (using dot-notation for merge)
        if (body.integrations && typeof body.integrations === 'object') {
            for (const [key, sanitizer] of Object.entries(ALLOWED_INTEGRATION_KEYS)) {
                if (body.integrations[key] !== undefined) {
                    let value = sanitizer(body.integrations[key]);

                    // Encrypt sensitive keys before persisting
                    if (key === 'calendar_api_key' && value) {
                        value = encrypt(value);
                    }

                    updateData[`integrations.${key}`] = value;
                }
            }
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        await adminDb.collection('businesses').doc(doc.id).update(updateData);

        return NextResponse.json({ success: true, updated: Object.keys(updateData) });
    } catch (error) {
        return handleAuthError(error);
    }
}
