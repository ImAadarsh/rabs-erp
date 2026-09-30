import { AppDataSource } from '@config/data-source.js';
import { B2bNotification } from '@entities/b2b/B2bNotification.js';
import { B2bNotificationPreference } from '@entities/b2b/B2bNotificationPreference.js';
import { Customer } from '@entities/orders/Customer.js';

export async function listNotifications(customerId: string) {
  const rows = await AppDataSource.getRepository(B2bNotification).find({
    where: { customer: { id: customerId } },
    order: { createdAt: 'DESC' },
    take: 100
  });
  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    date: new Date(n.createdAt).toLocaleString('en-GB'),
    read: n.isRead,
    actionUrl: n.actionUrl || undefined
  }));
}

export async function markNotificationRead(customerId: string, id: string) {
  const repo = AppDataSource.getRepository(B2bNotification);
  const row = await repo.findOne({ where: { id }, relations: ['customer'] });
  if (!row || row.customer.id !== customerId) {
    throw Object.assign(new Error('Notification not found'), { status: 404 });
  }
  row.isRead = true;
  await repo.save(row);
  return { success: true };
}

export async function markAllNotificationsRead(customerId: string) {
  await AppDataSource.getRepository(B2bNotification)
    .createQueryBuilder()
    .update(B2bNotification)
    .set({ isRead: true })
    .where('customer_id = :customerId', { customerId })
    .execute();
  return { success: true };
}

export async function getNotificationPreferences(customerId: string) {
  const repo = AppDataSource.getRepository(B2bNotificationPreference);
  let prefs = await repo.findOne({ where: { customer: { id: customerId } } });
  if (!prefs) {
    prefs = await repo.save(
      repo.create({
        customer: { id: customerId } as any
      })
    );
  }
  return prefs;
}

export async function updateNotificationPreferences(
  customerId: string,
  data: Partial<B2bNotificationPreference>
) {
  const prefs = await getNotificationPreferences(customerId);
  const repo = AppDataSource.getRepository(B2bNotificationPreference);
  Object.assign(prefs, {
    priceAlerts: data.priceAlerts ?? prefs.priceAlerts,
    stockSms: data.stockSms ?? prefs.stockSms,
    orderUpdates: data.orderUpdates ?? prefs.orderUpdates,
    creditAlerts: data.creditAlerts ?? prefs.creditAlerts,
    marketing: data.marketing ?? prefs.marketing,
    channelEmail: data.channelEmail ?? prefs.channelEmail,
    channelSms: data.channelSms ?? prefs.channelSms,
    channelWhatsapp: data.channelWhatsapp ?? prefs.channelWhatsapp
  });
  return repo.save(prefs);
}

export async function createNotification(opts: {
  orgId: string;
  customerId: string;
  title: string;
  message: string;
  type?: B2bNotification['type'];
  actionUrl?: string | null;
}) {
  const customer = await AppDataSource.getRepository(Customer).findOne({ where: { id: opts.customerId } });
  if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
  const repo = AppDataSource.getRepository(B2bNotification);
  return repo.save(
    repo.create({
      organization: { id: opts.orgId } as any,
      customer,
      title: opts.title,
      message: opts.message,
      type: opts.type || 'system',
      actionUrl: opts.actionUrl || null,
      isRead: false
    })
  );
}

export async function adminListNotifications(organizationId: string) {
  return AppDataSource.getRepository(B2bNotification).find({
    where: { organization: { id: organizationId } },
    relations: ['customer'],
    order: { createdAt: 'DESC' },
    take: 200
  });
}
