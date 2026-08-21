// ═══════════════════════════════════════════════════════════════════════════
// ZERO-TRUST SESSION VERIFICATION — Server-Side Firebase ID Token Validator
// ═══════════════════════════════════════════════════════════════════════════
// Every protected API route MUST call verifySession() before processing.
// This extracts the Firebase ID Token from the Authorization header,
// verifies it via Firebase Admin, and returns the authenticated user's
// UID and role. No exceptions, no fallbacks.
// ═══════════════════════════════════════════════════════════════════════════

import { adminAuth, adminDb } from '@/lib/firebase/admin';

/**
 * Verifies the Firebase ID Token from the request's Authorization header.
 * Returns the decoded token payload enriched with the user's role from Firestore.
 *
 * @param {Request} request — Next.js Request object
 * @returns {{ uid: string, email: string, role: string, tenant_ids: string[] }}
 * @throws {Response} — Returns a NextResponse-compatible error if verification fails
 */
export async function verifySession(request) {
    if (!adminAuth) {
        throw createAuthError('Authentication service unavailable', 503);
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw createAuthError('Missing or malformed Authorization header', 401);
    }

    const idToken = authHeader.substring(7); // Strip 'Bearer '

    try {
        // Verify the token with Firebase Admin (checks signature, expiry, issuer)
        const decodedToken = await adminAuth.verifyIdToken(idToken, true); // checkRevoked = true

        // Fetch user role and tenant associations from Firestore
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();

        let role = 'client'; // Default: least privilege
        let tenant_ids = [];

        if (userDoc.exists) {
            const userData = userDoc.data();
            role = userData.role || 'client';
            tenant_ids = userData.tenant_ids || [];
        }

        return {
            uid: decodedToken.uid,
            email: decodedToken.email || '',
            role,
            tenant_ids,
        };
    } catch (error) {
        // Firebase Admin throws specific error codes
        if (error.code === 'auth/id-token-expired') {
            throw createAuthError('Session expired — please re-authenticate', 401);
        }
        if (error.code === 'auth/id-token-revoked') {
            throw createAuthError('Session revoked — please re-authenticate', 401);
        }
        if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
            throw createAuthError('Invalid authentication token', 401);
        }

        // Don't leak internal error details
        console.error('Session verification failed:', error.code || error.message);
        throw createAuthError('Authentication failed', 401);
    }
}

/**
 * Checks whether the authenticated user has permission to access a specific
 * business document. Enforces strict tenant isolation.
 *
 * @param {{ uid: string, role: string, tenant_ids: string[] }} session
 * @param {string} businessId — The Firestore document ID of the business
 * @returns {boolean}
 */
export function canAccessBusiness(session, businessId) {
    // Admins can access everything
    if (session.role === 'admin') return true;

    // Clients can only access businesses they own
    return session.tenant_ids.includes(businessId);
}

/**
 * Verifies session AND checks business access in one call.
 * Returns the session object or throws a 403.
 *
 * @param {Request} request
 * @param {string} businessId
 * @returns {Promise<{ uid: string, email: string, role: string, tenant_ids: string[] }>}
 */
export async function verifyBusinessAccess(request, businessId) {
    const session = await verifySession(request);
    if (!canAccessBusiness(session, businessId)) {
        throw createAuthError('Access denied — you do not own this resource', 403);
    }
    return session;
}

/**
 * Creates a structured auth error that can be caught by route handlers.
 * The error object carries the HTTP status code and a safe message.
 */
function createAuthError(message, status) {
    const error = new Error(message);
    error.status = status;
    error.isAuthError = true;
    return error;
}

/**
 * Utility for route handlers to catch auth errors and return proper responses.
 * Usage:
 *   try { const session = await verifySession(request); }
 *   catch (e) { return handleAuthError(e); }
 */
export function handleAuthError(error) {
    if (error.isAuthError) {
        return Response.json(
            { error: error.message },
            { status: error.status }
        );
    }
    // Unknown error — don't leak details
    console.error('Unhandled auth error:', error);
    return Response.json(
        { error: 'Internal server error' },
        { status: 500 }
    );
}
