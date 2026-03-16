import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
    const checks = {
        timestamp: new Date().toISOString(),
        firebase_project_id: process.env.FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing',
        firebase_client_email: process.env.FIREBASE_CLIENT_EMAIL ? '✅ Set' : '❌ Missing',
        firebase_private_key: process.env.FIREBASE_PRIVATE_KEY ? '✅ Set (' + process.env.FIREBASE_PRIVATE_KEY.length + ' chars)' : '❌ Missing',
        gemini_api_key: process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing',
        adminDb_initialized: adminDb ? '✅ Yes' : '❌ No (null)',
        firestore_test: 'pending...',
    };

    if (adminDb) {
        try {
            const snapshot = await adminDb.collection('businesses').limit(1).get();
            checks.firestore_test = `✅ Connected (${snapshot.size} docs found)`;
        } catch (e) {
            checks.firestore_test = `❌ Error: ${e.message}`;
        }
    } else {
        checks.firestore_test = '⏭️ Skipped (adminDb is null)';
    }

    const allOk = !Object.values(checks).some(v => typeof v === 'string' && v.startsWith('❌'));

    return NextResponse.json({ status: allOk ? 'healthy' : 'unhealthy', checks });
}
