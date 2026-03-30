import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import crypto from 'crypto';

export async function POST(request) {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
        }

        const { slug, pin } = await request.json();

        if (!slug || !pin) {
            return NextResponse.json({ error: 'Slug and PIN are required' }, { status: 400 });
        }

        // Find business by slug
        const snapshot = await adminDb
            .collection('businesses')
            .where('slug', '==', slug.trim().toLowerCase())
            .limit(1)
            .get();

        if (snapshot.empty) {
            // Generic error to avoid slug enumeration
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 403 });
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        // Check client_pin
        if (!data.client_pin || data.client_pin !== pin.trim()) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 403 });
        }

        // Generate a simple session token (HMAC of slug + timestamp)
        const timestamp = Date.now();
        const secret = process.env.GATEWAY_TOKEN || 'default-secret-key';
        const token = crypto
            .createHmac('sha256', secret)
            .update(`${slug}:${timestamp}`)
            .digest('hex')
            .substring(0, 32);

        return NextResponse.json({
            slug: data.slug,
            token: `${token}:${timestamp}`,
        });
    } catch (error) {
        console.error('Client auth error:', error);
        return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
    }
}
