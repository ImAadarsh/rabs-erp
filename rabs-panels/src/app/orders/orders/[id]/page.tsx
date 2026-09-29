'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { getOrder, listOrderLines, listOrderAddresses, listOrderNotes, createOrderLine, updateOrderLine, deleteOrderLine, createOrderAddress, updateOrderAddress, deleteOrderAddress, createOrderNote, updateOrderNote, deleteOrderNote, listVariants, listWarehouses, listInvoices, generateInvoices, listDhlShipments, createDhlShipment, getDhlShipmentLabel, trackDhlShipment, cancelDhlShipment } from '@/lib/api';
import { toast } from 'sonner';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ArrowLeft, Plus, Pencil, Trash2, X, Package, MapPin, FileText, ShoppingCart, Receipt, Loader2, Truck } from 'lucide-react';
import Link from 'next/link';

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  
  // Modals
  const [showLineModal, setShowLineModal] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingLine, setEditingLine] = useState<any>(null);
  const [editingAddress, setEditingAddress] = useState<any>(null);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [confirmDel, setConfirmDel] = useState<{ type: 'line' | 'address' | 'note'; id: string } | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [dhlShipments, setDhlShipments] = useState<any[]>([]);
  const [dhlBusy, setDhlBusy] = useState(false);
  const [showDhlModal, setShowDhlModal] = useState(false);
  const [dhlForm, setDhlForm] = useState({
    weightKg: 1,
    pieces: 1,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 15,
    productCode: 'N',
    description: ''
  });

  // Forms
  const [lineForm, setLineForm] = useState({
    variantId: '',
    sku: '',
    name: '',
    quantity: 1,
    unitPrice: 0,
    discountAmount: 0,
    taxRate: 0,
    taxAmount: 0,
    lineTotal: 0,
    costPrice: 0,
    warehouseId: '',
    fulfillmentStatus: 'pending' as 'pending' | 'allocated' | 'picked' | 'packed' | 'shipped' | 'cancelled',
    notes: ''
  });

  const [addressForm, setAddressForm] = useState({
    addressType: 'shipping' as 'shipping' | 'billing',
    firstName: '',
    lastName: '',
    company: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    countryCode: 'GB',
    phone: '',
    email: ''
  });

  const [noteForm, setNoteForm] = useState({
    noteType: 'internal' as 'internal' | 'customer' | 'system',
    note: '',
    isCustomerVisible: false
  });

  useEffect(() => {
    if (!hydrated || !hasAccess || !orderId) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    loadData();
  }, [hydrated, hasAccess, router, session?.accessToken, orderId]);

  async function loadData() {
    try {
      setLoading(true);
      const [orderRes, linesRes, addressesRes, notesRes, variantsRes, warehousesRes, dhlRes] = await Promise.all([
        getOrder(orderId),
        listOrderLines({ orderId }),
        listOrderAddresses({ orderId }),
        listOrderNotes({ orderId }),
        listVariants(),
        listWarehouses(),
        listDhlShipments({ orderId }).catch(() => ({ data: [] }))
      ]);
      setOrder(orderRes.data);
      setLines(linesRes.data || []);
      setAddresses(addressesRes.data || []);
      setNotes(notesRes.data || []);
      setVariants(variantsRes.data || []);
      setWarehouses(warehousesRes.data || []);
      setDhlShipments(dhlRes.data || []);

      // Look up the unified invoice for this order, if one exists.
      if (session?.user?.organizationId && orderRes.data?.orderNumber) {
        const inv = await listInvoices(session.user.organizationId, {
          search: orderRes.data.orderNumber,
          limit: 20,
          page: 1
        }).catch(() => null);
        const match = inv?.data?.find((i: any) => String(i.order?.id ?? i.orderId) === String(orderId));
        setInvoiceId(match?.id ?? null);
      }
    } catch (e: any) {
      toast.error('Failed to load order details');
      router.push('/orders/orders');
    } finally {
      setLoading(false);
    }
  }

  async function onGenerateInvoice() {
    if (!session?.user?.organizationId || !orderId || invoiceBusy) return;
    try {
      setInvoiceBusy(true);
      const res = await generateInvoices({
        organizationId: session.user.organizationId,
        orderIds: [orderId]
      });
      if (res.data.created > 0 && res.data.invoices[0]) {
        toast.success(`Invoice ${res.data.invoices[0].invoiceNumber} created`);
        setInvoiceId(res.data.invoices[0].id);
        router.push(`/finance/invoices/${res.data.invoices[0].id}`);
      } else {
        toast.message(res.data.skipped?.[0]?.reason || 'Order already invoiced');
        await loadData();
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to generate invoice');
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function onSaveLine(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId || !lineForm.variantId || !lineForm.sku || !lineForm.name) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      if (editingLine) {
        await updateOrderLine(editingLine.id, lineForm);
        toast.success('Order line updated');
      } else {
        await createOrderLine({ orderId, ...lineForm });
        toast.success('Order line added');
      }
      setShowLineModal(false);
      setEditingLine(null);
      setLineForm({
        variantId: '',
        sku: '',
        name: '',
        quantity: 1,
        unitPrice: 0,
        discountAmount: 0,
        taxRate: 0,
        taxAmount: 0,
        lineTotal: 0,
        costPrice: 0,
        warehouseId: '',
        fulfillmentStatus: 'pending',
        notes: ''
      });
      loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to save order line');
    }
  }

  async function onSaveAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId || !addressForm.addressLine1 || !addressForm.city || !addressForm.postalCode) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      if (editingAddress) {
        await updateOrderAddress(editingAddress.id, addressForm);
        toast.success('Address updated');
      } else {
        await createOrderAddress({ orderId, ...addressForm });
        toast.success('Address added');
      }
      setShowAddressModal(false);
      setEditingAddress(null);
      setAddressForm({
        addressType: 'shipping',
        firstName: '',
        lastName: '',
        company: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        stateProvince: '',
        postalCode: '',
        countryCode: 'GB',
        phone: '',
        email: ''
      });
      loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to save address');
    }
  }

  async function onSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId || !noteForm.note) {
      toast.error('Please enter a note');
      return;
    }
    try {
      if (editingNote) {
        await updateOrderNote(editingNote.id, noteForm);
        toast.success('Note updated');
      } else {
        await createOrderNote({ orderId, ...noteForm });
        toast.success('Note added');
      }
      setShowNoteModal(false);
      setEditingNote(null);
      setNoteForm({
        noteType: 'internal',
        note: '',
        isCustomerVisible: false
      });
      loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to save note');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      if (confirmDel.type === 'line') {
        await deleteOrderLine(confirmDel.id);
        toast.success('Order line deleted');
      } else if (confirmDel.type === 'address') {
        await deleteOrderAddress(confirmDel.id);
        toast.success('Address deleted');
      } else if (confirmDel.type === 'note') {
        await deleteOrderNote(confirmDel.id);
        toast.success('Note deleted');
      }
      setConfirmDel(null);
      loadData();
    } catch (e: any) {
      toast.error('Failed to delete');
    }
  }

  async function onShipWithDhl(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId) return;
    setDhlBusy(true);
    try {
      const res = await createDhlShipment({
        orderId,
        organizationId: order?.organization?.id || session?.user?.organizationId,
        weightKg: Number(dhlForm.weightKg) || 1,
        pieces: Number(dhlForm.pieces) || 1,
        lengthCm: Number(dhlForm.lengthCm) || undefined,
        widthCm: Number(dhlForm.widthCm) || undefined,
        heightCm: Number(dhlForm.heightCm) || undefined,
        productCode: dhlForm.productCode || 'N',
        description: dhlForm.description || undefined
      });
      toast.success(`DHL shipment created · ${res.data?.trackingNumber || 'OK'}`);
      setShowDhlModal(false);
      if (res.data?.labelUrl) window.open(res.data.labelUrl, '_blank');
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'DHL ship failed');
    } finally {
      setDhlBusy(false);
    }
  }

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Orders · Order Detail" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">Loading...</div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!hasAccess || !order) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Orders · Order Detail" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Order Not Found</h2>
                <p className="text-muted-foreground">The order you're looking for doesn't exist.</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const total = lines.reduce((sum, line) => sum + parseFloat(String(line.lineTotal || '0')), 0);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title={`Orders · ${order.orderNumber}`} />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="w-full space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => router.push('/orders/orders')}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Orders
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setDhlForm((f) => ({ ...f, description: `Order ${order.orderNumber}` }));
                    setShowDhlModal(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  <Truck className="h-4 w-4" />
                  Ship with DHL
                </button>
                {invoiceId ? (
                  <Link
                    href={`/finance/invoices/${invoiceId}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
                  >
                    <Receipt className="h-4 w-4" />
                    View Invoice
                  </Link>
                ) : (
                  <button
                    onClick={() => void onGenerateInvoice()}
                    disabled={invoiceBusy}
                    className="inline-flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand/20 disabled:opacity-50"
                  >
                    {invoiceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                    Generate Invoice
                  </button>
                )}
              </div>
            </div>

            {/* DHL shipments */}
            {dhlShipments.length > 0 && (
              <div className="bg-card rounded-lg border border-border p-6 space-y-3">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  DHL shipping
                </h2>
                {dhlShipments.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-3 text-sm">
                    <div>
                      <div className="font-medium">{s.trackingNumber || 'No tracking yet'}</div>
                      <div className="text-muted-foreground">
                        {s.status}
                        {s.carrierStatus ? ` · ${s.carrierStatus}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="px-2 py-1 border rounded"
                        onClick={async () => {
                          try {
                            const res = await getDhlShipmentLabel(s.id);
                            if (res.data?.labelUrl) window.open(res.data.labelUrl, '_blank');
                            else toast.error('No label URL');
                            loadData();
                          } catch (e: any) {
                            toast.error(e?.response?.data?.error?.message || 'Label failed');
                          }
                        }}
                      >
                        Print label
                      </button>
                      <button
                        className="px-2 py-1 border rounded"
                        onClick={async () => {
                          try {
                            const res = await trackDhlShipment({ shipmentId: s.id });
                            toast.success(res.data?.carrierStatus || 'Tracked');
                            if (res.data?.trackingUrl) window.open(res.data.trackingUrl, '_blank');
                            loadData();
                          } catch (e: any) {
                            toast.error(e?.response?.data?.error?.message || 'Track failed');
                          }
                        }}
                      >
                        Track
                      </button>
                      {s.status !== 'cancelled' && (
                        <button
                          className="px-2 py-1 border rounded text-red-700"
                          onClick={async () => {
                            if (!confirm('Cancel this DHL shipment?')) return;
                            try {
                              await cancelDhlShipment(s.id);
                              toast.success('Cancelled');
                              loadData();
                            } catch (e: any) {
                              toast.error(e?.response?.data?.error?.message || 'Cancel failed');
                            }
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Order Info */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Order Number</h3>
                  <p className="text-lg font-semibold">{order.orderNumber}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Channel</h3>
                  <p className="text-lg font-semibold capitalize">{order.channel || '—'}</p>
                  {order.channelConnection?.name && (
                    <p className="text-sm text-muted-foreground">{order.channelConnection.name}</p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Status</h3>
                  <p className="text-lg font-semibold capitalize">{order.status}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Customer</h3>
                  <p className="text-lg">{order.customer?.companyName || order.customerEmail || '-'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Total</h3>
                  <p className="text-lg font-semibold">{order.currency || 'GBP'} {parseFloat(String(order.total || '0')).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Date</h3>
                  <p className="text-lg">{new Date(order.orderDate).toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            {/* Order Lines */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Order Lines ({lines.length})
                </h2>
                <button
                  onClick={() => {
                    setEditingLine(null);
                    setLineForm({
                      variantId: '',
                      sku: '',
                      name: '',
                      quantity: 1,
                      unitPrice: 0,
                      discountAmount: 0,
                      taxRate: 0,
                      taxAmount: 0,
                      lineTotal: 0,
                      costPrice: 0,
                      warehouseId: '',
                      fulfillmentStatus: 'pending',
                      notes: ''
                    });
                    setShowLineModal(true);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-brand text-white rounded hover:bg-brand-600 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  Add Line
                </button>
              </div>
              {lines.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No order lines</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between p-3 bg-muted/50 rounded border">
                      <div className="flex-1">
                        <p className="font-medium">{line.name} ({line.sku})</p>
                        <p className="text-sm text-muted-foreground">
                          Qty: {line.quantity} × {parseFloat(String(line.unitPrice || '0')).toLocaleString('en-GB', { minimumFractionDigits: 2 })} = {parseFloat(String(line.lineTotal || '0')).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingLine(line);
                            setLineForm({
                              variantId: line.variant?.id || '',
                              sku: line.sku || '',
                              name: line.name || '',
                              quantity: line.quantity || 1,
                              unitPrice: parseFloat(String(line.unitPrice || '0')),
                              discountAmount: parseFloat(String(line.discountAmount || '0')),
                              taxRate: parseFloat(String(line.taxRate || '0')),
                              taxAmount: parseFloat(String(line.taxAmount || '0')),
                              lineTotal: parseFloat(String(line.lineTotal || '0')),
                              costPrice: parseFloat(String(line.costPrice || '0')),
                              warehouseId: line.warehouse?.id || '',
                              fulfillmentStatus: (line.fulfillmentStatus || 'pending') as any,
                              notes: line.notes || ''
                            });
                            setShowLineModal(true);
                          }}
                          className="p-1 hover:bg-muted rounded"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDel({ type: 'line', id: line.id })}
                          className="p-1 hover:bg-muted rounded text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Addresses */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Addresses ({addresses.length})
                </h2>
                <button
                  onClick={() => {
                    setEditingAddress(null);
                    setAddressForm({
                      addressType: 'shipping',
                      firstName: '',
                      lastName: '',
                      company: '',
                      addressLine1: '',
                      addressLine2: '',
                      city: '',
                      stateProvince: '',
                      postalCode: '',
                      countryCode: 'GB',
                      phone: '',
                      email: ''
                    });
                    setShowAddressModal(true);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-brand text-white rounded hover:bg-brand-600 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  Add Address
                </button>
              </div>
              {addresses.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No addresses</p>
              ) : (
                <div className="space-y-3">
                  {addresses.map((addr) => (
                    <div key={addr.id} className="p-3 bg-muted/50 rounded border">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium capitalize">{addr.addressType} Address</p>
                          <p className="text-sm">{addr.addressLine1}</p>
                          {addr.addressLine2 && <p className="text-sm">{addr.addressLine2}</p>}
                          <p className="text-sm">{addr.city}, {addr.stateProvince} {addr.postalCode}</p>
                          <p className="text-sm">{addr.countryCode}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingAddress(addr);
                              setAddressForm({
                                addressType: addr.addressType,
                                firstName: addr.firstName || '',
                                lastName: addr.lastName || '',
                                company: addr.company || '',
                                addressLine1: addr.addressLine1 || '',
                                addressLine2: addr.addressLine2 || '',
                                city: addr.city || '',
                                stateProvince: addr.stateProvince || '',
                                postalCode: addr.postalCode || '',
                                countryCode: addr.countryCode || 'GB',
                                phone: addr.phone || '',
                                email: addr.email || ''
                              });
                              setShowAddressModal(true);
                            }}
                            className="p-1 hover:bg-muted rounded"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDel({ type: 'address', id: addr.id })}
                            className="p-1 hover:bg-muted rounded text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="bg-card rounded-lg border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Notes ({notes.length})
                </h2>
                <button
                  onClick={() => {
                    setEditingNote(null);
                    setNoteForm({
                      noteType: 'internal',
                      note: '',
                      isCustomerVisible: false
                    });
                    setShowNoteModal(true);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-brand text-white rounded hover:bg-brand-600 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  Add Note
                </button>
              </div>
              {notes.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No notes</p>
              ) : (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div key={note.id} className="p-3 bg-muted/50 rounded border">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium capitalize">{note.noteType}</span>
                            {note.isCustomerVisible && <span className="text-xs text-muted-foreground">(Customer Visible)</span>}
                            <span className="text-xs text-muted-foreground">
                              {new Date(note.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingNote(note);
                              setNoteForm({
                                noteType: note.noteType,
                                note: note.note || '',
                                isCustomerVisible: note.isCustomerVisible || false
                              });
                              setShowNoteModal(true);
                            }}
                            className="p-1 hover:bg-muted rounded"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDel({ type: 'note', id: note.id })}
                            className="p-1 hover:bg-muted rounded text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Line Modal */}
      {showLineModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingLine ? 'Edit' : 'Add'} Order Line</h3>
              <button onClick={() => { setShowLineModal(false); setEditingLine(null); }} className="p-1 hover:bg-muted rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={onSaveLine} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Variant *</label>
                  <select
                    value={lineForm.variantId}
                    onChange={e => {
                      const variant = variants.find(v => v.id === e.target.value);
                      setLineForm(prev => ({
                        ...prev,
                        variantId: e.target.value,
                        sku: variant?.variantSku || '',
                        name: variant?.name || ''
                      }));
                    }}
                    className="select"
                    required
                  >
                    <option value="">Select variant...</option>
                    {variants.map(v => (
                      <option key={v.id} value={v.id}>{v.variantSku} - {v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">SKU *</label>
                  <input
                    type="text"
                    value={lineForm.sku}
                    onChange={e => setLineForm(prev => ({ ...prev, sku: e.target.value }))}
                    className="input"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1.5">Name *</label>
                  <input
                    type="text"
                    value={lineForm.name}
                    onChange={e => setLineForm(prev => ({ ...prev, name: e.target.value }))}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Quantity *</label>
                  <input
                    type="number"
                    value={lineForm.quantity}
                    onChange={e => {
                      const qty = parseInt(e.target.value) || 0;
                      const total = (qty * lineForm.unitPrice) - lineForm.discountAmount + lineForm.taxAmount;
                      setLineForm(prev => ({ ...prev, quantity: qty, lineTotal: total }));
                    }}
                    className="input"
                    required
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Unit Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={lineForm.unitPrice}
                    onChange={e => {
                      const price = parseFloat(e.target.value) || 0;
                      const total = (lineForm.quantity * price) - lineForm.discountAmount + lineForm.taxAmount;
                      setLineForm(prev => ({ ...prev, unitPrice: price, lineTotal: total }));
                    }}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Line Total *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={lineForm.lineTotal}
                    onChange={e => setLineForm(prev => ({ ...prev, lineTotal: parseFloat(e.target.value) || 0 }))}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Warehouse</label>
                  <select
                    value={lineForm.warehouseId}
                    onChange={e => setLineForm(prev => ({ ...prev, warehouseId: e.target.value }))}
                    className="select"
                  >
                    <option value="">Select warehouse...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Fulfillment Status</label>
                  <select
                    value={lineForm.fulfillmentStatus}
                    onChange={e => setLineForm(prev => ({ ...prev, fulfillmentStatus: e.target.value as any }))}
                    className="select"
                  >
                    <option value="pending">Pending</option>
                    <option value="allocated">Allocated</option>
                    <option value="picked">Picked</option>
                    <option value="packed">Packed</option>
                    <option value="shipped">Shipped</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <button type="submit" className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600">
                  {editingLine ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={() => { setShowLineModal(false); setEditingLine(null); }} className="px-4 py-2 bg-muted rounded hover:bg-muted/80">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Address Modal */}
      {showAddressModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingAddress ? 'Edit' : 'Add'} Address</h3>
              <button onClick={() => { setShowAddressModal(false); setEditingAddress(null); }} className="p-1 hover:bg-muted rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={onSaveAddress} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Address Type *</label>
                  <select
                    value={addressForm.addressType}
                    onChange={e => setAddressForm(prev => ({ ...prev, addressType: e.target.value as any }))}
                    className="select"
                    required
                  >
                    <option value="shipping">Shipping</option>
                    <option value="billing">Billing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">First Name</label>
                  <input
                    type="text"
                    value={addressForm.firstName}
                    onChange={e => setAddressForm(prev => ({ ...prev, firstName: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Last Name</label>
                  <input
                    type="text"
                    value={addressForm.lastName}
                    onChange={e => setAddressForm(prev => ({ ...prev, lastName: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Company</label>
                  <input
                    type="text"
                    value={addressForm.company}
                    onChange={e => setAddressForm(prev => ({ ...prev, company: e.target.value }))}
                    className="input"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1.5">Address Line 1 *</label>
                  <input
                    type="text"
                    value={addressForm.addressLine1}
                    onChange={e => setAddressForm(prev => ({ ...prev, addressLine1: e.target.value }))}
                    className="input"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1.5">Address Line 2</label>
                  <input
                    type="text"
                    value={addressForm.addressLine2}
                    onChange={e => setAddressForm(prev => ({ ...prev, addressLine2: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">City *</label>
                  <input
                    type="text"
                    value={addressForm.city}
                    onChange={e => setAddressForm(prev => ({ ...prev, city: e.target.value }))}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">State/Province</label>
                  <input
                    type="text"
                    value={addressForm.stateProvince}
                    onChange={e => setAddressForm(prev => ({ ...prev, stateProvince: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Postal Code *</label>
                  <input
                    type="text"
                    value={addressForm.postalCode}
                    onChange={e => setAddressForm(prev => ({ ...prev, postalCode: e.target.value }))}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Country Code *</label>
                  <input
                    type="text"
                    value={addressForm.countryCode}
                    onChange={e => setAddressForm(prev => ({ ...prev, countryCode: e.target.value.toUpperCase() }))}
                    className="input"
                    maxLength={2}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Phone</label>
                  <input
                    type="text"
                    value={addressForm.phone}
                    onChange={e => setAddressForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email</label>
                  <input
                    type="email"
                    value={addressForm.email}
                    onChange={e => setAddressForm(prev => ({ ...prev, email: e.target.value }))}
                    className="input"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <button type="submit" className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600">
                  {editingAddress ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={() => { setShowAddressModal(false); setEditingAddress(null); }} className="px-4 py-2 bg-muted rounded hover:bg-muted/80">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingNote ? 'Edit' : 'Add'} Note</h3>
              <button onClick={() => { setShowNoteModal(false); setEditingNote(null); }} className="p-1 hover:bg-muted rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={onSaveNote} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Note Type</label>
                <select
                  value={noteForm.noteType}
                  onChange={e => setNoteForm(prev => ({ ...prev, noteType: e.target.value as any }))}
                  className="select"
                >
                  <option value="internal">Internal</option>
                  <option value="customer">Customer</option>
                  <option value="system">System</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Note *</label>
                <textarea
                  value={noteForm.note}
                  onChange={e => setNoteForm(prev => ({ ...prev, note: e.target.value }))}
                  className="input"
                  rows={5}
                  required
                />
              </div>
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={noteForm.isCustomerVisible}
                    onChange={e => setNoteForm(prev => ({ ...prev, isCustomerVisible: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">Customer Visible</span>
                </label>
              </div>
              <div className="flex gap-2 pt-4">
                <button type="submit" className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600">
                  {editingNote ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={() => { setShowNoteModal(false); setEditingNote(null); }} className="px-4 py-2 bg-muted rounded hover:bg-muted/80">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDhlModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-card shadow-2xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Truck className="h-5 w-5" /> Ship with DHL
              </h3>
              <button type="button" onClick={() => setShowDhlModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={onShipWithDhl} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Weight (kg) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input"
                    value={dhlForm.weightKg}
                    onChange={(e) => setDhlForm((f) => ({ ...f, weightKg: Number(e.target.value) }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Pieces</label>
                  <input
                    type="number"
                    min="1"
                    className="input"
                    value={dhlForm.pieces}
                    onChange={(e) => setDhlForm((f) => ({ ...f, pieces: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">L (cm)</label>
                  <input
                    type="number"
                    className="input"
                    value={dhlForm.lengthCm}
                    onChange={(e) => setDhlForm((f) => ({ ...f, lengthCm: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">W (cm)</label>
                  <input
                    type="number"
                    className="input"
                    value={dhlForm.widthCm}
                    onChange={(e) => setDhlForm((f) => ({ ...f, widthCm: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">H (cm)</label>
                  <input
                    type="number"
                    className="input"
                    value={dhlForm.heightCm}
                    onChange={(e) => setDhlForm((f) => ({ ...f, heightCm: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Product code</label>
                  <input
                    type="text"
                    className="input"
                    value={dhlForm.productCode}
                    onChange={(e) => setDhlForm((f) => ({ ...f, productCode: e.target.value }))}
                    placeholder="N = Domestic Express"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contents description</label>
                <input
                  type="text"
                  className="input"
                  maxLength={70}
                  value={dhlForm.description}
                  onChange={(e) => setDhlForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Uses order shipping address and DHL_SHIPPER_* from API env. Real DHL errors are shown if create fails.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={dhlBusy}
                  className="px-4 py-2 bg-black text-white rounded disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {dhlBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                  Create shipment
                </button>
                <button type="button" onClick={() => setShowDhlModal(false)} className="px-4 py-2 bg-muted rounded">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl border border-border p-6">
            <h3 className="text-lg font-semibold mb-2">Delete {confirmDel.type === 'line' ? 'Order Line' : confirmDel.type === 'address' ? 'Address' : 'Note'}</h3>
            <p className="text-muted-foreground mb-4">Are you sure you want to delete this? This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={onDelete} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
                Delete
              </button>
              <button onClick={() => setConfirmDel(null)} className="px-4 py-2 bg-muted rounded hover:bg-muted/80">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

