import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// ─── Token Verification ─────────────────────────────────────────────────────
function verifyPortalToken(token, slug) {
    if (!token) return false;
    const [hash, timestamp] = token.split(':');
    if (!hash || !timestamp) return false;

    // Tokens expire after 4 hours
    const age = Date.now() - parseInt(timestamp);
    if (age > 4 * 60 * 60 * 1000) return false;

    const secret = process.env.GATEWAY_TOKEN || 'default-secret-key';
    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${slug}:${timestamp}`)
        .digest('hex')
        .substring(0, 32);

    return hash === expected;
}

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

// ─── GET: Fetch business data ───────────────────────────────────────────────
export async function GET(request, { params }) {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
        }

        const { slug } = await params;
        const token = request.headers.get('x-portal-token');

        if (!verifyPortalToken(token, slug)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const snapshot = await adminDb
            .collection('businesses')
            .where('slug', '==', slug)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        // Return only what the client needs (no PIN, no whatsapp_number_id)
        return NextResponse.json({
            id: doc.id,
            name: data.name,
            slug: data.slug,
            description: data.description || '',
            greeting: data.greeting || '',
            knowledge_base: data.knowledge_base || '',
            timezone: data.timezone || 'America/Merida',
            integrations: data.integrations || {},
            active: data.active ?? true,
        });
    } catch (error) {
        console.error('Portal GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ─── PUT: Update business data ──────────────────────────────────────────────
export async function PUT(request, { params }) {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
        }

        const { slug } = await params;
        const token = request.headers.get('x-portal-token');

        if (!verifyPortalToken(token, slug)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const snapshot = await adminDb
            .collection('businesses')
            .where('slug', '==', slug)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }

        const doc = snapshot.docs[0];
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
                    updateData[`integrations.${key}`] = sanitizer(body.integrations[key]);
                }
            }
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        await adminDb.collection('businesses').doc(doc.id).update(updateData);

        return NextResponse.json({ success: true, updated: Object.keys(updateData) });
    } catch (error) {
        console.error('Portal PUT error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
