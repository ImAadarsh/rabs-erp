'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import {
  listOrganizations,
  createOrganization,
  updateOrganization,
  createOrganizationWithLogo,
  getCurrentUser,
  listBusinessUnits,
  createBusinessUnit,
  updateBusinessUnit,
  deleteBusinessUnit,
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation
} from '@/lib/api';
import { toast } from 'sonner';
import { useSession } from '@/hooks/use-session';
import { Plus, Building2, Edit2, Save, X, Trash2, MapPin, Briefcase, ChevronDown, ChevronRight } from 'lucide-react';

// ISO 3166-1 alpha-2 country codes
const COUNTRY_CODES = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IE', name: 'Ireland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GR', name: 'Greece' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'HU', name: 'Hungary' },
  { code: 'RO', name: 'Romania' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'EE', name: 'Estonia' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'India' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'EG', name: 'Egypt' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'PE', name: 'Peru' },
  { code: 'TR', name: 'Turkey' },
  { code: 'RU', name: 'Russia' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'IL', name: 'Israel' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'AF', name: 'Afghanistan' },
].sort((a, b) => a.name.localeCompare(b.name));

type Organization = {
  id: string;
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  status: 'active' | 'inactive' | 'suspended';
  createdAt?: string;
  updatedAt?: string;
};

type BusinessUnit = {
  id: string;
  code: string;
  name: string;
  type: 'wholesale' | 'retail' | 'ecommerce' | '3pl' | 'food_beverage' | 'other';
  status: 'active' | 'inactive' | 'suspended';
  settings?: Record<string, any> | null;
  organization?: Organization;
  parent?: BusinessUnit | null;
  locations?: Location[];
};

type Location = {
  id: string;
  code: string;
  name: string;
  type: 'warehouse' | 'store' | 'office' | 'distribution_center' | 'other';
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  postalCode?: string | null;
  countryCode: string;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string;
  status: 'active' | 'inactive';
  isDefault: boolean;
  businessUnit?: BusinessUnit;
};

export default function OrganizationsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [expandedBUs, setExpandedBUs] = useState<Set<string>>(new Set());
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showCreateBU, setShowCreateBU] = useState(false);
  const [showCreateLocation, setShowCreateLocation] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [editingBUId, setEditingBUId] = useState<string | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [orgFormData, setOrgFormData] = useState<Partial<Organization>>({});
  const [buFormData, setBuFormData] = useState<Partial<BusinessUnit & { organizationId: string; parentId?: string | null }>>({});
  const [locationFormData, setLocationFormData] = useState<Partial<Location & { businessUnitId: string }>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    loadData();
  }, [hydrated, router, session?.accessToken]);

  async function loadData() {
    try {
      const [orgsRes, userRes] = await Promise.all([
        listOrganizations(),
        getCurrentUser().catch(() => null)
      ]);
      setOrganizations(orgsRes.data || []);
      if (userRes?.data?.roles) {
        setIsSuperAdmin(userRes.data.roles.includes('SUPER_ADMIN'));
      }
      
      // Load business units and locations
      const busRes = await listBusinessUnits();
      setBusinessUnits(busRes.data || []);
      
      const locsRes = await listLocations();
      setLocations(locsRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load data');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function toggleOrg(orgId: string) {
    const newExpanded = new Set(expandedOrgs);
    if (newExpanded.has(orgId)) {
      newExpanded.delete(orgId);
    } else {
      newExpanded.add(orgId);
    }
    setExpandedOrgs(newExpanded);
  }

  function toggleBU(buId: string) {
    const newExpanded = new Set(expandedBUs);
    if (newExpanded.has(buId)) {
      newExpanded.delete(buId);
    } else {
      newExpanded.add(buId);
    }
    setExpandedBUs(newExpanded);
  }

  function getBusinessUnitsForOrg(orgId: string): BusinessUnit[] {
    return businessUnits.filter(bu => bu.organization?.id === orgId);
  }

  function getLocationsForBU(buId: string): Location[] {
    return locations.filter(loc => loc.businessUnit?.id === buId);
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Invalid file type. Please upload an image (JPEG, PNG, WebP, or SVG)');
        return;
      }
      
      // Validate file size (2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast.error('File size must be less than 2MB');
        return;
      }

      setLogoFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleSaveOrg(id: string | null) {
    try {
      if (id) {
        const res = await updateOrganization(id, orgFormData, logoFile || undefined);
        toast.success('Organization updated');
        setOrganizations(orgs => orgs.map(o => o.id === id ? res.data : o));
      } else {
        const res = await createOrganization(orgFormData as any, logoFile || undefined);
        setOrganizations([res.data, ...organizations]);
        toast.success('Organization created');
        setShowCreateOrg(false);
      }
      setOrgFormData({});
        setLogoFile(null);
        setLogoPreview(null);
      setEditingOrgId(null);
      await loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Operation failed');
    }
  }

  async function handleSaveBU(id: string | null) {
    try {
      if (id) {
        const res = await updateBusinessUnit(id, buFormData);
        toast.success('Business unit updated');
        setBusinessUnits(bus => bus.map(bu => bu.id === id ? res.data : bu));
      } else {
        if (!buFormData.organizationId) {
          toast.error('Organization is required');
          return;
        }
        const res = await createBusinessUnit({
          organizationId: buFormData.organizationId,
          code: buFormData.code!,
          name: buFormData.name!,
          type: buFormData.type!,
          status: buFormData.status || 'active',
          parentId: buFormData.parentId || null,
          settings: buFormData.settings || null
        });
        setBusinessUnits([res.data, ...businessUnits]);
        toast.success('Business unit created');
        setShowCreateBU(false);
      }
      setBuFormData({});
      setEditingBUId(null);
      await loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Operation failed');
    }
  }

  async function handleSaveLocation(id: string | null) {
    try {
      if (id) {
        const res = await updateLocation(id, locationFormData);
        toast.success('Location updated');
        setLocations(locs => locs.map(loc => loc.id === id ? res.data : loc));
      } else {
        if (!locationFormData.businessUnitId) {
          toast.error('Business unit is required');
          return;
        }
        const res = await createLocation({
          businessUnitId: locationFormData.businessUnitId,
          code: locationFormData.code!,
          name: locationFormData.name!,
          type: locationFormData.type!,
          addressLine1: locationFormData.addressLine1 || null,
          addressLine2: locationFormData.addressLine2 || null,
          city: locationFormData.city || null,
          stateProvince: locationFormData.stateProvince || null,
          postalCode: locationFormData.postalCode || null,
          countryCode: locationFormData.countryCode || 'GB',
          latitude: locationFormData.latitude || null,
          longitude: locationFormData.longitude || null,
          phone: locationFormData.phone || null,
          email: locationFormData.email || null,
          timezone: locationFormData.timezone || 'Europe/London',
          isDefault: locationFormData.isDefault || false,
          status: locationFormData.status || 'active'
        });
        setLocations([res.data, ...locations]);
        toast.success('Location created');
        setShowCreateLocation(false);
      }
      setLocationFormData({});
      setEditingLocationId(null);
      await loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Operation failed');
    }
  }

  async function handleDeleteBU(id: string) {
    if (!confirm('Are you sure you want to delete this business unit?')) return;
    try {
      await deleteBusinessUnit(id);
      setBusinessUnits(bus => bus.filter(bu => bu.id !== id));
      toast.success('Business unit deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
    }
  }

  async function handleDeleteLocation(id: string) {
    if (!confirm('Are you sure you want to delete this location?')) return;
    try {
      await deleteLocation(id);
      setLocations(locs => locs.filter(loc => loc.id !== id));
      toast.success('Location deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
    }
  }

  function canEditOrg(org: Organization): boolean {
    if (isSuperAdmin) return true;
    return session?.user?.organizationId === org.id;
  }

  function canCreateBU(orgId: string): boolean {
    if (isSuperAdmin) return true;
    return session?.user?.organizationId === orgId;
  }

  if (!hydrated || !session?.accessToken) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header
          title="IAM · Manage Organization"
          actions={
            isSuperAdmin
              ? [{ label: 'New Organization', onClick: () => { 
                  setShowCreateOrg(true); 
                  setOrgFormData({ status: 'active' }); 
                  setLogoFile(null);
                  setLogoPreview(null);
                }, icon: <Plus size={16} /> }]
              : []
          }
        />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Organizations & Structure</h2>
              <p className="text-muted-foreground">
                Manage organizations, business units, and locations
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center rounded-2xl border border-border bg-card/50 animate-pulse">
              Loading...
            </div>
          ) : organizations.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-border bg-card">
              <Building2 size={48} className="mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No organizations found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {organizations.map((org) => {
                const orgBUs = getBusinessUnitsForOrg(org.id);
                const isExpanded = expandedOrgs.has(org.id);
                const canEdit = canEditOrg(org);
                const canCreate = canCreateBU(org.id);

                return (
                  <div key={org.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                    {/* Organization Header */}
                    <div className="p-6">
                      {editingOrgId === org.id ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Name *</label>
                          <input
                            className="input"
                                value={orgFormData.name || ''}
                                onChange={(e) => setOrgFormData({ ...orgFormData, name: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Legal Name</label>
                          <input
                            className="input"
                                value={orgFormData.legalName || ''}
                                onChange={(e) => setOrgFormData({ ...orgFormData, legalName: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Tax ID</label>
                          <input
                            className="input"
                                value={orgFormData.taxId || ''}
                                onChange={(e) => setOrgFormData({ ...orgFormData, taxId: e.target.value })}
                          />
                        </div>
                        <div>
                              <label className="block text-sm font-medium mb-1.5">Status</label>
                              <select
                                className="select"
                                value={orgFormData.status || 'active'}
                                onChange={(e) => setOrgFormData({ ...orgFormData, status: e.target.value as any })}
                              >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                                <option value="suspended">Suspended</option>
                              </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium mb-1.5">Logo</label>
                          <div className="flex items-center gap-4">
                                {(logoPreview || orgFormData.logoUrl) && (
                              <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted">
                                <img
                                      src={logoPreview || orgFormData.logoUrl || ''}
                                  alt="Logo preview"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex-1">
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                                onChange={handleLogoChange}
                                className="input"
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                Upload a logo (JPEG, PNG, WebP, or SVG). Max 2MB.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-4 border-t border-border">
                            <button className="btn btn-outline" onClick={() => { 
                              setEditingOrgId(null); 
                              setOrgFormData({}); 
                              setLogoFile(null);
                              setLogoPreview(null);
                            }}>
                              <X size={16} className="mr-2" /> Cancel
                        </button>
                            <button className="btn btn-primary" onClick={() => handleSaveOrg(org.id)}>
                              <Save size={16} className="mr-2" /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1">
                      {org.logoUrl && (
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted flex-shrink-0">
                                <img src={org.logoUrl} alt={`${org.name} logo`} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold">{org.name}</h3>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            org.status === 'active' ? 'bg-green-500/20 text-green-500' :
                            org.status === 'inactive' ? 'bg-gray-500/20 text-gray-500' :
                            'bg-red-500/20 text-red-500'
                          }`}>
                            {org.status}
                          </span>
                        </div>
                              {org.legalName && <p className="text-sm text-muted-foreground">{org.legalName}</p>}
                              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                                <span>{orgBUs.length} Business Unit{orgBUs.length !== 1 ? 's' : ''}</span>
                              </div>
                        </div>
                      </div>
                          <div className="flex items-center gap-2">
                            {canEdit && (
                              <button className="btn btn-outline btn-sm" onClick={() => { 
                                setEditingOrgId(org.id); 
                                setOrgFormData(org); 
                                setLogoFile(null);
                                setLogoPreview(org.logoUrl || null);
                              }}>
                                <Edit2 size={14} className="mr-2" /> Edit
                              </button>
                            )}
                        <button
                          className="btn btn-outline btn-sm"
                              onClick={() => toggleOrg(org.id)}
                        >
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Business Units & Locations */}
                    {isExpanded && (
                      <div className="border-t border-border bg-muted/30 p-6 space-y-4">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-semibold flex items-center gap-2">
                            <Briefcase size={16} /> Business Units
                          </h4>
                          {canCreate && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => {
                                setShowCreateBU(true);
                                setBuFormData({ organizationId: org.id, status: 'active', type: 'other' });
                              }}
                            >
                              <Plus size={14} className="mr-2" /> New Business Unit
                            </button>
                          )}
                        </div>

                        {orgBUs.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No business units</p>
                        ) : (
                          <div className="space-y-3">
                            {orgBUs.map((bu) => {
                              const buLocations = getLocationsForBU(bu.id);
                              const isBUExpanded = expandedBUs.has(bu.id);

                              return (
                                <div key={bu.id} className="rounded-lg border border-border bg-card p-4">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                      {editingBUId === bu.id ? (
                                        <div className="space-y-3">
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                              <label className="block text-xs font-medium mb-1">Code *</label>
                                              <input className="input input-sm" value={buFormData.code || ''} onChange={(e) => setBuFormData({ ...buFormData, code: e.target.value })} required />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium mb-1">Name *</label>
                                              <input className="input input-sm" value={buFormData.name || ''} onChange={(e) => setBuFormData({ ...buFormData, name: e.target.value })} required />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium mb-1">Type *</label>
                                              <select className="select select-sm" value={buFormData.type || 'other'} onChange={(e) => setBuFormData({ ...buFormData, type: e.target.value as any })}>
                                                <option value="wholesale">Wholesale</option>
                                                <option value="retail">Retail</option>
                                                <option value="ecommerce">E-commerce</option>
                                                <option value="3pl">3PL</option>
                                                <option value="food_beverage">Food & Beverage</option>
                                                <option value="other">Other</option>
                                              </select>
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium mb-1">Status</label>
                                              <select className="select select-sm" value={buFormData.status || 'active'} onChange={(e) => setBuFormData({ ...buFormData, status: e.target.value as any })}>
                                                <option value="active">Active</option>
                                                <option value="inactive">Inactive</option>
                                                <option value="suspended">Suspended</option>
                                              </select>
                                            </div>
                                          </div>
                                          <div className="flex justify-end gap-2">
                                            <button className="btn btn-outline btn-xs" onClick={() => { setEditingBUId(null); setBuFormData({}); }}>Cancel</button>
                                            <button className="btn btn-primary btn-xs" onClick={() => handleSaveBU(bu.id)}>Save</button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div>
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium">{bu.code} - {bu.name}</span>
                                            <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">{bu.type}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded ${
                                              bu.status === 'active' ? 'bg-green-500/20 text-green-500' : 'bg-gray-500/20 text-gray-500'
                                            }`}>
                                              {bu.status}
                                            </span>
                                          </div>
                                          <p className="text-xs text-muted-foreground">{buLocations.length} Location{buLocations.length !== 1 ? 's' : ''}</p>
                                        </div>
                                      )}
                                    </div>
                                    {editingBUId !== bu.id && (
                                      <div className="flex items-center gap-2">
                                        {canCreate && (
                                          <>
                                            <button className="btn btn-outline btn-xs" onClick={() => { setEditingBUId(bu.id); setBuFormData(bu); }}>
                                              <Edit2 size={12} />
                                            </button>
                                            <button className="btn btn-outline btn-xs text-destructive" onClick={() => handleDeleteBU(bu.id)}>
                                              <Trash2 size={12} />
                                            </button>
                                          </>
                                        )}
                                        <button className="btn btn-outline btn-xs" onClick={() => toggleBU(bu.id)}>
                                          {isBUExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Locations */}
                                  {isBUExpanded && (
                                    <div className="mt-3 ml-4 space-y-2 border-l-2 border-border pl-4">
                                      <div className="flex items-center justify-between mb-2">
                                        <h5 className="text-xs font-medium flex items-center gap-1">
                                          <MapPin size={12} /> Locations
                                        </h5>
                                        {canCreate && (
                                          <button
                                            className="btn btn-outline btn-xs"
                                            onClick={() => {
                                              setShowCreateLocation(true);
                                              setLocationFormData({ businessUnitId: bu.id, status: 'active', type: 'warehouse', countryCode: 'GB' });
                                            }}
                                          >
                                            <Plus size={12} className="mr-1" /> New Location
                                          </button>
                  )}
                </div>
                                      {buLocations.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">No locations</p>
                                      ) : (
                                        buLocations.map((loc) => (
                                          <div key={loc.id} className="rounded border border-border bg-muted/50 p-3">
                                            {editingLocationId === loc.id ? (
                                              <div className="space-y-2">
                                                <div className="grid grid-cols-2 gap-2">
                                                  <div>
                                                    <label className="block text-xs font-medium mb-1">Code *</label>
                                                    <input className="input input-sm" value={locationFormData.code || ''} onChange={(e) => setLocationFormData({ ...locationFormData, code: e.target.value })} required />
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-medium mb-1">Name *</label>
                                                    <input className="input input-sm" value={locationFormData.name || ''} onChange={(e) => setLocationFormData({ ...locationFormData, name: e.target.value })} required />
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-medium mb-1">Type *</label>
                                                    <select className="select select-sm" value={locationFormData.type || 'warehouse'} onChange={(e) => setLocationFormData({ ...locationFormData, type: e.target.value as any })}>
                                                      <option value="warehouse">Warehouse</option>
                                                      <option value="store">Store</option>
                                                      <option value="office">Office</option>
                                                      <option value="distribution_center">Distribution Center</option>
                                                      <option value="other">Other</option>
                                                    </select>
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-medium mb-1">Country</label>
                                                    <select className="select select-sm" value={locationFormData.countryCode || 'GB'} onChange={(e) => setLocationFormData({ ...locationFormData, countryCode: e.target.value })}>
                                                      {COUNTRY_CODES.map((country) => (
                                                        <option key={country.code} value={country.code}>
                                                          {country.code} - {country.name}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  </div>
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                  <button className="btn btn-outline btn-xs" onClick={() => { setEditingLocationId(null); setLocationFormData({}); }}>Cancel</button>
                                                  <button className="btn btn-primary btn-xs" onClick={() => handleSaveLocation(loc.id)}>Save</button>
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="flex items-start justify-between">
                                                <div>
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium">{loc.code} - {loc.name}</span>
                                                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">{loc.type}</span>
                                                    {loc.isDefault && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500">Default</span>}
                                                  </div>
                                                  {loc.city && <p className="text-xs text-muted-foreground mt-1">{loc.city}, {loc.countryCode}</p>}
                                                </div>
                                                {canCreate && (
                                                  <div className="flex items-center gap-1">
                                                    <button className="btn btn-outline btn-xs" onClick={() => { setEditingLocationId(loc.id); setLocationFormData(loc); }}>
                                                      <Edit2 size={12} />
                                                    </button>
                                                    <button className="btn btn-outline btn-xs text-destructive" onClick={() => handleDeleteLocation(loc.id)}>
                                                      <Trash2 size={12} />
                                                    </button>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Create Organization Modal */}
          {showCreateOrg && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4">Create Organization</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Name *</label>
                      <input className="input" value={orgFormData.name || ''} onChange={(e) => setOrgFormData({ ...orgFormData, name: e.target.value })} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Status</label>
                      <select className="select" value={orgFormData.status || 'active'} onChange={(e) => setOrgFormData({ ...orgFormData, status: e.target.value as any })}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Logo</label>
                      <div className="flex items-center gap-4">
                        {logoPreview && (
                          <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted">
                            <img
                              src={logoPreview}
                              alt="Logo preview"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex-1">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/svg+xml"
                            onChange={handleLogoChange}
                            className="input"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Upload a logo (JPEG, PNG, WebP, or SVG). Max 2MB.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button className="btn btn-outline" onClick={() => { 
                      setShowCreateOrg(false); 
                      setOrgFormData({}); 
                      setLogoFile(null);
                      setLogoPreview(null);
                    }}>Cancel</button>
                    <button className="btn btn-primary" onClick={() => handleSaveOrg(null)}>Create Organization</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create Business Unit Modal */}
          {showCreateBU && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200">
                <h3 className="text-lg font-semibold mb-4">Create Business Unit</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Code *</label>
                      <input className="input" value={buFormData.code || ''} onChange={(e) => setBuFormData({ ...buFormData, code: e.target.value })} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Name *</label>
                      <input className="input" value={buFormData.name || ''} onChange={(e) => setBuFormData({ ...buFormData, name: e.target.value })} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Type *</label>
                      <select className="select" value={buFormData.type || 'other'} onChange={(e) => setBuFormData({ ...buFormData, type: e.target.value as any })}>
                        <option value="wholesale">Wholesale</option>
                        <option value="retail">Retail</option>
                        <option value="ecommerce">E-commerce</option>
                        <option value="3pl">3PL</option>
                        <option value="food_beverage">Food & Beverage</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Status</label>
                      <select className="select" value={buFormData.status || 'active'} onChange={(e) => setBuFormData({ ...buFormData, status: e.target.value as any })}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button className="btn btn-outline" onClick={() => { setShowCreateBU(false); setBuFormData({}); }}>Cancel</button>
                    <button className="btn btn-primary" onClick={() => handleSaveBU(null)}>Create Business Unit</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create Location Modal */}
          {showCreateLocation && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4">Create Location</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Code *</label>
                      <input className="input" value={locationFormData.code || ''} onChange={(e) => setLocationFormData({ ...locationFormData, code: e.target.value })} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Name *</label>
                      <input className="input" value={locationFormData.name || ''} onChange={(e) => setLocationFormData({ ...locationFormData, name: e.target.value })} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Type *</label>
                      <select className="select" value={locationFormData.type || 'warehouse'} onChange={(e) => setLocationFormData({ ...locationFormData, type: e.target.value as any })}>
                        <option value="warehouse">Warehouse</option>
                        <option value="store">Store</option>
                        <option value="office">Office</option>
                        <option value="distribution_center">Distribution Center</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Country *</label>
                      <select className="select" value={locationFormData.countryCode || 'GB'} onChange={(e) => setLocationFormData({ ...locationFormData, countryCode: e.target.value })} required>
                        {COUNTRY_CODES.map((country) => (
                          <option key={country.code} value={country.code}>
                            {country.code} - {country.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Address Line 1</label>
                      <input className="input" value={locationFormData.addressLine1 || ''} onChange={(e) => setLocationFormData({ ...locationFormData, addressLine1: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Address Line 2</label>
                      <input className="input" value={locationFormData.addressLine2 || ''} onChange={(e) => setLocationFormData({ ...locationFormData, addressLine2: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">City</label>
                      <input className="input" value={locationFormData.city || ''} onChange={(e) => setLocationFormData({ ...locationFormData, city: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Postal Code</label>
                      <input className="input" value={locationFormData.postalCode || ''} onChange={(e) => setLocationFormData({ ...locationFormData, postalCode: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Phone</label>
                      <input className="input" value={locationFormData.phone || ''} onChange={(e) => setLocationFormData({ ...locationFormData, phone: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Email</label>
                      <input className="input" type="email" value={locationFormData.email || ''} onChange={(e) => setLocationFormData({ ...locationFormData, email: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Status</label>
                      <select className="select" value={locationFormData.status || 'active'} onChange={(e) => setLocationFormData({ ...locationFormData, status: e.target.value as any })}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <input type="checkbox" id="isDefault" checked={locationFormData.isDefault || false} onChange={(e) => setLocationFormData({ ...locationFormData, isDefault: e.target.checked })} />
                      <label htmlFor="isDefault" className="text-sm font-medium">Set as default location</label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button className="btn btn-outline" onClick={() => { setShowCreateLocation(false); setLocationFormData({}); }}>Cancel</button>
                    <button className="btn btn-primary" onClick={() => handleSaveLocation(null)}>Create Location</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
