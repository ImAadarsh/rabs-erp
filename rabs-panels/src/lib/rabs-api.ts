/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';
import { API_BASE } from '@/lib/api';
import { getSession } from '@/lib/auth';

const BASE = `${API_BASE}/api/rabs`;

function headers(extra?: Record<string, string>) {
  const s = getSession();
  return { ...(s?.accessToken ? { Authorization: `Bearer ${s.accessToken}` } : {}), ...(extra || {}) };
}

export const rabs = {
  async get<T = any>(path: string, params?: Record<string, unknown>): Promise<T> {
    const { data } = await axios.get(`${BASE}${path}`, { headers: headers(), params });
    return data;
  },
  async post<T = any>(path: string, body?: unknown): Promise<T> {
    const { data } = await axios.post(`${BASE}${path}`, body ?? {}, { headers: headers() });
    return data;
  },
  async patch<T = any>(path: string, body?: unknown): Promise<T> {
    const { data } = await axios.patch(`${BASE}${path}`, body ?? {}, { headers: headers() });
    return data;
  },
  async put<T = any>(path: string, body?: unknown): Promise<T> {
    const { data } = await axios.put(`${BASE}${path}`, body ?? {}, { headers: headers() });
    return data;
  },
  async del<T = any>(path: string): Promise<T> {
    const { data } = await axios.delete(`${BASE}${path}`, { headers: headers() });
    return data;
  },
  async upload<T = any>(path: string, files: File[], fields?: Record<string, string>): Promise<T> {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    Object.entries(fields || {}).forEach(([k, v]) => fd.append(k, v));
    const { data } = await axios.post(`${BASE}${path}`, fd, { headers: headers() });
    return data;
  }
};

/** Friendly message from an API error (server already phrases validation errors for staff). */
export function errMsg(e: any, fallback = 'Something went wrong. Please try again.'): string {
  const m = e?.response?.data?.error?.message ?? e?.response?.data?.message;
  if (m) return String(m);
  if (e?.code === 'ERR_NETWORK') return 'Cannot reach the server — check your connection and try again.';
  return e?.message && !String(e.message).startsWith('Request failed') ? e.message : fallback;
}

export const gbp = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });

export const num = (n: number | null | undefined, dp = 2) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('en-GB', { maximumFractionDigits: dp, minimumFractionDigits: 0 });

export function fmtDate(v?: string | Date | null) {
  if (!v) return '—';
  const s = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(v?: string | Date | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtTime(v?: string | Date | null) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** yyyy-mm-dd in the browser's local time. */
export function isoDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

export const UNIT_LABEL: Record<string, string> = { m2: 'm²', sqyd: 'sq yd', linear_m: 'm', item: 'item', pack: 'pack', roll: 'roll' };

export type Status = { code: string; label: string; color: string; textColor: string; nextActionLabel?: string | null; isActive?: boolean; stage?: string };

export type RabsMeta = {
  me: { id: string; roles: string[]; permissions: string[] };
  statuses: Status[];
  progressSteps: Array<{ key: string; label: string }>;
  products: any[];
  categories: string[];
  labourRules: any[];
  staff: Array<{ id: string; email: string; name: string; roles: string[]; status: string }>;
  roomTypes: string[];
  leadSources: string[];
  appointmentPurposes: Array<{ value: string; label: string }>;
  capabilities: Array<{ key: string; label: string }>;
  rabsRoles: Array<{ code: string; name: string; description: string }>;
  settings: {
    vatRate: number;
    depositMode: string;
    depositPercent: number;
    defaultDeliveryCharge: number;
    quoteValidityDays: number;
    documentFooter: string | null;
    quoteTerms: string | null;
    companyDetails: Record<string, string> | null;
    autoCloseWhenPaid: boolean;
  };
  storage: 's3' | 'local';
  today: string;
};
