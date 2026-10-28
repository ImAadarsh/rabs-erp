/**
 * Google Calendar sync — env-gated.
 * Without GOOGLE_CALENDAR_REFRESH_TOKEN (+ client id/secret), calls no-op and return null.
 */
import { OAuth2Client } from 'google-auth-library';
import { env } from '@config/env.js';

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_CALENDAR_REFRESH_TOKEN
  );
}

function calendarId() {
  return env.GOOGLE_CALENDAR_ID || 'primary';
}

async function accessToken(): Promise<string | null> {
  if (!isGoogleCalendarConfigured()) return null;
  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: env.GOOGLE_CALENDAR_REFRESH_TOKEN });
  const { token } = await client.getAccessToken();
  return token || null;
}

export type CalendarEventInput = {
  summary: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  existingEventId?: string | null;
};

export async function upsertCalendarEvent(input: CalendarEventInput): Promise<{ eventId: string | null; synced: boolean; reason?: string }> {
  if (!isGoogleCalendarConfigured()) {
    return { eventId: null, synced: false, reason: 'Google Calendar not configured (set GOOGLE_CALENDAR_REFRESH_TOKEN)' };
  }
  try {
    const token = await accessToken();
    if (!token) return { eventId: null, synced: false, reason: 'Could not refresh Google access token' };

    const body = {
      summary: input.summary,
      description: input.description || '',
      location: input.location || '',
      start: { dateTime: input.startIso, timeZone: 'Europe/London' },
      end: { dateTime: input.endIso, timeZone: 'Europe/London' }
    };

    const cal = encodeURIComponent(calendarId());
    const url = input.existingEventId
      ? `https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${encodeURIComponent(input.existingEventId)}`
      : `https://www.googleapis.com/calendar/v3/calendars/${cal}/events`;

    const res = await fetch(url, {
      method: input.existingEventId ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[rabsCalendar] sync failed', res.status, text.slice(0, 200));
      return { eventId: null, synced: false, reason: `Calendar API ${res.status}` };
    }
    const data = (await res.json()) as { id?: string };
    return { eventId: data.id || null, synced: true };
  } catch (e: any) {
    console.warn('[rabsCalendar]', e?.message || e);
    return { eventId: null, synced: false, reason: String(e?.message || e) };
  }
}

export async function deleteCalendarEvent(eventId: string | null | undefined): Promise<void> {
  if (!eventId || !isGoogleCalendarConfigured()) return;
  try {
    const token = await accessToken();
    if (!token) return;
    const cal = encodeURIComponent(calendarId());
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (e: any) {
    console.warn('[rabsCalendar] delete', e?.message || e);
  }
}
