/** Workflow rules for the RABS one-click CRM: statuses, progress steps, next actions, permissions. Pure (no DB). */

export const PROGRESS_STEPS = [
  { key: 'APPOINTMENT', label: 'APPOINTMENT' },
  { key: 'MEASURE', label: 'MEASURE' },
  { key: 'QUOTE', label: 'QUOTE' },
  { key: 'ACCEPTED', label: 'ACCEPTED' },
  { key: 'DEPOSIT', label: 'DEPOSIT' },
  { key: 'MATERIAL', label: 'MATERIAL' },
  { key: 'FITTING', label: 'FITTING/DELIVERY' },
  { key: 'COMPLETE', label: 'COMPLETE' },
  { key: 'BALANCE', label: 'BALANCE' },
  { key: 'CLOSED', label: 'CLOSED' }
] as const;

export type StatusDef = {
  code: string;
  label: string;
  color: string;
  textColor: string;
  stage: (typeof PROGRESS_STEPS)[number]['key'];
  nextActionLabel: string | null;
};

/** Default statuses & colours — exactly the spec's colour table (+ Delivery Required for delivery-only jobs). */
export const DEFAULT_STATUSES: StatusDef[] = [
  { code: 'NEW', label: 'New / Enquiry', color: '#6B7280', textColor: '#FFFFFF', stage: 'APPOINTMENT', nextActionLabel: 'BOOK APPOINTMENT' },
  { code: 'APPOINTMENT', label: 'Appointment', color: '#2563EB', textColor: '#FFFFFF', stage: 'APPOINTMENT', nextActionLabel: 'START MEASUREMENT' },
  { code: 'MEASUREMENT', label: 'Measurement', color: '#7C3AED', textColor: '#FFFFFF', stage: 'MEASURE', nextActionLabel: 'CREATE QUOTATION' },
  { code: 'QUOTE_DRAFT', label: 'Quotation Draft', color: '#D1D5DB', textColor: '#111827', stage: 'QUOTE', nextActionLabel: 'ACCEPT & CREATE JOB' },
  { code: 'QUOTE_SENT', label: 'Quotation Sent', color: '#F59E0B', textColor: '#111827', stage: 'QUOTE', nextActionLabel: 'ACCEPT & CREATE JOB' },
  { code: 'ACCEPTED', label: 'Accepted', color: '#16A34A', textColor: '#FFFFFF', stage: 'ACCEPTED', nextActionLabel: 'CONVERT TO JOB' },
  { code: 'DEPOSIT_PENDING', label: 'Deposit Pending', color: '#EA580C', textColor: '#FFFFFF', stage: 'DEPOSIT', nextActionLabel: 'RECORD DEPOSIT' },
  { code: 'CONFIRMED', label: 'Confirmed', color: '#0D9488', textColor: '#FFFFFF', stage: 'MATERIAL', nextActionLabel: 'CHECK MATERIALS' },
  { code: 'MATERIALS_PENDING', label: 'Materials Pending', color: '#DC2626', textColor: '#FFFFFF', stage: 'MATERIAL', nextActionLabel: 'CHECK MATERIALS' },
  { code: 'READY_TO_FIT', label: 'Ready to Fit', color: '#0E9F9A', textColor: '#FFFFFF', stage: 'FITTING', nextActionLabel: 'BOOK FITTING' },
  { code: 'DELIVERY_REQUIRED', label: 'Delivery Required', color: '#0E9F9A', textColor: '#FFFFFF', stage: 'FITTING', nextActionLabel: 'BOOK DELIVERY' },
  { code: 'FITTING_BOOKED', label: 'Fitting Booked', color: '#2563EB', textColor: '#FFFFFF', stage: 'FITTING', nextActionLabel: 'OPEN FITTING' },
  { code: 'FITTING_TODAY', label: 'Fitting Today', color: '#FACC15', textColor: '#111827', stage: 'FITTING', nextActionLabel: 'START FITTING' },
  { code: 'FITTING_COMPLETE', label: 'Fitting Complete', color: '#16A34A', textColor: '#FFFFFF', stage: 'COMPLETE', nextActionLabel: 'COLLECT BALANCE' },
  { code: 'DELIVERY_BOOKED', label: 'Delivery Booked', color: '#2563EB', textColor: '#FFFFFF', stage: 'FITTING', nextActionLabel: 'OPEN DELIVERY' },
  { code: 'DELIVERY_COMPLETE', label: 'Delivery Complete', color: '#16A34A', textColor: '#FFFFFF', stage: 'COMPLETE', nextActionLabel: 'COLLECT BALANCE' },
  { code: 'BALANCE_PENDING', label: 'Balance Pending', color: '#EA580C', textColor: '#FFFFFF', stage: 'BALANCE', nextActionLabel: 'COLLECT BALANCE' },
  { code: 'FULLY_PAID', label: 'Fully Paid', color: '#166534', textColor: '#FFFFFF', stage: 'BALANCE', nextActionLabel: 'CLOSE JOB' },
  { code: 'ISSUE', label: 'Issue / Snag', color: '#DC2626', textColor: '#FFFFFF', stage: 'COMPLETE', nextActionLabel: 'RESOLVE ISSUE' },
  { code: 'CLOSED', label: 'Closed', color: '#111111', textColor: '#FFFFFF', stage: 'CLOSED', nextActionLabel: null }
];

/** Machine action each status's big "Next" button performs in the UI. */
export const NEXT_ACTION_CODE: Record<string, string | null> = {
  NEW: 'book_appointment',
  APPOINTMENT: 'start_measurement',
  MEASUREMENT: 'create_quote',
  QUOTE_DRAFT: 'accept_quote',
  QUOTE_SENT: 'accept_quote',
  ACCEPTED: 'convert_job',
  DEPOSIT_PENDING: 'record_deposit',
  CONFIRMED: 'check_materials',
  MATERIALS_PENDING: 'check_materials',
  READY_TO_FIT: 'book_fitting',
  DELIVERY_REQUIRED: 'book_delivery',
  FITTING_BOOKED: 'open_fitting',
  FITTING_TODAY: 'open_fitting',
  FITTING_COMPLETE: 'collect_balance',
  DELIVERY_BOOKED: 'open_delivery',
  DELIVERY_COMPLETE: 'collect_balance',
  BALANCE_PENDING: 'collect_balance',
  FULLY_PAID: 'close_job',
  ISSUE: 'resolve_issue',
  CLOSED: null
};

export interface DeriveInput {
  closed: boolean;
  hasIssue: boolean;
  converted: boolean;
  acceptedQuote: boolean;
  quoteStatus: string | null;
  hasMeasurement: boolean;
  hasAppointment: boolean;
  depositRequired: number;
  paid: number;
  balance: number;
  materialsStatus: string;
  requiresFitting: boolean;
  requiresDelivery: boolean;
  fitting: { status: string; date: string } | null;
  delivery: { status: string; date: string } | null;
  invoiceIssued: boolean;
  autoClose: boolean;
  today: string;
}

const active = (b: { status: string } | null) => !!b && (b.status === 'booked' || b.status === 'in_progress');

/** Status ignoring issue/closed flags — used for the progress bar position. */
export function deriveWorkflowStatus(s: DeriveInput): string {
  if (!s.acceptedQuote) {
    if (s.quoteStatus === 'sent') return 'QUOTE_SENT';
    if (s.quoteStatus === 'draft') return 'QUOTE_DRAFT';
    if (s.hasMeasurement) return 'MEASUREMENT';
    if (s.hasAppointment) return 'APPOINTMENT';
    return 'NEW';
  }
  if (!s.converted) return 'ACCEPTED';
  const depositMet = s.depositRequired <= 0 || s.paid + 0.005 >= s.depositRequired;
  if (!depositMet) return 'DEPOSIT_PENDING';

  const fitPending = s.requiresFitting && s.fitting?.status !== 'complete';
  const delPending = s.requiresDelivery && s.delivery?.status !== 'complete';

  if (!fitPending && !delPending) {
    if (s.balance <= 0.005) return s.autoClose ? 'CLOSED' : 'FULLY_PAID';
    if (s.invoiceIssued) return 'BALANCE_PENDING';
    return s.requiresFitting ? 'FITTING_COMPLETE' : 'DELIVERY_COMPLETE';
  }
  if (fitPending && active(s.fitting)) return s.fitting!.date === s.today ? 'FITTING_TODAY' : 'FITTING_BOOKED';
  if (delPending && active(s.delivery)) return 'DELIVERY_BOOKED';
  if (s.materialsStatus === 'not_checked') return 'CONFIRMED';
  if (s.materialsStatus === 'pending') return 'MATERIALS_PENDING';
  return fitPending ? 'READY_TO_FIT' : 'DELIVERY_REQUIRED';
}

export function deriveStatus(s: DeriveInput): string {
  if (s.closed) return 'CLOSED';
  if (s.hasIssue) return 'ISSUE';
  return deriveWorkflowStatus(s);
}

export function progressIndex(workflowStatus: string, closed: boolean): number {
  if (closed || workflowStatus === 'CLOSED') return PROGRESS_STEPS.length - 1;
  const def = DEFAULT_STATUSES.find((d) => d.code === workflowStatus);
  const idx = PROGRESS_STEPS.findIndex((p) => p.key === (def?.stage ?? 'APPOINTMENT'));
  return Math.max(0, idx);
}

// ---- Permissions ----------------------------------------------------------

export const CAPABILITIES = [
  { key: 'customers', label: 'Customers & enquiries' },
  { key: 'appointments', label: 'Book appointments' },
  { key: 'measure', label: 'Measure rooms' },
  { key: 'quotes', label: 'Create & send quotes' },
  { key: 'accept', label: 'Accept quote / create job' },
  { key: 'payments', label: 'Record payments' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'materials', label: 'Materials & stock' },
  { key: 'bookings', label: 'Book fitting / delivery' },
  { key: 'fieldwork', label: 'Fitter / driver job view' },
  { key: 'reports', label: 'Reports' },
  { key: 'view_prices', label: 'See selling prices' },
  { key: 'view_costs', label: 'See cost & margin' },
  { key: 'admin', label: 'Admin settings & prices' }
] as const;

export type Capability = (typeof CAPABILITIES)[number]['key'];

export const RABS_ROLES = [
  { code: 'OFFICE', name: 'Office Staff', description: 'RABS office: customers, quotes, jobs, payments, bookings' },
  { code: 'SURVEYOR', name: 'Sales / Surveyor', description: 'RABS sales & measuring: appointments, measurements, quotes' },
  { code: 'FITTER', name: 'Fitter', description: 'RABS fitter: assigned fitting jobs on phone' },
  { code: 'DRIVER', name: 'Delivery Driver', description: 'RABS driver: assigned deliveries on phone' }
];

export const DEFAULT_ROLE_PERMISSIONS: Record<Capability, string[]> = {
  customers: ['ADMIN', 'OFFICE', 'SURVEYOR', 'SALES_REP', 'CUSTOMER_SERVICE'],
  appointments: ['ADMIN', 'OFFICE', 'SURVEYOR', 'SALES_REP', 'CUSTOMER_SERVICE'],
  measure: ['ADMIN', 'OFFICE', 'SURVEYOR', 'SALES_REP'],
  quotes: ['ADMIN', 'OFFICE', 'SURVEYOR', 'SALES_REP'],
  accept: ['ADMIN', 'OFFICE', 'SURVEYOR', 'SALES_REP'],
  payments: ['ADMIN', 'OFFICE', 'FINANCE', 'ACCOUNTANT'],
  invoices: ['ADMIN', 'OFFICE', 'FINANCE', 'ACCOUNTANT'],
  materials: ['ADMIN', 'OFFICE', 'WAREHOUSE_MANAGER'],
  bookings: ['ADMIN', 'OFFICE'],
  fieldwork: ['ADMIN', 'OFFICE', 'FITTER', 'DRIVER'],
  reports: ['ADMIN', 'OFFICE', 'FINANCE', 'ACCOUNTANT'],
  view_prices: ['ADMIN', 'OFFICE', 'SURVEYOR', 'SALES_REP', 'CUSTOMER_SERVICE', 'FINANCE', 'ACCOUNTANT'],
  view_costs: ['ADMIN', 'FINANCE', 'ACCOUNTANT'],
  admin: ['ADMIN']
};

export function capabilitiesFor(roles: string[], matrix: Record<string, string[]> | null | undefined): Capability[] {
  const upper = roles.map((r) => String(r).toUpperCase());
  if (upper.includes('SUPER_ADMIN')) return CAPABILITIES.map((c) => c.key);
  const m = { ...DEFAULT_ROLE_PERMISSIONS, ...(matrix || {}) } as Record<string, string[]>;
  return CAPABILITIES.map((c) => c.key).filter((k) => (m[k] || []).some((r) => upper.includes(r.toUpperCase())));
}

export const ROOM_TYPES = [
  'Lounge', 'Living Room', 'Dining Room', 'Kitchen', 'Hall', 'Landing', 'Stairs', 'Hall, Stairs & Landing',
  'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Bedroom 4', 'Box Room', 'Bathroom', 'En-suite', 'WC', 'Conservatory',
  'Utility', 'Study', 'Office', 'Porch', 'Other'
];

export const LEAD_SOURCES = ['Walk-in', 'Phone', 'WhatsApp', 'Facebook', 'Instagram', 'TikTok', 'Website', 'Referral', 'Repeat customer', 'Other'];

export const APPOINTMENT_PURPOSES = [
  { value: 'measure', label: 'Measure & quote' },
  { value: 'consultation', label: 'Showroom consultation' },
  { value: 'sample', label: 'Bring samples' },
  { value: 'snag', label: 'Snag / aftercare visit' }
];

export const DEFAULT_CHECKLISTS: Record<'fitting' | 'delivery', string[]> = {
  fitting: [
    'Customer present & rooms clear',
    'Before photos taken',
    'Old flooring uplifted / disposed (if agreed)',
    'Gripper, underlay & flooring fitted',
    'Door bars fitted & doors checked',
    'Area cleaned & waste removed',
    'After photos taken',
    'Customer walked through the finished job'
  ],
  delivery: [
    'Correct items loaded & checked',
    'Items delivered to the right room',
    'Assembled / positioned (if agreed)',
    'Packaging removed',
    'Customer checked items for damage',
    'Photos taken'
  ]
};
