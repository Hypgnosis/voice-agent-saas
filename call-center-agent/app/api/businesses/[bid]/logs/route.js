// ═══════════════════════════════════════════════════════════════════════════
// CALL LOGS API — Zero-Trust Tenant-Scoped Log Access
// ═══════════════════════════════════════════════════════════════════════════
// Protected by Firebase ID Token + business ownership verification.
// Only the business owner or an admin can access conversation logs.
// The fallback index-error catch has been REMOVED — composite indexes
// MUST be deployed to Firestore before production.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyBusinessAccess, handleAuthError } from '@/lib/auth/verifySession';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase not configured' }, { status: 503 });
        }

        const bid = params.bid || (await params).bid;
        if (!bid) {
            return NextResponse.json({ error: 'Missing business ID' }, { status: 400 });
        }

        // Zero-Trust: verify the caller owns this business
        await verifyBusinessAccess(request, bid);

        // Composite index REQUIRED: call_logs(business_id ASC, timestamp DESC)
        const logsSnapshot = await adminDb.collection('call_logs')
            .where('business_id', '==', bid)
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();

        const logs = [];
        logsSnapshot.forEach(doc => {
            logs.push({ id: doc.id, ...doc.data() });
        });

        return NextResponse.json(logs);

    } catch (error) {
        return handleAuthError(error);
    }
}
