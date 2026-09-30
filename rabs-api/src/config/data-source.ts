import { DataSource } from 'typeorm';
import { env } from './env.js';
import { User } from '@entities/iam/User.js';
import { Role } from '@entities/iam/Role.js';
import { RoleAssignment } from '@entities/iam/RoleAssignment.js';
import { ApiKey } from '@entities/iam/ApiKey.js';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Location } from '@entities/iam/Location.js';
import { AuditLog } from '@entities/iam/AuditLog.js';
import { TaxCode } from '@entities/catalog/TaxCode.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { Variant } from '@entities/catalog/Variant.js';
import { Barcode } from '@entities/catalog/Barcode.js';
import { ProductMedia } from '@entities/catalog/ProductMedia.js';
import { Bundle } from '@entities/catalog/Bundle.js';
import { BundleItem } from '@entities/catalog/BundleItem.js';
import { PriceList } from '@entities/catalog/PriceList.js';
import { PriceListItem } from '@entities/catalog/PriceListItem.js';
import { PromotionalPrice } from '@entities/catalog/PromotionalPrice.js';
import { ChannelMapping } from '@entities/catalog/ChannelMapping.js';
import { ProductImportJob } from '@entities/catalog/ProductImportJob.js';
import { ChannelConnection } from '@entities/catalog/ChannelConnection.js';
import { ComplianceDocument } from '@entities/catalog/ComplianceDocument.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { Bin } from '@entities/inventory/Bin.js';
import { Supplier } from '@entities/inventory/Supplier.js';
import { PurchaseOrder } from '@entities/inventory/PurchaseOrder.js';
import { PurchaseOrderLine } from '@entities/inventory/PurchaseOrderLine.js';
import { ASN } from '@entities/inventory/ASN.js';
import { GRN } from '@entities/inventory/GRN.js';
import { GRNLine } from '@entities/inventory/GRNLine.js';
import { StockItem } from '@entities/inventory/StockItem.js';
import { StockMovement } from '@entities/inventory/StockMovement.js';
import { StockTransfer } from '@entities/inventory/StockTransfer.js';
import { StockTransferLine } from '@entities/inventory/StockTransferLine.js';
import { StockAdjustment } from '@entities/inventory/StockAdjustment.js';
import { CycleCount } from '@entities/inventory/CycleCount.js';
import { CycleCountLine } from '@entities/inventory/CycleCountLine.js';
import { InventorySnapshot } from '@entities/inventory/InventorySnapshot.js';
import { Customer } from '@entities/orders/Customer.js';
import { CustomerAddress } from '@entities/orders/CustomerAddress.js';
import { Order } from '@entities/orders/Order.js';
import { OrderLine } from '@entities/orders/OrderLine.js';
import { OrderAddress } from '@entities/orders/OrderAddress.js';
import { OrderNote } from '@entities/orders/OrderNote.js';
import { OrderSplit } from '@entities/orders/OrderSplit.js';
import { Backorder } from '@entities/orders/Backorder.js';
import { Return } from '@entities/orders/Return.js';
import { ReturnLine } from '@entities/orders/ReturnLine.js';
import { ChartOfAccounts } from '@entities/finance/ChartOfAccounts.js';
import { LedgerAccount } from '@entities/finance/LedgerAccount.js';
import { CostCenter } from '@entities/finance/CostCenter.js';
import { FiscalPeriod } from '@entities/finance/FiscalPeriod.js';
import { JournalEntry } from '@entities/finance/JournalEntry.js';
import { JournalLine } from '@entities/finance/JournalLine.js';
import { BankAccount } from '@entities/finance/BankAccount.js';
import { BankTransaction } from '@entities/finance/BankTransaction.js';
import { VatReturn } from '@entities/finance/VatReturn.js';
import { BudgetLine } from '@entities/finance/BudgetLine.js';
import { Employee } from '@entities/hr/Employee.js';
import { EmploymentContract } from '@entities/hr/EmploymentContract.js';
import { EmployeeDocument } from '@entities/hr/EmployeeDocument.js';
import { TimeEntry } from '@entities/hr/TimeEntry.js';
import { LeaveRequest } from '@entities/hr/LeaveRequest.js';
import { Shift } from '@entities/hr/Shift.js';
import { PayrollRun } from '@entities/hr/PayrollRun.js';
import { PayrollLine } from '@entities/hr/PayrollLine.js';
import { Task } from '@entities/hr/Task.js';
import { KpiDefinition } from '@entities/hr/KpiDefinition.js';
import { KpiRecord } from '@entities/hr/KpiRecord.js';
import { HrImmigration } from '@entities/hr/HrImmigration.js';
import { HrRtwDocument } from '@entities/hr/HrRtwDocument.js';
import { HrLeavePolicy } from '@entities/hr/HrLeavePolicy.js';
import { HrLeaveBalance } from '@entities/hr/HrLeaveBalance.js';
import { HrAttendance } from '@entities/hr/HrAttendance.js';
import { HrOvertime } from '@entities/hr/HrOvertime.js';
import { HrSickEpisode } from '@entities/hr/HrSickEpisode.js';
import { HrPension } from '@entities/hr/HrPension.js';
import { HrDocument } from '@entities/hr/HrDocument.js';
import { HrPayslip } from '@entities/hr/HrPayslip.js';
import { HrTaxDocument } from '@entities/hr/HrTaxDocument.js';
import { HrJobPosting } from '@entities/hr/HrJobPosting.js';
import { HrApplicant } from '@entities/hr/HrApplicant.js';
import { HrOnboardingChecklist } from '@entities/hr/HrOnboardingChecklist.js';
import { HrComplianceAlert } from '@entities/hr/HrComplianceAlert.js';
import { Ticket } from '@entities/crm/Ticket.js';
import { TicketMessage } from '@entities/crm/TicketMessage.js';
import { TicketAssignment } from '@entities/crm/TicketAssignment.js';
import { CannedResponse } from '@entities/crm/CannedResponse.js';
import { CustomerTier } from '@entities/crm/CustomerTier.js';
import { CustomerNote } from '@entities/crm/CustomerNote.js';
import { CrmPipeline } from '@entities/crm/CrmPipeline.js';
import { CrmStage } from '@entities/crm/CrmStage.js';
import { CrmLead } from '@entities/crm/CrmLead.js';
import { CrmDeal } from '@entities/crm/CrmDeal.js';
import { CrmDealStageHistory } from '@entities/crm/CrmDealStageHistory.js';
import { CrmActivity } from '@entities/crm/CrmActivity.js';
import { CrmTag } from '@entities/crm/CrmTag.js';
import { CrmTaggable } from '@entities/crm/CrmTaggable.js';
import { CrmIntegrationKey } from '@entities/crm/CrmIntegrationKey.js';
import { CrmContact } from '@entities/crm/CrmContact.js';
import { CrmSettings } from '@entities/crm/CrmSettings.js';
import { PaymentGateway } from '@entities/finance/PaymentGateway.js';
import { Payment } from '@entities/finance/Payment.js';
import { PaymentAllocation } from '@entities/finance/PaymentAllocation.js';
import { PaymentDispute } from '@entities/finance/PaymentDispute.js';
import { Invoice } from '@entities/finance/Invoice.js';
import { InvoiceLine } from '@entities/finance/InvoiceLine.js';
import { CreditNote } from '@entities/finance/CreditNote.js';
import { CreditNoteLine } from '@entities/finance/CreditNoteLine.js';
import { Payout } from '@entities/finance/Payout.js';
import { Settlement } from '@entities/finance/Settlement.js';
import { SettlementLine } from '@entities/finance/SettlementLine.js';
import { AccOrgSettings } from '@entities/finance/AccOrgSettings.js';
import { AccVatCode } from '@entities/finance/AccVatCode.js';
import { AccAuditEvent } from '@entities/finance/AccAuditEvent.js';
import { AccRecurringInvoice } from '@entities/finance/AccRecurringInvoice.js';
import { AccSupplierBill } from '@entities/finance/AccSupplierBill.js';
import { AccSupplierBillLine } from '@entities/finance/AccSupplierBillLine.js';
import { AccBillPayment } from '@entities/finance/AccBillPayment.js';
import { AccInvoicePayment } from '@entities/finance/AccInvoicePayment.js';
import { AccExpense } from '@entities/finance/AccExpense.js';
import { AccFixedAsset } from '@entities/finance/AccFixedAsset.js';
import { AccDepreciationSchedule } from '@entities/finance/AccDepreciationSchedule.js';
import { AccBankRule } from '@entities/finance/AccBankRule.js';
import { AccBankTransfer } from '@entities/finance/AccBankTransfer.js';
import { AccBankReconciliation } from '@entities/finance/AccBankReconciliation.js';
import { AccCtWorksheet } from '@entities/finance/AccCtWorksheet.js';
import { Segment } from '@entities/marketing/Segment.js';
import { SegmentMember } from '@entities/marketing/SegmentMember.js';
import { Campaign } from '@entities/marketing/Campaign.js';
import { CampaignSend } from '@entities/marketing/CampaignSend.js';
import { CampaignLog } from '@entities/marketing/CampaignLog.js';
import { Coupon } from '@entities/marketing/Coupon.js';
import { CouponUsage } from '@entities/marketing/CouponUsage.js';
import { Affiliate } from '@entities/marketing/Affiliate.js';
import { AffiliateLink } from '@entities/marketing/AffiliateLink.js';
import { AffiliateClick } from '@entities/marketing/AffiliateClick.js';
import { AffiliateConversion } from '@entities/marketing/AffiliateConversion.js';
import { AffiliatePayout } from '@entities/marketing/AffiliatePayout.js';
import { MarketingEmailCampaign } from '@entities/marketing/MarketingEmailCampaign.js';
import { MarketingEmailSend } from '@entities/marketing/MarketingEmailSend.js';
import { MarketingEmailConnector } from '@entities/marketing/MarketingEmailConnector.js';
import { MarketingEmailEvent } from '@entities/marketing/MarketingEmailEvent.js';
import { SocialAccount } from '@entities/social/SocialAccount.js';
import { SocialPost } from '@entities/social/SocialPost.js';
import { SocialComment } from '@entities/social/SocialComment.js';
import { SocialMessage } from '@entities/social/SocialMessage.js';
import { SocialAsset } from '@entities/social/SocialAsset.js';
import { Creator } from '@entities/social/Creator.js';
import { Deliverable } from '@entities/social/Deliverable.js';
import { KeywordAlert } from '@entities/social/KeywordAlert.js';
import { SocialEngagement } from '@entities/social/SocialEngagement.js';
import { ReportDefinition } from '@entities/analytics/ReportDefinition.js';
import { ScheduledReport } from '@entities/analytics/ScheduledReport.js';
import { ReportExecution } from '@entities/analytics/ReportExecution.js';
import { Dashboard } from '@entities/analytics/Dashboard.js';
import { DataExport } from '@entities/analytics/DataExport.js';
import { B2bPortalSettings } from '@entities/b2b/B2bPortalSettings.js';
import { RetailerAccount } from '@entities/b2b/RetailerAccount.js';
import { B2bShippingMethod } from '@entities/b2b/B2bShippingMethod.js';
import { B2bShipment } from '@entities/b2b/B2bShipment.js';
import { B2bShipmentEvent } from '@entities/b2b/B2bShipmentEvent.js';
import { B2bNotification } from '@entities/b2b/B2bNotification.js';
import { B2bNotificationPreference } from '@entities/b2b/B2bNotificationPreference.js';
import { B2bReferral } from '@entities/b2b/B2bReferral.js';
import { B2bCreditRequest } from '@entities/b2b/B2bCreditRequest.js';
import { B2bRetailerBuyer } from '@entities/b2b/B2bRetailerBuyer.js';
import { B2bCreditLedger } from '@entities/b2b/B2bCreditLedger.js';
import { PmProject } from '@entities/pm/PmProject.js';
import { PmDeliverable } from '@entities/pm/PmDeliverable.js';
import { PmWorkStage } from '@entities/pm/PmWorkStage.js';
import { PmWorkOrder } from '@entities/pm/PmWorkOrder.js';
import { PmTask } from '@entities/pm/PmTask.js';
import { PmTaskDependency } from '@entities/pm/PmTaskDependency.js';
import { PmMilestone } from '@entities/pm/PmMilestone.js';
import { PmScheduleBlock } from '@entities/pm/PmScheduleBlock.js';
import { PmProjectMember } from '@entities/pm/PmProjectMember.js';
import { OrderShipment } from '@entities/fulfillment/OrderShipment.js';
import { RABS_ENTITIES } from '@entities/rabs/RabsEntities.js';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  charset: 'utf8mb4',
  synchronize: false,
  logging: false,
  entities: [
    User, Role, RoleAssignment, ApiKey, Organization, BusinessUnit, Location, AuditLog,
    TaxCode, CatalogItem, Variant, Barcode, ProductMedia, Bundle, BundleItem,
    PriceList, PriceListItem, PromotionalPrice, ChannelMapping, ProductImportJob, ChannelConnection, ComplianceDocument,
    Warehouse, Bin, Supplier, PurchaseOrder, PurchaseOrderLine, ASN, GRN, GRNLine,
    StockItem, StockMovement, StockTransfer, StockTransferLine, StockAdjustment, CycleCount, CycleCountLine, InventorySnapshot,
    Customer, CustomerAddress, Order, OrderLine, OrderAddress, OrderNote, OrderSplit, Backorder, Return, ReturnLine,
    ChartOfAccounts, LedgerAccount, CostCenter, FiscalPeriod, JournalEntry, JournalLine,
    BankAccount, BankTransaction, VatReturn, BudgetLine,
    Employee, EmploymentContract, EmployeeDocument, TimeEntry, LeaveRequest, Shift,
    PayrollRun, PayrollLine, Task, KpiDefinition, KpiRecord,
    HrImmigration, HrRtwDocument, HrLeavePolicy, HrLeaveBalance, HrAttendance, HrOvertime,
    HrSickEpisode, HrPension, HrDocument, HrPayslip, HrTaxDocument,
    HrJobPosting, HrApplicant, HrOnboardingChecklist, HrComplianceAlert,
    Ticket, TicketMessage, TicketAssignment, CannedResponse, CustomerTier, CustomerNote,
    CrmPipeline, CrmStage, CrmLead, CrmDeal, CrmDealStageHistory, CrmActivity, CrmTag, CrmTaggable,
    CrmIntegrationKey, CrmContact, CrmSettings,
    PaymentGateway, Payment, PaymentAllocation, PaymentDispute, Invoice, InvoiceLine, CreditNote, CreditNoteLine, Payout, Settlement, SettlementLine,
    AccOrgSettings, AccVatCode, AccAuditEvent, AccRecurringInvoice, AccSupplierBill, AccSupplierBillLine,
    AccBillPayment, AccInvoicePayment, AccExpense, AccFixedAsset, AccDepreciationSchedule,
    AccBankRule, AccBankTransfer, AccBankReconciliation, AccCtWorksheet,
    Segment, SegmentMember, Campaign, CampaignSend, CampaignLog, Coupon, CouponUsage, Affiliate, AffiliateLink, AffiliateClick, AffiliateConversion, AffiliatePayout,
    MarketingEmailCampaign, MarketingEmailSend, MarketingEmailConnector, MarketingEmailEvent,
    SocialAccount, SocialPost, SocialComment, SocialMessage, SocialAsset, Creator, Deliverable, KeywordAlert, SocialEngagement,
    ReportDefinition, ScheduledReport, ReportExecution, Dashboard, DataExport,
    B2bPortalSettings, RetailerAccount,
    B2bShippingMethod, B2bShipment, B2bShipmentEvent,
    B2bNotification, B2bNotificationPreference, B2bReferral,
    B2bCreditRequest, B2bRetailerBuyer, B2bCreditLedger,
    PmProject, PmDeliverable, PmWorkStage, PmWorkOrder, PmTask, PmTaskDependency,
    PmMilestone, PmScheduleBlock, PmProjectMember,
    OrderShipment,
    ...RABS_ENTITIES
  ],
  migrations: []
});
