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
from datetime import datetime

import edge_tts
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

AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

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

    def build_system_prompt(self, mode="customer"):
        if mode == "assistant":
            return f"""You are the personal AI assistant for the doctor/owner of {self.name}.
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
            return f"""You are a professional, friendly AI receptionist for {self.name}.

BUSINESS DESCRIPTION:
{self.description}

KNOWLEDGE BASE — Use this information to answer caller questions:
{self.knowledge_base}

RULES:
- Keep answers brief, conversational, and natural. They will be spoken aloud.
- Do NOT use emojis, markdown, or special formatting.
- If you don't know something specific, politely offer to take a message or transfer to a human.
- If the caller speaks Spanish, respond in Spanish.
- If the caller speaks English, respond in English.
- Always match the caller's language.
- Start EVERY response with a language tag: [EN] or [ES] — it will be stripped before speaking.
"""


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
BOOKING: Walk-ins welcome, appointments recommended. Book online at www.sunshinepets.com

FAQ:
- We accept all breeds and sizes
- First-time customers get 15% off
- We use hypoallergenic, organic products
- Free bandana with every full groom!""",
            greeting="Thank you for calling Sunshine Pet Grooming! How can I help you today?",
        )
        db.session.add(demo)

        demo2 = Business(
            name="Dr. García Dental Clinic",
            slug="garcia-dental",
            description="Clínica dental familiar con más de 15 años de experiencia. Ofrecemos servicios de odontología general y cosmética.",
            knowledge_base="""SERVICIOS Y PRECIOS:
- Limpieza dental: $800 MXN
- Blanqueamiento: $3,500 MXN
- Extracción simple: $1,200 MXN
- Corona dental: $5,000 MXN
- Ortodoncia (brackets): desde $15,000 MXN
- Carillas de porcelana: $7,000 MXN por pieza

HORARIO:
- Lunes a Viernes: 9:00 AM - 7:00 PM
- Sábado: 9:00 AM - 2:00 PM
- Domingo: Cerrado

DIRECCIÓN: Av. Reforma 456, Col. Centro
TELÉFONO: (333) 456-7890

INFORMACIÓN ADICIONAL:
- Aceptamos la mayoría de seguros dentales
- Primera consulta y diagnóstico GRATIS
- Planes de pago a meses sin intereses
- Contamos con tecnología de rayos X digital
- Estacionamiento gratuito para pacientes""",
            greeting="Gracias por llamar a la Clínica Dental del Dr. García. ¿En qué le podemos ayudar?",
            voice_en="en-US-AriaNeural",
            voice_es="es-MX-DaliaNeural",
            language="auto",
        )
        db.session.add(demo2)
        db.session.commit()
        print("✅ Created demo businesses")


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


def generate_tts_sync(text, voice):
    filename = f"{uuid.uuid4().hex}.mp3"
    filepath = os.path.join(AUDIO_DIR, filename)
    async def _gen():
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(filepath)
    asyncio.run(_gen())
    return filename


def get_model_for_business(business, mode="customer"):
    """Create a Gemini model with the business-specific system prompt."""
    # Using gemini-2.0-flash as 3.1 does not exist natively returning a 500 error
    return genai.GenerativeModel(
        model_name="gemini-2.0-flash", 
        system_instruction=business.build_system_prompt(mode=mode),
    )


# ══════════════════════════════════════════════════════
#  WEB UI ROUTES
# ══════════════════════════════════════════════════════

@app.route("/")
def index():
    return send_from_directory("web", "index.html")

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
    businesses = Business.query.order_by(Business.created_at.desc()).all()
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

    if not user_text:
        return jsonify({"error": "No text provided"}), 400

    # Build session key unique to this business and mode
    session_key = f"{business.id}:{session_id}:{mode}"

    if session_key not in sessions:
        business_model = get_model_for_business(business, mode=mode)
        sessions[session_key] = business_model.start_chat()

    chat_session = sessions[session_key]

    try:
        response = chat_session.send_message(user_text)
        response_text = response.text
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"AI error: {str(e)}"}), 500

    lang_tag, clean_text = parse_lang_tag(response_text)
    # Double-check: even if tag says EN, if the text is actually Spanish, use Spanish voice
    if lang_tag != "ES" and detect_spanish(clean_text):
        lang_tag = "ES"
    voice = business.voice_es if lang_tag == "ES" else business.voice_en
    print(f"  → Mode: {mode}, Language: {lang_tag}, Voice: {voice}")

    # Generate TTS
    try:
        audio_file = generate_tts_sync(clean_text, voice)
        audio_url = f"/audio/{audio_file}"
    except Exception as e:
        print(f"TTS error: {e}")
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

    try:
        audio_file = generate_tts_sync(text, voice)
        return jsonify({
            "audio_url": f"/audio/{audio_file}",
            "text": text,
            "business_name": business.name,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
