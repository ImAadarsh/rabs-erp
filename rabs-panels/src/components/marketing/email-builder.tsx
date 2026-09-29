'use client';

import { useMemo, useState } from 'react';
import {
  BLOCK_LABELS,
  EmailBlock,
  EmailBlockType,
  EmailBuilderJson,
  createDefaultBlock,
  renderEmailHtml,
} from '@/lib/email-builder';
import {
  ChevronDown,
  ChevronUp,
  Heading,
  Image as ImageIcon,
  Minus,
  MousePointerClick,
  Plus,
  Trash2,
  Type,
  AlignLeft,
  ImagePlus,
  LayoutTemplate,
} from 'lucide-react';
import { crmInputClass, crmTextareaClass } from '@/components/crm/crm-modal';

const PALETTE: { type: EmailBlockType; icon: React.ReactNode }[] = [
  { type: 'logo', icon: <ImagePlus size={14} /> },
  { type: 'heading', icon: <Heading size={14} /> },
  { type: 'paragraph', icon: <Type size={14} /> },
  { type: 'image', icon: <ImageIcon size={14} /> },
  { type: 'button', icon: <MousePointerClick size={14} /> },
  { type: 'divider', icon: <Minus size={14} /> },
  { type: 'footer', icon: <LayoutTemplate size={14} /> },
];

function BlockEditor({
  block,
  onChange,
}: {
  block: EmailBlock;
  onChange: (next: EmailBlock) => void;
}) {
  const set = (patch: Partial<EmailBlock>) => onChange({ ...block, ...patch });

  return (
    <div className="space-y-3 text-sm">
      {(block.type === 'logo' ||
        block.type === 'heading' ||
        block.type === 'paragraph' ||
        block.type === 'image' ||
        block.type === 'button' ||
        block.type === 'footer') && (
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Align
          </span>
          <select
            value={block.align || 'left'}
            onChange={(e) => set({ align: e.target.value as EmailBlock['align'] })}
            className={crmInputClass}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
      )}

      {block.type === 'logo' && (
        <>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Company name
            </span>
            <input
              value={block.companyName || ''}
              onChange={(e) => set({ companyName: e.target.value })}
              className={crmInputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Logo image URL
            </span>
            <input
              value={block.logoUrl || ''}
              onChange={(e) => set({ logoUrl: e.target.value })}
              className={crmInputClass}
              placeholder="https://…"
            />
          </label>
        </>
      )}

      {block.type === 'heading' && (
        <>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Level
            </span>
            <select
              value={block.level || 1}
              onChange={(e) => set({ level: Number(e.target.value) as 1 | 2 | 3 })}
              className={crmInputClass}
            >
              <option value={1}>H1</option>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Text
            </span>
            <input
              value={block.text || ''}
              onChange={(e) => set({ text: e.target.value })}
              className={crmInputClass}
            />
          </label>
        </>
      )}

      {(block.type === 'paragraph' || block.type === 'footer') && (
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Text
          </span>
          <textarea
            value={block.text || ''}
            onChange={(e) => set({ text: e.target.value })}
            className={`${crmTextareaClass} min-h-[100px]`}
          />
        </label>
      )}

      {block.type === 'image' && (
        <>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Image URL
            </span>
            <input
              value={block.imageUrl || ''}
              onChange={(e) => set({ imageUrl: e.target.value })}
              className={crmInputClass}
              placeholder="https://…"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Alt text
            </span>
            <input
              value={block.alt || ''}
              onChange={(e) => set({ alt: e.target.value })}
              className={crmInputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Link URL (optional)
            </span>
            <input
              value={block.href || ''}
              onChange={(e) => set({ href: e.target.value })}
              className={crmInputClass}
              placeholder="https://…"
            />
          </label>
        </>
      )}

      {block.type === 'button' && (
        <>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Button label
            </span>
            <input
              value={block.buttonLabel || ''}
              onChange={(e) => set({ buttonLabel: e.target.value })}
              className={crmInputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Button URL
            </span>
            <input
              value={block.buttonUrl || ''}
              onChange={(e) => set({ buttonUrl: e.target.value })}
              className={crmInputClass}
              placeholder="https://…"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Color
            </span>
            <input
              type="color"
              value={block.color || '#E3070F'}
              onChange={(e) => set({ color: e.target.value })}
              className="h-10 w-full rounded-xl border border-border cursor-pointer"
            />
          </label>
        </>
      )}

      {block.type === 'divider' && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <AlignLeft size={14} /> Horizontal rule — no extra settings.
        </p>
      )}
    </div>
  );
}

export function EmailBuilderEditor({
  value,
  onChange,
  previewTitle,
}: {
  value: EmailBuilderJson;
  onChange: (next: EmailBuilderJson) => void;
  previewTitle?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(value.blocks[0]?.id || null);
  const html = useMemo(
    () => renderEmailHtml(value, { previewTitle }),
    [value, previewTitle]
  );

  const selected = value.blocks.find((b) => b.id === selectedId) || null;

  function updateBlocks(blocks: EmailBlock[]) {
    onChange({ ...value, version: 1, blocks });
  }

  function addBlock(type: EmailBlockType) {
    const block = createDefaultBlock(type);
    updateBlocks([...value.blocks, block]);
    setSelectedId(block.id);
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = value.blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= value.blocks.length) return;
    const copy = [...value.blocks];
    const [item] = copy.splice(idx, 1);
    copy.splice(next, 0, item);
    updateBlocks(copy);
  }

  function removeBlock(id: string) {
    const blocks = value.blocks.filter((b) => b.id !== id);
    updateBlocks(blocks);
    if (selectedId === id) setSelectedId(blocks[0]?.id || null);
  }

  function patchBlock(next: EmailBlock) {
    updateBlocks(value.blocks.map((b) => (b.id === next.id ? next : b)));
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-[520px]">
      <div className="xl:col-span-3 space-y-3">
        <div className="rounded-2xl border border-border/60 bg-card p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1">
            Add section
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((p) => (
              <button
                key={p.type}
                type="button"
                onClick={() => addBlock(p.type)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted px-2.5 py-1.5 text-xs font-medium"
              >
                {p.icon}
                {BLOCK_LABELS[p.type]}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-2 space-y-1 max-h-[360px] overflow-auto">
          {value.blocks.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">
              Add a section to start building.
            </p>
          ) : (
            value.blocks.map((b, i) => (
              <div
                key={b.id}
                className={`flex items-center gap-1 rounded-xl px-2 py-1.5 cursor-pointer transition ${
                  selectedId === b.id
                    ? 'bg-brand/15 ring-1 ring-brand/30'
                    : 'hover:bg-muted/60'
                }`}
                onClick={() => setSelectedId(b.id)}
              >
                <span className="flex-1 text-xs font-medium truncate">
                  {i + 1}. {BLOCK_LABELS[b.type]}
                </span>
                <button
                  type="button"
                  className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveBlock(b.id, -1);
                  }}
                  aria-label="Move up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveBlock(b.id, 1);
                  }}
                  aria-label="Move down"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  className="p-1 rounded-md hover:bg-destructive/10 text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeBlock(b.id);
                  }}
                  aria-label="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {selected && (
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">
              Edit · {BLOCK_LABELS[selected.type]}
            </div>
            <BlockEditor block={selected} onChange={patchBlock} />
          </div>
        )}
      </div>

      <div className="xl:col-span-9 rounded-2xl border border-border/60 bg-muted/30 overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between bg-card/80">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Live preview
          </span>
          <span className="text-[10px] text-muted-foreground">600px email canvas</span>
        </div>
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={html}
            className="w-full min-h-[480px] rounded-xl border border-border/40 bg-white shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}

export function EmailBuilderToolbarHint() {
  return (
    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
      <Plus size={12} className="text-brand" />
      Add blocks on the left, edit in place, preview updates instantly.
    </p>
  );
}
