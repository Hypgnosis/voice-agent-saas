# AI Call Center Agent — Architecture & Scaling Plan

## Current State
- ✅ Voice agent works locally with mic → Gemini → Edge TTS
- ✅ Web UI with real-time transcription
- ✅ Multilingual (English/Spanish) with neural voices

## Business Model
Sell the AI receptionist as a service to businesses. Each business gets:
- A dedicated phone number (via Twilio)
- Optional WhatsApp Business integration
- A custom AI agent trained on their business info
- Dashboard to manage their knowledge base

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     YOUR SERVER                          │
│                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐    │
│  │  Twilio   │──▶│  Flask   │──▶│  Gemini 3.0      │    │
│  │ Webhook   │   │  Router  │   │  + Business KB   │    │
│  └──────────┘   └──────────┘   └──────────────────┘    │
│       ▲               │                │                 │
│       │               ▼                ▼                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐    │
│  │  Phone/   │   │  Admin   │   │  Edge TTS        │    │
│  │ WhatsApp  │   │ Dashboard│   │  Neural Voice     │    │
│  └──────────┘   └──────────┘   └──────────────────┘    │
│                       │                                  │
│                       ▼                                  │
│              ┌──────────────┐                            │
│              │   Database   │                            │
│              │  (SQLite →   │                            │
│              │  PostgreSQL) │                            │
│              └──────────────┘                            │
└─────────────────────────────────────────────────────────┘
```

## Integration Options

### 1. Twilio Voice (Phone Calls)
- Buy a local phone number ($1/month)
- Incoming calls trigger a webhook to your server
- Use Twilio's `<Gather>` for speech input OR stream audio
- Respond with TTS or pre-generated audio

### 2. Twilio WhatsApp
- Connect via WhatsApp Business API through Twilio
- Text messages → Gemini → Text response
- Voice notes → Speech-to-text → Gemini → TTS audio response

### 3. Web Widget (Current)
- Embed on client's website
- Direct browser-based interaction

---

## Phase 1: Multi-Tenant Backend (Building Now)
- [x] Business CRUD (create, read, update, delete)
- [x] Per-business knowledge base & system prompt
- [x] Admin dashboard to manage businesses
- [x] Dynamic agent that loads business context

## Phase 2: Twilio Integration (Next)
- [ ] Twilio account setup
- [ ] Phone number provisioning
- [ ] Voice webhook handler
- [ ] WhatsApp webhook handler

## Phase 3: Production Deployment
- [ ] Deploy to Google Cloud Run or Railway
- [ ] PostgreSQL database
- [ ] Custom domain + SSL
- [ ] Usage tracking & billing
