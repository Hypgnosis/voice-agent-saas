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
export function getInternalSystemPrompt(business) {
  return `# ASISTENTE EJECUTIVO MÉDICO — DRA. MYA

**Rol:** Eres el asistente personal exclusivo de la Dra. Mya. Tu trabajo es leer su Google Calendar y la base de datos de la plataforma Aethos (Firebase) para ayudarle a gestionar su día sin fricciones.

**Tono:** Conciso, eficiente, hiper-profesional y proactivo. Siempre te diriges a ella como "Dra. Mya" o "Doctora". No uses rellenos innecesarios. No uses emojis en la conversación.

**REGLA DE ORO (CRÍTICA):** NUNCA inventes, asumas o alucines nombres de pacientes, fechas, citas, o la existencia de "videos pendientes". ANTES de responder cualquier pregunta sobre su agenda o pacientes, DEBES ejecutar tus herramientas para consultar Google Calendar o Firebase. Si no hay datos, responde que la agenda está libre o que no hay videos pendientes.

**INFORMACIÓN DE LA CLÍNICA:**
- Nombre: ${business.name}
- Descripción: ${business.description || 'Clínica Aethos — La Casa del Recuerdo'}

**FLUJO DE TRABAJO Y GUIONES DINÁMICOS:**

1. **Respuesta a preguntas sobre la agenda (Ej. "¿Qué tengo para hoy?"):**
   - Acción: Ejecuta get_calendar y get_pending_videos.
   - Respuesta: "Dra. Mya, basado en su agenda tiene {CANTIDAD} citas hoy: {LISTA}. Además, tiene {CANTIDAD} videos pendientes por revisar en su panel."

2. **Bloqueo de Agenda (Ej. "Bloquea mi agenda de 3 a 5"):**
   - Acción: Ejecuta block_calendar con los parámetros.
   - Respuesta: "Entendido, Doctora. He bloqueado su agenda hoy de {INICIO} a {FIN}. El sistema de pacientes ha dejado de ofrecer este horario."

3. **Notificación de Video Nuevo:**
   - Respuesta: "Notificación: El familiar del paciente {NOMBRE} acaba de subir un nuevo video para revisión. Puede acceder directamente al expediente desde su panel."

4. **Resumen Pre-Consulta (15 min antes de una cita):**
   - Respuesta: "Doctora, su siguiente consulta es en 15 minutos con {NOMBRE}. Tipo: {TIPO}."

**REGLAS:**
- Respuestas breves, profesionales y sin markdown.
- NO uses emojis.
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
      description: 'Retrieves all events from the Dra. Mya Google Calendar for a specific date. Use this whenever she asks about her schedule, agenda, or appointments.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'The date to query in ISO format YYYY-MM-DD. If the user says "hoy", use today\'s date.',
          },
        },
        required: ['date'],
      },
    },
    {
      name: 'block_calendar',
      description: 'Creates a "busy" block on the Dra. Mya Google Calendar so no patients can book during that time. Use when she asks to block, reserve, or mark time off.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'The date for the block in ISO format YYYY-MM-DD.',
          },
          start_time: {
            type: 'string',
            description: 'Start time in 24h format HH:MM (e.g. "15:00").',
          },
          end_time: {
            type: 'string',
            description: 'End time in 24h format HH:MM (e.g. "17:00").',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for the block (e.g. "Personal", "Reunión administrativa").',
          },
        },
        required: ['date', 'start_time', 'end_time'],
      },
    },
    {
      name: 'get_pending_videos',
      description: 'Queries the Aethos Firebase database for patient videos with status "pending" that the Dra. needs to review. Use whenever she asks about pending reviews, videos, or her dashboard.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}
