/**
 * One-off: seed tax codes from inventory sheet + import all products.
 * Usage: npx tsx src/scripts/importInventorySheet.ts [path-to-xlsx]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppDataSource } from '@config/data-source.js';
import { Organization } from '@entities/iam/Organization.js';
import { TaxCode } from '@entities/catalog/TaxCode.js';
import { parseInventoryExcel } from '@services/import/inventoryExcelParser.js';
import { runInventoryExcelImport } from '@services/import/inventoryExcelImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureTaxCodes(orgId: string, taxPercents: number[]) {
  const taxRepo = AppDataSource.getRepository(TaxCode);
  const org = await AppDataSource.getRepository(Organization).findOne({ where: { id: orgId } });
  if (!org) throw new Error('Organization not found');

  const created: string[] = [];
  const existing: string[] = [];

  for (const pct of taxPercents) {
    const rate = pct > 1 ? pct / 100 : pct;
    const pctLabel = Math.round(rate * 100);
    const code = `VAT${pctLabel}`;

    let tax = await taxRepo
      .createQueryBuilder('t')
      .where('t.organization_id = :orgId', { orgId })
      .andWhere('(t.code = :code OR ROUND(t.rate, 4) = ROUND(:rate, 4))', { code, rate })
      .getOne();

    if (!tax) {
      tax = await taxRepo.save(
        taxRepo.create({
          organization: org,
          code,
          name: pctLabel === 0 ? 'Zero-rated (0%)' : `VAT ${pctLabel}%`,
          rate,
          countryCode: 'GB',
          description: `Imported from inventory sheet · ${pctLabel}%`,
          isDefault: pctLabel === 20,
          status: 'active'
        })
      );
      created.push(`${code} (${rate})`);
    } else {
      // Keep name/description aligned
      tax.code = code;
      tax.name = pctLabel === 0 ? 'Zero-rated (0%)' : `VAT ${pctLabel}%`;
      tax.rate = rate;
      tax.isDefault = pctLabel === 20 ? true : tax.isDefault;
      tax.status = 'active';
      await taxRepo.save(tax);
      existing.push(`${code} (${rate})`);
    }
  }

  // Ensure only one default
  const all = await taxRepo.find({ where: { organization: { id: orgId } } });
  const defaultVat = all.find((t) => Math.round(Number(t.rate) * 100) === 20) ?? all[0];
  for (const t of all) {
    const shouldDefault = defaultVat ? t.id === defaultVat.id : false;
    if (t.isDefault !== shouldDefault) {
      t.isDefault = shouldDefault;
      await taxRepo.save(t);
    }
  }

  return { created, existing };
}

async function main() {
  const defaultPath = path.resolve(__dirname, '../../../Inventory sheet updated 20072026.xlsx');
  const filePath = process.argv[2] ? path.resolve(process.argv[2]) : defaultPath;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  await AppDataSource.initialize();

  const org = await AppDataSource.getRepository(Organization).findOne({ where: {} });
  if (!org) throw new Error('No organization in database');

  const buffer = fs.readFileSync(filePath);
  const { rows, preview } = parseInventoryExcel(buffer);

  const taxPercents = [
    ...new Set(
      rows
        .map((r) => r.taxPercent)
        .filter((v): v is number => v != null && Number.isFinite(v))
    )
  ].sort((a, b) => a - b);

  // Always ensure 0% and 20% for UK retail even if sheet misses one
  if (!taxPercents.includes(0)) taxPercents.unshift(0);
  if (!taxPercents.includes(20) && !taxPercents.includes(0.2)) taxPercents.push(20);

  console.log('Organization:', org.id, org.name);
  console.log('Rows:', rows.length);
  console.log('Tax percents in sheet:', taxPercents);

  const taxes = await ensureTaxCodes(org.id, taxPercents);
  console.log('Tax codes created:', taxes.created);
  console.log('Tax codes existing/updated:', taxes.existing);

  const result = await runInventoryExcelImport(rows, {
    organizationId: org.id,
    businessUnitId: undefined,
    duplicateMode: 'update',
    importInventory: true
  });

  console.log('Import result:', JSON.stringify(result, null, 2));
  console.log('Preview warehouses:', preview.warehouses);
  console.log('Preview suppliers:', preview.suppliers);

  await AppDataSource.destroy();
}

main().catch(async (err) => {
  console.error(err);
  try {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
