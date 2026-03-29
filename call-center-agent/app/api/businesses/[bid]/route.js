import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase not configured' }, { status: 503 });
        }

        // Must await params in latest Next.js versions, but for backward compatibility we await it anyway or just access it.
        // It's safer to destructure directly if it's already awaited, let's assume we have it.
        const bid = params.bid || (await params).bid;
        const data = await request.json();

        if (!bid) {
             return NextResponse.json({ error: 'Missing business ID' }, { status: 400 });
        }

        const docRef = adminDb.collection('businesses').doc(bid);
        const doc = await docRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: 'Business not found' }, { status: 404 });
        }

        const updateData = {};
        const allowedFields = ["name", "slug", "description", "knowledge_base", "greeting",
                  "voice_en", "voice_es", "language", "phone_number", "whatsapp_number", "whatsapp_number_id", "active"];

        for (let field of allowedFields) {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        }

        if (Object.keys(updateData).length > 0) {
            await docRef.update(updateData);
        }

        return NextResponse.json({ id: bid, ...doc.data(), ...updateData });

    } catch (e) {
        console.error('PUT /api/businesses/[bid] error:', e);
        return NextResponse.json({ error: 'Database error', details: e.message }, { status: 500 });
    }
}
