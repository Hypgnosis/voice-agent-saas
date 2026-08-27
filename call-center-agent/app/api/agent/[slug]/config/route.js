import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { GoogleGenAI } from '@google/genai';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { decrypt, isEncrypted } from '@/lib/crypto/vault';

export const dynamic = 'force-dynamic';

const LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-latest';
const PLATFORM_GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Each business may bring its own Gemini API key (billed/rate-limited under
// their own account) via the vault-encrypted integrations.gemini_api_key
// field. Falls back to the platform's key for tenants who haven't
// configured their own yet.
function resolveGeminiKey(business) {
    let key = business?.integrations?.gemini_api_key || '';
    if (key && isEncrypted(key)) {
        try {
            key = decrypt(key);
        } catch (e) {
            console.error('Failed to decrypt gemini_api_key for tenant, falling back to platform key:', e.message);
            key = '';
        }
    }
    return key || PLATFORM_GEMINI_API_KEY || '';
}

export async function POST(request, { params }) {
    try {
        if (!adminDb) {
            return NextResponse.json({ error: 'Firebase not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your environment variables.' }, { status: 503 });
        }

        const resolvedParams = await params;
        const slug = resolvedParams.slug;

        // Public, unauthenticated endpoint (called by the embed widget) — rate
        // limit per-IP per-slug so it can't be used to mint unlimited tokens.
        const ip = getClientIp(request);
        const { success } = await checkRateLimit(`config:${slug}:${ip}`);
        if (!success) {
            return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
        }

        const data = await request.json().catch(() => ({}));
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

        const geminiKey = resolveGeminiKey(business);
        if (!geminiKey) {
            return NextResponse.json({ error: 'AI not configured for this business.' }, { status: 503 });
        }
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        // Build the system prompt using the metadata
        const isSpanishBusiness = (business.language && business.language.startsWith('es')) ||
            (business.greeting && /[ñáéíóúü¿¡]/i.test(business.greeting));
        const primaryLang = business.language && business.language !== 'auto'
            ? business.language
            : (isSpanishBusiness ? 'es-MX' : 'en-US');

        const phoneNumber = business.phone_number || '';
        const handoffInstruction = phoneNumber
            ? `- If you can't help, or the caller asks for a human, say you'll flag it for the team and give them this direct number to reach out to right now: ${phoneNumber}.`
            : `- If you can't help, or the caller asks for a human, tell them you've flagged this conversation and the team will follow up shortly. Do NOT invent a phone number or promise a live transfer — none exists.`;

        let systemPrompt = `You are a professional, friendly AI receptionist for ${business.name}.

BUSINESS DESCRIPTION:
${business.description}

KNOWLEDGE BASE:
${business.knowledge_base}

VOICE AGENT BOOKING SYSTEM:
- When a patient agrees to book an appointment, you MUST output the special tag at the VERY END of your spoken response.
- The tag format is: [BOOK] {"date": "ISO_DATE", "type": "live/async", "symptoms": "BRIEF_SYMPTOMS"}
- Example: \"He agendado tu cita. [BOOK] {\"date\": \"2026-03-11T10:00:00-06:00\", \"type\": \"live\", \"symptoms\": \"Revisión\"}\"
- NEVER mention the code \"[BOOK]\" out loud. It is a hidden system tag.

HUMAN HANDOFF:
${handoffInstruction}
- You cannot actually transfer the call yourself — never say "transferring you now" or go silent waiting for a transfer to complete. Say your handoff line, then immediately output the tag [TRANSFER] at the very end of your response (after any spoken text).
- NEVER mention the code "[TRANSFER]" out loud. It is a hidden system tag.

RULES:
- Keep answers brief, conversational, and natural.
- Do NOT use emojis, markdown, or special formatting.
- If the caller speaks Spanish, respond in Spanish. If in English, respond in English.
`;

        if (parentInstructions) {
            systemPrompt += `\n\n=== PARENT APP INSTRUCTIONS (MANDATORY OVERRIDE) ===\n${parentInstructions}\n====================================================\n`;
        }

        // ─────────────────────────────────────────────────────────────────
        // SECURITY: never send the master GEMINI_API_KEY to the browser.
        // Mint a short-lived, single-use, config-locked ephemeral token
        // instead. `liveConnectConstraints` + `lockAdditionalFields: []`
        // bakes the model and system prompt into the token itself, so a
        // captured token can start exactly one Live session with THIS
        // business's exact configuration — it can't be replayed against a
        // different prompt/model, reused for a second session, or used for
        // any non-Live Gemini API call.
        // ─────────────────────────────────────────────────────────────────
        const liveConfig = {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
            systemInstruction: { parts: [{ text: systemPrompt }] },
            outputAudioTranscription: {},
            inputAudioTranscription: {}
        };

        const token = await ai.authTokens.create({
            config: {
                uses: 1,
                newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(), // must open the WS within 60s
                expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // session hard-closes after 30 min
                liveConnectConstraints: { model: LIVE_MODEL, config: liveConfig },
                lockAdditionalFields: [],
                httpOptions: { apiVersion: 'v1alpha' }
            }
        });

        return NextResponse.json({
            ephemeral_token: token.name,
            model: LIVE_MODEL,
            primary_lang: primaryLang,
            phone_number: phoneNumber
        });
    } catch (e) {
        console.error('POST /api/agent/[slug]/config error:', e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
