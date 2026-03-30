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

export async function GET() {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase not configured. Check your environment variables.' }, { status: 503 });
        }

        const snapshot = await adminDb.collection('businesses')
            .where('active', '==', true)
            .get();
        
        const businesses = [];
        snapshot.forEach((doc) => {
            businesses.push({ id: doc.id, ...doc.data() });
        });

        // Aethos first
        businesses.sort((a, b) => {
            if (a.slug === 'aethos') return -1;
            if (b.slug === 'aethos') return 1;
            return 0;
        });

        return NextResponse.json(businesses);
    } catch (e) {
        console.error('GET /api/businesses error:', e);
        return NextResponse.json({ error: 'Database error', details: e.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
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
            return NextResponse.json({ error: `An agent with slug "${data.slug}" already exists.` }, { status: 409 });
        }

        // Sanitize integration fields before persisting
        const safeCalendarApiKey = sanitizeString(data.calendar_api_key);
        const safeCalendarId     = sanitizeString(data.calendar_id);
        const safeEventTypeId    = sanitizeEventTypeId(data.event_type_id);

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
            // Tenant Vault: Timezone & Calendar Integrations
            timezone: data.timezone || 'America/Merida',
            integrations: {
                calendar_api_key: safeCalendarApiKey,
                calendar_id: safeCalendarId,
                event_type_id: safeEventTypeId,
            },
            // Client Portal Access
            client_pin: sanitizeString(data.client_pin),
            active: true,
            created_at: new Date().toISOString(),
            call_count: 0,
        });

        return NextResponse.json({ id: docRef.id, ...data, active: true }, { status: 201 });
    } catch (e) {
        console.error('POST /api/businesses error:', e);
        return NextResponse.json({ error: 'Database error', details: e.message }, { status: 500 });
    }
}
