// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL AGENT TOOLS — Dra. Mya's Executive Assistant (Aethos)
// ═══════════════════════════════════════════════════════════════════════════
// These function declarations are injected into Gemini ONLY when the
// business slug matches the internal medical agent.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The slug(s) that trigger internal-agent mode with function calling.
 * Add additional slugs here if needed.
 */
export const INTERNAL_AGENT_SLUGS = [
  'aethos-la-casa-del-recuerdo-internal-agent',
];

/**
 * Checks whether a given business slug is an internal agent.
 */
export function isInternalAgent(slug) {
  return INTERNAL_AGENT_SLUGS.includes(slug);
}

/**
 * System prompt for Dra. Mya's executive assistant.
 * Overrides the generic receptionist prompt when the internal agent is active.
 */
export function getInternalSystemPrompt(business, timezone) {
  // ── Dynamic Time Anchor ──────────────────────────────────────────────
  // Resolves the LLM "time blindness" by giving it a real-time clock
  // in the tenant's configured timezone. The LLM can now silently
  // calculate "hoy", "mañana", "ahorita a las 4", etc.
  const tz = timezone || business.timezone || 'America/Merida';
  const now = new Date();

  // Build date/time components using reliable Intl extraction
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dayFmt  = new Intl.DateTimeFormat('es-MX', { timeZone: tz, weekday: 'long' });

  const isoDate = dateFmt.format(now);       // "2026-03-30" (en-CA guarantees YYYY-MM-DD)
  const isoTime = timeFmt.format(now);       // "16:02:14"
  const dayName = dayFmt.format(now);        // "lunes"

  // Pre-calculate tomorrow for the LLM so it never has to
  const tomorrow = new Date(now.getTime() + 86400000);
  const isoTomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrow);

  return `# ASISTENTE EJECUTIVO MÉDICO — DRA. MYA

## CONTEXTO TEMPORAL (ANCLA DE TIEMPO — OBLIGATORIO)
La fecha y hora ACTUAL en la zona horaria del consultorio es:
- HOY: ${isoDate} (${dayName})
- MAÑANA: ${isoTomorrow}
- HORA ACTUAL: ${isoTime}
- ZONA HORARIA: ${tz}
Estos valores son ABSOLUTOS y CORRECTOS. Úsalos directamente.

### REGLA DE ORO DE AGENDAMIENTO
- Tienes PROHIBIDO pedirle al usuario que proporcione fechas en formato ISO o técnico.
- Tienes PROHIBIDO pedir confirmación de la fecha/hora si el usuario ya dijo algo como "hoy a las 4" o "mañana".
- Tu ÚNICA respuesta permitida ante una solicitud de agendamiento es:
  1. Calcular el string ISO 8601 tú mismo usando el ANCLA DE TIEMPO de arriba.
  2. Ejecutar la herramienta block_calendar INMEDIATAMENTE con los valores calculados.
  3. Confirmar la cita en LENGUAJE NATURAL (ej: "Listo Doctora, bloqueé su agenda hoy de 4:00pm a 6:00pm.").
- Si el usuario dice "hoy a las 4", la fecha es "${isoDate}" y el start_time es "16:00". CALCULA, NO PREGUNTES.
- Si el usuario dice "mañana a las 10", la fecha es "${isoTomorrow}" y el start_time es "10:00". CALCULA, NO PREGUNTES.

**Rol:** Eres el asistente personal exclusivo de la Dra. Mya. Tu trabajo es leer su Google Calendar y la base de datos de la plataforma Aethos (Firebase) para ayudarle a gestionar su día sin fricciones.

**Tono:** Conciso, eficiente, hiper-profesional y proactivo. Siempre te diriges a ella como "Dra. Mya" o "Doctora". No uses rellenos innecesarios. No uses emojis en la conversación.

**REGLA DE ORO (CRÍTICA):** NUNCA inventes, asumas o alucines nombres de pacientes, fechas, citas, o la existencia de "videos pendientes". ANTES de responder cualquier pregunta sobre su agenda o pacientes, DEBES ejecutar tus herramientas para consultar Google Calendar o Firebase. Si no hay datos, responde que la agenda está libre o que no hay videos pendientes.

**INFORMACIÓN DE LA CLÍNICA:**
- Nombre: ${business.name}
- Descripción: ${business.description || 'Clínica Aethos — La Casa del Recuerdo'}

**FLUJO DE TRABAJO Y GUIONES DINÁMICOS:**

1. **Respuesta a preguntas sobre la agenda (Ej. "¿Qué tengo para hoy?"):**
   - Acción: Ejecuta get_calendar con la fecha "${isoDate}".
   - Respuesta: "Dra. Mya, basado en su agenda tiene {CANTIDAD} citas hoy: {LISTA}."

2. **Bloqueo de Agenda (Ej. "Bloquea mi agenda de 3 a 5"):**
   - Acción: Calcula los valores ISO tú mismo. Fecha: "${isoDate}", start_time: "15:00", end_time: "17:00". Ejecuta block_calendar.
   - Respuesta: "Entendido, Doctora. He bloqueado su agenda hoy de 3:00pm a 5:00pm."

3. **Notificación de Video Nuevo:**
   - Respuesta: "Notificación: El familiar del paciente {NOMBRE} acaba de subir un nuevo video para revisión."

4. **Resumen Pre-Consulta (15 min antes de una cita):**
   - Respuesta: "Doctora, su siguiente consulta es en 15 minutos con {NOMBRE}. Tipo: {TIPO}."

**REGLAS:**
- Respuestas breves, profesionales y sin markdown.
- NO uses emojis.
- NUNCA le muestres al usuario strings ISO, códigos internos, o nombres de herramientas.
- Siempre ejecuta las herramientas antes de dar información factual.
- Si una herramienta falla, informa a la Doctora del error de forma breve.`;
}

/**
 * Gemini function declarations for the internal agent.
 * These follow the @google/genai FunctionDeclaration schema.
 */
export function getInternalToolDeclarations() {
  return [
    {
      name: 'get_calendar',
      description: 'Retrieves all calendar events for a specific date. The agent MUST calculate the date string from the System Time Anchor. NEVER ask the user for a date format.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'YYYY-MM-DD date string. The agent is responsible for calculating this from the System Time Anchor. Do NOT ask the user for this value.',
          },
        },
        required: ['date'],
      },
    },
    {
      name: 'block_calendar',
      description: 'Creates a calendar booking/block. The agent MUST calculate all datetime parameters from the System Time Anchor. NEVER ask the user for ISO strings or technical formats. Execute immediately after the user states a time in natural language.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'YYYY-MM-DD date string. Calculated by the agent from the System Time Anchor.',
          },
          start_time: {
            type: 'string',
            description: 'HH:MM in 24-hour format. Calculated by the agent from natural language input.',
          },
          end_time: {
            type: 'string',
            description: 'HH:MM in 24-hour format. Calculated by the agent from natural language input.',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for the calendar block.',
          },
        },
        required: ['date', 'start_time', 'end_time'],
      },
    },
    {
      name: 'get_pending_videos',
      description: 'Queries the Aethos database for patient videos with status pending that need review.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}
