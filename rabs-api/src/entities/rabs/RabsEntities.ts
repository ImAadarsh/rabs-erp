import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ValueTransformer } from 'typeorm';

/** mysql2 returns DECIMAL as string; expose numbers to the service layer. */
const num: ValueTransformer = {
  to: (v: unknown) => v,
  from: (v: unknown) => (v === null || v === undefined ? v : Number(v))
};
const bool: ValueTransformer = {
  to: (v: unknown) => (v === undefined ? v : v ? 1 : 0),
  from: (v: unknown) => v === 1 || v === true || v === '1'
};

const dec = (name: string, opts: { nullable?: boolean; scale?: number; precision?: number } = {}) =>
  Column({ name, type: 'decimal', precision: opts.precision ?? 12, scale: opts.scale ?? 2, nullable: opts.nullable ?? false, transformer: num });
const flag = (name: string) => Column({ name, type: 'tinyint', width: 1, transformer: bool });
const fk = (name: string, nullable = true) => Column({ name, type: 'bigint', unsigned: true, nullable });

@Entity({ name: 'rabs_settings' })
export class RabsSettings {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @dec('vat_rate', { scale: 4, precision: 6 }) vatRate!: number;
  @flag('prices_include_vat') pricesIncludeVat!: boolean;
  @Column({ name: 'deposit_mode', type: 'enum', enum: ['percent', 'fixed', 'none'] }) depositMode!: 'percent' | 'fixed' | 'none';
  @dec('deposit_percent', { precision: 6 }) depositPercent!: number;
  @dec('deposit_fixed_amount') depositFixedAmount!: number;
  @dec('deposit_min_amount') depositMinAmount!: number;
  @flag('auto_close_when_paid') autoCloseWhenPaid!: boolean;
  @dec('default_delivery_charge') defaultDeliveryCharge!: number;
  @Column({ name: 'quote_validity_days', type: 'int' }) quoteValidityDays!: number;
  @Column({ name: 'job_prefix', type: 'varchar', length: 20 }) jobPrefix!: string;
  @Column({ name: 'quote_prefix', type: 'varchar', length: 20 }) quotePrefix!: string;
  @Column({ name: 'invoice_prefix', type: 'varchar', length: 20 }) invoicePrefix!: string;
  @Column({ name: 'next_job_number', type: 'int' }) nextJobNumber!: number;
  @Column({ name: 'next_quote_number', type: 'int' }) nextQuoteNumber!: number;
  @Column({ name: 'next_invoice_number', type: 'int' }) nextInvoiceNumber!: number;
  @Column({ name: 'document_footer', type: 'text', nullable: true }) documentFooter!: string | null;
  @Column({ name: 'quote_terms', type: 'text', nullable: true }) quoteTerms!: string | null;
  @Column({ name: 'company_details', type: 'json', nullable: true }) companyDetails!: Record<string, string> | null;
  @Column({ name: 'role_permissions', type: 'json', nullable: true }) rolePermissions!: Record<string, string[]> | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_statuses' })
export class RabsStatus {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @Column({ type: 'varchar', length: 40 }) code!: string;
  @Column({ type: 'varchar', length: 80 }) label!: string;
  @Column({ type: 'varchar', length: 20 }) color!: string;
  @Column({ name: 'text_color', type: 'varchar', length: 20 }) textColor!: string;
  @Column({ type: 'varchar', length: 30 }) stage!: string;
  @Column({ name: 'sort_order', type: 'int' }) sortOrder!: number;
  @Column({ name: 'next_action_label', type: 'varchar', length: 80, nullable: true }) nextActionLabel!: string | null;
  @flag('is_active') isActive!: boolean;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_products' })
export class RabsProduct {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @Column({ type: 'varchar', length: 60 }) code!: string;
  @Column({ type: 'varchar', length: 255 }) name!: string;
  @Column({ type: 'varchar', length: 60 }) category!: string;
  @Column({ type: 'enum', enum: ['flooring', 'accessory', 'furniture', 'service'] }) kind!: 'flooring' | 'accessory' | 'furniture' | 'service';
  @Column({ type: 'enum', enum: ['m2', 'sqyd', 'linear_m', 'item', 'pack', 'roll'] }) unit!: string;
  @Column({ name: 'calc_method', type: 'enum', enum: ['per_m2', 'per_sqyd', 'per_linear_m', 'per_item', 'per_pack'] }) calcMethod!: string;
  @dec('roll_width_m', { nullable: true, precision: 6 }) rollWidthM!: number | null;
  @dec('pack_coverage_m2', { nullable: true, precision: 8, scale: 3 }) packCoverageM2!: number | null;
  @dec('wastage_percent', { precision: 6 }) wastagePercent!: number;
  @dec('cost_price') costPrice!: number;
  @dec('sell_price') sellPrice!: number;
  @Column({ name: 'accessory_basis', type: 'enum', enum: ['area', 'perimeter', 'door', 'each'], nullable: true }) accessoryBasis!: 'area' | 'perimeter' | 'door' | 'each' | null;
  @dec('accessory_factor', { nullable: true, precision: 8, scale: 3 }) accessoryFactor!: number | null;
  @Column({ name: 'applies_to', type: 'json', nullable: true }) appliesTo!: string[] | null;
  @flag('default_selected') defaultSelected!: boolean;
  @fk('variant_id') variantId!: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) colour!: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) supplier!: string | null;
  @flag('is_active') isActive!: boolean;
  @Column({ name: 'sort_order', type: 'int' }) sortOrder!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_labour_rules' })
export class RabsLabourRule {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @Column({ type: 'varchar', length: 120 }) name!: string;
  @Column({ type: 'varchar', length: 60 }) category!: string;
  @Column({ name: 'room_type', type: 'varchar', length: 60, nullable: true }) roomType!: string | null;
  @Column({ type: 'enum', enum: ['per_m2', 'per_sqyd', 'per_room', 'per_stair', 'per_item', 'fixed'] }) basis!: string;
  @dec('cost_rate') costRate!: number;
  @dec('sell_rate') sellRate!: number;
  @dec('min_charge') minCharge!: number;
  @flag('is_active') isActive!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_price_audit' })
export class RabsPriceAudit {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @Column({ type: 'varchar', length: 40 }) entity!: string;
  @fk('entity_id') entityId!: string | null;
  @Column({ name: 'entity_label', type: 'varchar', length: 255, nullable: true }) entityLabel!: string | null;
  @Column({ type: 'varchar', length: 60 }) field!: string;
  @Column({ name: 'old_value', type: 'varchar', length: 255, nullable: true }) oldValue!: string | null;
  @Column({ name: 'new_value', type: 'varchar', length: 255, nullable: true }) newValue!: string | null;
  @fk('changed_by') changedBy!: string | null;
  @CreateDateColumn({ name: 'changed_at' }) changedAt!: Date;
}

@Entity({ name: 'rabs_customers' })
export class RabsCustomer {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @fk('customer_id') customerId!: string | null;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'varchar', length: 40, nullable: true }) phone!: string | null;
  @Column({ type: 'varchar', length: 190, nullable: true }) email!: string | null;
  @Column({ name: 'address_line1', type: 'varchar', length: 190, nullable: true }) addressLine1!: string | null;
  @Column({ name: 'address_line2', type: 'varchar', length: 190, nullable: true }) addressLine2!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) city!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) postcode!: string | null;
  @Column({ type: 'varchar', length: 60, nullable: true }) source!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @fk('created_by') createdBy!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_jobs' })
export class RabsJob {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @Column({ name: 'job_number', type: 'varchar', length: 40 }) jobNumber!: string;
  @fk('rabs_customer_id', false) rabsCustomerId!: string;
  @Column({ type: 'varchar', length: 40 }) status!: string;
  @Column({ type: 'varchar', length: 190, nullable: true }) title!: string | null;
  @Column({ name: 'site_address', type: 'varchar', length: 255, nullable: true }) siteAddress!: string | null;
  @flag('requires_fitting') requiresFitting!: boolean;
  @flag('requires_delivery') requiresDelivery!: boolean;
  @fk('surveyor_user_id') surveyorUserId!: string | null;
  @fk('accepted_quote_id') acceptedQuoteId!: string | null;
  @Column({ name: 'converted_at', type: 'datetime', nullable: true }) convertedAt!: Date | null;
  @dec('total_amount') totalAmount!: number;
  @dec('deposit_required') depositRequired!: number;
  @dec('paid_amount') paidAmount!: number;
  @dec('balance_due') balanceDue!: number;
  @Column({ name: 'materials_status', type: 'enum', enum: ['not_checked', 'pending', 'ready'] }) materialsStatus!: 'not_checked' | 'pending' | 'ready';
  @flag('has_issue') hasIssue!: boolean;
  @Column({ name: 'issue_note', type: 'text', nullable: true }) issueNote!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'completed_at', type: 'datetime', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'closed_at', type: 'datetime', nullable: true }) closedAt!: Date | null;
  @fk('created_by') createdBy!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_appointments' })
export class RabsAppointment {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @fk('job_id', false) jobId!: string;
  @Column({ name: 'scheduled_at', type: 'datetime' }) scheduledAt!: Date;
  @Column({ name: 'duration_min', type: 'int' }) durationMin!: number;
  @Column({ type: 'varchar', length: 40 }) purpose!: string;
  @fk('staff_user_id') staffUserId!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ type: 'enum', enum: ['booked', 'done', 'cancelled'] }) status!: 'booked' | 'done' | 'cancelled';
  @fk('created_by') createdBy!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_measurements' })
export class RabsMeasurement {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @fk('job_id', false) jobId!: string;
  @fk('appointment_id') appointmentId!: string | null;
  @Column({ type: 'enum', enum: ['draft', 'complete'] }) status!: 'draft' | 'complete';
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @fk('measured_by') measuredBy!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_rooms' })
export class RabsRoom {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('measurement_id', false) measurementId!: string;
  @fk('job_id', false) jobId!: string;
  @Column({ type: 'varchar', length: 80 }) name!: string;
  @Column({ name: 'unit_input', type: 'enum', enum: ['m', 'ftin'] }) unitInput!: 'm' | 'ftin';
  @Column({ name: 'length_ft', type: 'int', nullable: true }) lengthFt!: number | null;
  @dec('length_in', { nullable: true, precision: 5 }) lengthIn!: number | null;
  @Column({ name: 'width_ft', type: 'int', nullable: true }) widthFt!: number | null;
  @dec('width_in', { nullable: true, precision: 5 }) widthIn!: number | null;
  @dec('length_m', { precision: 8, scale: 3 }) lengthM!: number;
  @dec('width_m', { precision: 8, scale: 3 }) widthM!: number;
  @dec('area_m2', { precision: 10 }) areaM2!: number;
  @dec('area_sqyd', { precision: 10 }) areaSqyd!: number;
  @dec('perimeter_m', { precision: 10 }) perimeterM!: number;
  @Column({ type: 'int' }) doors!: number;
  @Column({ type: 'int' }) stairs!: number;
  @fk('product_id') productId!: string | null;
  @dec('product_qty', { nullable: true, precision: 10 }) productQty!: number | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'sort_order', type: 'int' }) sortOrder!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_room_accessories' })
export class RabsRoomAccessory {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('room_id', false) roomId!: string;
  @fk('product_id', false) productId!: string;
  @dec('qty', { precision: 10 }) qty!: number;
}

@Entity({ name: 'rabs_files' })
export class RabsFile {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @fk('job_id', false) jobId!: string;
  @fk('room_id') roomId!: string | null;
  @fk('booking_id') bookingId!: string | null;
  @Column({ type: 'enum', enum: ['room_photo', 'before', 'after', 'signature', 'document', 'other'] }) kind!: string;
  @Column({ type: 'varchar', length: 600 }) url!: string;
  @Column({ name: 'storage_key', type: 'varchar', length: 400, nullable: true }) storageKey!: string | null;
  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true }) mimeType!: string | null;
  @Column({ name: 'size_bytes', type: 'int', nullable: true }) sizeBytes!: number | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) caption!: string | null;
  @fk('uploaded_by') uploadedBy!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity({ name: 'rabs_quotes' })
export class RabsQuote {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @fk('job_id', false) jobId!: string;
  @fk('measurement_id') measurementId!: string | null;
  @Column({ name: 'quote_number', type: 'varchar', length: 40 }) quoteNumber!: string;
  @Column({ type: 'int' }) version!: number;
  @Column({ type: 'enum', enum: ['draft', 'sent', 'accepted', 'superseded', 'declined'] }) status!: 'draft' | 'sent' | 'accepted' | 'superseded' | 'declined';
  @dec('subtotal') subtotal!: number;
  @Column({ name: 'discount_type', type: 'enum', enum: ['none', 'percent', 'fixed'] }) discountType!: 'none' | 'percent' | 'fixed';
  @dec('discount_value') discountValue!: number;
  @dec('discount_amount') discountAmount!: number;
  @dec('delivery_charge') deliveryCharge!: number;
  @dec('net_total') netTotal!: number;
  @dec('vat_rate', { scale: 4, precision: 6 }) vatRate!: number;
  @dec('vat_amount') vatAmount!: number;
  @dec('total') total!: number;
  @dec('deposit_required') depositRequired!: number;
  @dec('cost_total') costTotal!: number;
  @dec('margin_amount') marginAmount!: number;
  @dec('margin_percent', { precision: 6 }) marginPercent!: number;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'valid_until', type: 'date', nullable: true }) validUntil!: string | null;
  @Column({ name: 'sent_at', type: 'datetime', nullable: true }) sentAt!: Date | null;
  @Column({ name: 'accepted_at', type: 'datetime', nullable: true }) acceptedAt!: Date | null;
  @Column({ name: 'accepted_by_name', type: 'varchar', length: 160, nullable: true }) acceptedByName!: string | null;
  @fk('created_by') createdBy!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_quote_lines' })
export class RabsQuoteLine {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('quote_id', false) quoteId!: string;
  @fk('room_id') roomId!: string | null;
  @Column({ name: 'room_name', type: 'varchar', length: 80, nullable: true }) roomName!: string | null;
  @Column({ name: 'line_type', type: 'enum', enum: ['product', 'accessory', 'labour', 'custom'] }) lineType!: 'product' | 'accessory' | 'labour' | 'custom';
  @fk('product_id') productId!: string | null;
  @Column({ type: 'varchar', length: 255 }) description!: string;
  @dec('qty', { precision: 10 }) qty!: number;
  @Column({ type: 'varchar', length: 20 }) unit!: string;
  @dec('unit_cost') unitCost!: number;
  @dec('unit_price') unitPrice!: number;
  @dec('line_cost') lineCost!: number;
  @dec('line_total') lineTotal!: number;
  @Column({ type: 'json', nullable: true }) meta!: any;
  @Column({ name: 'sort_order', type: 'int' }) sortOrder!: number;
}

@Entity({ name: 'rabs_variations' })
export class RabsVariation {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @fk('job_id', false) jobId!: string;
  @Column({ type: 'varchar', length: 255 }) description!: string;
  @dec('net_amount') netAmount!: number;
  @dec('vat_amount') vatAmount!: number;
  @dec('total') total!: number;
  @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected'] }) status!: 'pending' | 'approved' | 'rejected';
  @Column({ name: 'approved_at', type: 'datetime', nullable: true }) approvedAt!: Date | null;
  @fk('created_by') createdBy!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity({ name: 'rabs_invoices' })
export class RabsInvoice {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @fk('job_id', false) jobId!: string;
  @fk('quote_id') quoteId!: string | null;
  @Column({ name: 'invoice_number', type: 'varchar', length: 40 }) invoiceNumber!: string;
  @Column({ type: 'enum', enum: ['issued', 'part_paid', 'paid'] }) status!: 'issued' | 'part_paid' | 'paid';
  @dec('net_total') netTotal!: number;
  @dec('vat_amount') vatAmount!: number;
  @dec('total') total!: number;
  @dec('paid_amount') paidAmount!: number;
  @dec('balance') balance!: number;
  @Column({ type: 'json', nullable: true }) lines!: any;
  @Column({ name: 'issued_at', type: 'datetime' }) issuedAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_payments' })
export class RabsPayment {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @fk('job_id', false) jobId!: string;
  @Column({ type: 'enum', enum: ['deposit', 'part', 'balance', 'refund'] }) kind!: 'deposit' | 'part' | 'balance' | 'refund';
  @Column({ type: 'enum', enum: ['cash', 'card', 'bank_transfer', 'finance', 'cheque', 'other'] }) method!: string;
  @dec('amount') amount!: number;
  @Column({ name: 'paid_at', type: 'datetime' }) paidAt!: Date;
  @Column({ type: 'varchar', length: 120, nullable: true }) reference!: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) notes!: string | null;
  @fk('recorded_by') recordedBy!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity({ name: 'rabs_material_items' })
export class RabsMaterialItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @fk('job_id', false) jobId!: string;
  @fk('product_id') productId!: string | null;
  @Column({ type: 'varchar', length: 255 }) description!: string;
  @Column({ type: 'varchar', length: 20 }) unit!: string;
  @dec('qty_required', { precision: 10 }) qtyRequired!: number;
  @Column({ name: 'qty_reserved', type: 'int' }) qtyReserved!: number;
  @Column({ name: 'qty_short', type: 'int' }) qtyShort!: number;
  @fk('variant_id') variantId!: string | null;
  @Column({ type: 'enum', enum: ['reserved', 'to_order', 'ordered', 'received', 'not_tracked'] }) status!: 'reserved' | 'to_order' | 'ordered' | 'received' | 'not_tracked';
  @Column({ name: 'checked_at', type: 'datetime', nullable: true }) checkedAt!: Date | null;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_bookings' })
export class RabsBooking {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @fk('job_id', false) jobId!: string;
  @Column({ type: 'enum', enum: ['fitting', 'delivery'] }) type!: 'fitting' | 'delivery';
  @Column({ name: 'scheduled_date', type: 'date' }) scheduledDate!: string;
  @Column({ type: 'varchar', length: 20 }) slot!: string;
  @fk('staff_user_id') staffUserId!: string | null;
  @Column({ type: 'enum', enum: ['booked', 'in_progress', 'complete', 'cancelled'] }) status!: 'booked' | 'in_progress' | 'complete' | 'cancelled';
  @Column({ type: 'text', nullable: true }) instructions!: string | null;
  @Column({ type: 'json', nullable: true }) checklist!: Array<{ label: string; done: boolean }> | null;
  @Column({ name: 'signed_name', type: 'varchar', length: 160, nullable: true }) signedName!: string | null;
  @fk('signature_file_id') signatureFileId!: string | null;
  @Column({ name: 'signed_at', type: 'datetime', nullable: true }) signedAt!: Date | null;
  @Column({ name: 'started_at', type: 'datetime', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'datetime', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'completion_notes', type: 'text', nullable: true }) completionNotes!: string | null;
  @fk('created_by') createdBy!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity({ name: 'rabs_timeline' })
export class RabsTimeline {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id!: string;
  @fk('organization_id', false) organizationId!: string;
  @fk('job_id', false) jobId!: string;
  @Column({ type: 'varchar', length: 60 }) event!: string;
  @Column({ type: 'varchar', length: 500 }) message!: string;
  @Column({ type: 'json', nullable: true }) meta!: any;
  @fk('user_id') userId!: string | null;
  @CreateDateColumn({ name: 'created_at', precision: 3 }) createdAt!: Date;
}

export const RABS_ENTITIES = [
  RabsSettings, RabsStatus, RabsProduct, RabsLabourRule, RabsPriceAudit, RabsCustomer, RabsJob,
  RabsAppointment, RabsMeasurement, RabsRoom, RabsRoomAccessory, RabsFile, RabsQuote, RabsQuoteLine,
  RabsVariation, RabsInvoice, RabsPayment, RabsMaterialItem, RabsBooking, RabsTimeline
];
