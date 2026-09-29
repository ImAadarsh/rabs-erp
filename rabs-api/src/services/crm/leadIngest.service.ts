import { AppDataSource } from '@config/data-source.js';
import { CrmLead } from '@entities/crm/CrmLead.js';
import { syncFromCrmLead } from '@services/marketing/marketingLeads.service.js';
import { applyLeadAutomation } from '@services/crm/leadAssignment.service.js';

const STATUS_MAP: Record<string, CrmLead['status']> = {
  new: 'new',
  open: 'new',
  contacted: 'contacted',
  working: 'contacted',
  qualified: 'qualified',
  unqualified: 'unqualified',
  disqualified: 'unqualified',
  converted: 'converted',
  closed: 'lost',
  lost: 'lost'
};

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function mapStatus(raw: string | null | undefined): CrmLead['status'] {
  if (!raw) return 'new';
  const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
  return STATUS_MAP[key] || 'new';
}

export type IngestLeadInput = Record<string, any>;

export type MappedLead = {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  externalId: string | null;
  status: CrmLead['status'];
  notes: string | null;
};

/**
 * Map Salesforce-ish + generic payloads into CrmLead fields.
 */
export function mapInboundLeadPayload(
  body: IngestLeadInput,
  defaultSource: string
): MappedLead {
  const first = pickString(body.FirstName, body.firstName, body.first_name);
  const last = pickString(body.LastName, body.lastName, body.last_name);
  const fullFromParts = [first, last].filter(Boolean).join(' ').trim();
  const name =
    pickString(body.name, body.Name, body.fullName, body.FullName, fullFromParts) ||
    pickString(body.Company, body.company) ||
    pickString(body.Email, body.email) ||
    'Unknown Lead';

  const email = pickString(body.Email, body.email, body.emailAddress)?.toLowerCase() ?? null;
  const phone = pickString(body.Phone, body.phone, body.MobilePhone, body.mobile);
  const company = pickString(body.Company, body.company, body.companyName, body.AccountName);
  // Prefer integration key source for idempotency; keep LeadSource in notes.
  const leadSourceLabel = pickString(body.LeadSource, body.leadSource, body.source, body.Source);
  const source =
    defaultSource && defaultSource !== 'generic'
      ? defaultSource
      : leadSourceLabel || defaultSource || 'generic';
  const externalIdRaw = pickString(
    body.Id,
    body.id,
    body.externalId,
    body.external_id,
    body.ExternalId,
    body.sfId,
    body.hubspotId
  );
  const externalId = externalIdRaw || null;
  const status = mapStatus(pickString(body.Status, body.status, body.LeadStatus));
  const description = pickString(body.Description, body.description, body.notes, body.Notes);
  const rawSnippet =
    body.raw != null
      ? typeof body.raw === 'string'
        ? body.raw
        : JSON.stringify(body.raw).slice(0, 4000)
      : null;
  const notesParts = [
    description,
    leadSourceLabel && leadSourceLabel !== source ? `LeadSource: ${leadSourceLabel}` : null,
    rawSnippet ? `raw:${rawSnippet}` : null
  ].filter(Boolean);
  const notes = notesParts.length ? notesParts.join('\n') : null;

  return { name, email, phone, company, source, externalId, status, notes };
}

export async function upsertInboundLead(opts: {
  organizationId: string;
  body: IngestLeadInput;
  defaultSource: string;
  syncToMarketing?: boolean;
}): Promise<{ lead: CrmLead; created: boolean; marketingSync?: any }> {
  const mapped = mapInboundLeadPayload(opts.body, opts.defaultSource);
  const repo = AppDataSource.getRepository(CrmLead);

  let lead: CrmLead | null = null;
  let created = false;

  if (mapped.externalId) {
    lead = await repo.findOne({
      where: {
        organizationId: opts.organizationId,
        source: mapped.source,
        externalId: mapped.externalId
      }
    });
  }

  if (lead) {
    lead.name = mapped.name;
    lead.email = mapped.email ?? lead.email;
    lead.phone = mapped.phone ?? lead.phone;
    lead.company = mapped.company ?? lead.company;
    if (mapped.notes) {
      lead.notes = [lead.notes, mapped.notes].filter(Boolean).join('\n---\n');
    }
    // Do not downgrade converted leads via webhook
    if (lead.status !== 'converted' && lead.status !== 'lost') {
      lead.status = mapped.status;
    }
    lead = await repo.save(lead);
  } else {
    lead = await repo.save(
      repo.create({
        organizationId: opts.organizationId,
        name: mapped.name,
        email: mapped.email,
        phone: mapped.phone,
        company: mapped.company,
        source: mapped.source,
        externalId: mapped.externalId,
        status: mapped.status,
        notes: mapped.notes,
        priority: 'medium'
      })
    );
    created = true;
    const automation = await applyLeadAutomation(lead);
    lead = automation.lead;
  }

  let marketingSync: any;
  if (opts.syncToMarketing !== false) {
    try {
      marketingSync = await syncFromCrmLead(lead);
    } catch (err: any) {
      marketingSync = { error: err.message || 'sync failed' };
    }
  }

  return { lead, created, marketingSync };
}
