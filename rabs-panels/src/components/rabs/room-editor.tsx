/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, ImagePlus, Minus, Plus, X } from 'lucide-react';
import clsx from 'clsx';
import { useRabs } from './shell';
import { Btn, Field, inputCls, textareaCls } from './ui';
import { rabs, errMsg, gbp, num, UNIT_LABEL } from '@/lib/rabs-api';

type Acc = { productId: string; name: string; unit: string; sellPrice?: number; suggestedQty: number; checked: boolean; qty: string };

type RoomForm = {
  name: string;
  unitInput: 'm' | 'ftin';
  lengthM: string;
  widthM: string;
  lengthFt: string;
  lengthIn: string;
  widthFt: string;
  widthIn: string;
  doors: number;
  stairs: number;
  category: string;
  productId: string;
  productQty: string;
  notes: string;
};

const s = (v: any) => (v === null || v === undefined ? '' : String(v));

function fromRoom(r: any | null, categoryOf: (pid: string) => string): RoomForm {
  return {
    name: r?.name ?? '',
    unitInput: r?.unitInput ?? 'm',
    lengthM: s(r?.lengthM || ''),
    widthM: s(r?.widthM || ''),
    lengthFt: s(r?.lengthFt ?? ''),
    lengthIn: s(r?.lengthIn ?? ''),
    widthFt: s(r?.widthFt ?? ''),
    widthIn: s(r?.widthIn ?? ''),
    doors: r?.doors ?? 1,
    stairs: r?.stairs ?? 0,
    category: r?.productId ? categoryOf(r.productId) : '',
    productId: r?.productId ?? '',
    productQty: r?.productQty ? String(r.productQty) : '',
    notes: r?.notes ?? ''
  };
}

/** Local draft key for a room: one for the room being added, one per existing room being edited. */
export const roomDraftKey = (base: string, roomId?: string | null) => (roomId ? `${base}_room_${roomId}` : base);

/** A draft is worth offering back only if something was actually typed. */
export function draftHasContent(raw: string | null) {
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    return !!(d.name || d.lengthM || d.widthM || d.lengthFt || d.widthFt || d.productId || d.notes);
  } catch {
    return false;
  }
}

export function RoomEditor({
  measurementId,
  room,
  draftKey,
  onSaved,
  onCancel
}: {
  measurementId: string;
  room: any | null;
  draftKey: string;
  onSaved: (addAnother: boolean) => void;
  onCancel: () => void;
}) {
  const { meta, can } = useRabs();
  const products = useMemo(() => (meta?.products || []).filter((p: any) => p.kind !== 'accessory'), [meta]);
  const categoryOf = (pid: string) => products.find((p: any) => p.id === pid)?.category ?? '';
  const key = roomDraftKey(draftKey, room?.id);
  const [restored, setRestored] = useState(() => typeof window !== 'undefined' && draftHasContent(localStorage.getItem(key)));
  const [f, setF] = useState<RoomForm>(() => {
    if (restored) {
      try {
        return { ...fromRoom(room, categoryOf), ...JSON.parse(localStorage.getItem(key) as string) };
      } catch {
        /* ignore */
      }
    }
    return fromRoom(room, categoryOf);
  });
  const [preview, setPreview] = useState<any>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [accs, setAccs] = useState<Acc[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const initialAccs = useRef<any[] | null>(room ? room.accessories : null);

  const product = products.find((p: any) => p.id === f.productId);
  const perItem = product?.calcMethod === 'per_item';

  // Autosave what has been typed so a reload, a dropped signal or a closed tab never loses a room.
  useEffect(() => {
    if (!dirty.current && !restored) return;
    const t = setTimeout(() => localStorage.setItem(key, JSON.stringify(f)), 300);
    return () => clearTimeout(t);
  }, [f, key, restored]);

  const dimsBody = () => ({
    unitInput: f.unitInput,
    lengthM: f.unitInput === 'm' && f.lengthM ? Number(f.lengthM) : null,
    widthM: f.unitInput === 'm' && f.widthM ? Number(f.widthM) : null,
    lengthFt: f.unitInput === 'ftin' && f.lengthFt ? Number(f.lengthFt) : null,
    lengthIn: f.unitInput === 'ftin' && f.lengthIn ? Number(f.lengthIn) : null,
    widthFt: f.unitInput === 'ftin' && f.widthFt ? Number(f.widthFt) : null,
    widthIn: f.unitInput === 'ftin' && f.widthIn ? Number(f.widthIn) : null,
    doors: f.doors,
    stairs: f.stairs,
    productId: f.productId || null,
    productQty: perItem && f.productQty ? Number(f.productQty) : null
  });

  // Live m² / sq yd / quantity preview (server does the maths so it always matches the quote)
  useEffect(() => {
    const hasDims = f.unitInput === 'm' ? Number(f.lengthM) > 0 && Number(f.widthM) > 0 : Number(f.lengthFt) + Number(f.lengthIn) > 0 && Number(f.widthFt) + Number(f.widthIn) > 0;
    if (!hasDims && !perItem) {
      setPreview(null);
      setPreviewErr(null);
      setAccs([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const p = await rabs.post('/calc/room', { name: f.name || 'Room', ...dimsBody() });
        setPreview(p);
        setPreviewErr(null);
        setAccs((prev) =>
          (p.accessories || []).map((a: any) => {
            const old = prev.find((x) => x.productId === a.productId);
            const saved = initialAccs.current?.find((x: any) => x.productId === a.productId);
            const checked = old ? old.checked : initialAccs.current ? !!saved : a.defaultSelected;
            const qty = old && old.qty !== String(old.suggestedQty) ? old.qty : saved && !old ? String(saved.qty) : String(a.suggestedQty);
            return { ...a, checked, qty };
          })
        );
        initialAccs.current = null;
      } catch (e) {
        setPreviewErr(errMsg(e));
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.unitInput, f.lengthM, f.widthM, f.lengthFt, f.lengthIn, f.widthFt, f.widthIn, f.doors, f.stairs, f.productId, f.productQty]);

  const set = <K extends keyof RoomForm>(k: K, v: RoomForm[K]) => {
    dirty.current = true;
    setF((p) => ({ ...p, [k]: v }));
  };

  const cancel = () => {
    if (dirty.current && !confirm('Discard the changes to this room?')) return;
    localStorage.removeItem(key);
    onCancel();
  };

  const save = async (addAnother = false) => {
    if (!f.name.trim()) return toast.error('Give the room a name');
    if (!f.productId) return toast.error('Choose a product for this room');
    setSaving(true);
    try {
      const body = { name: f.name.trim(), notes: f.notes || null, ...dimsBody(), accessories: accs.filter((a) => a.checked && Number(a.qty) > 0).map((a) => ({ productId: a.productId, qty: Number(a.qty) })) };
      const saved = room ? await rabs.patch(`/rooms/${room.id}`, body) : await rabs.post(`/measurements/${measurementId}/rooms`, body);
      const roomId = saved?.id ?? saved?.room?.id ?? room?.id;
      if (files.length && roomId) {
        await rabs.upload(`/rooms/${roomId}/photos`, files);
      }
      localStorage.removeItem(key);
      toast.success(`${f.name} saved`);
      onSaved(addAnother);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const catList = meta?.categories || [];
  const catProducts = products.filter((p: any) => !f.category || p.category === f.category);
  const existingPhotos = room?.photos?.length ?? 0;

  return (
    <div className="space-y-4">
      {restored && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 px-3 py-2 text-sm flex items-center justify-between gap-2">
          <span>Your unsaved changes were brought back.</span>
          <button
            type="button"
            className="text-xs font-semibold underline"
            onClick={() => {
              localStorage.removeItem(key);
              dirty.current = false;
              setRestored(false);
              setF(fromRoom(room, categoryOf));
            }}
          >
            Start again
          </button>
        </div>
      )}
      <Field label="Room">
        <input list="rabs-room-types" className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Lounge" />
        <datalist id="rabs-room-types">
          {meta?.roomTypes.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="flex gap-2 overflow-x-auto mt-2 pb-1">
          {meta?.roomTypes.slice(0, 12).map((r) => (
            <button key={r} type="button" onClick={() => set('name', r)} className={clsx('shrink-0 h-8 px-3 rounded-full border text-xs font-semibold', f.name === r ? 'bg-brand text-white border-brand' : 'border-border')}>
              {r}
            </button>
          ))}
        </div>
      </Field>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold">Measurements</span>
          <div className="inline-flex rounded-lg bg-muted p-0.5">
            {(['m', 'ftin'] as const).map((u) => (
              <button key={u} type="button" onClick={() => set('unitInput', u)} className={clsx('h-8 px-3 rounded-md text-xs font-bold', f.unitInput === u ? 'bg-background shadow' : 'text-muted-foreground')}>
                {u === 'm' ? 'Metres' : 'Feet & inches'}
              </button>
            ))}
          </div>
        </div>
        {f.unitInput === 'm' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Length (m)">
              <input className={`${inputCls} text-lg font-bold`} inputMode="decimal" value={f.lengthM} onChange={(e) => set('lengthM', e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
            </Field>
            <Field label="Width (m)">
              <input className={`${inputCls} text-lg font-bold`} inputMode="decimal" value={f.widthM} onChange={(e) => set('widthM', e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-sm font-semibold mb-1.5">Length</span>
              <div className="flex gap-2">
                <input className={`${inputCls} text-lg font-bold`} inputMode="numeric" value={f.lengthFt} onChange={(e) => set('lengthFt', e.target.value.replace(/\D/g, ''))} placeholder="ft" aria-label="Length feet" />
                <input className={`${inputCls} text-lg font-bold`} inputMode="decimal" value={f.lengthIn} onChange={(e) => set('lengthIn', e.target.value.replace(/[^\d.]/g, ''))} placeholder="in" aria-label="Length inches" />
              </div>
            </div>
            <div>
              <span className="block text-sm font-semibold mb-1.5">Width</span>
              <div className="flex gap-2">
                <input className={`${inputCls} text-lg font-bold`} inputMode="numeric" value={f.widthFt} onChange={(e) => set('widthFt', e.target.value.replace(/\D/g, ''))} placeholder="ft" aria-label="Width feet" />
                <input className={`${inputCls} text-lg font-bold`} inputMode="decimal" value={f.widthIn} onChange={(e) => set('widthIn', e.target.value.replace(/[^\d.]/g, ''))} placeholder="in" aria-label="Width inches" />
              </div>
            </div>
          </div>
        )}
        {preview && (preview.areaM2 > 0 || perItem) && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Area" value={`${num(preview.areaM2)} m²`} />
            <Stat label="Sq yards" value={`${num(preview.areaSqyd)}`} />
            <Stat label="Perimeter" value={`${num(preview.perimeterM)} m`} />
          </div>
        )}
        {previewErr && <div className="mt-2 text-sm text-red-600">{previewErr}</div>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Counter label="Doorways" value={f.doors} onChange={(v) => set('doors', v)} max={20} />
        <Counter label="Stairs" value={f.stairs} onChange={(v) => set('stairs', v)} max={60} />
      </div>

      <div>
        <span className="block text-sm font-semibold mb-1.5">Product</span>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => set('category', '')} className={clsx('shrink-0 h-9 px-3 rounded-full border text-sm font-semibold', !f.category ? 'bg-brand text-white border-brand' : 'border-border')}>
            All
          </button>
          {catList.map((c) => (
            <button key={c} type="button" onClick={() => set('category', c)} className={clsx('shrink-0 h-9 px-3 rounded-full border text-sm font-semibold', f.category === c ? 'bg-brand text-white border-brand' : 'border-border')}>
              {c}
            </button>
          ))}
        </div>
        <select className={`${inputCls} mt-2`} value={f.productId} onChange={(e) => set('productId', e.target.value)}>
          <option value="">Choose product…</option>
          {catProducts.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.colour ? ` — ${p.colour}` : ''}
              {p.sellPrice !== undefined ? ` · ${gbp(p.sellPrice)}/${UNIT_LABEL[p.unit] || p.unit}` : ''}
            </option>
          ))}
        </select>
        {perItem && (
          <Field label="Quantity" className="mt-3">
            <input className={inputCls} inputMode="numeric" value={f.productQty} onChange={(e) => set('productQty', e.target.value.replace(/[^\d.]/g, ''))} placeholder="1" />
          </Field>
        )}
        {preview?.productQty && product && (
          <div className="mt-2 text-sm rounded-xl bg-brand/10 text-foreground px-3 py-2">
            Needs <b>{num(preview.productQty)} {UNIT_LABEL[preview.productUnit] || preview.productUnit}</b>
            {product.rollWidthM ? ` (cut from ${num(product.rollWidthM)} m roll)` : ''}
            {product.sellPrice !== undefined && can('view_prices') ? ` · ${gbp(preview.productQty * product.sellPrice)}` : ''}
          </div>
        )}
      </div>

      {accs.length > 0 && (
        <div>
          <span className="block text-sm font-semibold mb-1.5">Accessories</span>
          <div className="space-y-2">
            {accs.map((a, i) => (
              <div key={a.productId} className={clsx('flex items-center gap-3 rounded-xl border px-3 py-2', a.checked ? 'border-brand bg-brand/5' : 'border-border')}>
                <button
                  type="button"
                  onClick={() => setAccs((l) => l.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))}
                  className={clsx('h-7 w-7 shrink-0 rounded-md border-2 flex items-center justify-center font-bold', a.checked ? 'bg-brand border-brand text-white' : 'border-border')}
                  aria-label={`Include ${a.name}`}
                >
                  {a.checked ? '✓' : ''}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{a.name}</div>
                  {a.sellPrice !== undefined && (
                    <div className="text-xs text-muted-foreground">
                      {gbp(a.sellPrice)}/{UNIT_LABEL[a.unit] || a.unit}
                    </div>
                  )}
                </div>
                <input
                  className="w-20 h-10 rounded-lg border border-border bg-background px-2 text-right text-sm font-semibold"
                  inputMode="decimal"
                  value={a.qty}
                  disabled={!a.checked}
                  onChange={(e) => setAccs((l) => l.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/[^\d.]/g, '') } : x)))}
                  aria-label={`${a.name} quantity`}
                />
                <span className="text-xs text-muted-foreground w-10">{UNIT_LABEL[a.unit] || a.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="block text-sm font-semibold mb-1.5">Photos</span>
        <div className="flex gap-2 flex-wrap">
          {files.map((file, i) => (
            <div key={i} className="relative">
              <FilePreview file={file} />
              <button type="button" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-black text-white flex items-center justify-center" aria-label="Remove photo">
                <X size={14} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => camRef.current?.click()} className="h-20 w-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:bg-muted">
            <Camera size={22} />
            <span className="text-[10px] font-semibold mt-0.5">Camera</span>
          </button>
          <button type="button" onClick={() => galRef.current?.click()} className="h-20 w-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:bg-muted">
            <ImagePlus size={22} />
            <span className="text-[10px] font-semibold mt-0.5">From phone</span>
          </button>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {existingPhotos + files.length} photo{existingPhotos + files.length === 1 ? '' : 's'} — take 3–5 per room (floor, doorways, stairs, problem areas).
        </div>
        {[camRef, galRef].map((ref, i) => (
          <input
            key={i}
            ref={ref}
            type="file"
            accept="image/*"
            {...(i === 0 ? { capture: 'environment' as const } : {})}
            multiple
            hidden
            onChange={(e) => {
              const list = Array.from(e.target.files || []);
              setFiles((l) => [...l, ...list].slice(0, 12));
              e.target.value = '';
            }}
          />
        ))}
      </div>

      <Field label="Room notes">
        <textarea className={textareaCls} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Floor condition, furniture to move, thresholds…" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Btn variant="secondary" size="lg" onClick={cancel}>
          Cancel
        </Btn>
        <Btn variant="secondary" size="lg" loading={saving} onClick={() => save(false)}>
          SAVE ROOM
        </Btn>
        <Btn className="col-span-2" size="lg" loading={saving} onClick={() => save(true)}>
          SAVE & ADD NEXT ROOM →
        </Btn>
      </div>
    </div>
  );
}

export function FilePreview({ file, className = 'h-20 w-20' }: { file: File; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className={`${className} rounded-xl object-cover border border-border`} /> : <div className={`${className} rounded-xl bg-muted`} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted px-2 py-2">
      <div className="text-[11px] text-muted-foreground font-semibold">{label}</div>
      <div className="text-base font-extrabold">{value}</div>
    </div>
  );
}

function Counter({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max: number }) {
  return (
    <div>
      <span className="block text-sm font-semibold mb-1.5">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="h-12 w-12 rounded-xl border border-border flex items-center justify-center" aria-label={`Fewer ${label}`}>
          <Minus size={18} />
        </button>
        <div className="flex-1 text-center text-xl font-extrabold">{value}</div>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="h-12 w-12 rounded-xl border border-border flex items-center justify-center" aria-label={`More ${label}`}>
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
