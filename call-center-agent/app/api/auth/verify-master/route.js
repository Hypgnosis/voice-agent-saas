// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROLE VERIFICATION — Firebase Auth + Firestore RBAC
// ═══════════════════════════════════════════════════════════════════════════
// Replaces the deprecated ADMIN_MASTER_PIN pattern.
// Verifies the Firebase ID Token AND checks for role: 'admin' in Firestore.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { verifySession, handleAuthError } from '@/lib/auth/verifySession';

// Every other auth-sensitive route declares this; this one didn't, which
// let Netlify's edge/durable cache serve a stale response (observed:
// identical 403 across requests, Vary header missing Authorization).
export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        const session = await verifySession(request);

        if (session.role !== 'admin') {
            return NextResponse.json(
                { error: 'Insufficient privileges — admin role required' },
                { status: 403 }
            );
        }

        return NextResponse.json({
            authenticated: true,
            uid: session.uid,
            role: session.role,
        });
    } catch (error) {
        return handleAuthError(error);
    }
}
