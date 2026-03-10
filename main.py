import os
import io
import wave
import asyncio
import tempfile
import numpy as np
import sounddevice as sd
import miniaudio
import speech_recognition as sr
import edge_tts
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure Gemini API
GENAI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not GENAI_API_KEY:
    print("Error: Please set the GEMINI_API_KEY in your .env file.")
    exit(1)

genai.configure(api_key=GENAI_API_KEY)

# ═══════════════════════════════════════════════════════════════
#  VOICE CONFIGURATION
# ═══════════════════════════════════════════════════════════════

# English voice
VOICE_EN = "en-US-AriaNeural"
# Spanish voice
VOICE_ES = "es-MX-DaliaNeural"
# Default voice
DEFAULT_VOICE = VOICE_EN

# Speech recognition language order
RECOGNITION_LANGUAGES = ["en-US", "es-MX"]

# ═══════════════════════════════════════════════════════════════

system_instruction = """
You are a highly capable and polite AI Call Center Agent.
Your goal is to answer questions, assist the caller, and collect information if necessary.
You must keep your answers brief, conversational, and natural, as they will be spoken out loud over a phone speaker.
Do not use emojis, markdown, or complex formatting. Speak cleanly.

IMPORTANT MULTILINGUAL RULE:
- If the caller speaks to you in Spanish, you MUST respond in Spanish.
- If the caller speaks to you in English, you MUST respond in English.
- Always match the language of the caller.
- At the very START of each response, include a language tag like [EN] or [ES]
  to indicate which language you are responding in. This tag will be removed before speaking.
"""

# Use Gemini 3.0 Flash for fast, low-latency conversational responses
model = genai.GenerativeModel(
    model_name="gemini-3.0-flash",
    system_instruction=system_instruction
)

# Audio recording settings
SAMPLE_RATE = 16000
CHANNELS = 1


def get_voice_for_language(lang_tag):
    lang_map = {
        "EN": VOICE_EN,
        "ES": VOICE_ES,
        "FR": "fr-FR-DeniseNeural",
        "PT": "pt-BR-FranciscaNeural",
        "DE": "de-DE-KatjaNeural",
    }
    return lang_map.get(lang_tag.upper(), DEFAULT_VOICE)


def parse_language_tag(text):
    text = text.strip()
    if text.startswith("[") and "]" in text:
        tag_end = text.index("]")
        lang_tag = text[1:tag_end].strip().upper()
        cleaned = text[tag_end + 1:].strip()
        return lang_tag, cleaned
    return "EN", text


async def speak_async(text, voice):
    """Converts text to speech using Edge TTS neural voices and plays via miniaudio + sounddevice."""
    print(f"\n[AI Agent] ({voice}): {text}")

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        # Generate speech audio with Edge TTS
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(tmp_path)

        # Decode MP3 to raw PCM using miniaudio
        decoded = miniaudio.mp3_read_file_f32(tmp_path)
        samples = np.frombuffer(decoded.samples, dtype=np.float32)

        # Reshape for multi-channel if needed
        if decoded.nchannels > 1:
            samples = samples.reshape(-1, decoded.nchannels)

        # Play the audio through speakers
        sd.play(samples, decoded.sample_rate)
        sd.wait()

    except Exception as e:
        print(f"[System]: TTS Error: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except:
            pass


def speak(text, voice=None):
    if voice is None:
        voice = DEFAULT_VOICE
    asyncio.run(speak_async(text, voice))


def record_audio(max_duration=8):
    print("\n[System]: 🎤 Listening... (Speak now, you have ~8 seconds)")

    audio_data = sd.rec(
        int(SAMPLE_RATE * max_duration),
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype='int16'
    )
    sd.wait()

    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, 'wb') as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio_data.tobytes())
    wav_buffer.seek(0)
    return wav_buffer


def listen():
    try:
        wav_buffer = record_audio()
        recognizer = sr.Recognizer()

        with sr.AudioFile(wav_buffer) as source:
            audio = recognizer.record(source)

        print("[System]: Processing audio...")

        for lang in RECOGNITION_LANGUAGES:
            try:
                text = recognizer.recognize_google(audio, language=lang)
                print(f"\n[Caller] (detected: {lang}): {text}")
                return text
            except sr.UnknownValueError:
                continue

        print("[System]: Could not understand audio in any language.")

    except sr.RequestError as e:
        print(f"[System]: Speech Recognition API unavailable; {e}")
    except Exception as e:
        print(f"[System]: Error during listening: {e}")
    return None


def main():
    print("=" * 50)
    print("   🤖 AI Voice Agent (Gemini 3.0 Flash)")
    print("=" * 50)
    print(f"  English voice : {VOICE_EN}")
    print(f"  Spanish voice : {VOICE_ES}")
    print(f"  Languages     : {', '.join(RECOGNITION_LANGUAGES)}")
    print("=" * 50)
    print("Press Ctrl+C to exit at any time.\n")

    chat = model.start_chat()
    speak("Hello, thank you for calling. How can I assist you today?", VOICE_EN)

    while True:
        user_text = listen()

        if user_text:
            exit_words = ["goodbye", "hang up", "adiós", "colgar", "hasta luego"]
            if any(word in user_text.lower() for word in exit_words):
                if any(w in user_text.lower() for w in ["adiós", "colgar", "hasta luego"]):
                    speak("¡Hasta luego! Que tenga un excelente día.", VOICE_ES)
                else:
                    speak("Goodbye! Have a great day.", VOICE_EN)
                break

            try:
                response = chat.send_message(user_text)
                response_text = response.text
                lang_tag, clean_text = parse_language_tag(response_text)
                voice = get_voice_for_language(lang_tag)
                speak(clean_text, voice)
            except Exception as e:
                print(f"[System]: Error communicating with Gemini: {e}")
                speak("I'm sorry, I am experiencing technical difficulties.", DEFAULT_VOICE)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[System]: Shutting down Voice Agent.")
