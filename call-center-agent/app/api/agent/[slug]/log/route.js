import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase not configured' }, { status: 503 });
        }

        const slug = params.slug || (await params).slug;
        const data = await request.json();

        if (!slug) {
             return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
        }

        // First find the business by slug
        const bSnap = await adminDb.collection('businesses')
            .where('slug', '==', slug)
            .limit(1)
            .get();

        if (bSnap.empty) {
            return NextResponse.json({ error: 'Business not found' }, { status: 404 });
        }

        const business = bSnap.docs[0];
        const bid = business.id;

        // the frontend sends { role: 'user' | 'agent', text: '...', channel: 'iframe' }
        // Let's create a new log or append to the last one.
        // For simplicity, let's create a new log per turn or match it roughly if possible
        
        let caller_text = '';
        let agent_text = '';
        
        if (data.role === 'user') {
            caller_text = data.text;
        } else if (data.role === 'agent') {
            agent_text = data.text;
        }

        // we could just append to collection
        const newLog = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            business_id: bid,
            business_slug: slug,
            caller_text: caller_text,
            agent_text: agent_text,
            channel: data.channel || 'web'
        };

        await adminDb.collection('call_logs').add(newLog);

        return NextResponse.json({ success: true });

    } catch (e) {
        console.error('POST /api/agent/[slug]/log error:', e);
        return NextResponse.json({ error: 'Database error', details: e.message }, { status: 500 });
    }
}
