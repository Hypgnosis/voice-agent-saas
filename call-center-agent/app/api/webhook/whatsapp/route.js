import { NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { isInternalAgent, getInternalSystemPrompt, getInternalToolDeclarations } from '@/lib/tools/internalAgentTools';
import { dispatchToolCall } from '@/lib/tools/calendarFunctions';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { Readable, PassThrough } from 'stream';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

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

// ═══════════════════════════════════════════════════════════════════════════
// NEW VOICE PIPELINE (Gemini Native Audio)
// ═══════════════════════════════════════════════════════════════════════════

async function downloadWhatsAppMedia(mediaId) {
    if (!META_ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN not set");
    
    // 1. Get Media URL
    const urlRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${META_ACCESS_TOKEN}` }
    });
    const urlData = await urlRes.json();
    if (!urlData.url) throw new Error("Could not retrieve media URL from Meta.");
    
    // 2. Download Raw Audio
    const mediaRes = await fetch(urlData.url, {
        headers: { 'Authorization': `Bearer ${META_ACCESS_TOKEN}` }
    });
    
    const arrayBuffer = await mediaRes.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
}

async function uploadToFirebaseAndSend(audioBuffer, phoneNumberId, patientPhone) {
    try {
        if (!adminStorage) throw new Error("Firebase Admin Storage not initialized");
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
        if (!bucketName) throw new Error("FIREBASE_STORAGE_BUCKET not set");

        console.log("🛠️ Transcoding audio from WAV to MP3 in memory...");

        const mp3Buffer = await new Promise((resolve, reject) => {
            const inputStream = Readable.from(audioBuffer);
            const outputStream = new PassThrough();
            const chunks = [];

            outputStream.on('data', (chunk) => chunks.push(chunk));

            ffmpeg(inputStream)
                // Le decimos explícitamente qué entra para que no adivine
                .inputFormat('wav') 
                .format('mp3')
                .on('end', () => {
                    // MAGIA: Ahora escuchamos el 'end' de FFmpeg, no del tubo.
                    // Si llega aquí, sabemos 100% que la conversión fue exitosa.
                    console.log("✅ FFmpeg Process Finished!");
                    resolve(Buffer.concat(chunks));
                })
                .on('error', (err) => {
                    // Si FFmpeg falla, la Promesa muere aquí y salta a tu bloque catch
                    console.error("❌ FFmpeg Process Error:", err);
                    reject(err);
                })
                .pipe(outputStream, { end: true });
        });

        console.log("✅ Transcoding complete. MP3 Buffer size:", mp3Buffer.length, "bytes");

        // 3. AHORA subes el mp3Buffer a Firebase, asegurándote de usar su tamaño real
        const bucket = adminStorage.bucket(bucketName);
        const filename = `voice-replies/${uuidv4()}.mp3`;
        const file = bucket.file(filename);

        // Upload to Firebase Storage
        await file.save(mp3Buffer, {
            metadata: { contentType: 'audio/mpeg' },
            public: false
        });

        // Generate signed URL (valid for 4 hours)
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 4 * 60 * 60 * 1000 // 4 hours from now
        });

        // Send via Meta Messages API
        const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
        const payload = {
            messaging_product: 'whatsapp',
            to: patientPhone,
            type: 'audio',
            audio: { link: signedUrl }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            throw new Error(`Meta Audio Message failed: ${await res.text()}`);
        }
    } catch (e) {
        console.error("❌ Firebase Storage / Meta API Error:", e);
        throw e;
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
        
        let userText = "";
        let isAudioIncoming = false;
        let base64Audio = null;
        let mimeType = "";

        // 1. Candado dinámico: Rechazar lo que NO sea texto, audio o voice (ej. imágenes, stickers)
        if (message.type !== "text" && message.type !== "audio" && message.type !== "voice") {
            await sendWhatsAppMessage(phoneNumberId, patientPhone, "Lo siento, por ahora solo puedo procesar texto y notas de voz.");
            return NextResponse.json({ status: "media_ignored" }, { status: 200 });
        }

        // 2. Extraer el contenido dependiendo del tipo
        if (message.type === "text") {
            userText = message.text.body;
        } else if (message.type === "audio" || message.type === "voice") {
            isAudioIncoming = true;
            try {
                // Extraer el ID correcto de la nota de voz o archivo de audio
                const mediaId = message.type === "voice" ? message.voice.id : message.audio.id;
                mimeType = message.type === "voice" ? message.voice.mime_type : message.audio.mime_type;
                
                console.log(`🎙️ Audio/Voice message received (${mediaId}). Downloading...`);
                base64Audio = await downloadWhatsAppMedia(mediaId);
                console.log(`✅ Audio downloaded and encoded to base64.`);
                userText = "[Voice note received]";
            } catch (err) {
                console.error("❌ Failed to process incoming audio:", err);
                await sendWhatsAppMessage(phoneNumberId, patientPhone, "Lo siento, tuve un problema escuchando tu mensaje de voz. ¿Podrías escribirlo?");
                return NextResponse.json({ status: "audio_failed" }, { status: 200 });
            }
        }

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

        // Construir el payload dinámico para Gemini
        const userParts = [];
        
        // Si hay texto, lo agregamos
        if (userText && userText.trim() !== "") {
            userParts.push({ text: userText });
        }
        
        // Si hay audio en Base64, lo agregamos
        if (base64Audio) {
            userParts.push({ 
                inlineData: { 
                    mimeType: mimeType || "audio/ogg", // Fallback por si acaso
                    data: base64Audio 
                } 
            });
        }

        // Evitar que el agente procese un mensaje completamente vacío
        if (userParts.length === 0) {
             console.log("Mensaje vacío, ignorando.");
             return NextResponse.json({ status: "empty_payload" }, { status: 200 });
        }

        // Agregar al historial
        history.push({ role: 'user', parts: userParts });

        // ═══════════════════════════════════════════════════════════════════
        // ROUTE: Internal Agent (Dra. Mya) vs. Standard Receptionist
        // ═══════════════════════════════════════════════════════════════════
        let agentResult;

        if (isInternalAgent(slug)) {
            agentResult = await handleInternalAgent(business, history, isAudioIncoming);
        } else {
            agentResult = await handleStandardAgent(business, history, patientPhone, phoneNumberId, isAudioIncoming);
        }

        const cleanText = agentResult.text;
        const replyAudioBuffer = agentResult.audioBuffer;

        // Save to Firebase
        await adminDb.collection('call_logs').add({
            id: uuidv4(),
            business_id: bid,
            business_slug: slug,
            caller_text: userText, // If native audio, we don't have perfect caller_text initially. Gemini will respond mostly to audio.
            agent_text: cleanText || "[Audio reply]",
            language: "auto",
            channel: "whatsapp",
            incoming_type: isAudioIncoming ? "audio" : "text",
            timestamp: new Date().toISOString()
        });

        // Update call count
        await adminDb.collection('businesses').doc(bid).update({
            call_count: (business.call_count || 0) + 1
        });

        // Send Reply via Meta (Audio or Text)
        if (isAudioIncoming && replyAudioBuffer) {
            try {
                console.log(`📤 Uploading and sending audio reply...`);
                await uploadToFirebaseAndSend(replyAudioBuffer, phoneNumberId, patientPhone);
            } catch (err) {
                console.error("❌ Failed to upload/send audio, falling back to text:", err);
                await sendWhatsAppMessage(phoneNumberId, patientPhone, cleanText || "Error processing voice note.");
            }
        } else if (cleanText) {
            await sendWhatsAppMessage(phoneNumberId, patientPhone, cleanText);
        }

        return NextResponse.json({ status: "success" }, { status: 200 });

    } catch (e) {
        console.error("WhatsApp Webhook Error:", e);
        return NextResponse.json({ status: "error", details: e.message }, { status: 500 });
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL AGENT — Two-trip Function Calling for Dra. Mya
// ═══════════════════════════════════════════════════════════════════════════
async function handleInternalAgent(business, history, isAudioIncoming) {
    const timezone = business.timezone || 'America/Merida';
    const systemPrompt = getInternalSystemPrompt(business, timezone);
    const toolDeclarations = getInternalToolDeclarations();

    console.log('🩺 Internal Agent activated — Function Calling mode');
    
    // Hop 1: THE BRAIN (Logic and Function Calling)
    const config = {
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: toolDeclarations }],
    };

    // ── FIRST TRIP: Send message with tools available ───────────────────
    const firstResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: history,
        config: config,
    });

    // ── CHECK: Did Gemini request any tool calls? ───────────────────────
    const functionCalls = firstResponse.functionCalls;

    let finalBrainText = "";

    if (!functionCalls || functionCalls.length === 0) {
        // No tools needed — Gemini answered directly
        finalBrainText = cleanResponse(firstResponse.text || '');
    } else {
        // ── EXECUTE ALL REQUESTED TOOLS ─────────────────────────────────────
        console.log(`🔧 Gemini requested ${functionCalls.length} tool call(s)`);

        const modelFunctionCallParts = functionCalls.map(fc => ({
            functionCall: { name: fc.name, args: fc.args },
        }));

        const functionResponseParts = [];
        for (const fc of functionCalls) {
            try {
                console.log(`  → Executing: ${fc.name}(${JSON.stringify(fc.args)})`);
                const result = await dispatchToolCall(fc.name, fc.args || {}, business);
                functionResponseParts.push({ functionResponse: { name: fc.name, response: result } });
            } catch (error) {
                console.error(`  ✗ Tool "${fc.name}" failed:`, error);
                functionResponseParts.push({
                    functionResponse: { name: fc.name, response: { status: 'error', message: 'Fallo de conexión.', details: error.message } }
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
            model: 'gemini-2.5-flash',
            contents: secondTripContents,
            config: config,
        });

        finalBrainText = cleanResponse(secondResponse.text || '');
    }

    // Hop 2: THE VOICE (TTS)
    let audioBuffer = null;
    if (isAudioIncoming && finalBrainText) {
        console.log("🗣️ Synthesizing native TTS audio from Internal Agent...");
        try {
            const audioResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash-preview-tts',
                contents: finalBrainText,
                config: {
                    responseModalities: ["AUDIO"],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } }
                }
            });
            const geminiAudioBase64 = audioResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
            if (geminiAudioBase64) {
                audioBuffer = Buffer.from(geminiAudioBase64, 'base64');
            }
        } catch (e) {
            console.error("❌ Native TTS generation failed:", e);
        }
    }

    return { text: finalBrainText, audioBuffer };
}


// ═══════════════════════════════════════════════════════════════════════════
// STANDARD AGENT — Original multi-tenant receptionist (unchanged logic)
// ═══════════════════════════════════════════════════════════════════════════
async function handleStandardAgent(business, history, patientPhone, phoneNumberId, isAudioIncoming) {
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

    // Hop 1: THE BRAIN
    const config = { systemInstruction: systemPrompt };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: history,
        config: config
    });

    let finalBrainText = response.text || '';
    let bookData = null;

    // Check for Booking Intent
    const bookMatch = finalBrainText.match(/\[BOOK\]\s*(\{.*?\})/s);
    if (bookMatch) {
        try {
            bookData = JSON.parse(bookMatch[1]);
            console.log(`🚀 Booking Intent detected for ${patientPhone}:`, bookData);
            finalBrainText = finalBrainText.replace(/\[BOOK\]\s*\{.*?\}/gs, '').trim();
            
            triggerOpenClaw(patientPhone, bookData, history).catch(console.error);
        } catch (e) {
            console.error("Failed to parse BOOK tag:", e);
        }
    }
    
    finalBrainText = cleanResponse(finalBrainText);

    // Hop 2: THE VOICE (TTS)
    let audioBuffer = null;
    if (isAudioIncoming && finalBrainText) {
        console.log("🗣️ Synthesizing native TTS audio from Standard Agent...");
        try {
            const audioResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash-preview-tts',
                contents: finalBrainText,
                config: {
                    responseModalities: ["AUDIO"],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } }
                }
            });
            const geminiAudioBase64 = audioResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
            if (geminiAudioBase64) {
                audioBuffer = Buffer.from(geminiAudioBase64, 'base64');
            }
        } catch (e) {
            console.error("❌ Native TTS generation failed:", e);
        }
    }

    return { text: finalBrainText, audioBuffer };
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
