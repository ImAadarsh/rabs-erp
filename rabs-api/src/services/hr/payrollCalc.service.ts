/**
 * Illustrative UK PAYE / NI stubs — NOT HMRC-certified.
 * Rates are configurable via env (see docs/HR_API.md).
 */
import { env } from '@config/env.js';

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Basic rate band illustrative defaults (tax year style, not live HMRC). */
export function getPayrollRates() {
  return {
    personalAllowanceAnnual: num(process.env.HR_PAYE_PERSONAL_ALLOWANCE, 12570),
    basicRatePct: num(process.env.HR_PAYE_BASIC_RATE_PCT, 20),
    niEmployeePct: num(process.env.HR_NI_EMPLOYEE_PCT, 8),
    niEmployerPct: num(process.env.HR_NI_EMPLOYER_PCT, 13.8),
    niPrimaryThresholdAnnual: num(process.env.HR_NI_PRIMARY_THRESHOLD, 12570),
    pensionEmployeeDefaultPct: num(process.env.HR_PENSION_EMPLOYEE_PCT, 5),
    pensionEmployerDefaultPct: num(process.env.HR_PENSION_EMPLOYER_PCT, 3),
    sspWeeklyRate: num(process.env.HR_SSP_WEEKLY_RATE, 116.75)
  };
}

export interface PayeNiInput {
  grossPay: number;
  /** Period fraction of year, e.g. monthly = 1/12 */
  periodFraction?: number;
  employeePensionPct?: number | null;
  employerPensionPct?: number | null;
}

export interface PayeNiResult {
  grossPay: number;
  taxDeduction: number;
  nationalInsurance: number;
  pensionDeduction: number;
  employerNi: number;
  employerPension: number;
  totalDeductions: number;
  netPay: number;
  totalEmployerCosts: number;
  illustrative: true;
  ratesUsed: ReturnType<typeof getPayrollRates>;
}

/**
 * Very rough monthly PAYE/NI: annualise gross, apply PA + basic rate only,
 * employee NI above primary threshold, optional pension %.
 */
export function calculateIllustrativePayeNi(input: PayeNiInput): PayeNiResult {
  const rates = getPayrollRates();
  const frac = input.periodFraction ?? 1 / 12;
  const gross = Number(input.grossPay) || 0;
  const annualGross = gross / frac;

  const taxableAnnual = Math.max(0, annualGross - rates.personalAllowanceAnnual);
  const taxAnnual = taxableAnnual * (rates.basicRatePct / 100);
  const taxDeduction = round2(taxAnnual * frac);

  const niBaseAnnual = Math.max(0, annualGross - rates.niPrimaryThresholdAnnual);
  const nationalInsurance = round2(niBaseAnnual * (rates.niEmployeePct / 100) * frac);
  const employerNi = round2(niBaseAnnual * (rates.niEmployerPct / 100) * frac);

  const empPct = input.employeePensionPct ?? rates.pensionEmployeeDefaultPct;
  const erPct = input.employerPensionPct ?? rates.pensionEmployerDefaultPct;
  const pensionDeduction = round2(gross * (empPct / 100));
  const employerPension = round2(gross * (erPct / 100));

  const totalDeductions = round2(taxDeduction + nationalInsurance + pensionDeduction);
  const netPay = round2(gross - totalDeductions);
  const totalEmployerCosts = round2(gross + employerNi + employerPension);

  return {
    grossPay: round2(gross),
    taxDeduction,
    nationalInsurance,
    pensionDeduction,
    employerNi,
    employerPension,
    totalDeductions,
    netPay,
    totalEmployerCosts,
    illustrative: true,
    ratesUsed: rates
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Soft reminder stub — logs only; never sends real email unless wired later. */
export function stubVisaReminderEmail(payload: {
  employeeId: string;
  email: string | null;
  visaExpiry: string | Date | null;
  daysUntil: number;
}): void {
  const to = payload.email || '(no email)';
  console.log(
    `[HR reminder stub] Visa expiry for employee ${payload.employeeId} → ${to}; ` +
      `expires ${payload.visaExpiry}; in ${payload.daysUntil} days. JWT_ENV=${env.NODE_ENV}`
  );
}
