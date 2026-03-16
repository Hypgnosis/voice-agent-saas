import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your environment variables.' }, { status: 503 });
        }

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not configured in environment variables.' }, { status: 503 });
        }

        const resolvedParams = await params;
        const slug = resolvedParams.slug;
        const data = await request.json().catch(() => ({}));
        
        const mode = data.mode || "customer";
        const parentInstructions = data.parent_app_instructions || "";

        // Query Firestore for business config
        const snapshot = await adminDb.collection('businesses')
            .where('slug', '==', slug)
            .where('active', '==', true)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return NextResponse.json({ error: `Agent "${slug}" not found. Create it first in the Command Center.` }, { status: 404 });
        }

        const business = snapshot.docs[0].data();

        // Build the system prompt using the metadata
        let systemPrompt = `You are a professional, friendly AI receptionist for ${business.name}.

BUSINESS DESCRIPTION:
${business.description}

KNOWLEDGE BASE:
${business.knowledge_base}

RULES:
- Keep answers brief, conversational, and natural.
- Do NOT use emojis, markdown, or special formatting.
- If you don't know something specific, politely offer to take a message or transfer to a human.
- If the caller speaks Spanish, respond in Spanish. If in English, respond in English.
`;

        if (parentInstructions) {
            systemPrompt += `\n\n=== PARENT APP INSTRUCTIONS (MANDATORY OVERRIDE) ===\n${parentInstructions}\n====================================================\n`;
        }

        return NextResponse.json({
            system_prompt: systemPrompt,
            gemini_api_key: process.env.GEMINI_API_KEY
        });
    } catch (e) {
        console.error('POST /api/agent/[slug]/config error:', e);
        return NextResponse.json({ error: "Internal Server Error", details: e.message }, { status: 500 });
    }
}
