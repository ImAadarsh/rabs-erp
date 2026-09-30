/** Compute EAN-13 check digit for a 12-digit payload. */
function ean13CheckDigit(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(digits12[i]!, 10);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** Deterministic numeric barcode from SKU (EAN-13, SumUp POS compatible, prefix 20 = internal). */
export function generateBarcodeFromSku(sku: string): string {
  let hash = 0;
  for (let i = 0; i < sku.length; i++) {
    hash = (hash * 31 + sku.charCodeAt(i)) >>> 0;
  }
  const body = `20${String(hash % 1_000_000_000_0).padStart(10, '0')}`;
  const check = ean13CheckDigit(body);
  return `${body}${check}`;
}
