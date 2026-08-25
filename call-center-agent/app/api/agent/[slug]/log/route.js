import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { v4 as uuidv4 } from 'uuid';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const ALLOWED_CHANNELS = new Set(['iframe', 'web']);
const MAX_TEXT_LENGTH = 4000;

export async function POST(request, { params }) {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase not configured' }, { status: 503 });
        }

        const resolvedParams = await params;
        const slug = resolvedParams.slug;
        if (!slug) {
            return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
        }

        // Public, unauthenticated endpoint (called by the embed widget) —
        // rate limit per-IP per-slug so it can't be used to spam call_logs.
        const ip = getClientIp(request);
        const { success } = await checkRateLimit(`log:${slug}:${ip}`);
        if (!success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const data = await request.json().catch(() => ({}));

        if (data.role !== 'user' && data.role !== 'agent') {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
        }
        if (typeof data.text !== 'string' || !data.text.trim()) {
            return NextResponse.json({ error: 'Missing text' }, { status: 400 });
        }
        if (data.text.length > MAX_TEXT_LENGTH) {
            return NextResponse.json({ error: 'Text too long' }, { status: 413 });
        }
        const channel = ALLOWED_CHANNELS.has(data.channel) ? data.channel : 'iframe';
        const escalated = data.escalated === true;

        // First find the business by slug (must be an active tenant)
        const bSnap = await adminDb.collection('businesses')
            .where('slug', '==', slug)
            .where('active', '==', true)
            .limit(1)
            .get();

        if (bSnap.empty) {
            return NextResponse.json({ error: 'Business not found' }, { status: 404 });
        }

        const business = bSnap.docs[0];
        const bid = business.id;

        const text = data.text.trim();
        const newLog = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            business_id: bid,
            business_slug: slug,
            caller_text: data.role === 'user' ? text : '',
            agent_text: data.role === 'agent' ? text : '',
            channel,
            escalated
        };

        await adminDb.collection('call_logs').add(newLog);

        return NextResponse.json({ success: true });

    } catch (e) {
        console.error('POST /api/agent/[slug]/log error:', e);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
}
