import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.' }, { status: 503 });
        }

        const businessesRef = adminDb.collection('businesses');

        // Check if already seeded
        const snapshot = await businessesRef.limit(1).get();
        if (!snapshot.empty) {
            return NextResponse.json({ message: "Database already seeded", count: snapshot.size });
        }

        // Seed the Aethos agent (rebranded from Dra. Mya / yo-te-cuido)
        await businessesRef.add({
            name: "Aethos",
            slug: "aethos",
            description: `Aethos is a specialized telemedicine practice dedicated to the comprehensive care and management of patients with Alzheimer's and other dementias. Our mission is to facilitate access to highly specialized medical care through an innovative telemedicine platform, allowing families to manage their loved ones' health from the safety and comfort of their homes. We combine human warmth with technological flexibility, offering both live video consultations and asynchronous video reviews for continuous monitoring.`,
            knowledge_base: `AGENT PERSONA & TONE:
- Tone: Highly empathetic, patient, professional, and reassuring.
- Context: Callers are family members who are often stressed, exhausted, or overwhelmed.
- Tech-Patience: Callers may be older adults who are not tech-savvy. Act as "Tech Enablers."
- Core Selling Point: "Our platform is designed so you don't have to move the patient."

CORE SERVICES:
1. Consulta en Vivo (Live Video Consultation): Face-to-face video call with the doctor in real-time. Best for diagnosis, Q&A, and treatment plans.
2. Revisión de Video (Asynchronous Video Review): Caregiver records a video of patient behaviors, uploads it, and the doctor reviews it later. Best for uncooperative patients or capturing specific behavioral episodes.

MENU OPTIONS:
1. Schedule a Live Video Call
2. Submit a Video for Review (Async Consultation)
3. Help with Registration (First time on platform)
4. Speak to a Human (Specific or technical help)

ONBOARDING STEPS:
1. Registration: Account creation on the platform.
2. Request: Choose Live or Video Review.
3. Management: Patient dashboard to view appointments or upload files.

FAQ & OBJECTIONS:
- "I'm not good with tech": "Don't worry, the platform is very intuitive. If you'd like, I can stay on the line and guide you step by step."
- "I prefer in-person": "I understand. However, for patients with Alzheimer's, travel causes stress. Our platform allows evaluating the patient in their natural environment, resulting in a more accurate diagnosis."`,
            greeting: "Welcome to Aethos. I'm your virtual assistant. We understand how important the care of your loved one's memory is. I'm here to help you connect with specialized care from the comfort of home.",
            voice_en: "en-US-AriaNeural",
            voice_es: "es-MX-DaliaNeural",
            language: "auto",
            phone_number: "",
            whatsapp_number: "",
            whatsapp_number_id: "",
            active: true,
            created_at: new Date().toISOString(),
            call_count: 0,
        });

        return NextResponse.json({ success: true, message: "Aethos agent seeded successfully" });
    } catch (e) {
        console.error('POST /api/setup error:', e);
        return NextResponse.json({ error: 'Database error', details: e.message }, { status: 500 });
    }
}
