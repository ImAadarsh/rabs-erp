import type { ZodError } from 'zod';

export function zodMessage(error: ZodError): string {
  const parts = error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
  return parts.length ? `Invalid payload — ${parts.join('; ')}` : 'Invalid payload';
}
