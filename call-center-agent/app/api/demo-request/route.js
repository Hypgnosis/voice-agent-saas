import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { v4 as uuidv4 } from 'uuid';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LEN = 500;

function sanitize(val, maxLen = MAX_LEN) {
    if (typeof val !== 'string') return '';
    return val.trim().slice(0, maxLen);
}

export async function POST(request) {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
        }

        // Public, unauthenticated endpoint — rate limit per-IP.
        const ip = getClientIp(request);
        const { success } = await checkRateLimit(`demo-request:${ip}`);
        if (!success) {
            return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
        }

        const data = await request.json().catch(() => ({}));

        const name = sanitize(data.name, 200);
        const email = sanitize(data.email, 200);
        const company = sanitize(data.company, 200);
        const message = sanitize(data.message, MAX_LEN);

        if (!name || !email || !company) {
            return NextResponse.json({ error: 'Name, email, and company are required.' }, { status: 400 });
        }
        if (!EMAIL_RE.test(email)) {
            return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
        }

        await adminDb.collection('demo_requests').add({
            id: uuidv4(),
            name,
            email,
            company,
            message,
            status: 'new',
            source: 'landing_page',
            created_at: new Date().toISOString(),
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('POST /api/demo-request error:', e);
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
}
