'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import { Download, Loader2, Minus, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { resolveBarcodeSymbology, toJsBarcodeFormat } from '@/lib/barcodeSymbology';

export type LabelProduct = {
  product_id: string;
  product_name: string;
  product_sku: string;
  barcode: string | null;
  selling_price: string;
};

/** Brother QL-820 / DK-11209 die-cut: 90 mm × 29 mm, one label per page. */
export const BROTHER_QL820 = {
  unit: 'mm' as const,
  width: 90,
  height: 29,
  marginX: 2.5,
  marginY: 1.8,
  nameFontPt: 8,
  barcodeHeightMm: 15
};

type Props = {
  products: LabelProduct[];
  onClose: () => void;
};

type BarRect = { x: number; y: number; w: number; h: number };

type BarcodeGeometry = {
  moduleWidth: number;
  totalWidth: number;
  height: number;
  bars: BarRect[];
};

function truncateName(name: string, max = 90): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Build barcode geometry from a canvas render (not SVG).
 * SVG groups use translate() — parsing raw rect x without transforms caused overlapping bars.
 */
function buildBarcodeGeometry(value: string): BarcodeGeometry | null {
  try {
    const { symbology, encodeValue } = resolveBarcodeSymbology(value);
    const modulePx = 4;
    const heightPx = 120;
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, encodeValue, {
      format: toJsBarcodeFormat(symbology),
      width: modulePx,
      height: heightPx,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000'
    });

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || canvas.width < 8) return null;

    const { width, height } = canvas;
    const mid = ctx.getImageData(0, Math.floor(height / 2), width, 1).data;
    // Guard bars are taller — sample near the top too for full-height bars
    const top = ctx.getImageData(0, Math.max(0, Math.floor(height * 0.02)), width, 1).data;

    const isBlack = (data: Uint8ClampedArray, x: number) => data[x * 4]! < 128;

    const bars: BarRect[] = [];
    let x = 0;
    while (x < width) {
      if (!isBlack(mid, x)) {
        x++;
        continue;
      }
      const start = x;
      while (x < width && isBlack(mid, x)) x++;
      const w = x - start;
      // Taller if top row is also black across this run (EAN guard bars)
      let guard = true;
      for (let i = start; i < x; i++) {
        if (!isBlack(top, i)) {
          guard = false;
          break;
        }
      }
      bars.push({
        x: start,
        y: 0,
        w,
        h: guard ? heightPx : Math.round(heightPx * 0.88)
      });
    }

    if (!bars.length) return null;

    return {
      moduleWidth: modulePx,
      totalWidth: width,
      height: heightPx,
      bars
    };
  } catch {
    return null;
  }
}

/** Draw barcode as solid PDF rectangles — print-sharp at any zoom. */
function drawVectorBarcode(
  pdf: jsPDF,
  geometry: BarcodeGeometry,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number
) {
  const scaleX = widthMm / geometry.totalWidth;
  const scaleY = heightMm / geometry.height;

  pdf.setFillColor(0, 0, 0);
  for (const bar of geometry.bars) {
    const bx = xMm + bar.x * scaleX;
    // Align shorter bars to the bottom (like EAN guard vs data bars)
    const bh = bar.h * scaleY;
    const by = yMm + (geometry.height - bar.h) * scaleY;
    const bw = bar.w * scaleX;
    if (bw <= 0 || bh <= 0) continue;
    pdf.rect(bx, by, bw, bh, 'F');
  }
}

export function EposLabelDesigner({ products, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [defaultCopies, setDefaultCopies] = useState(1);
  const [copiesById, setCopiesById] = useState<Record<string, number>>({});
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const uniqueProducts = useMemo(() => {
    const seen = new Set<string>();
    return products.filter((p) => {
      if (seen.has(p.product_id)) return false;
      seen.add(p.product_id);
      return true;
    });
  }, [products]);

  useEffect(() => {
    setCopiesById((prev) => {
      const next = { ...prev };
      for (const p of uniqueProducts) {
        if (next[p.product_id] == null) next[p.product_id] = defaultCopies;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueProducts]);

  const getCopies = useCallback(
    (productId: string) => Math.max(0, Math.floor(copiesById[productId] ?? defaultCopies)),
    [copiesById, defaultCopies]
  );

  const setCopies = (productId: string, value: number) => {
    const n = Math.max(0, Math.min(99, Math.floor(value) || 0));
    setCopiesById((prev) => ({ ...prev, [productId]: n }));
  };

  const applyDefaultToAll = () => {
    const next: Record<string, number> = {};
    for (const p of uniqueProducts) next[p.product_id] = defaultCopies;
    setCopiesById(next);
  };

  const missingBarcodes = uniqueProducts.filter((p) => !p.barcode?.trim());
  const printable = useMemo(() => {
    const out: LabelProduct[] = [];
    for (const p of uniqueProducts) {
      const n = getCopies(p.product_id);
      for (let i = 0; i < n; i++) out.push(p);
    }
    return out;
  }, [uniqueProducts, getCopies]);

  const totalLabels = printable.length;

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return uniqueProducts;
    return uniqueProducts.filter(
      (p) =>
        p.product_name.toLowerCase().includes(q) ||
        p.product_sku.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
    );
  }, [uniqueProducts, productSearch]);

  const previewProduct =
    filteredProducts.find((p) => p.barcode?.trim()) ??
    uniqueProducts.find((p) => p.barcode?.trim()) ??
    filteredProducts[0] ??
    uniqueProducts[0] ??
    null;

  const handleDownloadPdf = useCallback(async () => {
    if (!printable.length) {
      toast.error('Set at least 1 copy for a product with a barcode');
      return;
    }
    const withoutCode = printable.filter((p) => !p.barcode?.trim());
    if (withoutCode.length) {
      toast.error(`${missingBarcodes.length} product(s) missing barcodes — generate them first`);
      return;
    }

    setDownloading(true);
    try {
      const { width, height, marginX, marginY, nameFontPt, barcodeHeightMm } = BROTHER_QL820;
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [width, height],
        compress: true
      });

      const geometryCache = new Map<string, BarcodeGeometry | null>();

      for (let i = 0; i < printable.length; i++) {
        const product = printable[i]!;
        const code = product.barcode!.trim();
        if (i > 0) pdf.addPage([width, height], 'landscape');

        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, width, height, 'F');

        // Product name (vector text)
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('times', 'normal');
        pdf.setFontSize(nameFontPt);
        const nameW = width - marginX * 2;
        const nameLines = pdf.splitTextToSize(truncateName(product.product_name, 110), nameW);
        pdf.text(nameLines.slice(0, 1), width / 2, marginY + 3.2, { align: 'center' });

        // Vector barcode (no PNG blur)
        let geometry = geometryCache.get(code);
        if (geometry === undefined) {
          geometry = buildBarcodeGeometry(code);
          geometryCache.set(code, geometry);
        }
        if (!geometry) {
          throw new Error(`Could not encode barcode: ${code}`);
        }

        const barMaxW = width - marginX * 2;
        // Match sample density: ~78% of label width, centered (not overstretched edge-to-edge)
        const barW = Math.min(barMaxW, width * 0.78);
        const barH = barcodeHeightMm;
        const barX = (width - barW) / 2;
        const barY = height - marginY - barH;
        drawVectorBarcode(pdf, geometry, barX, barY, barW, barH);
      }

      const stamp = new Date().toISOString().slice(0, 10);
      const name =
        uniqueProducts.length === 1
          ? `brother-ql820-${uniqueProducts[0]!.product_sku.slice(0, 24)}.pdf`
          : `brother-ql820-labels-${stamp}.pdf`;
      pdf.save(name);
      toast.success(`Downloaded ${totalLabels} crisp barcode label${totalLabels === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  }, [printable, missingBarcodes.length, uniqueProducts, totalLabels]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex bg-black/50">
      <div className="flex flex-1 flex-col lg:flex-row bg-background m-2 lg:m-4 rounded-xl overflow-hidden shadow-2xl max-h-[calc(100vh-1rem)]">
        <div className="w-full lg:w-[400px] shrink-0 border-r overflow-y-auto p-4 space-y-4 bg-card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Brother QL-820 Labels</h2>
              <p className="text-xs text-muted-foreground">29 × 90 mm · barcode only · vector print</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
              <X size={18} />
            </button>
          </div>

          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs space-y-1">
            <p>
              <strong>{uniqueProducts.length}</strong> product{uniqueProducts.length !== 1 ? 's' : ''} ·{' '}
              <strong>{totalLabels}</strong> label{totalLabels !== 1 ? 's' : ''} in PDF
            </p>
            <p className="text-muted-foreground">
              Name + 1D barcode, drawn as vectors (sharp on Brother QL-820).
            </p>
          </div>

          {missingBarcodes.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              {missingBarcodes.length} product(s) have no barcode. Generate barcodes in Browse EPOS first.
            </div>
          )}

          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Copies</p>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Default copies per product</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded border p-1 hover:bg-muted"
                  onClick={() => setDefaultCopies((n) => Math.max(1, n - 1))}
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min={1}
                  max={99}
                  className="w-14 rounded border px-2 py-1 text-center text-sm"
                  value={defaultCopies}
                  onChange={(e) => setDefaultCopies(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))}
                />
                <button
                  type="button"
                  className="rounded border p-1 hover:bg-muted"
                  onClick={() => setDefaultCopies((n) => Math.min(99, n + 1))}
                >
                  <Plus size={14} />
                </button>
              </div>
            </label>
            <button
              type="button"
              onClick={applyDefaultToAll}
              className="w-full rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Apply {defaultCopies} to all products
            </button>
            <p className="text-[11px] text-muted-foreground">
              Set copies to 0 to skip. Use 2+ for multiple labels of the same product.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Products ({filteredProducts.length}
              {productSearch.trim() ? ` of ${uniqueProducts.length}` : ''})
            </p>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search name, SKU, or barcode…"
                className="w-full rounded-md border bg-background pl-8 pr-8 py-2 text-sm"
              />
              {productSearch.trim() ? (
                <button
                  type="button"
                  onClick={() => setProductSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <div className="max-h-[40vh] overflow-y-auto space-y-2 pr-1">
              {filteredProducts.map((p) => {
                const copies = getCopies(p.product_id);
                return (
                  <div key={p.product_id} className="rounded-lg border bg-background px-3 py-2 space-y-1.5">
                    <p className="text-xs font-medium line-clamp-2" title={p.product_name}>
                      {p.product_name}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground truncate">
                      {p.barcode ?? 'No barcode'}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">Copies</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded border p-1 hover:bg-muted"
                          onClick={() => setCopies(p.product_id, copies - 1)}
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={99}
                          className="w-12 rounded border px-1.5 py-0.5 text-center text-xs"
                          value={copies}
                          onChange={(e) => setCopies(p.product_id, parseInt(e.target.value, 10) || 0)}
                        />
                        <button
                          type="button"
                          className="rounded border p-1 hover:bg-muted"
                          onClick={() => setCopies(p.product_id, copies + 1)}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!filteredProducts.length && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No products match “{productSearch.trim()}”
                </p>
              )}
            </div>
          </div>

          <button type="button" onClick={onClose} className="w-full rounded-lg border px-4 py-2 text-sm">
            Close
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">
          <div className="border-b bg-card px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Label preview</h3>
              <p className="text-xs text-muted-foreground">
                PDF pages: {totalLabels} · {BROTHER_QL820.width}×{BROTHER_QL820.height} mm · vector barcode
              </p>
            </div>
            <button
              type="button"
              disabled={downloading || totalLabels === 0 || missingBarcodes.length === uniqueProducts.length}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Download all ({totalLabels})
            </button>
          </div>

          <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-6">
            {previewProduct ? (
              <BrotherLabelPreview product={previewProduct} />
            ) : (
              <p className="text-sm text-muted-foreground">No products selected</p>
            )}

            <div className="w-full max-w-lg rounded-xl border bg-card p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground text-sm">How to print</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Download the PDF (all products in one file).</li>
                <li>Open in Brother iPrint&amp;Label or print to QL-820.</li>
                <li>Select die-cut 29 mm × 90 mm (DK-11209) — do not scale to fit.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function BrotherLabelPreview({ product }: { product: LabelProduct }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const code = product.barcode?.trim() ?? '';

  useEffect(() => {
    if (!svgRef.current || !code) return;
    try {
      const { symbology, encodeValue } = resolveBarcodeSymbology(code);
      JsBarcode(svgRef.current, encodeValue, {
        format: toJsBarcodeFormat(symbology),
        width: 2,
        height: 56,
        displayValue: false,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000'
      });
      svgRef.current.style.width = '100%';
      svgRef.current.style.height = '56px';
    } catch {
      /* invalid */
    }
  }, [code]);

  const scale = 3.6;
  const w = BROTHER_QL820.width * scale;
  const h = BROTHER_QL820.height * scale;

  return (
    <div className="space-y-2">
      <p className="text-xs text-center text-muted-foreground">Actual ratio · 90 × 29 mm · barcode only</p>
      <div
        className="bg-white border shadow-md overflow-hidden flex flex-col items-center justify-between"
        style={{
          width: w,
          height: h,
          padding: `${BROTHER_QL820.marginY * scale}px ${BROTHER_QL820.marginX * scale}px`
        }}
      >
        {!code ? (
          <p className="text-xs text-amber-600 w-full text-center my-auto">Generate barcode first</p>
        ) : (
          <>
            <p className="text-center font-serif leading-tight line-clamp-1 w-full" style={{ fontSize: 13 }}>
              {product.product_name}
            </p>
            <svg ref={svgRef} className="w-full" />
          </>
        )}
      </div>
    </div>
  );
}
