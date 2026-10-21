'use client';
import { useEffect, useState } from 'react';
import { CalendarDays, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { approveLeaveRequest, getLeaveRequest, rejectLeaveRequest } from '@/lib/api';
import { HrModal, hrTextareaClass } from '@/components/hr/hr-modal';
import {
  employeeName, formatDate, formatDateTime, hrApiError, LEAVE_TYPES, statusBadgeClass,
} from '@/lib/hr-utils';

function userName(u?: any): string {
  if (!u) return '—';
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username || u.email || '—';
}

export function LeaveRequestDetail({
  request,
  onClose,
  onChanged,
  canApprove,
}: {
  request: any | null;
  onClose: () => void;
  onChanged: () => void;
  canApprove: boolean;
}) {
  const [item, setItem] = useState<any>(request);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setItem(request);
    setRejecting(false);
    setReason('');
    if (!request?.id) return;
    getLeaveRequest(request.id)
      .then((res) => setItem(res.data || request))
      .catch(() => {});
  }, [request]);

  if (!request || !item) return null;

  const typeLabel = LEAVE_TYPES.find((t) => t.value === item.leaveType)?.label || (item.leaveType || '').replace(/_/g, ' ');

  const history: { label: string; at?: string | null; by?: string; note?: string | null }[] = [
    { label: 'Submitted', at: item.createdAt },
  ];
  if (item.status === 'approved') {
    history.push({ label: 'Approved', at: item.approvedAt, by: userName(item.approvedBy) });
  } else if (item.status === 'rejected') {
    history.push({ label: 'Rejected', at: item.approvedAt, by: userName(item.approvedBy), note: item.rejectionReason });
  } else if (item.status === 'cancelled') {
    history.push({ label: 'Cancelled', at: item.updatedAt });
  } else {
    history.push({ label: 'Awaiting approval' });
  }

  async function approve() {
    setBusy(true);
    try {
      await approveLeaveRequest(item.id);
      toast.success('Leave approved');
      onChanged();
      onClose();
    } catch (err) {
      toast.error(hrApiError(err, 'Approve failed'));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      await rejectLeaveRequest(item.id, { rejectionReason: reason.trim() || undefined });
      toast.success('Leave rejected');
      onChanged();
      onClose();
    } catch (err) {
      toast.error(hrApiError(err, 'Reject failed'));
    } finally {
      setBusy(false);
    }
  }

  const fields: [string, React.ReactNode][] = [
    ['Employee', employeeName(item.employee)],
    ['Employee #', item.employee?.employeeNumber || '—'],
    ['Department', item.employee?.department || '—'],
    ['Leave type', <span key="t" className="capitalize">{typeLabel}</span>],
    ['Start date', formatDate(item.startDate)],
    ['End date', formatDate(item.endDate)],
    ['Total days', item.totalDays ?? '—'],
    ['Status', (
      <span key="s" className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusBadgeClass(item.status)}`}>{item.status}</span>
    )],
    ['Submitted', formatDateTime(item.createdAt)],
    ['Last updated', formatDateTime(item.updatedAt)],
  ];

  return (
    <HrModal open onClose={onClose} title="Leave request" icon={CalendarDays} wide>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border/40 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
            <div className="mt-1 text-sm font-medium">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/40 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Reason</div>
        <div className="mt-1 text-sm whitespace-pre-wrap">{item.reason || '—'}</div>
      </div>
      {item.notes && (
        <div className="rounded-xl border border-border/40 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Notes</div>
          <div className="mt-1 text-sm whitespace-pre-wrap">{item.notes}</div>
        </div>
      )}

      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2">Status history</div>
        <ol className="border-l border-border/60 ml-2 space-y-3">
          {history.map((h, i) => (
            <li key={i} className="relative pl-4">
              <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand" />
              <div className="text-sm font-medium">{h.label}</div>
              <div className="text-xs text-muted-foreground">
                {h.at ? formatDateTime(h.at) : '—'}{h.by && h.by !== '—' ? ` · by ${h.by}` : ''}
              </div>
              {h.note && <div className="text-xs mt-0.5">Reason: {h.note}</div>}
            </li>
          ))}
        </ol>
      </div>

      {canApprove && item.status === 'pending' && (
        <div className="space-y-3 pt-2 border-t border-border/40">
          {rejecting && (
            <textarea
              className={hrTextareaClass}
              placeholder="Rejection reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          <div className="flex gap-3">
            {rejecting ? (
              <>
                <button type="button" disabled={busy} onClick={() => setRejecting(false)} className="btn flex-1 h-11 rounded-xl bg-muted text-foreground border-none shadow-none">Back</button>
                <button type="button" disabled={busy} onClick={reject} className="btn flex-1 h-11 gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white border-none">
                  <X size={14} /> Confirm reject
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="btn flex-1 h-11 gap-2 rounded-xl bg-red-500/10 text-red-600 hover:bg-red-500/20 border-none shadow-none">
                  <X size={14} /> Reject
                </button>
                <button type="button" disabled={busy} onClick={approve} className="btn flex-1 h-11 gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border-none">
                  <Check size={14} /> Approve
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </HrModal>
  );
}
