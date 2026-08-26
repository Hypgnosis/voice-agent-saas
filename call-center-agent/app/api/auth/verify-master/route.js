// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROLE VERIFICATION — Firebase Auth + Firestore RBAC
// ═══════════════════════════════════════════════════════════════════════════
// Replaces the deprecated ADMIN_MASTER_PIN pattern.
// Verifies the Firebase ID Token AND checks for role: 'admin' in Firestore.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { verifySession, handleAuthError } from '@/lib/auth/verifySession';

export async function POST(request) {
    try {
        const session = await verifySession(request);

        if (session.role !== 'admin') {
            // TEMPORARY DIAGNOSTIC — remove once the role-check mismatch is
            // resolved. Exposes only the caller's own already-verified
            // uid/role/email back to themselves, nothing sensitive.
            return NextResponse.json(
                {
                    error: 'Insufficient privileges — admin role required',
                    debug_uid: session.uid,
                    debug_role_seen_by_server: session.role,
                    debug_email: session.email,
                },
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
