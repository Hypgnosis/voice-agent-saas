import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

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

    } catch (e) {
        console.error(`GET /api/businesses/[bid]/logs error:`, e);
        // Sometimes missing indexes on firestore cause query failure. If so, fallback to no orderBy
        if (e.message && e.message.includes('index')) {
            try {
                 const fallbackSnapshot = await adminDb.collection('call_logs')
                    .where('business_id', '==', (params.bid || params).bid)
                    .limit(100)
                    .get();
                 const logsFallback = [];
                 fallbackSnapshot.forEach(doc => {
                     logsFallback.push({ id: doc.id, ...doc.data() });
                 });
                 // Sort locally
                 logsFallback.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
                 return NextResponse.json(logsFallback);
            } catch(e2) {
                 return NextResponse.json({ error: 'Database error', details: e2.message }, { status: 500 });
            }
        }
        return NextResponse.json({ error: 'Database error', details: e.message }, { status: 500 });
    }
}
