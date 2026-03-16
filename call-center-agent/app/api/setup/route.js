import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { v4 as uuidv4 } from 'uuid';

export async function POST() {
    try {
        const batch = adminDb.batch();
        const businessesRef = adminDb.collection('businesses');

        // Check if already seeded
        const snapshot = await businessesRef.limit(1).get();
        if (!snapshot.empty) {
            return NextResponse.json({ message: "Database already seeded" });
        }

        const myaId = uuidv4();
        const myaRef = businessesRef.doc(myaId);
        batch.set(myaRef, {
            name: "Dra. Mya - Consultorio Virtual",
            slug: "yo-te-cuido",
            description: "Dra. Mya - Consultorio Virtual is a specialized medical practice...",
            knowledge_base: "AGENT PERSONA & TONE...\nCORE SERVICES:\n1. Consulta en Vivo...",
            greeting: "Hola, bienvenido(a) a Dra. Mya - Consultorio Virtual. Soy tu asistente virtual...",
            voice_es: "es-MX-DaliaNeural",
            language: "es-MX",
            active: true
        });

        await batch.commit();

        return NextResponse.json({ success: true, message: "Demo data seeded" });
    } catch (e) {
        return NextResponse.json({ error: 'Database error', details: e.toString() }, { status: 500 });
    }
}
