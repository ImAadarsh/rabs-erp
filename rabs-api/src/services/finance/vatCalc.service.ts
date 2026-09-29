import { AppDataSource } from '@config/data-source.js';
import { AccVatCode } from '@entities/finance/AccVatCode.js';

export type VatLineInput = {
  netAmount: number;
  vatCodeId?: string | null;
  taxRate?: number | null;
};

export type VatLineResult = {
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  grossAmount: number;
  vatCodeId: string | null;
};

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export async function resolveVatRate(
  organizationId: string,
  vatCodeId?: string | null,
  fallbackRate = 0
): Promise<{ rate: number; vatCodeId: string | null }> {
  if (!vatCodeId) return { rate: fallbackRate, vatCodeId: null };
  const code = await AppDataSource.getRepository(AccVatCode).findOne({
    where: { id: vatCodeId, organizationId }
  });
  if (!code) return { rate: fallbackRate, vatCodeId: null };
  return { rate: Number(code.rate), vatCodeId: code.id };
}

/** taxRate is a fraction (0.20 = 20%). */
export function calcVatOnNet(netAmount: number, taxRate: number): VatLineResult {
  const net = roundMoney(netAmount);
  const rate = Number(taxRate) || 0;
  const taxAmount = roundMoney(net * rate);
  return {
    netAmount: net,
    taxRate: rate,
    taxAmount,
    grossAmount: roundMoney(net + taxAmount),
    vatCodeId: null
  };
}

export function calcVatFromGross(grossAmount: number, taxRate: number): VatLineResult {
  const gross = roundMoney(grossAmount);
  const rate = Number(taxRate) || 0;
  const net = rate > 0 ? roundMoney(gross / (1 + rate)) : gross;
  const taxAmount = roundMoney(gross - net);
  return {
    netAmount: net,
    taxRate: rate,
    taxAmount,
    grossAmount: gross,
    vatCodeId: null
  };
}

export async function calcLineVat(
  organizationId: string,
  input: {
    quantity: number;
    unitPrice: number;
    vatCodeId?: string | null;
    taxRate?: number | null;
    vatInclusive?: boolean;
  }
): Promise<VatLineResult> {
  const qty = Number(input.quantity) || 0;
  const unit = Number(input.unitPrice) || 0;
  const base = roundMoney(qty * unit);
  const { rate, vatCodeId } = await resolveVatRate(
    organizationId,
    input.vatCodeId,
    Number(input.taxRate) || 0
  );
  const result = input.vatInclusive ? calcVatFromGross(base, rate) : calcVatOnNet(base, rate);
  return { ...result, vatCodeId };
}
