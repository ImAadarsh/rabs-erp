/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRabs } from '@/components/rabs/shell';
import { Btn, Card, Empty, Field, Modal, Spinner, StatusBadge, textareaCls } from '@/components/rabs/ui';
import { RoomEditor } from '@/components/rabs/room-editor';
import { Thumbs } from '@/components/rabs/thumbs';
import { rabs, errMsg, gbp, num, UNIT_LABEL } from '@/lib/rabs-api';

export default function MeasurePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useRabs();
  const [agg, setAgg] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [notes, setNotes] = useState('');
  const [notesState, setNotesState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [creating, setCreating] = useState(false);
  const [photoRoom, setPhotoRoom] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const notesLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      let a = await rabs.get(`/jobs/${id}`);
      if (!a.measurement && !a.job.acceptedQuoteId && a.permissions.includes('measure')) {
        await rabs.post(`/jobs/${id}/measurement`);
        a = await rabs.get(`/jobs/${id}`);
      }
      setAgg(a);
      if (!notesLoaded.current) {
        setNotes(a.measurement?.notes || '');
        notesLoaded.current = true;
      }
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Autosave measurement notes
  useEffect(() => {
    if (!agg?.measurement || !notesLoaded.current || notes === (agg.measurement.notes || '')) return;
    setNotesState('saving');
    const t = setTimeout(async () => {
      try {
        await rabs.patch(`/measurements/${agg.measurement.id}`, { notes: notes || null });
        agg.measurement.notes = notes;
        setNotesState('saved');
      } catch (e) {
        toast.error(errMsg(e));
        setNotesState('idle');
      }
    }, 800);
    return () => clearTimeout(t);
  }, [notes, agg]);

  if (error) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  if (!agg) return <Spinner />;

  const { job, customer, measurement, status } = agg;
  const locked = !!job.acceptedQuoteId;
  const rooms: any[] = measurement?.rooms || [];
  const missingProduct = rooms.some((r) => !r.productId);
  const totalArea = rooms.reduce((s, r) => s + (r.areaM2 || 0), 0);
  const draftKey = `rabs_room_draft_${id}`;

  const createQuote = async () => {
    setCreating(true);
    try {
      await rabs.post(`/jobs/${id}/quotes`);
      toast.success('Quotation built from your measurements');
      router.push(`/rabs/jobs/${id}/quote`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCreating(false);
    }
  };

  const deleteRoom = async (r: any) => {
    if (!confirm(`Delete ${r.name}?`)) return;
    try {
      await rabs.del(`/rooms/${r.id}`);
      toast.success('Room removed');
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length || !photoRoom) return;
    try {
      await rabs.upload(`/rooms/${photoRoom}/photos`, Array.from(files));
      toast.success('Photos added');
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href={`/rabs/jobs/${id}`} className="h-10 w-10 rounded-xl border border-border flex items-center justify-center hover:bg-muted" aria-label="Back to job">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold tracking-tight truncate">Measurement</h1>
          <div className="text-sm text-muted-foreground truncate">
            {customer.name} · {job.jobNumber} · {agg.siteAddress}
          </div>
        </div>
        <StatusBadge size="sm" label={status.label} color={status.color} textColor={status.textColor} />
      </div>

      {locked && (
        <div className="flex items-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm">
          <Lock size={16} /> The quote has been accepted, so these measurements are locked. Add changes as a variation on the job.
        </div>
      )}

      <Card
        title={`Rooms (${rooms.length})${totalArea ? ` · ${num(totalArea)} m² total` : ''}`}
        actions={
          !locked && can('measure') ? (
            <Btn size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>
              Add room
            </Btn>
          ) : null
        }
      >
        {rooms.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">Add each room you measure — the quote is built from these automatically.</p>
            {!locked && (
              <Btn size="lg" icon={<Plus size={18} />} onClick={() => setEditing('new')}>
                ADD FIRST ROOM
              </Btn>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {rooms.map((r) => (
              <div key={r.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-base">{r.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {r.areaM2 > 0 ? (
                        <>
                          {r.unitInput === 'ftin' ? `${r.lengthFt}′${r.lengthIn ? ` ${num(r.lengthIn)}″` : ''} × ${r.widthFt}′${r.widthIn ? ` ${num(r.widthIn)}″` : ''} · ` : ''}
                          {num(r.lengthM)} × {num(r.widthM)} m · <b className="text-foreground">{num(r.areaM2)} m²</b> · {num(r.areaSqyd)} sq yd
                        </>
                      ) : (
                        'No floor area (item)'
                      )}
                      {r.doors ? ` · ${r.doors} door${r.doors > 1 ? 's' : ''}` : ''}
                      {r.stairs ? ` · ${r.stairs} stairs` : ''}
                    </div>
                    <div className="text-sm mt-1">
                      {r.product ? (
                        <>
                          {r.product.name}
                          {r.product.colour ? ` — ${r.product.colour}` : ''}
                          {r.productQty ? ` × ${num(r.productQty)} ${UNIT_LABEL[r.product.unit] || ''}` : ''}
                        </>
                      ) : (
                        <span className="text-red-600 font-semibold">Choose a product</span>
                      )}
                    </div>
                    {r.accessories.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {r.accessories.map((a: any) => `${a.name} ${num(a.qty)} ${UNIT_LABEL[a.unit] || a.unit}`).join(' · ')}
                      </div>
                    )}
                    {r.notes && <div className="text-xs text-muted-foreground italic mt-0.5">{r.notes}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {r.subtotal !== undefined && r.subtotal > 0 && <span className="font-bold text-sm">{gbp(r.subtotal)}</span>}
                    {!locked && (
                      <div className="flex gap-1">
                        <button onClick={() => setEditing(r)} className="p-2 rounded-lg hover:bg-muted" aria-label={`Edit ${r.name}`}>
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => deleteRoom(r)} className="p-2 rounded-lg hover:bg-muted text-red-600" aria-label={`Delete ${r.name}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">{r.photos.length > 0 ? <Thumbs photos={r.photos} /> : <div className="text-xs text-amber-700 mt-2">No photos yet</div>}</div>
                  {can('measure') && (
                    <button
                      onClick={() => {
                        setPhotoRoom(r.id);
                        setTimeout(() => photoRef.current?.click(), 0);
                      }}
                      className="h-16 w-16 shrink-0 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:bg-muted"
                    >
                      <Camera size={18} />
                      <span className="text-[10px] font-semibold">Photo</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => uploadPhotos(e.target.files)} />
      </Card>

      {measurement && (
        <Card title="Survey notes" actions={<span className="text-xs text-muted-foreground">{notesState === 'saving' ? 'Saving…' : notesState === 'saved' ? 'Saved' : ''}</span>}>
          <Field label="Notes for the office and fitters">
            <textarea className={textareaCls} value={notes} disabled={!can('measure')} onChange={(e) => setNotes(e.target.value)} placeholder="Access, parking, subfloor, furniture moving, customer preferences…" />
          </Field>
        </Card>
      )}

      {rooms.length === 0 && !measurement && <Empty>No measurement yet.</Empty>}

      {!locked && can('quotes') && rooms.length > 0 && (
        <div className="sticky bottom-20 md:bottom-4 z-10">
          <Btn size="lg" className="w-full text-lg" loading={creating} disabled={missingProduct} onClick={createQuote}>
            {agg.currentQuote ? 'UPDATE QUOTATION' : 'CREATE QUOTATION'} →
          </Btn>
          {missingProduct && <div className="text-center text-xs text-red-600 mt-1">Every room needs a product before quoting.</div>}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add room' : `Edit ${editing?.name ?? 'room'}`} wide>
        {editing && measurement && (
          <RoomEditor
            key={editing === 'new' ? 'new' : editing.id}
            measurementId={measurement.id}
            room={editing === 'new' ? null : editing}
            draftKey={draftKey}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
