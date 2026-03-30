import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { isInternalAgent, getInternalSystemPrompt, getInternalToolDeclarations } from '@/lib/tools/internalAgentTools';
import { dispatchToolCall } from '@/lib/tools/calendarFunctions';

export const dynamic = 'force-dynamic';

const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://127.0.0.1:3000/api/v1/tasks';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function sendWhatsAppMessage(phoneNumberId, toNumber, text) {
    if (!META_ACCESS_TOKEN) return;
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: toNumber, type: 'text', text: { body: text } })
        });
    } catch (e) {
        console.error("Failed to send WhatsApp message:", e);
    }
}

async function triggerOpenClaw(patientPhone, bookData, conversationHistory) {
    if (!GATEWAY_TOKEN) {
        console.warn("⚠️ OPENCLAW: Skipping handoff. GATEWAY_TOKEN not set.");
        return;
    }
    
    const payload = {
        task: `A patient consultation just concluded on WhatsApp. You are the autonomous administrative backend.
        
1. Execute the 'calendar_tetris' skill to find a valid overlapping slot.
2. Execute the 'whatsapp_notify' skill to proactively message the patient back with their confirmed slot.

Patient Phone: ${patientPhone}
Extracted Intent Data:
${JSON.stringify(bookData, null, 2)}

Recent Context:
${conversationHistory.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n')}
        `,
        allowed_skills: ["calendar_tetris", "whatsapp_notify"]
    };

    try {
        console.log(`⚙️ Waking up OpenClaw for patient ${patientPhone}...`);
        const res = await fetch(OPENCLAW_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GATEWAY_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (res.ok) console.log("✅ OpenClaw accepted the task.");
        else console.error("❌ OpenClaw rejected task:", await res.text());
    } catch (e) {
        console.error("❌ Failed to reach OpenClaw container:", e);
    }
}

// 1. META WEBHOOK VERIFICATION (GET)
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    // Failsafe: strip any invisible quotes or whitespace from the Netlify environment variable
    const expectedToken = (process.env.META_VERIFY_TOKEN || '').replace(/['"]/g, '').trim();

    if (mode === "subscribe" && token === expectedToken) {
        console.log("✅ Meta Webhook verified successfully.");
        
        // Meta strictly requires a raw Response with text/plain (NOT NextResponse)
        return new Response(challenge, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain',
            },
        });
    }

    console.error(`❌ Webhook verification failed. Mode: ${mode}, Token match: ${token === expectedToken}`);
    return new Response("Forbidden", { status: 403 });
}

// 2. INCOMING WHATSAPP MESSAGE (POST) — Multi-tenant via phone_number_id
export async function POST(request) {
    try {
        const data = await request.json();

        // KILL SWITCH: Ignore Meta's read/delivered receipts
        if (data.entry?.[0]?.changes?.[0]?.value?.statuses) {
            console.log("Status update ignored.");
            return new Response("OK", { status: 200 });
        }

        // Ensure there is actually a text message to process
        const incomingMessages = data.entry?.[0]?.changes?.[0]?.value?.messages;
        if (!incomingMessages || incomingMessages.length === 0) {
            return new Response("OK", { status: 200 });
        }

        const entry = data.entry?.[0] || {};
        const changes = entry.changes?.[0] || {};
        const value = changes.value || {};
        
        // THIS IS THE CRITICAL KEY FOR MULTI-TENANT ROUTING
        const phoneNumberId = value.metadata?.phone_number_id;

        const message = value.messages[0];
        const patientPhone = message.from;

        if (message.type !== "text") {
            await sendWhatsAppMessage(phoneNumberId, patientPhone, "Lo siento, por ahora solo puedo leer mensajes de texto.");
            return NextResponse.json({ status: "media_ignored" }, { status: 200 });
        }

        const userText = message.text.body;

        // 🚀 MULTI-TENANT QUERY: Find the business by their WhatsApp Phone Number ID
        const bSnap = await adminDb.collection('businesses')
            .where('whatsapp_number_id', '==', phoneNumberId)
            .where('active', '==', true)
            .limit(1)
            .get();

        if (bSnap.empty) {
            console.error(`❌ Unrecognized WhatsApp Number ID: ${phoneNumberId}`);
            return NextResponse.json({ error: "Business not configured for this number." }, { status: 404 });
        }
        
        const businessDoc = bSnap.docs[0];
        const business = businessDoc.data();
        const bid = businessDoc.id;
        const slug = business.slug;

        // Fetch Conversation History for this specific patient
        const logsSnap = await adminDb.collection('call_logs')
            .where('business_id', '==', bid)
            .where('channel', '==', 'whatsapp')
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();

        const history = [];
        logsSnap.forEach(doc => {
            const log = doc.data();
            if (log.agent_text) history.unshift({ role: 'model', parts: [{ text: log.agent_text }] });
            if (log.caller_text) history.unshift({ role: 'user', parts: [{ text: log.caller_text }] });
        });

        // Append the current message
        history.push({ role: 'user', parts: [{ text: userText }] });

        // ═══════════════════════════════════════════════════════════════════
        // ROUTE: Internal Agent (Dra. Mya) vs. Standard Receptionist
        // ═══════════════════════════════════════════════════════════════════
        let cleanText;

        if (isInternalAgent(slug)) {
            cleanText = await handleInternalAgent(business, history);
        } else {
            cleanText = await handleStandardAgent(business, history, patientPhone, phoneNumberId);
        }

        // Save to Firebase
        await adminDb.collection('call_logs').add({
            id: uuidv4(),
            business_id: bid,
            business_slug: slug,
            caller_text: userText,
            agent_text: cleanText,
            language: "auto",
            channel: "whatsapp",
            timestamp: new Date().toISOString()
        });

        // Update call count
        await adminDb.collection('businesses').doc(bid).update({
            call_count: (business.call_count || 0) + 1
        });

        // Send Reply via Meta
        await sendWhatsAppMessage(phoneNumberId, patientPhone, cleanText);

        return NextResponse.json({ status: "success" }, { status: 200 });

    } catch (e) {
        console.error("WhatsApp Webhook Error:", e);
        return NextResponse.json({ status: "error", details: e.message }, { status: 500 });
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL AGENT — Two-trip Function Calling for Dra. Mya
// ═══════════════════════════════════════════════════════════════════════════
async function handleInternalAgent(business, history) {
    const systemPrompt = getInternalSystemPrompt(business);
    const toolDeclarations = getInternalToolDeclarations();

    console.log('🩺 Internal Agent activated — Function Calling mode');

    // ── FIRST TRIP: Send message with tools available ───────────────────
    const firstResponse = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: history,
        config: {
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations: toolDeclarations }],
        },
    });

    // ── CHECK: Did Gemini request any tool calls? ───────────────────────
    const functionCalls = firstResponse.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
        // No tools needed — Gemini answered directly
        return cleanResponse(firstResponse.text || '');
    }

    // ── EXECUTE ALL REQUESTED TOOLS ─────────────────────────────────────
    console.log(`🔧 Gemini requested ${functionCalls.length} tool call(s)`);

    // Build the function call parts (what Gemini asked for)
    const modelFunctionCallParts = functionCalls.map(fc => ({
        functionCall: { name: fc.name, args: fc.args },
    }));

    // Execute each tool and collect the results
    // ⚡ Pass 'business' so the dispatcher can extract Tenant Vault credentials
    const functionResponseParts = [];
    for (const fc of functionCalls) {
        try {
            console.log(`  → Executing: ${fc.name}(${JSON.stringify(fc.args)})`);
            const result = await dispatchToolCall(fc.name, fc.args || {}, business);
            functionResponseParts.push({
                functionResponse: { name: fc.name, response: result },
            });
        } catch (error) {
            console.error(`  ✗ Tool "${fc.name}" failed:`, error);
            functionResponseParts.push({
                functionResponse: {
                    name: fc.name,
                    response: {
                        status: 'error',
                        message: 'Fallo de conexión con el servicio.',
                        details: error.message,
                    },
                },
            });
        }
    }

    // ── SECOND TRIP: Feed tool results back to Gemini ───────────────────
    const secondTripContents = [
        ...history,
        { role: 'model', parts: modelFunctionCallParts },
        { role: 'user', parts: functionResponseParts },
    ];

    const secondResponse = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: secondTripContents,
        config: {
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations: toolDeclarations }],
        },
    });

    return cleanResponse(secondResponse.text || '');
}


// ═══════════════════════════════════════════════════════════════════════════
// STANDARD AGENT — Original multi-tenant receptionist (unchanged logic)
// ═══════════════════════════════════════════════════════════════════════════
async function handleStandardAgent(business, history, patientPhone, phoneNumberId) {
    const systemPrompt = `You are a professional, friendly AI receptionist for ${business.name}.
BUSINESS DESCRIPTION: ${business.description}
KNOWLEDGE BASE: ${business.knowledge_base}

VOICE AGENT BOOKING SYSTEM:
- When a patient agrees to book an appointment, output the special tag at the VERY END of your response.
- Format: [BOOK] {"date": "ISO_DATE", "type": "live/async", "symptoms": "BRIEF_SYMPTOMS"}
- NEVER mention the code "[BOOK]" out loud.

RULES:
- Keep answers brief, conversational, and natural.
- Do NOT use markdown.
- Match the caller's language.`;

    // Call Gemini (standard — no tools)
    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: history,
        config: { systemInstruction: systemPrompt }
    });

    let responseText = response.text;
    let bookData = null;

    // Check for Booking Intent
    const bookMatch = responseText.match(/\[BOOK\]\s*(\{.*?\})/s);
    if (bookMatch) {
        try {
            bookData = JSON.parse(bookMatch[1]);
            console.log(`🚀 Booking Intent detected for ${patientPhone}:`, bookData);
            responseText = responseText.replace(/\[BOOK\]\s*\{.*?\}/gs, '').trim();
            
            triggerOpenClaw(patientPhone, bookData, history).catch(console.error);
        } catch (e) {
            console.error("Failed to parse BOOK tag:", e);
        }
    }

    return cleanResponse(responseText);
}


// ═══════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════
function cleanResponse(text) {
    return text
        .replace(/\[(EN|ES|FR|PT)\]/gi, '')
        .replace(/\[BOOK\]\s*\{.*?\}/gs, '')
        .trim();
}
