import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { AccAuditEvent } from '@entities/finance/AccAuditEvent.js';
import { appendAccAudit } from '@services/finance/accAudit.service.js';
import { zodMessage } from '@services/finance/zodMessage.js';

function orgId(req: Request): string {
  return String(req.query.organizationId || req.body?.organizationId || (req as any).user?.orgId || '1');
}
function userId(req: Request): string | null {
  return (req as any).user?.id ? String((req as any).user.id) : null;
}

const DOC_ENTITY = 'document_link';

type EntityType = 'invoice' | 'bill' | 'expense' | 'journal' | 'other';

type Resolver = {
  label: string;
  hint: string;
  find: (oid: string, ref: string) => Promise<{ id: string; ref: string } | null>;
  findById: (oid: string, id: string) => Promise<{ id: string; ref: string } | null>;
  attach?: (id: string, url: string) => Promise<void>;
  href: (id: string) => string;
};

const isNumeric = (s: string) => /^\d+$/.test(s);

async function firstRow(sql: string, params: unknown[]): Promise<{ id: string; ref: string } | null> {
  const rows: Array<{ id: string | number; ref: string | null }> = await AppDataSource.query(sql, params);
  if (!rows.length) return null;
  return { id: String(rows[0].id), ref: rows[0].ref ? String(rows[0].ref) : String(rows[0].id) };
}

const RESOLVERS: Record<Exclude<EntityType, 'other'>, Resolver> = {
  invoice: {
    label: 'Invoice',
    hint: 'invoice number (e.g. INV-2026-00122), order number, or invoice ID',
    find: (oid, ref) =>
      firstRow(
        `SELECT i.id, i.invoice_number AS ref
           FROM invoices i
           LEFT JOIN orders o ON o.id = i.order_id
          WHERE i.organization_id = ?
            AND (i.invoice_number = ? OR o.order_number = ? ${isNumeric(ref) ? 'OR i.id = ?' : ''})
          ORDER BY (i.invoice_number = ?) DESC, i.id DESC
          LIMIT 1`,
        isNumeric(ref) ? [oid, ref, ref, ref, ref] : [oid, ref, ref, ref]
      ),
    findById: (oid, id) =>
      firstRow('SELECT id, invoice_number AS ref FROM invoices WHERE organization_id = ? AND id = ? LIMIT 1', [oid, id]),
    attach: async (id, url) => {
      await AppDataSource.query('UPDATE invoices SET document_url = ? WHERE id = ?', [url, id]);
    },
    href: (id) => `/finance/invoices/${id}`
  },
  bill: {
    label: 'Bill',
    hint: 'bill number or bill ID',
    find: (oid, ref) =>
      firstRow(
        `SELECT id, bill_number AS ref FROM acc_supplier_bills
          WHERE organization_id = ? AND (bill_number = ? ${isNumeric(ref) ? 'OR id = ?' : ''})
          ORDER BY (bill_number = ?) DESC, id DESC LIMIT 1`,
        isNumeric(ref) ? [oid, ref, ref, ref] : [oid, ref, ref]
      ),
    findById: (oid, id) =>
      firstRow('SELECT id, bill_number AS ref FROM acc_supplier_bills WHERE organization_id = ? AND id = ? LIMIT 1', [oid, id]),
    attach: async (id, url) => {
      await AppDataSource.query('UPDATE acc_supplier_bills SET document_url = ? WHERE id = ?', [url, id]);
    },
    href: (id) => `/accounting/purchases/${id}`
  },
  expense: {
    label: 'Expense',
    hint: 'expense ID',
    find: (oid, ref) =>
      isNumeric(ref)
        ? firstRow('SELECT id, id AS ref FROM acc_expenses WHERE organization_id = ? AND id = ? LIMIT 1', [oid, ref])
        : Promise.resolve(null),
    findById: (oid, id) =>
      firstRow('SELECT id, id AS ref FROM acc_expenses WHERE organization_id = ? AND id = ? LIMIT 1', [oid, id]),
    attach: async (id, url) => {
      await AppDataSource.query(
        'UPDATE acc_expenses SET receipt_url = COALESCE(receipt_url, ?) WHERE id = ?',
        [url, id]
      );
    },
    href: () => '/accounting/expenses'
  },
  journal: {
    label: 'Journal',
    hint: 'journal number or journal ID',
    find: (oid, ref) =>
      firstRow(
        `SELECT id, journal_number AS ref FROM journal_entries
          WHERE organization_id = ? AND (journal_number = ? ${isNumeric(ref) ? 'OR id = ?' : ''})
          ORDER BY (journal_number = ?) DESC, id DESC LIMIT 1`,
        isNumeric(ref) ? [oid, ref, ref, ref] : [oid, ref, ref]
      ),
    findById: (oid, id) =>
      firstRow('SELECT id, journal_number AS ref FROM journal_entries WHERE organization_id = ? AND id = ? LIMIT 1', [oid, id]),
    href: (id) => `/finance/journal-entries/${id}`
  }
};

function toDocument(r: AccAuditEvent) {
  const p = (r.payloadJson || {}) as Record<string, unknown>;
  const type = (p.linkedType as EntityType | undefined) ?? 'other';
  const entityId = type === 'other' ? null : r.entityId;
  return {
    id: r.id,
    entityType: type,
    entityId,
    entityRef: (p.entityRef as string | null) ?? null,
    entityHref: entityId && type !== 'other' ? RESOLVERS[type].href(entityId) : null,
    documentName: (p.documentName as string | null) ?? null,
    documentUrl: (p.documentUrl as string | null) ?? null,
    createdAt: r.createdAt,
    actorUserId: r.actorUserId
  };
}

/** Documents linked to one record (e.g. a bill), newest first. */
export async function documentsForEntity(
  oid: string,
  type: Exclude<EntityType, 'other'>,
  entityId: string
): Promise<Array<{ id: string | null; documentName: string | null; documentUrl: string | null; createdAt: Date }>> {
  const rows = await AppDataSource.getRepository(AccAuditEvent).find({
    where: { organizationId: oid, entityType: DOC_ENTITY, entityId },
    order: { createdAt: 'DESC' }
  });
  return rows
    .map(toDocument)
    .filter((d) => d.entityType === type)
    .map((d) => ({ id: d.id, documentName: d.documentName, documentUrl: d.documentUrl, createdAt: d.createdAt }));
}

export class AccDocumentsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const rows = await AppDataSource.getRepository(AccAuditEvent).find({
        where: { organizationId: orgId(req), entityType: DOC_ENTITY },
        order: { createdAt: 'DESC' },
        take: 500
      });
      res.json({ data: rows.map(toDocument) });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const oid = orgId(req);
      const row = await AppDataSource.getRepository(AccAuditEvent).findOne({
        where: { id: req.params.id, organizationId: oid, entityType: DOC_ENTITY },
        relations: ['actor']
      });
      if (!row) {
        res.status(404).json({ error: { message: 'Document not found' } });
        return;
      }
      const doc = toDocument(row);
      let linked: { id: string; ref: string } | null = null;
      if (doc.entityType !== 'other' && doc.entityId) {
        linked = await RESOLVERS[doc.entityType].findById(oid, doc.entityId);
      }
      const actor = row.actor;
      res.json({
        data: {
          ...doc,
          entityLabel: doc.entityType === 'other' ? 'Other' : RESOLVERS[doc.entityType].label,
          entityExists: doc.entityType === 'other' ? null : Boolean(linked),
          entityRef: linked?.ref ?? doc.entityRef,
          addedBy: actor
            ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email || null
            : null
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const schema = z
        .object({
          organizationId: z.coerce.string().optional(),
          entityType: z.enum(['invoice', 'bill', 'expense', 'journal', 'other'], {
            errorMap: () => ({ message: 'Entity type must be invoice, bill, expense, journal or other' })
          }),
          entityRef: z.coerce.string().trim().optional(),
          entityId: z.coerce.string().trim().optional(),
          documentName: z.string().trim().min(1, 'Document name is required').max(255),
          documentUrl: z
            .string()
            .trim()
            .min(1, 'Upload a file or enter a document URL')
            .max(1000)
            .refine((v) => /^(https?:\/\/|\/)/i.test(v), 'Document URL must start with http:// or https://')
        })
        .refine((v) => v.entityType === 'other' || Boolean(v.entityRef || v.entityId), {
          path: ['entityRef'],
          message: 'Choose the record to link this document to'
        });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: zodMessage(parsed.error), details: parsed.error.issues } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      const type = parsed.data.entityType as EntityType;
      let linkedId = '0';
      let linkedRef: string | null = null;

      if (type !== 'other') {
        const resolver = RESOLVERS[type];
        const ref = String(parsed.data.entityId || parsed.data.entityRef);
        const found = parsed.data.entityId
          ? await resolver.findById(oid, parsed.data.entityId)
          : await resolver.find(oid, ref);
        if (!found) {
          res.status(404).json({
            error: {
              message: `${resolver.label} "${ref}" not found in this organisation. Enter the ${resolver.hint}.`,
              details: [{ path: ['entityRef'], message: `${resolver.label} not found` }]
            }
          });
          return;
        }
        linkedId = found.id;
        linkedRef = found.ref;
        if (resolver.attach) await resolver.attach(found.id, parsed.data.documentUrl);
      }

      await appendAccAudit({
        organizationId: oid,
        entityType: DOC_ENTITY,
        entityId: linkedId,
        action: 'update',
        actorUserId: userId(req),
        payload: {
          linkedType: type,
          entityRef: linkedRef,
          documentName: parsed.data.documentName,
          documentUrl: parsed.data.documentUrl
        }
      });

      res.status(201).json({
        data: {
          entityType: type,
          entityId: type === 'other' ? null : linkedId,
          entityRef: linkedRef,
          documentName: parsed.data.documentName,
          documentUrl: parsed.data.documentUrl
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}
