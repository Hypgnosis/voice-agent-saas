// ═══════════════════════════════════════════════════════════════════════════
// BUSINESSES API — Zero-Trust Multi-Tenant CRUD
// ═══════════════════════════════════════════════════════════════════════════
// Protected by Firebase ID Token verification. Admin users can list/create
// all agents. Client users only see their own agents.
//
// client_pin has been REMOVED. Authentication is via Firebase Auth.
// calendar_api_key is encrypted via AES-256-GCM before persistence.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifySession, handleAuthError } from '@/lib/auth/verifySession';
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


// ─── GET: List businesses ───────────────────────────────────────────────────
export async function GET(request) {
    try {
        const session = await verifySession(request);

        if (!adminDb) {
            return NextResponse.json(
                { error: 'Firebase not configured. Check your environment variables.' },
                { status: 503 }
            );
        }

        let query = adminDb.collection('businesses').where('active', '==', true);

        // Tenant isolation: non-admin users only see their own businesses
        if (session.role !== 'admin') {
            query = query.where('owner_uid', '==', session.uid);
        }

        const snapshot = await query.get();

        const businesses = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Strip sensitive fields before returning to client
            const { integrations, ...safeData } = data;
            businesses.push({
                id: doc.id,
                ...safeData,
                // Return integration metadata without raw secrets
                integrations: {
                    calendar_id: integrations?.calendar_id || '',
                    event_type_id: integrations?.event_type_id || '',
                    has_calendar_key: !!integrations?.calendar_api_key,
                    has_gemini_key: !!integrations?.gemini_api_key,
                    has_whatsapp_token: !!integrations?.whatsapp_access_token,
                },
            });
        });

        // Sort: consistent ordering
        businesses.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        return NextResponse.json(businesses);
    } catch (error) {
        return handleAuthError(error);
    }
}


// ─── POST: Create new business ──────────────────────────────────────────────
export async function POST(request) {
    try {
        const session = await verifySession(request);

        // Only admins can create new agents
        if (session.role !== 'admin') {
            return NextResponse.json(
                { error: 'Insufficient privileges — admin role required to create agents' },
                { status: 403 }
            );
        }

        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase not configured.' }, { status: 503 });
        }

        const data = await request.json();

        if (!data.name || !data.slug) {
            return NextResponse.json({ error: 'name and slug are required' }, { status: 400 });
        }

        // Check for duplicate slug
        const existing = await adminDb.collection('businesses')
            .where('slug', '==', data.slug)
            .limit(1)
            .get();

        if (!existing.empty) {
            return NextResponse.json(
                { error: `An agent with slug "${data.slug}" already exists.` },
                { status: 409 }
            );
        }

        // Sanitize and encrypt integration fields
        const safeCalendarApiKey = sanitizeString(data.calendar_api_key);
        const safeCalendarId = sanitizeString(data.calendar_id);
        const safeEventTypeId = sanitizeEventTypeId(data.event_type_id);
        const safeGeminiApiKey = sanitizeString(data.gemini_api_key);
        const safeWhatsappAccessToken = sanitizeString(data.whatsapp_access_token);

        const docRef = await adminDb.collection('businesses').add({
            name: data.name,
            slug: data.slug,
            description: data.description || '',
            knowledge_base: data.knowledge_base || '',
            greeting: data.greeting || 'Hello, thank you for calling. How can I assist you today?',
            voice_en: data.voice_en || 'en-US-AriaNeural',
            voice_es: data.voice_es || 'es-MX-DaliaNeural',
            language: data.language || 'auto',
            phone_number: data.phone_number || '',
            whatsapp_number: data.whatsapp_number || '',
            whatsapp_number_id: data.whatsapp_number_id || '',
            timezone: data.timezone || 'America/Merida',
            integrations: {
                // Encrypt sensitive live credentials before persisting
                calendar_api_key: safeCalendarApiKey ? encrypt(safeCalendarApiKey) : '',
                calendar_id: safeCalendarId,
                event_type_id: safeEventTypeId,
                gemini_api_key: safeGeminiApiKey ? encrypt(safeGeminiApiKey) : '',
                whatsapp_access_token: safeWhatsappAccessToken ? encrypt(safeWhatsappAccessToken) : '',
            },
            // Zero-Trust: link business to the creating admin's UID
            // Can be overridden to assign to a specific client
            owner_uid: data.owner_uid || session.uid,
            active: true,
            created_at: new Date().toISOString(),
            call_count: 0,
        });

        return NextResponse.json(
            { id: docRef.id, name: data.name, slug: data.slug, active: true },
            { status: 201 }
        );
    } catch (error) {
        return handleAuthError(error);
    }
}
