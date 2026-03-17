"""
AI Voice Agent — Multi-Tenant Server
- Admin dashboard to manage businesses
- Per-business knowledge base & system prompts
- Ready for Twilio Voice/WhatsApp integration
"""
import os
import asyncio
import uuid
import json
import io
import re
from datetime import datetime, timedelta
import requests
import pytz


import google.generativeai as genai
from flask import Flask, request, jsonify, send_from_directory, render_template_string
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv

try:
    from PyPDF2 import PdfReader
    import docx
except ImportError:
    pass

load_dotenv()

# ── Config ───────────────────────────────────────────
GENAI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GENAI_API_KEY:
    print("ERROR: Set GEMINI_API_KEY in your .env file")
    exit(1)

genai.configure(api_key=GENAI_API_KEY)


DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.db")

# ── Flask App ────────────────────────────────────────
app = Flask(__name__, static_folder="web")
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_PATH}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-in-prod")
CORS(app)
db = SQLAlchemy(app)

# ── Database Models ──────────────────────────────────

class Business(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text, default="")
    knowledge_base = db.Column(db.Text, default="")
    greeting = db.Column(db.String(500), default="Hello, thank you for calling. How can I assist you today?")
    voice_en = db.Column(db.String(100), default="en-US-AriaNeural")
    voice_es = db.Column(db.String(100), default="es-MX-DaliaNeural")
    language = db.Column(db.String(20), default="auto")
    phone_number = db.Column(db.String(20), default="")
    whatsapp_number = db.Column(db.String(20), default="")
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    call_count = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "description": self.description,
            "knowledge_base": self.knowledge_base,
            "greeting": self.greeting,
            "voice_en": self.voice_en,
            "voice_es": self.voice_es,
            "language": self.language,
            "phone_number": self.phone_number,
            "whatsapp_number": self.whatsapp_number,
            "active": self.active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "call_count": self.call_count,
        }

    def build_system_prompt(self, mode="customer", parent_app_instructions=None):
        if mode == "assistant":
            prompt = f"""You are the personal AI assistant for the doctor/owner of {self.name}.
You are talking directly to them (the doctor/owner).

BUSINESS DESCRIPTION:
{self.description}

KNOWLEDGE BASE:
{self.knowledge_base}

RULES:
- Be highly efficient, supportive, and formal but friendly.
- Summarize information, answer internal questions from the knowledge base, and help the doctor with tasks.
- Do NOT use emojis, markdown, or special formatting. It will be spoken aloud.
- Match the language they are speaking (Spanish or English).
- Start EVERY response with a language tag: [EN] or [ES] — it will be stripped before speaking.
"""
        else:
            prompt = f"""You are a professional, friendly AI receptionist for {self.name}.

BUSINESS DESCRIPTION:
{self.description}

KNOWLEDGE BASE — Use this information to answer caller questions:
{self.knowledge_base}

VOICE AGENT BOOKING SYSTEM:
- TIMEZONE: You are operating in Mérida time (GMT-6). The current local time is {(datetime.utcnow() - timedelta(hours=6)).strftime("%Y-%m-%d %I:%M %p")}.
- ZERO DOUBLE-BOOKING RULE: ALWAYS check availability using the `check_calendar_availability` tool BEFORE offering any specific time slots to the patient. NEVER guess or offer a slot without checking first.
- When the patient agrees to an available slot, use the `book_appointment` tool to finalize the booking in Google Calendar and trigger the WhatsApp confirmation.
- AFTER booking with the tool, you MUST also output the special tag at the VERY END of your spoken response to sync with the patient portal.
- The tag format is: [BOOK] {{"date": "ISO_DATE", "type": "live/async", "symptoms": "BRIEF_SYMPTOMS"}}
- Example: "He agendado tu cita. [BOOK] {{"date": "2026-03-11T10:00:00-06:00", "type": "live", "symptoms": "Revisión"}}"
- NEVER mention the code "[BOOK]" out loud.

RULES:
- Keep answers brief, conversational, and natural. They will be spoken aloud.
- Do NOT use emojis, markdown, or special formatting.
- If you don't know something specific, politely offer to take a message or transfer to a human.
- If the caller speaks Spanish, respond in Spanish.
- If the caller speaks English, respond in English.
- Always match the caller's language.
- Start EVERY response with a language tag: [EN] or [ES] — it will be stripped before speaking.
"""
        
        if parent_app_instructions:
            prompt += f"\n\n=== PARENT APP INSTRUCTIONS (MANDATORY OVERRIDE) ===\nThe following instructions come directly from the application currently embedding you. You MUST treat these instructions as the highest priority and follow them at all times during this conversation, overriding any conflicting rules or knowledge base above:\n{parent_app_instructions}\n====================================================\n"
        
        return prompt


class CallLog(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    business_id = db.Column(db.String(36), db.ForeignKey("business.id"))
    caller_text = db.Column(db.Text)
    agent_text = db.Column(db.Text)
    language = db.Column(db.String(10))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    channel = db.Column(db.String(20), default="web")  # web, phone, whatsapp


# ── Create DB ────────────────────────────────────────
with app.app_context():
    db.create_all()

    # Seed a demo business if none exist
    if Business.query.count() == 0:
        # Dra. Mya - Consultorio Virtual
        mya = Business(
            name="Dra. Mya - Consultorio Virtual",
            slug="yo-te-cuido",
            description="""Dra. Mya - Consultorio Virtual is a specialized medical practice dedicated to the comprehensive care and management of patients with Alzheimer's and other dementias. Our mission is to facilitate access to highly specialized medical care through an innovative telemedicine platform, allowing families to manage their loved ones' health from the safety and comfort of their homes. We combine human warmth with technological flexibility, offering both live video consultations and asynchronous video reviews for continuous monitoring.""",
            knowledge_base="""AGENT PERSONA & TONE:
- Tone: Highly empathetic, patient, professional, and reassuring.
- Context: Callers are family members who are often stressed, exhausted, or overwhelmed.
- Tech-Patience: Callers may be older adults who are not tech-savvy. Act as "Tech Enablers."
- Core Selling Point: "Nuestra plataforma está diseñada para que usted no tenga que trasladar al paciente." (Our platform is designed so you don't have to move the patient).

CORE SERVICES:
1. Consulta en Vivo (Live Video Consultation): Face-to-face video call with Dra. Mya in real-time. Best for diagnosis, Q&A, and treatment plans.
2. Revisión de Video (Asynchronous Video Review): Caregiver records a video of patient behaviors, uploads it, and Dra. Mya reviews it later. Best for uncooperative patients or capturing specific behavioral episodes.

MENU OPTIONS:
1️⃣ Agendar una Videollamada en Vivo.
2️⃣ Enviar un Video para Revisión (Consulta asíncrona).
3️⃣ Ayuda para Registrarme (First time on platform).
4️⃣ Hablar con un Humano (Specific or technical help).

ONBOARDING STEPS:
1. Registro: Account creation at casarecuerdo.com.
2. Solicitud: Choose Live or Video Review.
3. Gestión: Patient dashboard to view appointments or upload files.
- Mention the "green button" to 'Abrir App en pantalla completa'.

FAQ & OBJECTIONS:
- "I'm not good with tech": "No se preocupe, la plataforma es muy intuitiva. Si gusta, me quedo en la línea y le guío paso a paso."
- "I prefer in-person": "Lo entiendo. Sin embargo, en pacientes con Alzheimer, el traslado genera estrés. Nuestra plataforma permite evaluar al familiar en su entorno natural, resultando en un diagnóstico más certero."
""",
            greeting="""Hola, bienvenido(a) a Dra. Mya - Consultorio Virtual 🏠💜. Soy tu asistente virtual. Entendemos lo importante que es para ti el cuidado de la memoria de tu ser querido. Estoy aquí para facilitarte el contacto con la Dra. Mya y que recibas atención especializada en Alzheimer y demencias sin salir de casa.""",
            voice_es="es-MX-DaliaNeural",
            language="es-MX",
        )
        db.session.add(mya)

        # Keep a secondary demo for variety
        demo = Business(
            name="Sunshine Pet Grooming",
            slug="sunshine-pets",
            description="A premium pet grooming salon located in downtown. We treat your furry friends like family.",
            knowledge_base="""SERVICES & PRICES:
- Basic Bath & Brush: $35 (small), $45 (medium), $55 (large)
- Full Grooming Package: $55 (small), $70 (medium), $85 (large)
- Nail Trimming: $15
- Teeth Brushing: $10
- De-shedding Treatment: $25 extra

HOURS:
- Monday to Friday: 8:00 AM - 6:00 PM
- Saturday: 9:00 AM - 4:00 PM
- Sunday: Closed

LOCATION: 123 Main Street, Downtown
PHONE: (555) 123-4567
BOOKING: Walk-ins welcome, appointments recommended. Book online at www.sunshinepets.com""",
            greeting="Thank you for calling Sunshine Pet Grooming! How can I help you today?",
        )
        db.session.add(demo)
        db.session.commit()
        print("✅ Created Dra. Mya and Sunshine businesses")



# ── Chat sessions ────────────────────────────────────
sessions = {}

VOICES = {
    "EN": "en-US-AriaNeural",
    "ES": "es-MX-DaliaNeural",
    "FR": "fr-FR-DeniseNeural",
    "PT": "pt-BR-FranciscaNeural",
}


def detect_spanish(text):
    """Detect if text is in Spanish using character and keyword heuristics."""
    text_lower = text.lower()
    # Spanish-specific characters
    spanish_chars = ['ñ', 'á', 'é', 'í', 'ó', 'ú', '¿', '¡', 'ü']
    # Common Spanish words unlikely in English
    spanish_words = [
        ' el ', ' la ', ' los ', ' las ', ' del ', ' por ', ' para ', ' con ',
        ' que ', ' en ', ' es ', ' un ', ' una ', ' su ', ' más ', ' como ',
        ' pero ', ' muy ', ' también ', ' tiene ', ' puede ', ' desde ',
        ' entre ', ' sobre ', ' sin ', ' hasta ', ' después ', ' antes ',
        'gracias', 'hola', 'buenos', 'buenas', 'bienvenido', 'llamar',
        'clínica', 'horario', 'lunes', 'martes', 'miércoles', 'jueves',
        'viernes', 'sábado', 'domingo', 'precio', 'servicio', 'cita',
        'ayudar', 'podemos', 'ofrecemos', 'dental', 'consulta',
    ]
    char_hits = sum(1 for c in spanish_chars if c in text_lower)
    word_hits = sum(1 for w in spanish_words if w in text_lower)
    return (char_hits >= 1) or (word_hits >= 2)


def parse_lang_tag(text):
    text = text.strip()
    if text.startswith("[") and "]" in text:
        idx = text.index("]")
        tag = text[1:idx].strip().upper()
        clean = text[idx + 1:].strip()
        return tag, clean
    # Fallback: auto-detect language if no tag
    if detect_spanish(text):
        return "ES", text
    return "EN", text



# ── Clinic Authority Bridge ──────────────────────────
# This agent no longer manages GCal directly. It asks the Parent App.

TELEMEDICINE_APP_URL = os.environ.get("TELEMEDICINE_APP_URL", "http://localhost:5001")

def check_calendar_availability(date_str: str) -> str:
    """AI Tool: Requests availability from the Telemedicine App."""
    try:
        resp = requests.get(f"{TELEMEDICINE_APP_URL}/api/availability", params={"date": date_str}, timeout=7)
        data = resp.json()
        slots = data.get("slots", [])
        if not slots:
            return f"Lo siento, no hay espacios disponibles para el {date_str}."
        return f"Espacios disponibles para {date_str}: {', '.join(slots)}"
    except Exception as e:
        print(f"Calendar Bridge Error: {e}")
        return "No pude conectar con el calendario de la clínica. Por favor, intente más tarde."

def book_appointment(patient_name: str, phone_number: str, datetime_iso: str, type_of_visit: str, symptoms: str) -> str:
    """AI Tool: Tells the Telemedicine App to handle the booking."""
    try:
        payload = {
            "patient_name": patient_name,
            "phone": phone_number,
            "date": datetime_iso,
            "type": type_of_visit,
            "symptoms": symptoms
        }
        resp = requests.post(f"{TELEMEDICINE_APP_URL}/api/book", json=payload, timeout=10)
        if resp.status_code == 200:
            return f"¡Éxito! He reservado su cita para el {datetime_iso}. La clínica se pondrá en contacto con usted."
        return "Hubo un problema al procesar la reserva. Por favor, contacte a soporte."
    except Exception as e:
        print(f"Booking Bridge Error: {e}")
        return "Error de conexión al intentar agendar."

def get_model_for_business(business, mode="customer", parent_instructions=None):
    """Create a Gemini model with tools, injecting dynamic parent app context if provided."""
    system_prompt = business.build_system_prompt(mode=mode)
    
    # Hierarchy Injection: Parent App overrides or enhances base tenant config
    if parent_instructions:
        system_prompt += f"\n\n--- CURRENT APP HIERARCHY INSTRUCTIONS (MUST FOLLOW) ---\n{parent_instructions}\n"

    return genai.GenerativeModel(
        model_name="gemini-2.0-flash", 
        system_instruction=system_prompt,
        tools=[check_calendar_availability, book_appointment]
    )


# ══════════════════════════════════════════════════════
#  WEB UI ROUTES
# ══════════════════════════════════════════════════════

@app.route("/")
def index_redirect():
    # Primary view is now the Admin Panel
    return send_from_directory("web", "admin.html")

@app.route("/chat")
def index_chat():
    # Legacy home is now /chat
    return send_from_directory(app.static_folder, "index.html")

@app.route("/health")
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()}), 200

@app.route("/admin")
def admin():
    return send_from_directory("web", "admin.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("web", path)


# ══════════════════════════════════════════════════════
#  BUSINESS API (Admin CRUD)
# ══════════════════════════════════════════════════════

@app.route("/api/extract", methods=["POST"])
def extract_doc_text():
    """Extract text from uploaded PDF/Docx."""
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    filename = file.filename.lower()
    extracted = ""
    
    try:
        if filename.endswith(".pdf"):
            reader = PdfReader(file)
            for page in reader.pages:
                extracted += page.extract_text() + "\n"
        elif filename.endswith(".docx"):
            document = docx.Document(file)
            for paragraph in document.paragraphs:
                extracted += paragraph.text + "\n"
        elif filename.endswith(".txt"):
            extracted = file.read().decode('utf-8')
        else:
            return jsonify({"error": "Unsupported file format. Use PDF, DOCX, or TXT"}), 400
            
        return jsonify({"text": extracted.strip()})
    except Exception as e:
        return jsonify({"error": f"Failed to extract document: {str(e)}"}), 500

@app.route("/api/businesses", methods=["GET"])
def list_businesses():
    # Order by Dra Mya first if exists
    businesses = Business.query.order_by(Business.slug == 'yo-te-cuido').all()
    # SQLAlchemy order_by with boolean is weird, let's just do it in python or use a better way
    businesses = Business.query.all()
    businesses.sort(key=lambda x: x.slug != 'yo-te-cuido') # yo-te-cuido first
    return jsonify([b.to_dict() for b in businesses])


@app.route("/api/businesses", methods=["POST"])
def create_business():
    data = request.get_json()
    b = Business(
        name=data.get("name", "New Business"),
        slug=data.get("slug", str(uuid.uuid4())[:8]),
        description=data.get("description", ""),
        knowledge_base=data.get("knowledge_base", ""),
        greeting=data.get("greeting", "Hello, thank you for calling. How can I assist you?"),
        voice_en=data.get("voice_en", "en-US-AriaNeural"),
        voice_es=data.get("voice_es", "es-MX-DaliaNeural"),
        language=data.get("language", "auto"),
        phone_number=data.get("phone_number", ""),
        whatsapp_number=data.get("whatsapp_number", ""),
    )
    db.session.add(b)
    db.session.commit()
    return jsonify(b.to_dict()), 201


@app.route("/api/businesses/<bid>", methods=["GET"])
def get_business(bid):
    b = Business.query.get_or_404(bid)
    return jsonify(b.to_dict())


@app.route("/api/businesses/<bid>", methods=["PUT"])
def update_business(bid):
    b = Business.query.get_or_404(bid)
    data = request.get_json()
    for field in ["name", "slug", "description", "knowledge_base", "greeting",
                  "voice_en", "voice_es", "language", "phone_number", "whatsapp_number", "active"]:
        if field in data:
            setattr(b, field, data[field])
    db.session.commit()
    return jsonify(b.to_dict())


@app.route("/api/businesses/<bid>", methods=["DELETE"])
def delete_business(bid):
    b = Business.query.get_or_404(bid)
    db.session.delete(b)
    db.session.commit()
    return jsonify({"status": "deleted"})


# ══════════════════════════════════════════════════════
#  CALL LOG API
# ══════════════════════════════════════════════════════

@app.route("/api/businesses/<bid>/logs", methods=["GET"])
def get_call_logs(bid):
    logs = CallLog.query.filter_by(business_id=bid)\
        .order_by(CallLog.timestamp.desc()).limit(100).all()
    return jsonify([{
        "id": l.id,
        "caller_text": l.caller_text,
        "agent_text": l.agent_text,
        "language": l.language,
        "timestamp": l.timestamp.isoformat(),
        "channel": l.channel,
    } for l in logs])

@app.route("/api/agent/<slug>/log", methods=["POST"])
def agent_log(slug):
    """Save transcript log directly from the frontend VoiceAgent client."""
    business = Business.query.filter_by(slug=slug, active=True).first()
    if not business:
        return jsonify({"error": "Business not found"}), 404
        
    data = request.get_json() or {}
    role = data.get("role")
    text = data.get("text", "").strip()
    channel = data.get("channel", "web")
    
    if not text:
        return jsonify({"status": "ignored"})
        
    log = CallLog(
        business_id=business.id,
        caller_text=text if role == "user" else "",
        agent_text=text if role == "agent" else "",
        language="auto",
        channel=channel
    )
    db.session.add(log)
    if role == "user":
        business.call_count += 1
    db.session.commit()
    return jsonify({"status": "logged"})



# ══════════════════════════════════════════════════════
#  VOICE AGENT API (per-business)
# ══════════════════════════════════════════════════════

@app.route("/api/agent/<slug>/chat", methods=["POST"])
def agent_chat(slug):
    """Chat with a business-specific agent."""
    business = Business.query.filter_by(slug=slug, active=True).first()
    if not business:
        return jsonify({"error": "Business not found"}), 404

    data = request.get_json()
    user_text = data.get("text", "").strip()
    session_id = data.get("session_id", "default")
    mode = data.get("mode", "customer")  # customer or assistant
    parent_app_instructions = data.get("parent_app_instructions", "").strip()

    if not user_text:
        return jsonify({"error": "No text provided"}), 400

    # Build session key unique to this business and mode (and parent instructions state)
    session_key = f"{business.id}:{session_id}:{mode}"

    if session_key not in sessions:
        business_model = get_model_for_business(business, mode=mode, parent_app_instructions=parent_app_instructions)
        sessions[session_key] = business_model.start_chat(enable_automatic_function_calling=True)

    chat_session = sessions[session_key]

    try:
        response = chat_session.send_message(user_text)
        response_text = response.text
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"AI error: {str(e)}"}), 500

    # Extract [BOOK] data if present
    book_data = None
    book_match = re.search(r'\[BOOK\]\s*(\{.*?\})', response_text, re.DOTALL)
    if book_match:
        try:
            book_json_str = book_match.group(1)
            book_data = json.loads(book_json_str)
            # Remove the tag from the spoken text
            response_text = re.sub(r'\[BOOK\]\s*\{.*?\}', '', response_text, flags=re.DOTALL).strip()
        except Exception as e:
            print(f"Error parsing BOOK tag: {e}")

    lang_tag, clean_text = parse_lang_tag(response_text)
    # Double-check: even if tag says EN, if the text is actually Spanish, use Spanish voice
    if lang_tag != "ES" and detect_spanish(clean_text):
        lang_tag = "ES"
    voice = business.voice_es if lang_tag == "ES" else business.voice_en
    print(f"  → Mode: {mode}, Language: {lang_tag}, Voice: {voice}")

    # TTS is now handled fully on the frontend using browser native Google voices
    audio_url = None

    # Log the interaction
    log = CallLog(
        business_id=business.id,
        caller_text=user_text,
        agent_text=clean_text,
        language=lang_tag,
        channel="web",
    )
    db.session.add(log)
    business.call_count += 1
    db.session.commit()

    return jsonify({
        "text": clean_text,
        "language": lang_tag,
        "voice": voice,
        "audio_url": audio_url,
        "business_name": business.name,
        "book_data": book_data,
    })


@app.route("/api/agent/<slug>/greeting", methods=["POST"])
def agent_greeting(slug):
    """Get the business-specific greeting."""
    business = Business.query.filter_by(slug=slug, active=True).first()
    if not business:
        return jsonify({"error": "Business not found"}), 404

    text = business.greeting
    # Auto-detect greeting language to pick the right voice
    voice = business.voice_es if detect_spanish(text) else business.voice_en
    print(f"  → Greeting voice: {voice} (detected {'ES' if detect_spanish(text) else 'EN'})")

    return jsonify({
        "audio_url": None,
        "text": text,
        "business_name": business.name,
    })


@app.route("/api/agent/<slug>/info", methods=["GET"])
def agent_info(slug):
    """Get public business info for the agent UI."""
    business = Business.query.filter_by(slug=slug, active=True).first()
    if not business:
        return jsonify({"error": "Business not found"}), 404
    # Auto-detect primary language from the business content
    if business.language != "auto":
        primary_lang = business.language
    elif detect_spanish(business.greeting) or detect_spanish(business.description):
        primary_lang = "es-MX"
    else:
        primary_lang = "en-US"

    return jsonify({
        "name": business.name,
        "greeting": business.greeting,
        "voice_en": business.voice_en,
        "voice_es": business.voice_es,
        "language": business.language,
        "primary_lang": primary_lang,
    })


# ══════════════════════════════════════════════════════
#  LEGACY ROUTES (backward compat with original UI)
# ══════════════════════════════════════════════════════

@app.route("/api/chat", methods=["POST"])
def chat_legacy():
    """Backward-compatible chat route — uses first active business."""
    business = Business.query.filter_by(active=True).first()
    if not business:
        return jsonify({"error": "No business configured"}), 404

    data = request.get_json()
    data["text"] = data.get("text", "")
    # Forward to the slug-based route
    request_data = request.get_json()
    return agent_chat(business.slug)


@app.route("/api/tts/greeting", methods=["POST"])
def greeting_legacy():
    business = Business.query.filter_by(active=True).first()
    if not business:
        return jsonify({"error": "No business configured"}), 404
    return agent_greeting(business.slug)

@app.route("/api/agent/<slug>/config", methods=["POST"])
def agent_config(slug):
    """Get the business-specific configuration including system prompt and API key."""
    business = Business.query.filter_by(slug=slug, active=True).first()
    if not business:
        return jsonify({"error": "Business not found"}), 404

    data = request.get_json() or {}
    mode = data.get("mode", "customer")
    parent_app_instructions = data.get("parent_app_instructions", "")
    
    system_prompt = business.build_system_prompt(mode=mode, parent_app_instructions=parent_app_instructions)
    
    return jsonify({
        "system_prompt": system_prompt,
        "gemini_api_key": GENAI_API_KEY
    })


# ══════════════════════════════════════════════════════
#  TWILIO WEBHOOK (Ready for integration)
# ══════════════════════════════════════════════════════

@app.route("/webhook/twilio/voice/<slug>", methods=["POST"])
def twilio_voice(slug):
    """
    Twilio voice webhook endpoint.
    To activate, you need:
    1. pip install twilio
    2. Set up a Twilio account
    3. Buy a phone number
    4. Point the webhook to: https://yourdomain.com/webhook/twilio/voice/<slug>
    """
    # Placeholder — returns TwiML instructions
    business = Business.query.filter_by(slug=slug, active=True).first()
    if not business:
        return '<Response><Say>Sorry, this number is not configured.</Say></Response>', 200, {'Content-Type': 'text/xml'}

    greeting = business.greeting
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">{greeting}</Say>
    <Gather input="speech" action="/webhook/twilio/respond/{slug}" method="POST" language="en-US" timeout="3">
        <Say>Please go ahead.</Say>
    </Gather>
</Response>"""
    return twiml, 200, {'Content-Type': 'text/xml'}


@app.route("/webhook/twilio/respond/<slug>", methods=["POST"])
def twilio_respond(slug):
    """Handle Twilio speech input and respond."""
    business = Business.query.filter_by(slug=slug, active=True).first()
    if not business:
        return '<Response><Say>Error.</Say></Response>', 200, {'Content-Type': 'text/xml'}

    speech_result = request.form.get("SpeechResult", "")
    if not speech_result:
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>I didn't catch that.</Say>
    <Gather input="speech" action="/webhook/twilio/respond/{slug}" method="POST" language="en-US" timeout="3">
        <Say>Could you repeat that?</Say>
    </Gather>
</Response>"""
        return twiml, 200, {'Content-Type': 'text/xml'}

    # Get AI response
    session_key = f"{business.id}:twilio"
    if session_key not in sessions:
        business_model = get_model_for_business(business)
        sessions[session_key] = business_model.start_chat()

    try:
        response = sessions[session_key].send_message(speech_result)
        _, clean_text = parse_lang_tag(response.text)
    except:
        clean_text = "I'm sorry, I'm having technical difficulties."

    # Log it
    log = CallLog(business_id=business.id, caller_text=speech_result,
                  agent_text=clean_text, language="EN", channel="phone")
    db.session.add(log)
    business.call_count += 1
    db.session.commit()

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">{clean_text}</Say>
    <Gather input="speech" action="/webhook/twilio/respond/{slug}" method="POST" language="en-US" timeout="3">
    </Gather>
</Response>"""
    return twiml, 200, {'Content-Type': 'text/xml'}


# ══════════════════════════════════════════════════════
# AVAILABILITY CHECK (Direct Google Calendar)
# ══════════════════════════════════════════════════════
# AVAILABILITY CHECK (Bridge to Parent App)
# ══════════════════════════════════════════════════════
@app.route("/api/availability", methods=["POST"])
def check_availability():
    """Forward dashboard availability requests to the Telemedicine App."""
    data = request.get_json() or {}
    date_str = data.get("date", datetime.now().strftime("%Y-%m-%d"))
    try:
        resp = requests.get(f"{TELEMEDICINE_APP_URL}/api/availability", params={"date": date_str}, timeout=5)
        return jsonify(resp.json())
    except Exception as e:
        print(f"Availability Bridge Error: {e}")
        return jsonify({"slots": ["09:00", "10:00", "14:00", "16:00"], "warning": "Bridge Down"})


# ══════════════════════════════════════════════════════
#  START SERVER
# ══════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 55)
    print("  AI Voice Agent Server · Multi-Tenant")
    print("  Agent UI    → http://localhost:5000")
    print("  Admin Panel → http://localhost:5000/admin")
    print("=" * 55)

    with app.app_context():
        businesses = Business.query.all()
        for b in businesses:
            print(f"  📋 {b.name} → /agent/{b.slug}")
        print("=" * 55)

    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
