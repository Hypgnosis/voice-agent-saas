// ═══════════════════════════════════════════════════════════════════════════
// CALENDAR & FIREBASE EXECUTOR FUNCTIONS — Cal.com + Firestore
// ═══════════════════════════════════════════════════════════════════════════
// These are the real backend functions that Gemini's function calling
// invokes. The LLM never has direct access to credentials — it only
// receives the structured JSON result from these executors.
//
// Calendar operations use the Cal.com REST API with per-tenant API keys
// stored in the Firebase Tenant Vault (business.integrations).
// ═══════════════════════════════════════════════════════════════════════════

import { adminDb } from '@/lib/firebase/admin';

// ─── Dashboard URL ─────────────────────────────────────────────────────────
const DASHBOARD_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? `${process.env.NEXT_PUBLIC_SITE_URL}/doctor-dashboard`
  : 'https://your-app.netlify.app/doctor-dashboard';


// ═══════════════════════════════════════════════════════════════════════════
// 1. GET CALENDAR — Query Cal.com availability for a given date
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Queries Cal.com availability for a specific date using the tenant's
 * API key and calendar username from the Tenant Vault.
 *
 * @param {string} date     — YYYY-MM-DD
 * @param {string} apiKey   — Cal.com API key from Firestore
 * @param {string} timezone — e.g. 'America/Merida'
 * @param {string} username — Cal.com username/slug, e.g. 'dra-mya'
 * @returns {object}
 */
export async function executeGetCalendar(date, apiKey, timezone, username) {
  try {
    if (!apiKey) {
      return {
        status: 'error',
        message: 'No se ha configurado la llave API del calendario para este inquilino. Pida al administrador que la configure en el panel.',
      };
    }

    const url = `https://api.cal.com/v1/availability?apiKey=${apiKey}&username=${username || 'me'}&dateFrom=${date}T00:00:00.000Z&dateTo=${date}T23:59:59.000Z`;

    console.log(`📅 get_calendar → Cal.com availability for ${date} (tz: ${timezone})`);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Cal.com API error ${response.status}:`, errorText);
      throw new Error(`Error de Cal.com: ${response.statusText}`);
    }

    const data = await response.json();

    // Simplify for the LLM — only return what's useful
    return {
      status: 'success',
      date,
      timezone,
      available_slots: data,
    };

  } catch (error) {
    console.error('❌ executeGetCalendar error:', error);
    return {
      status: 'error',
      message: 'No se pudo conectar con el servidor de calendario del doctor.',
      details: error.message,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 2. BLOCK CALENDAR — Create a booking / busy block via Cal.com
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Creates a booking on Cal.com to block a time slot.
 *
 * @param {string} date        — YYYY-MM-DD
 * @param {string} startTime   — HH:MM (24h)
 * @param {string} endTime     — HH:MM (24h)
 * @param {string} reason      — Description for the block
 * @param {string} apiKey      — Cal.com API key
 * @param {string} timezone    — e.g. 'America/Merida'
 * @param {string} eventTypeId — Cal.com event type ID (stored in vault)
 * @returns {object}
 */
export async function executeBlockCalendar(date, startTime, endTime, reason, apiKey, timezone, eventTypeId) {
  try {
    if (!apiKey) {
      return {
        status: 'error',
        message: 'No se ha configurado la llave API del calendario para este inquilino.',
      };
    }

    // Build ISO 8601 start datetime with correct timezone offset
    const startDateTime = new Date(`${date}T${startTime}:00${getOffset(timezone)}`).toISOString();

    const payload = {
      eventTypeId: parseInt(eventTypeId) || 0,
      start: startDateTime,
      responses: {
        name: 'Bloqueo Interno / IA',
        email: 'admin@higharchytech.com',
        notes: reason || 'Bloqueado por asistente IA',
      },
      metadata: {},
      timeZone: timezone,
      language: 'es',
    };

    console.log(`🔒 block_calendar → Cal.com booking: ${date} ${startTime}→${endTime}`);

    const response = await fetch(`https://api.cal.com/v1/bookings?apiKey=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Cal.com booking error:', errorData);
      throw new Error(JSON.stringify(errorData));
    }

    const data = await response.json();

    return {
      status: 'success',
      message: `Bloqueo exitoso de ${startTime} a ${endTime}. Motivo: ${reason || 'No disponible'}`,
      booking_id: data.booking?.id,
    };

  } catch (error) {
    console.error('❌ executeBlockCalendar error:', error);
    return {
      status: 'error',
      message: 'Fallo al intentar bloquear el horario en la base de datos externa.',
      details: error.message,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 3. GET PENDING VIDEOS — Query Firebase for unreviewed patient videos
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Queries Firestore for documents in the 'videos' collection
 * with status == 'pending'.
 *
 * @returns {object} — Structured result with patient names and dashboard link
 */
export async function executeGetPendingVideos() {
  try {
    if (!adminDb) {
      return {
        status: 'error',
        message: 'Firebase Admin no está inicializado.',
      };
    }

    const snapshot = await adminDb
      .collection('videos')
      .where('status', '==', 'pending')
      .orderBy('uploaded_at', 'desc')
      .limit(20)
      .get();

    if (snapshot.empty) {
      return {
        status: 'success',
        count: 0,
        patients: [],
        message: 'No hay videos pendientes por revisar.',
        dashboardUrl: DASHBOARD_URL,
      };
    }

    const patients = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      patients.push({
        id: doc.id,
        patient_name: data.patient_name || 'Paciente sin nombre',
        uploaded_at: data.uploaded_at || null,
        family_contact: data.family_contact || null,
      });
    });

    return {
      status: 'success',
      count: patients.length,
      patients,
      dashboardUrl: DASHBOARD_URL,
    };

  } catch (error) {
    // If the 'videos' collection doesn't exist yet, handle gracefully
    if (error.code === 5 || error.message?.includes('NOT_FOUND')) {
      return {
        status: 'success',
        count: 0,
        patients: [],
        message: 'La colección de videos aún no está creada en la base de datos.',
        dashboardUrl: DASHBOARD_URL,
      };
    }

    console.error('❌ executeGetPendingVideos error:', error);
    return {
      status: 'error',
      message: 'No se pudo consultar la base de datos de videos.',
      details: error.message,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// TOOL DISPATCHER — Routes a Gemini function call to the correct executor
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Given a function name, its arguments (from Gemini's functionCall), and the
 * business document (with Tenant Vault credentials), executes the
 * corresponding backend function and returns the result.
 *
 * @param {string} functionName — e.g. 'get_calendar', 'block_calendar'
 * @param {object} args         — Parsed arguments from Gemini
 * @param {object} business     — The full Firebase business document
 * @returns {object}            — Result JSON to feed back into Gemini
 */
export async function dispatchToolCall(functionName, args, business = {}) {
  // Extract Tenant Vault credentials
  const apiKey   = business.integrations?.calendar_api_key || '';
  const timezone = business.timezone || 'America/Merida';
  const username = business.integrations?.calendar_id || 'me';
  const eventTypeId = business.integrations?.event_type_id || '0';

  switch (functionName) {
    case 'get_calendar':
      return await executeGetCalendar(args.date, apiKey, timezone, username);

    case 'block_calendar': {
      // Pre-flight: Guard against missing/invalid event_type_id
      if (!eventTypeId || eventTypeId === '0' || eventTypeId === '') {
        console.warn('⚠️ block_calendar aborted: event_type_id not configured for this tenant');
        return {
          status: 'error',
          message: 'No se pudo crear el bloqueo: el Event Type ID de Cal.com no está configurado para este negocio. Pida al administrador que lo configure en el panel de integraciones.',
        };
      }
      return await executeBlockCalendar(
        args.date,
        args.start_time,
        args.end_time,
        args.reason,
        apiKey,
        timezone,
        eventTypeId
      );
    }

    case 'get_pending_videos':
      return await executeGetPendingVideos();

    default:
      console.warn(`⚠️ Unknown tool call: ${functionName}`);
      return {
        status: 'error',
        message: `Herramienta desconocida: ${functionName}`,
      };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER — Get UTC offset string from a timezone name
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Converts a timezone name (e.g. 'America/Merida') to a UTC offset
 * string (e.g. '-06:00') for ISO 8601 datetime construction.
 */
function getOffset(timeZone) {
  try {
    const date = new Date();
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate  = new Date(date.toLocaleString('en-US', { timeZone }));
    const offset  = (tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
    const sign    = offset < 0 ? '-' : '+';
    const abs     = Math.abs(offset);
    const hours   = String(Math.floor(abs)).padStart(2, '0');
    const minutes = String((abs % 1) * 60).padStart(2, '0');
    return `${sign}${hours}:${minutes}`;
  } catch {
    // Fallback to Mérida offset if timezone string is invalid
    return '-06:00';
  }
}
