/** SumUp POS / Good Till supported 1D symbologies for product barcodes. */

export type BarcodeSymbology = 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'CODE128';

function ean13CheckDigit(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(digits12[i]!, 10);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return (10 - (sum % 10)) % 10;
}

function hasValidEan13CheckDigit(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false;
  return ean13CheckDigit(digits.slice(0, 12)) === parseInt(digits[12]!, 10);
}

function hasValidUpcCheckDigit(digits: string): boolean {
  if (!/^\d{12}$/.test(digits)) return false;
  return ean13CheckDigit(`0${digits.slice(0, 11)}`) === parseInt(digits[11]!, 10);
}

function hasValidEan8CheckDigit(digits: string): boolean {
  if (!/^\d{8}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const n = parseInt(digits[i]!, 10);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(digits[7]!, 10);
}

export function resolveBarcodeSymbology(value: string): {
  symbology: BarcodeSymbology;
  encodeValue: string;
} {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (hasValidEan13CheckDigit(digits)) {
    return { symbology: 'EAN13', encodeValue: digits };
  }
  if (hasValidUpcCheckDigit(digits)) {
    return { symbology: 'UPC', encodeValue: digits };
  }
  if (hasValidEan8CheckDigit(digits)) {
    return { symbology: 'EAN8', encodeValue: digits };
  }
  if (/^[0-9A-Z\-. $/+%]+$/i.test(trimmed) && trimmed.length <= 43) {
    return { symbology: 'CODE39', encodeValue: trimmed.toUpperCase() };
  }
  return { symbology: 'CODE128', encodeValue: trimmed };
}

export function toJsBarcodeFormat(symbology: BarcodeSymbology): string {
  switch (symbology) {
    case 'EAN13':
      return 'EAN13';
    case 'EAN8':
      return 'EAN8';
    case 'UPC':
      return 'UPC';
    case 'CODE39':
      return 'CODE39';
    default:
      return 'CODE128';
  }
}
