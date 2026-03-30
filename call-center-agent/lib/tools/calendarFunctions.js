// ═══════════════════════════════════════════════════════════════════════════
// CALENDAR & FIREBASE EXECUTOR FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════
// These are the real backend functions that Gemini's function calling
// invokes. The LLM never has direct access to credentials — it only
// receives the structured JSON result from these executors.
// ═══════════════════════════════════════════════════════════════════════════

import { adminDb } from '@/lib/firebase/admin';

// ─── Mérida, Yucatán timezone offset ───────────────────────────────────────
const TIMEZONE = 'America/Merida';
const UTC_OFFSET = '-06:00';

// ─── Dashboard URL (update to production domain when deployed) ─────────────
const DASHBOARD_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? `${process.env.NEXT_PUBLIC_SITE_URL}/doctor-dashboard`
  : 'https://your-app.netlify.app/doctor-dashboard';


// ═══════════════════════════════════════════════════════════════════════════
// 1. GET CALENDAR — Retrieve events for a given date
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Queries Google Calendar for all events on a given date.
 * 
 * TODO: Replace the stub with a real Google Calendar API call once
 * the OAuth2 refresh token for goldenagemerida@gmail.com is configured.
 * You will need:
 *   - npm install googleapis
 *   - GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET,
 *     GOOGLE_CALENDAR_REFRESH_TOKEN in .env.local
 *
 * @param {string} date — ISO date string YYYY-MM-DD
 * @returns {object} — Structured result for Gemini to read
 */
export async function executeGetCalendar(date) {
  try {
    // ──────────────────────────────────────────────────────────────────────
    // STUB: Replace this block with real Google Calendar API integration
    // ──────────────────────────────────────────────────────────────────────
    // const { google } = require('googleapis');
    // const oauth2Client = new google.auth.OAuth2(
    //   process.env.GOOGLE_CALENDAR_CLIENT_ID,
    //   process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    // );
    // oauth2Client.setCredentials({
    //   refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
    // });
    // const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    //
    // const timeMin = `${date}T00:00:00${UTC_OFFSET}`;
    // const timeMax = `${date}T23:59:59${UTC_OFFSET}`;
    //
    // const res = await calendar.events.list({
    //   calendarId: 'primary',
    //   timeMin,
    //   timeMax,
    //   singleEvents: true,
    //   orderBy: 'startTime',
    // });
    //
    // const events = (res.data.items || []).map(e => ({
    //   summary: e.summary || 'Sin título',
    //   start: e.start?.dateTime || e.start?.date,
    //   end: e.end?.dateTime || e.end?.date,
    //   location: e.location || null,
    // }));
    //
    // return {
    //   status: 'success',
    //   date,
    //   count: events.length,
    //   events,
    // };
    // ──────────────────────────────────────────────────────────────────────

    // Temporary: return a "no events" response until Google OAuth is set up
    console.log(`📅 get_calendar called for date: ${date} (stub mode)`);
    return {
      status: 'success',
      date,
      count: 0,
      events: [],
      _note: 'Google Calendar integration pending OAuth setup. No events returned.',
    };

  } catch (error) {
    console.error('❌ executeGetCalendar error:', error);
    return {
      status: 'error',
      message: 'No se pudo acceder a Google Calendar.',
      details: error.message,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 2. BLOCK CALENDAR — Create a busy block on a given date/time range
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Creates a "Busy" event on Google Calendar.
 *
 * @param {string} date      — YYYY-MM-DD
 * @param {string} startTime — HH:MM (24h)
 * @param {string} endTime   — HH:MM (24h)
 * @param {string} reason    — Optional description
 * @returns {object}
 */
export async function executeBlockCalendar(date, startTime, endTime, reason) {
  try {
    const startDateTime = `${date}T${startTime}:00${UTC_OFFSET}`;
    const endDateTime = `${date}T${endTime}:00${UTC_OFFSET}`;

    // ──────────────────────────────────────────────────────────────────────
    // STUB: Replace with real Google Calendar API insert
    // ──────────────────────────────────────────────────────────────────────
    // const { google } = require('googleapis');
    // const oauth2Client = new google.auth.OAuth2(
    //   process.env.GOOGLE_CALENDAR_CLIENT_ID,
    //   process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    // );
    // oauth2Client.setCredentials({
    //   refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
    // });
    // const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    //
    // await calendar.events.insert({
    //   calendarId: 'primary',
    //   requestBody: {
    //     summary: reason || 'Bloqueado — No disponible',
    //     start: { dateTime: startDateTime, timeZone: TIMEZONE },
    //     end: { dateTime: endDateTime, timeZone: TIMEZONE },
    //     status: 'confirmed',
    //     transparency: 'opaque', // Shows as "Busy"
    //   },
    // });
    // ──────────────────────────────────────────────────────────────────────

    console.log(`🔒 block_calendar: ${date} ${startTime}→${endTime} reason="${reason || 'N/A'}" (stub mode)`);
    return {
      status: 'success',
      message: `Calendario bloqueado exitosamente de ${startTime} a ${endTime} el ${date}.`,
      blocked: { date, startTime, endTime, reason: reason || 'No disponible' },
      _note: 'Google Calendar integration pending OAuth setup. Block simulated.',
    };

  } catch (error) {
    console.error('❌ executeBlockCalendar error:', error);
    return {
      status: 'error',
      message: 'No se pudo crear el bloqueo en Google Calendar.',
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
 * Given a function name and its arguments (from Gemini's functionCall),
 * executes the corresponding backend function and returns the result.
 *
 * @param {string} functionName — e.g. 'get_calendar', 'block_calendar'
 * @param {object} args         — Parsed arguments from Gemini
 * @returns {object}            — Result JSON to feed back into Gemini
 */
export async function dispatchToolCall(functionName, args) {
  switch (functionName) {
    case 'get_calendar':
      return await executeGetCalendar(args.date);

    case 'block_calendar':
      return await executeBlockCalendar(
        args.date,
        args.start_time,
        args.end_time,
        args.reason
      );

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
