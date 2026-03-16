import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-static';

export async function GET() {
    try {
        const snapshot = await adminDb.collection('businesses')
            .where('active', '==', true)
            .get();
        
        const businesses = [];
        snapshot.forEach((doc) => {
            businesses.push({ id: doc.id, ...doc.data() });
        });

        // Simple sorting mimicking the legacy python code (yo-te-cuido goes first)
        businesses.sort((a, b) => {
            if (a.slug === 'yo-te-cuido') return -1;
            if (b.slug === 'yo-te-cuido') return 1;
            return 0;
        });

        return NextResponse.json(businesses);
    } catch (e) {
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
}
