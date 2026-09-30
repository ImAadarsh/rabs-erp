'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { resolveBarcodeSymbology, toJsBarcodeFormat } from '@/lib/barcodeSymbology';

type Props = {
  value: string;
  width?: number;
  height?: number;
  showText?: boolean;
  className?: string;
};

/** Renders a POS-compatible barcode (EAN-13 / UPC / EAN-8) for on-screen preview. */
export function BarcodePreview({ value, width = 2, height = 40, showText = true, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value?.trim()) return;
    try {
      const { symbology, encodeValue } = resolveBarcodeSymbology(value);
      JsBarcode(svgRef.current, encodeValue, {
        format: toJsBarcodeFormat(symbology),
        width,
        height,
        displayValue: showText,
        fontSize: 11,
        margin: 4,
        textMargin: 2
      });
    } catch {
      /* invalid barcode */
    }
  }, [value, width, height, showText]);

  if (!value?.trim()) {
    return <span className="text-xs text-amber-600">No barcode</span>;
  }

  return <svg ref={svgRef} className={className} role="img" aria-label={`Barcode ${value}`} />;
}
