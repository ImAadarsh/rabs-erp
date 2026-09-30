/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { Phone, MapPin, AlertTriangle, ChevronRight } from 'lucide-react';
import { gbp, fmtDate, fmtDateTime } from '@/lib/rabs-api';
import { StatusBadge } from './ui';

export function JobRow({ j }: { j: any }) {
  const when = j.nextBooking ? `Booked ${fmtDate(j.nextBooking)}` : j.nextAppointment ? `Appt ${fmtDateTime(j.nextAppointment)}` : null;
  return (
    <Link href={`/rabs/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60 border-b border-border/60 last:border-0">
      <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: j.statusColor }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold truncate">{j.customerName}</span>
          <span className="text-xs text-muted-foreground">{j.jobNumber}</span>
          {j.hasIssue && <AlertTriangle size={14} className="text-red-600" />}
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          {j.customerPhone && (
            <span className="inline-flex items-center gap-1">
              <Phone size={11} /> {j.customerPhone}
            </span>
          )}
          {j.address && (
            <span className="inline-flex items-center gap-1 truncate max-w-[16rem]">
              <MapPin size={11} /> {j.address}
            </span>
          )}
          {when && <span>{when}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge size="sm" label={j.statusLabel} color={j.statusColor} textColor={j.statusTextColor} />
        {j.total !== undefined && (j.total > 0 || j.quoteTotal) ? (
          <span className="text-xs text-muted-foreground">
            {j.balance > 0 && j.total > 0 ? `Due ${gbp(j.balance)}` : gbp(j.total || j.quoteTotal)}
          </span>
        ) : null}
      </div>
      <ChevronRight size={16} className="text-muted-foreground shrink-0 hidden sm:block" />
    </Link>
  );
}
