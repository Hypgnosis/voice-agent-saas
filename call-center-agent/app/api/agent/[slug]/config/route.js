import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request, { params }) {
    try {
        const slug = params.slug;
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
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
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
`;

        if (parentInstructions) {
            systemPrompt += `\n\n=== PARENT APP INSTRUCTIONS (MANDATORY OVERRIDE) ===\n${parentInstructions}\n====================================================\n`;
        }

        return NextResponse.json({
            system_prompt: systemPrompt,
            gemini_api_key: process.env.GEMINI_API_KEY
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
