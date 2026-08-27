import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifySession, handleAuthError } from '@/lib/auth/verifySession';

export const dynamic = 'force-dynamic';

// Admin-only: list demo requests captured from the landing page form.
export async function GET(request) {
    try {
        const session = await verifySession(request);
        if (session.role !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase not configured' }, { status: 503 });
        }

        const snapshot = await adminDb.collection('demo_requests')
            .orderBy('created_at', 'desc')
            .limit(100)
            .get();

        const requests = [];
        snapshot.forEach(doc => requests.push({ id: doc.id, ...doc.data() }));

        return NextResponse.json(requests);
    } catch (error) {
        return handleAuthError(error);
    }
}
