import { Router } from 'express';
import { ChartOfAccountsController } from '@controllers/finance/chartOfAccounts.controller.js';
import { LedgerAccountsController } from '@controllers/finance/ledgerAccounts.controller.js';
import { CostCentersController } from '@controllers/finance/costCenters.controller.js';
import { FiscalPeriodsController } from '@controllers/finance/fiscalPeriods.controller.js';
import { JournalEntriesController } from '@controllers/finance/journalEntries.controller.js';
import { BankAccountsController } from '@controllers/finance/bankAccounts.controller.js';
import { BankTransactionsController } from '@controllers/finance/bankTransactions.controller.js';
import { VatReturnsController } from '@controllers/finance/vatReturns.controller.js';
import { BudgetLinesController } from '@controllers/finance/budgetLines.controller.js';
import { authMiddleware } from '@middlewares/auth.js';
import { auditMiddleware } from '@middlewares/audit.js';
import { requireRoles } from '@middlewares/rbac.js';
import { GatewayController } from '@controllers/finance/gateway.controller.js';
import { PaymentController } from '@controllers/finance/payment.controller.js';
import { InvoiceController } from '@controllers/finance/invoice.controller.js';
import { PayoutController } from '@controllers/finance/payout.controller.js';
import { SettlementController } from '@controllers/finance/settlement.controller.js';
import {
  AccDashboardController,
  AccSettingsController,
  AccVatCodesController,
  AccReportsController,
  AccPostingController,
  AccAuditController
} from '@controllers/finance/ukAccounting.controller.js';
import { AccSalesController } from '@controllers/finance/accSales.controller.js';
import {
  AccPurchasesController,
  AccExpensesController
} from '@controllers/finance/accPurchases.controller.js';
import { AccBankingController } from '@controllers/finance/accBanking.controller.js';
import {
  AccFixedAssetsController,
  AccCtController
} from '@controllers/finance/accAssetsTax.controller.js';
import { ACC_READ_ROLES, ACC_WRITE_ROLES } from '@services/finance/accScope.js';

export const financeRouter = Router();

const read = [...ACC_READ_ROLES];
const write = [...ACC_WRITE_ROLES];

financeRouter.use(authMiddleware);
financeRouter.use(auditMiddleware);

// ——— UK Accounting dashboard / settings / VAT codes / audit ———
financeRouter.get('/dashboard', requireRoles(...read), AccDashboardController.get);
financeRouter.get('/settings', requireRoles(...read), AccSettingsController.get);
financeRouter.put('/settings', requireRoles(...write), AccSettingsController.upsert);
financeRouter.patch('/settings', requireRoles(...write), AccSettingsController.upsert);
financeRouter.get('/vat-codes', requireRoles(...read), AccVatCodesController.list);
financeRouter.post('/vat-codes', requireRoles(...write), AccVatCodesController.create);
financeRouter.patch('/vat-codes/:id', requireRoles(...write), AccVatCodesController.update);
financeRouter.get('/audit-events', requireRoles(...read), AccAuditController.list);

// ——— Reports ———
financeRouter.get('/reports/trial-balance', requireRoles(...read), AccReportsController.trialBalance);
financeRouter.get('/reports/profit-and-loss', requireRoles(...read), AccReportsController.profitAndLoss);
financeRouter.get('/reports/balance-sheet', requireRoles(...read), AccReportsController.balanceSheet);
financeRouter.get('/reports/cash-flow', requireRoles(...read), AccReportsController.cashFlow);
financeRouter.get('/reports/aged-receivables', requireRoles(...read), AccReportsController.agedAr);
financeRouter.get('/reports/aged-payables', requireRoles(...read), AccReportsController.agedAp);
financeRouter.get('/reports/general-ledger', requireRoles(...read), AccReportsController.generalLedger);
financeRouter.get('/reports/vat-draft', requireRoles(...read), AccReportsController.vatDraft);
financeRouter.post('/reports/vat-draft', requireRoles(...write), AccReportsController.vatSaveDraft);

// ——— Chart of Accounts ———
financeRouter.get('/chart-of-accounts', requireRoles(...read), ChartOfAccountsController.list);
financeRouter.get('/chart-of-accounts/:id', requireRoles(...read), ChartOfAccountsController.get);
financeRouter.post('/chart-of-accounts', requireRoles(...write), ChartOfAccountsController.create);
financeRouter.patch('/chart-of-accounts/:id', requireRoles(...write), ChartOfAccountsController.update);
financeRouter.delete('/chart-of-accounts/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ChartOfAccountsController.remove);

financeRouter.get('/ledger-accounts', requireRoles(...read), LedgerAccountsController.list);
financeRouter.get('/ledger-accounts/:id', requireRoles(...read), LedgerAccountsController.get);
financeRouter.post('/ledger-accounts', requireRoles(...write), LedgerAccountsController.create);
financeRouter.patch('/ledger-accounts/:id', requireRoles(...write), LedgerAccountsController.update);
financeRouter.delete('/ledger-accounts/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), LedgerAccountsController.remove);

financeRouter.get('/cost-centers', requireRoles(...read), CostCentersController.list);
financeRouter.get('/cost-centers/:id', requireRoles(...read), CostCentersController.get);
financeRouter.post('/cost-centers', requireRoles(...write), CostCentersController.create);
financeRouter.patch('/cost-centers/:id', requireRoles(...write), CostCentersController.update);
financeRouter.delete('/cost-centers/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), CostCentersController.remove);

financeRouter.get('/fiscal-periods', requireRoles(...read), FiscalPeriodsController.list);
financeRouter.get('/fiscal-periods/:id', requireRoles(...read), FiscalPeriodsController.get);
financeRouter.post('/fiscal-periods', requireRoles(...write), FiscalPeriodsController.create);
financeRouter.patch('/fiscal-periods/:id', requireRoles(...write), FiscalPeriodsController.update);
financeRouter.delete('/fiscal-periods/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), FiscalPeriodsController.remove);

// ——— Journals (true double-entry) ———
financeRouter.get('/journal-entries', requireRoles(...read), JournalEntriesController.list);
financeRouter.get('/journal-entries/:id', requireRoles(...read), JournalEntriesController.get);
financeRouter.post('/journal-entries', requireRoles(...write), JournalEntriesController.create);
financeRouter.patch('/journal-entries/:id', requireRoles(...write), JournalEntriesController.update);
financeRouter.post('/journal-entries/:id/post', requireRoles(...write), AccPostingController.postJournal);
financeRouter.delete('/journal-entries/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), JournalEntriesController.remove);

// ——— Banking ———
financeRouter.get('/bank-accounts', requireRoles(...read), BankAccountsController.list);
financeRouter.get('/bank-accounts/:id', requireRoles(...read), BankAccountsController.get);
financeRouter.post('/bank-accounts', requireRoles(...write), BankAccountsController.create);
financeRouter.patch('/bank-accounts/:id', requireRoles(...write), BankAccountsController.update);
financeRouter.delete('/bank-accounts/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BankAccountsController.remove);

financeRouter.get('/bank-transactions', requireRoles(...read), BankTransactionsController.list);
financeRouter.get('/bank-transactions/:id', requireRoles(...read), BankTransactionsController.get);
financeRouter.post('/bank-transactions', requireRoles(...write), BankTransactionsController.create);
financeRouter.patch('/bank-transactions/:id', requireRoles(...write), BankTransactionsController.update);
financeRouter.delete('/bank-transactions/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BankTransactionsController.remove);
financeRouter.post('/bank-transactions/import-csv', requireRoles(...write), AccBankingController.importCsv);
financeRouter.get('/bank-transactions/:id/suggest-matches', requireRoles(...read), AccBankingController.suggestMatches);
financeRouter.post('/bank-transactions/:id/match', requireRoles(...write), AccBankingController.match);
financeRouter.post('/bank-rules/apply', requireRoles(...write), AccBankingController.applyRules);
financeRouter.get('/bank-rules', requireRoles(...read), AccBankingController.listRules);
financeRouter.post('/bank-rules', requireRoles(...write), AccBankingController.createRule);
financeRouter.post('/bank-transfers', requireRoles(...write), AccBankingController.transfer);
financeRouter.get('/bank-reconciliations', requireRoles(...read), AccBankingController.listReconciliations);
financeRouter.post('/bank-reconciliations', requireRoles(...write), AccBankingController.startReconciliation);
financeRouter.post('/bank-reconciliations/:id/complete', requireRoles(...write), AccBankingController.completeReconciliation);

// ——— VAT returns + MTD export / placeholder ———
financeRouter.get('/vat-returns', requireRoles(...read), VatReturnsController.list);
financeRouter.get('/vat-returns/:id', requireRoles(...read), VatReturnsController.get);
financeRouter.post('/vat-returns', requireRoles(...write), VatReturnsController.create);
financeRouter.patch('/vat-returns/:id', requireRoles(...write), VatReturnsController.update);
financeRouter.get('/vat-returns/:id/export', requireRoles(...read), AccReportsController.vatExport);
financeRouter.post('/vat-returns/:id/submit-mtd', requireRoles(...write), AccReportsController.vatSubmitPlaceholder);
financeRouter.delete('/vat-returns/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), VatReturnsController.remove);

financeRouter.get('/budget-lines', requireRoles(...read), BudgetLinesController.list);
financeRouter.get('/budget-lines/:id', requireRoles(...read), BudgetLinesController.get);
financeRouter.post('/budget-lines', requireRoles(...write), BudgetLinesController.create);
financeRouter.patch('/budget-lines/:id', requireRoles(...write), BudgetLinesController.update);
financeRouter.delete('/budget-lines/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BudgetLinesController.remove);

// ——— Payment gateways (existing) ———
financeRouter.get('/payments/dashboard', requireRoles(...read), GatewayController.dashboard);
financeRouter.get('/gateways', requireRoles(...read), GatewayController.list);
financeRouter.get('/gateways/:id', requireRoles(...read), GatewayController.get);
financeRouter.post('/gateways', requireRoles(...write), GatewayController.create);
financeRouter.patch('/gateways/:id', requireRoles(...write), GatewayController.update);
financeRouter.delete('/gateways/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), GatewayController.remove);
financeRouter.post('/gateways/:id/test', requireRoles(...read), GatewayController.testConnection);

financeRouter.get('/payments', requireRoles(...read), PaymentController.list);
financeRouter.get('/payments/:id', requireRoles(...read), PaymentController.get);
financeRouter.post('/payments', requireRoles(...write), PaymentController.create);
financeRouter.patch('/payments/:id', requireRoles(...write), PaymentController.update);
financeRouter.delete('/payments/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), PaymentController.remove);

// ——— Sales invoices (extend existing + UK posting) ———
financeRouter.get('/invoices', requireRoles(...read), InvoiceController.list);
financeRouter.get('/invoices/uninvoiced-orders', requireRoles(...read), InvoiceController.uninvoicedOrders);
financeRouter.post('/invoices/generate', requireRoles(...write), InvoiceController.generate);
financeRouter.post('/invoices/uk', requireRoles(...write), AccSalesController.createInvoice);
financeRouter.post('/invoices/payments', requireRoles(...write), AccSalesController.recordPayment);
financeRouter.post('/invoices/:id/post', requireRoles(...write), AccPostingController.postInvoice);
financeRouter.get('/invoices/:id', requireRoles(...read), InvoiceController.get);
financeRouter.post('/invoices', requireRoles(...write), InvoiceController.create);
financeRouter.patch('/invoices/:id', requireRoles(...write), InvoiceController.update);
financeRouter.delete('/invoices/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), InvoiceController.remove);

financeRouter.get('/credit-notes', requireRoles(...read), AccSalesController.listCreditNotes);
financeRouter.post('/credit-notes', requireRoles(...write), AccSalesController.createCreditNote);
financeRouter.get('/recurring-invoices', requireRoles(...read), AccSalesController.listRecurring);
financeRouter.post('/recurring-invoices', requireRoles(...write), AccSalesController.createRecurring);
financeRouter.post('/recurring-invoices/:id/run', requireRoles(...write), AccSalesController.runRecurring);
financeRouter.get('/customers/:customerId/statement', requireRoles(...read), AccSalesController.customerStatement);

// ——— Purchases ———
financeRouter.get('/bills', requireRoles(...read), AccPurchasesController.listBills);
financeRouter.get('/bills/:id', requireRoles(...read), AccPurchasesController.getBill);
financeRouter.post('/bills', requireRoles(...write), AccPurchasesController.createBill);
financeRouter.post('/bills/:id/submit', requireRoles(...write), AccPurchasesController.submitForApproval);
financeRouter.post('/bills/:id/approve', requireRoles(...write), AccPurchasesController.approveBill);
financeRouter.post('/bills/:id/post', requireRoles(...write), AccPostingController.postBill);
financeRouter.post('/bills/:id/payments', requireRoles(...write), AccPurchasesController.payBill);
financeRouter.get('/suppliers/:supplierId/statement', requireRoles(...read), AccPurchasesController.supplierStatement);

// ——— Expenses ———
financeRouter.get('/expenses', requireRoles(...read), AccExpensesController.list);
financeRouter.post('/expenses', requireRoles(...write), AccExpensesController.create);
financeRouter.post('/expenses/:id/submit', requireRoles(...write), AccExpensesController.submit);
financeRouter.post('/expenses/:id/approve', requireRoles(...write), AccExpensesController.approve);
financeRouter.post('/expenses/:id/reject', requireRoles(...write), AccExpensesController.reject);

// ——— Fixed assets ———
financeRouter.get('/fixed-assets', requireRoles(...read), AccFixedAssetsController.list);
financeRouter.get('/fixed-assets/:id', requireRoles(...read), AccFixedAssetsController.get);
financeRouter.post('/fixed-assets', requireRoles(...write), AccFixedAssetsController.create);
financeRouter.post('/fixed-assets/schedule/:scheduleId/post', requireRoles(...write), AccFixedAssetsController.postDepreciation);
financeRouter.post('/fixed-assets/:id/dispose', requireRoles(...write), AccFixedAssetsController.dispose);

// ——— Corporation tax worksheet ———
financeRouter.get('/ct-worksheets', requireRoles(...read), AccCtController.list);
financeRouter.post('/ct-worksheets', requireRoles(...write), AccCtController.upsert);
financeRouter.put('/ct-worksheets', requireRoles(...write), AccCtController.upsert);

// ——— Payroll link (HR → GL) ———
financeRouter.post('/payroll-runs/:id/post-journal', requireRoles(...write), AccPostingController.postPayroll);
financeRouter.get('/payroll-payslips', requireRoles(...read), AccPostingController.listPayslips);

financeRouter.get('/payouts', requireRoles(...read), PayoutController.list);
financeRouter.get('/payouts/:id', requireRoles(...read), PayoutController.get);
financeRouter.post('/payouts', requireRoles(...write), PayoutController.create);
financeRouter.patch('/payouts/:id', requireRoles(...write), PayoutController.update);
financeRouter.delete('/payouts/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), PayoutController.remove);

financeRouter.get('/settlements', requireRoles(...read), SettlementController.list);
financeRouter.get('/settlements/:id', requireRoles(...read), SettlementController.get);
financeRouter.post('/settlements', requireRoles(...write), SettlementController.create);
financeRouter.patch('/settlements/:id', requireRoles(...write), SettlementController.update);
financeRouter.delete('/settlements/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), SettlementController.remove);
