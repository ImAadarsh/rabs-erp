/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { clearSession, getSession, updateAccessToken } from '@/lib/auth';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

let interceptorsRegistered = false;
let isRefreshing = false;
let refreshWaiters: Array<(token: string | null) => void> = [];

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function isAuthEndpoint(url?: string) {
  if (!url) return false;
  return (
    url.includes('/api/iam/auth/login') ||
    url.includes('/api/iam/auth/refresh') ||
    url.includes('/api/iam/auth/google')
  );
}

function forceLogout() {
  clearSession();
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/login')) return;
  const next = `/login?reason=expired`;
  if (window.location.pathname + window.location.search !== next) {
    window.location.href = next;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const session = getSession();
  if (!session?.refreshToken) return null;
  try {
    const { data } = await axios.post(
      `${API_BASE}/api/iam/auth/refresh`,
      { refreshToken: session.refreshToken },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const accessToken = data?.accessToken as string | undefined;
    if (!accessToken) return null;
    updateAccessToken(accessToken);
    return accessToken;
  } catch {
    return null;
  }
}

function ensureInterceptors() {
  if (interceptorsRegistered) return;

  axios.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const status = error.response?.status;
      const original = error.config as RetryConfig | undefined;

      // Only handle expired / invalid access tokens — never nuke the session
      // on login failures or refresh failures (handled below).
      if (status !== 401 || !original || original._retry || isAuthEndpoint(original.url)) {
        return Promise.reject(error);
      }

      // No stored session → nothing to recover; just fail the request.
      if (!getSession()?.refreshToken) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshWaiters.push((token) => {
            if (!token) {
              reject(error);
              return;
            }
            original.headers = original.headers ?? {};
            original.headers.Authorization = `Bearer ${token}`;
            resolve(axios(original));
          });
        });
      }

      original._retry = true;
      isRefreshing = true;
      const token = await refreshAccessToken();
      isRefreshing = false;

      const waiters = refreshWaiters;
      refreshWaiters = [];
      waiters.forEach((cb) => cb(token));

      if (!token) {
        forceLogout();
        return Promise.reject(error);
      }

      original.headers = original.headers ?? {};
      original.headers.Authorization = `Bearer ${token}`;
      return axios(original);
    }
  );

  interceptorsRegistered = true;
}

ensureInterceptors();

export async function login(payload: { email: string; password: string }) {
  const { data } = await axios.post(`${API_BASE}/api/iam/auth/login`, payload);
  return data as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; firstName?: string; lastName?: string; organizationId: string; roles: string[] };
  };
}

export async function getGoogleAuthUrl() {
  const { data } = await axios.get(`${API_BASE}/api/iam/auth/google/url`);
  return data as { authUrl: string };
}

function authHeaders() {
  const s = getSession();
  // Never send "Bearer " with an empty token — that alone triggers a 401 logout loop.
  if (!s?.accessToken) return {};
  return { Authorization: `Bearer ${s.accessToken}` };
}

type PaginatedListResult<T = any> = {
  data: T[];
  pagination?: { page?: number; limit?: number; total?: number; totalPages?: number };
  /** Aggregates over the whole filtered set, independent of the current page. */
  summary?: {
    totalValue?: number;
    count?: number;
    totalInvoiced?: number;
    totalPaid?: number;
    totalOutstanding?: number;
    overdueCount?: number;
  };
};
type PaginatedQueryValue = string | number | boolean | undefined | null;
type PaginatedQueryParams = Record<string, PaginatedQueryValue> & { page?: number; limit?: number };

function appendPaginatedQueryParams(q: URLSearchParams, params?: PaginatedQueryParams) {
  if (!params) return;
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page' || key === 'limit') continue;
    if (value === undefined || value === null || value === '') continue;
    q.append(key, String(value));
  }
}

async function fetchAllPaginatedPages<T>(
  fetchPage: (page: number, limit: number) => Promise<PaginatedListResult<T>>,
  pageSize = 100
): Promise<PaginatedListResult<T>> {
  const all: T[] = [];
  let page = 1;
  let totalPages = 1;
  let total = 0;
  let summary: PaginatedListResult<T>['summary'];

  do {
    const res = await fetchPage(page, pageSize);
    all.push(...(res.data || []));
    totalPages = res.pagination?.totalPages ?? 1;
    total = res.pagination?.total ?? all.length;
    // Summary covers the whole filtered set, so the first page's copy is enough.
    if (page === 1) summary = res.summary;
    page++;
  } while (page <= totalPages);

  return {
    data: all,
    pagination: { page: 1, limit: all.length, total, totalPages: 1 },
    summary,
  };
}

/** Fetches all pages when page/limit are omitted; otherwise returns a single page. */
async function getPaginatedList<T = any>(
  path: string,
  params?: PaginatedQueryParams,
  pageSize = 100
): Promise<PaginatedListResult<T>> {
  const fetchPage = async (page: number, limit: number): Promise<PaginatedListResult<T>> => {
    const q = new URLSearchParams();
    appendPaginatedQueryParams(q, params);
    q.append('page', String(page));
    q.append('limit', String(limit));
    const query = q.toString() ? `?${q.toString()}` : '';
    const { data } = await axios.get(`${API_BASE}${path}${query}`, { headers: authHeaders() });
    return data;
  };

  if (params?.page != null || params?.limit != null) {
    return fetchPage(params.page ?? 1, params.limit ?? 50);
  }
  return fetchAllPaginatedPages(fetchPage, pageSize);
}

// USERS
export async function listUsers() {
  const { data } = await axios.get(`${API_BASE}/api/iam/users`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getUser(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/iam/users/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createUser(payload: { organizationId: string; email: string; username?: string; firstName?: string; lastName?: string; password?: string; roleId: string; businessUnitId?: string; locationId?: string; status?: string }) {
  const { data } = await axios.post(`${API_BASE}/api/iam/users`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateUser(id: string, payload: Partial<{ email: string; username: string | null; firstName: string | null; lastName: string | null; status: string }>) {
  const { data } = await axios.patch(`${API_BASE}/api/iam/users/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteUser(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/iam/users/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ROLES
export async function listRoles() {
  const { data } = await axios.get(`${API_BASE}/api/iam/roles`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function createRole(payload: { organizationId: string; name: string; code: string; permissions?: any }) {
  const { data } = await axios.post(`${API_BASE}/api/iam/roles`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateRole(id: string, payload: { name?: string; code?: string; permissions?: any }) {
  const { data } = await axios.patch(`${API_BASE}/api/iam/roles/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function assignRole(payload: { userId: string; roleId: string; businessUnitId: string; locationId: string }) {
  try {
    const { data } = await axios.post(`${API_BASE}/api/iam/roles/assign`, payload, { headers: authHeaders() });
    return data as { data: any };
  } catch (error: any) {
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      throw new Error('Cannot connect to server. Please ensure the backend API is running on ' + API_BASE);
    }
    throw error;
  }
}

export async function unassignRole(payload: { userId: string; roleAssignmentId: string }) {
  try {
    const { data } = await axios.post(`${API_BASE}/api/iam/roles/unassign`, payload, { headers: authHeaders() });
    return data as { data: any };
  } catch (error: any) {
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      throw new Error('Cannot connect to server. Please ensure the backend API is running on ' + API_BASE);
    }
    throw error;
  }
}

// API KEYS
export async function listApiKeys() {
  const { data } = await axios.get(`${API_BASE}/api/iam/api-keys`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function createApiKey(payload: { organizationId: string; name: string; scopes?: string[] }) {
  const { data } = await axios.post(`${API_BASE}/api/iam/api-keys`, payload, { headers: authHeaders() });
  return data as { data: { id: string; name: string; key: string; keyPrefix: string } };
}

export async function deleteApiKey(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/iam/api-keys/${id}`, { headers: authHeaders() });
  return status === 204;
}

// AUDIT LOGS
export async function listAuditLogs(limit = 50) {
  const { data } = await axios.get(`${API_BASE}/api/iam/audit-logs?limit=${limit}`, { headers: authHeaders() });
  return data as { data: any[] };
}

// ORGANIZATIONS
export async function listOrganizations() {
  const { data } = await axios.get(`${API_BASE}/api/iam/organizations`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getOrganization(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/iam/organizations/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createOrganization(payload: {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  status?: 'active' | 'inactive' | 'suspended';
}, logoFile?: File) {
  if (logoFile) {
    return createOrganizationWithLogo(payload, logoFile);
  }
  const { data } = await axios.post(`${API_BASE}/api/iam/organizations`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateOrganization(id: string, payload: {
  name?: string;
  legalName?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  status?: 'active' | 'inactive' | 'suspended';
}, logoFile?: File) {
  const formData = new FormData();

  // Add logo file if provided
  if (logoFile) {
    formData.append('logo', logoFile);
  }

  // Add other fields as JSON string (or append individually)
  Object.keys(payload).forEach(key => {
    const value = payload[key as keyof typeof payload];
    if (value !== undefined && value !== null) {
      formData.append(key, value.toString());
    }
  });

  const { data } = await axios.patch(`${API_BASE}/api/iam/organizations/${id}`, formData, {
    headers: {
      ...authHeaders(),
      'Content-Type': 'multipart/form-data'
    }
  });
  return data as { data: any };
}

export async function createOrganizationWithLogo(payload: {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: 'active' | 'inactive' | 'suspended';
}, logoFile?: File) {
  const formData = new FormData();

  // Add logo file if provided
  if (logoFile) {
    formData.append('logo', logoFile);
  }

  // Add other fields
  Object.keys(payload).forEach(key => {
    const value = payload[key as keyof typeof payload];
    if (value !== undefined && value !== null) {
      formData.append(key, value.toString());
    }
  });

  const { data } = await axios.post(`${API_BASE}/api/iam/organizations`, formData, {
    headers: {
      ...authHeaders(),
      'Content-Type': 'multipart/form-data'
    }
  });
  return data as { data: any };
}

// PROFILE
export async function getCurrentUser() {
  const session = getSession();
  if (!session?.user?.id) throw new Error('No user session found');
  const { data } = await axios.get(`${API_BASE}/api/iam/users/${session.user.id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCurrentUser(payload: Partial<{ email: string; username: string | null; firstName: string | null; lastName: string | null }>) {
  const session = getSession();
  if (!session?.user?.id) throw new Error('No user session found');
  const { data } = await axios.patch(`${API_BASE}/api/iam/users/${session.user.id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function changePassword(payload: { currentPassword: string; newPassword: string }) {
  const session = getSession();
  if (!session?.user?.id) throw new Error('No user session found');
  const { data } = await axios.patch(`${API_BASE}/api/iam/users/${session.user.id}/password`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function setPassword(payload: { password: string }) {
  const session = getSession();
  if (!session?.user?.id) throw new Error('No user session found');
  const { data } = await axios.post(`${API_BASE}/api/iam/users/${session.user.id}/password`, payload, { headers: authHeaders() });
  return data as { data: any };
}

// BUSINESS UNITS
export async function listBusinessUnits(organizationId?: string) {
  const params = organizationId ? `?organizationId=${organizationId}` : '';
  const { data } = await axios.get(`${API_BASE}/api/iam/business-units${params}`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getBusinessUnit(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/iam/business-units/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createBusinessUnit(payload: {
  organizationId: string;
  parentId?: string | null;
  code: string;
  name: string;
  type: 'wholesale' | 'retail' | 'ecommerce' | '3pl' | 'food_beverage' | 'other';
  status?: 'active' | 'inactive' | 'suspended';
  settings?: Record<string, any> | null;
}) {
  const { data } = await axios.post(`${API_BASE}/api/iam/business-units`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateBusinessUnit(id: string, payload: {
  code?: string;
  name?: string;
  type?: 'wholesale' | 'retail' | 'ecommerce' | '3pl' | 'food_beverage' | 'other';
  status?: 'active' | 'inactive' | 'suspended';
  parentId?: string | null;
  settings?: Record<string, any> | null;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/iam/business-units/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteBusinessUnit(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/iam/business-units/${id}`, { headers: authHeaders() });
  return status === 204;
}

// LOCATIONS
export async function listLocations(businessUnitId?: string, organizationId?: string) {
  const params = new URLSearchParams();
  if (businessUnitId) params.append('businessUnitId', businessUnitId);
  if (organizationId) params.append('organizationId', organizationId);
  const query = params.toString() ? `?${params.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/iam/locations${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getLocation(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/iam/locations/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createLocation(payload: {
  businessUnitId: string;
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
  isDefault?: boolean;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.post(`${API_BASE}/api/iam/locations`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateLocation(id: string, payload: {
  code?: string;
  name?: string;
  type?: 'warehouse' | 'store' | 'office' | 'distribution_center' | 'other';
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  postalCode?: string | null;
  countryCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string;
  isDefault?: boolean;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/iam/locations/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteLocation(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/iam/locations/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ============================================================================
// CATALOG API FUNCTIONS
// ============================================================================

// CATALOG ITEMS
export async function listCatalogItems(params?: {
  organizationId?: string;
  businessUnitId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/catalog/items', params);
}


export async function getCatalogItem(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/catalog/items/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createCatalogItem(payload: {
  organizationId: string;
  businessUnitId?: string;
  sku: string;
  name: string;
  description?: string;
  longDescription?: string;
  category?: string;
  subCategory?: string;
  brand?: string;
  manufacturer?: string;
  uom?: string;
  packSize?: string;
  costPrice?: number;
  sellingPrice?: number;
  currency?: string;
  supplierSku?: string;
  leadTimeDays?: number;
  remarks?: string;
  hsCode?: string;
  countryOfOrigin?: string;
  taxCodeId?: string;
  weightValue?: number;
  weightUnit?: 'g' | 'kg' | 'lb' | 'oz';
  lengthValue?: number;
  widthValue?: number;
  heightValue?: number;
  dimensionUnit?: 'cm' | 'm' | 'in' | 'ft';
  attributes?: Record<string, any>;
  status?: 'active' | 'inactive' | 'discontinued';
  barcode?: string;
  openingQuantity?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  warehouseName?: string;
  binCode?: string;
  supplierName?: string;
  lotNumber?: string;
  expiryDate?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/catalog/items`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCatalogItem(id: string, payload: {
  businessUnitId?: string;
  sku?: string;
  name?: string;
  description?: string;
  longDescription?: string;
  category?: string;
  subCategory?: string;
  brand?: string;
  manufacturer?: string;
  uom?: string;
  packSize?: string;
  costPrice?: number;
  sellingPrice?: number;
  currency?: string;
  supplierSku?: string;
  leadTimeDays?: number;
  remarks?: string;
  hsCode?: string;
  countryOfOrigin?: string;
  taxCodeId?: string;
  weightValue?: number;
  weightUnit?: 'g' | 'kg' | 'lb' | 'oz';
  lengthValue?: number;
  widthValue?: number;
  heightValue?: number;
  dimensionUnit?: 'cm' | 'm' | 'in' | 'ft';
  attributes?: Record<string, any>;
  status?: 'active' | 'inactive' | 'discontinued';
  barcode?: string;
  openingQuantity?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  warehouseName?: string;
  binCode?: string;
  supplierName?: string;
  lotNumber?: string;
  expiryDate?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/catalog/items/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteCatalogItem(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/items/${id}`, { headers: authHeaders() });
  return status === 204;
}

// VARIANTS
export async function listVariants(params?: {
  catalogItemId?: string;
  status?: string;
  search?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.catalogItemId) queryParams.append('catalogItemId', params.catalogItemId);
  if (params?.status) queryParams.append('status', params.status);
  if (params?.search) queryParams.append('search', params.search);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/catalog/variants${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getVariant(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/catalog/variants/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createVariant(payload: {
  catalogItemId: string;
  variantSku: string;
  name?: string;
  option1Name?: string;
  option1Value?: string;
  option2Name?: string;
  option2Value?: string;
  option3Name?: string;
  option3Value?: string;
  weightValue?: number;
  weightUnit?: 'g' | 'kg' | 'lb' | 'oz';
  lengthValue?: number;
  widthValue?: number;
  heightValue?: number;
  dimensionUnit?: 'cm' | 'm' | 'in' | 'ft';
  costPrice?: number;
  costCurrency?: string;
  imageUrl?: string;
  position?: number;
  status?: 'active' | 'inactive' | 'discontinued';
}, imageFile?: File) {
  const formData = new FormData();
  if (imageFile) {
    formData.append('image', imageFile);
  }
  Object.keys(payload).forEach(key => {
    const value = payload[key as keyof typeof payload];
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  });
  const { data } = await axios.post(`${API_BASE}/api/catalog/variants`, formData, {
    headers: {
      ...authHeaders(),
      'Content-Type': 'multipart/form-data'
    }
  });
  return data as { data: any };
}

export async function updateVariant(id: string, payload: {
  variantSku?: string;
  name?: string;
  option1Name?: string;
  option1Value?: string;
  option2Name?: string;
  option2Value?: string;
  option3Name?: string;
  option3Value?: string;
  weightValue?: number;
  weightUnit?: 'g' | 'kg' | 'lb' | 'oz';
  lengthValue?: number;
  widthValue?: number;
  heightValue?: number;
  dimensionUnit?: 'cm' | 'm' | 'in' | 'ft';
  costPrice?: number;
  costCurrency?: string;
  imageUrl?: string | null;
  position?: number;
  status?: 'active' | 'inactive' | 'discontinued';
}, imageFile?: File) {
  const formData = new FormData();
  if (imageFile) {
    formData.append('image', imageFile);
  }
  Object.keys(payload).forEach(key => {
    const value = payload[key as keyof typeof payload];
    if (value !== undefined && value !== null) {
      formData.append(key, value === null ? '' : String(value));
    }
  });
  const { data } = await axios.patch(`${API_BASE}/api/catalog/variants/${id}`, formData, {
    headers: {
      ...authHeaders(),
      'Content-Type': 'multipart/form-data'
    }
  });
  return data as { data: any };
}

export async function deleteVariant(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/variants/${id}`, { headers: authHeaders() });
  return status === 204;
}

// BARCODES
export async function listBarcodes(params?: {
  variantId?: string;
  type?: string;
  isPrimary?: boolean;
}) {
  const queryParams = new URLSearchParams();
  if (params?.variantId) queryParams.append('variantId', params.variantId);
  if (params?.type) queryParams.append('type', params.type);
  if (params?.isPrimary !== undefined) queryParams.append('isPrimary', params.isPrimary.toString());
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/catalog/barcodes${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function createBarcode(payload: {
  variantId: string;
  barcode: string;
  type?: 'EAN' | 'UPC' | 'ISBN' | 'CODE128' | 'QR' | 'INTERNAL';
  isPrimary?: boolean;
}) {
  const { data } = await axios.post(`${API_BASE}/api/catalog/barcodes`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateBarcode(id: string, payload: {
  barcode?: string;
  type?: 'EAN' | 'UPC' | 'ISBN' | 'CODE128' | 'QR' | 'INTERNAL';
  isPrimary?: boolean;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/catalog/barcodes/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteBarcode(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/barcodes/${id}`, { headers: authHeaders() });
  return status === 204;
}

// TAX CODES
export async function listTaxCodes(params?: {
  organizationId?: string;
  countryCode?: string;
  status?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.organizationId) queryParams.append('organizationId', params.organizationId);
  if (params?.countryCode) queryParams.append('countryCode', params.countryCode);
  if (params?.status) queryParams.append('status', params.status);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/catalog/tax-codes${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getTaxCode(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/catalog/tax-codes/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createTaxCode(payload: {
  organizationId: string;
  code: string;
  name: string;
  rate: number;
  countryCode?: string;
  description?: string;
  isDefault?: boolean;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.post(`${API_BASE}/api/catalog/tax-codes`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateTaxCode(id: string, payload: {
  code?: string;
  name?: string;
  rate?: number;
  countryCode?: string;
  description?: string;
  isDefault?: boolean;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/catalog/tax-codes/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteTaxCode(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/tax-codes/${id}`, { headers: authHeaders() });
  return status === 204;
}

// PRICE LISTS
export async function listPriceLists(params?: {
  organizationId?: string;
  businessUnitId?: string;
  type?: string;
  status?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.organizationId) queryParams.append('organizationId', params.organizationId);
  if (params?.businessUnitId) queryParams.append('businessUnitId', params.businessUnitId);
  if (params?.type) queryParams.append('type', params.type);
  if (params?.status) queryParams.append('status', params.status);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/catalog/price-lists${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getPriceList(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/catalog/price-lists/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createPriceList(payload: {
  organizationId: string;
  businessUnitId?: string;
  name: string;
  code: string;
  type: 'retail' | 'wholesale' | 'channel' | 'customer_tier' | 'region';
  currency?: string;
  description?: string;
  validFrom?: string;
  validUntil?: string;
  isDefault?: boolean;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.post(`${API_BASE}/api/catalog/price-lists`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePriceList(id: string, payload: {
  businessUnitId?: string;
  name?: string;
  code?: string;
  type?: 'retail' | 'wholesale' | 'channel' | 'customer_tier' | 'region';
  currency?: string;
  description?: string;
  validFrom?: string;
  validUntil?: string;
  isDefault?: boolean;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/catalog/price-lists/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deletePriceList(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/price-lists/${id}`, { headers: authHeaders() });
  return status === 204;
}

// PRICE LIST ITEMS
export async function listPriceListItems(params?: {
  priceListId?: string;
  variantId?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.priceListId) queryParams.append('priceListId', params.priceListId);
  if (params?.variantId) queryParams.append('variantId', params.variantId);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/catalog/price-list-items${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function createPriceListItem(payload: {
  priceListId: string;
  variantId: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  minMarginPercent?: number;
  minQuantity?: number;
  maxQuantity?: number;
}) {
  const { data } = await axios.post(`${API_BASE}/api/catalog/price-list-items`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePriceListItem(id: string, payload: {
  price?: number;
  compareAtPrice?: number;
  costPrice?: number;
  minMarginPercent?: number;
  minQuantity?: number;
  maxQuantity?: number;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/catalog/price-list-items/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deletePriceListItem(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/price-list-items/${id}`, { headers: authHeaders() });
  return status === 204;
}

// PRODUCT MEDIA
export async function listProductMedia(params?: {
  catalogItemId?: string;
  variantId?: string;
  type?: 'image' | 'video' | 'document' | '3d_model';
}) {
  const queryParams = new URLSearchParams();
  if (params?.catalogItemId) queryParams.append('catalogItemId', params.catalogItemId);
  if (params?.variantId) queryParams.append('variantId', params.variantId);
  if (params?.type) queryParams.append('type', params.type);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/catalog/media${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getProductMedia(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/catalog/media/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createProductMedia(payload: {
  catalogItemId: string;
  variantId?: string;
  type: 'image' | 'video' | 'document' | '3d_model';
  altText?: string;
  position?: number;
  isPrimary?: boolean;
}, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  Object.keys(payload).forEach(key => {
    const value = payload[key as keyof typeof payload];
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  });
  const { data } = await axios.post(`${API_BASE}/api/catalog/media`, formData, {
    headers: {
      ...authHeaders(),
      'Content-Type': 'multipart/form-data'
    }
  });
  return data as { data: any };
}

export async function updateProductMedia(id: string, payload: {
  variantId?: string | null;
  type?: 'image' | 'video' | 'document' | '3d_model';
  altText?: string;
  position?: number;
  isPrimary?: boolean;
}, file?: File) {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }
  Object.keys(payload).forEach(key => {
    const value = payload[key as keyof typeof payload];
    if (value !== undefined && value !== null) {
      formData.append(key, value === null ? '' : String(value));
    }
  });
  const { data } = await axios.patch(`${API_BASE}/api/catalog/media/${id}`, formData, {
    headers: {
      ...authHeaders(),
      'Content-Type': 'multipart/form-data'
    }
  });
  return data as { data: any };
}

export async function deleteProductMedia(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/media/${id}`, { headers: authHeaders() });
  return status === 204;
}

// BUNDLES
export async function listBundles(params?: {
  catalogItemId?: string;
  status?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.catalogItemId) queryParams.append('catalogItemId', params.catalogItemId);
  if (params?.status) queryParams.append('status', params.status);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/catalog/bundles${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getBundle(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/catalog/bundles/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createBundle(payload: {
  catalogItemId: string;
  name: string;
  description?: string;
  discountPercent?: number;
  fixedPrice?: number;
  currency?: string;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.post(`${API_BASE}/api/catalog/bundles`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateBundle(id: string, payload: {
  name?: string;
  description?: string;
  discountPercent?: number;
  fixedPrice?: number;
  currency?: string;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/catalog/bundles/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteBundle(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/bundles/${id}`, { headers: authHeaders() });
  return status === 204;
}

// BUNDLE ITEMS
export async function listBundleItems(params?: {
  bundleId?: string;
  variantId?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.bundleId) queryParams.append('bundleId', params.bundleId);
  if (params?.variantId) queryParams.append('variantId', params.variantId);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/catalog/bundle-items${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getBundleItem(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/catalog/bundle-items/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createBundleItem(payload: {
  bundleId: string;
  variantId: string;
  quantity?: number;
  position?: number;
}) {
  const { data } = await axios.post(`${API_BASE}/api/catalog/bundle-items`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateBundleItem(id: string, payload: {
  variantId?: string;
  quantity?: number;
  position?: number;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/catalog/bundle-items/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteBundleItem(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/bundle-items/${id}`, { headers: authHeaders() });
  return status === 204;
}

// PROMOTIONAL PRICES
export async function listPromotionalPrices(params?: {
  variantId?: string;
  priceListId?: string;
  status?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.variantId) queryParams.append('variantId', params.variantId);
  if (params?.priceListId) queryParams.append('priceListId', params.priceListId);
  if (params?.status) queryParams.append('status', params.status);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/catalog/promotional-prices${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getPromotionalPrice(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/catalog/promotional-prices/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createPromotionalPrice(payload: {
  variantId: string;
  priceListId?: string;
  name: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  validFrom: string;
  validUntil: string;
  status?: 'scheduled' | 'active' | 'expired' | 'cancelled';
}) {
  const { data } = await axios.post(`${API_BASE}/api/catalog/promotional-prices`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePromotionalPrice(id: string, payload: {
  priceListId?: string | null;
  name?: string;
  discountType?: 'percentage' | 'fixed_amount';
  discountValue?: number;
  validFrom?: string;
  validUntil?: string;
  status?: 'scheduled' | 'active' | 'expired' | 'cancelled';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/catalog/promotional-prices/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deletePromotionalPrice(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/promotional-prices/${id}`, { headers: authHeaders() });
  return status === 204;
}

// CHANNEL MAPPINGS
export async function listChannelMappings(params?: {
  catalogItemId?: string;
  variantId?: string;
  channel?: string;
  syncStatus?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.catalogItemId) queryParams.append('catalogItemId', params.catalogItemId);
  if (params?.variantId) queryParams.append('variantId', params.variantId);
  if (params?.channel) queryParams.append('channel', params.channel);
  if (params?.syncStatus) queryParams.append('syncStatus', params.syncStatus);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/catalog/channel-mappings${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getChannelMapping(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/catalog/channel-mappings/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createChannelMapping(payload: {
  catalogItemId: string;
  variantId?: string;
  channel: 'amazon' | 'ebay' | 'tiktok' | 'etsy' | 'shopify' | 'woocommerce' | 'wix' | 'b2b_portal' | 'pos';
  channelProductId?: string;
  channelVariantId?: string;
  channelUrl?: string;
  attributes?: Record<string, any>;
  syncEnabled?: boolean;
  syncStatus?: 'pending' | 'synced' | 'failed' | 'disabled';
}) {
  const { data } = await axios.post(`${API_BASE}/api/catalog/channel-mappings`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateChannelMapping(id: string, payload: {
  variantId?: string | null;
  channelProductId?: string;
  channelVariantId?: string;
  channelUrl?: string;
  attributes?: Record<string, any>;
  syncEnabled?: boolean;
  syncStatus?: 'pending' | 'synced' | 'failed' | 'disabled';
  syncError?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/catalog/channel-mappings/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteChannelMapping(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/channel-mappings/${id}`, { headers: authHeaders() });
  return status === 204;
}

// IMPORT CHANNELS
export async function listImportSources() {
  const { data } = await axios.get(`${API_BASE}/api/catalog/import-channels/sources`, { headers: authHeaders() });
  return data as {
    data: Array<{
      id: string;
      channel: string;
      label: string;
      format: 'csv' | 'api';
      available: boolean;
      hint?: string;
    }>;
  };
}

export type ProductImportOptions = {
  organizationId: string;
  businessUnitId?: string;
  warehouseId?: string;
  priceListId?: string;
  duplicateMode: 'skip' | 'update';
  importProducts: boolean;
  importVariants: boolean;
  importInventory: boolean;
  importPrices: boolean;
  importMedia: boolean;
  importChannelMappings: boolean;
};

export type ImportPreviewResult = {
  sourceType: string;
  channel: string;
  fileName?: string;
  detectedSourceType?: string | null;
  productCount: number;
  variantCount: number;
  mediaCount: number;
  sampleProducts: any[];
};

export async function previewProductImport(file: File, sourceType: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('sourceType', sourceType);
  const { data } = await axios.post(`${API_BASE}/api/catalog/import-channels/preview`, formData, {
    headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' }
  });
  return data as { data: ImportPreviewResult };
}

export type ShopifyApiCredentials = { shopDomain: string; accessToken: string };
export type WooCommerceApiCredentials = {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

export async function previewProductImportApi(payload: {
  sourceType: 'shopify_api' | 'woocommerce_api' | 'wordpress_api';
  organizationId: string;
  connectionId?: string;
  credentials?: ShopifyApiCredentials | WooCommerceApiCredentials | Record<string, unknown>;
}) {
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/import-channels/api/preview`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: ImportPreviewResult };
}

export async function executeProductImportApi(payload: {
  sourceType: 'shopify_api' | 'woocommerce_api' | 'wordpress_api';
  organizationId: string;
  connectionId?: string;
  credentials?: ShopifyApiCredentials | WooCommerceApiCredentials | Record<string, unknown>;
  options: ProductImportOptions;
}) {
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/import-channels/api/execute`,
    payload,
    { headers: authHeaders(), timeout: 600000 }
  );
  return data as { data: { jobId: string; status: string; summary: Record<string, unknown> } };
}

// CHANNEL CONNECTIONS (saved WooCommerce / Shopify stores)
export async function listChannelConnections(params?: {
  organizationId?: string;
  channel?: 'shopify' | 'woocommerce' | 'wordpress' | 'goodtill';
  status?: string;
}) {
  const q = new URLSearchParams();
  if (params?.organizationId) q.append('organizationId', params.organizationId);
  if (params?.channel) q.append('channel', params.channel);
  if (params?.status) q.append('status', params.status);
  const query = q.toString() ? `?${q.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/catalog/channel-connections${query}`, {
    headers: authHeaders()
  });
  return data as { data: any[] };
}

export async function createWooCommerceConnection(payload: {
  organizationId: string;
  name: string;
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.post(`${API_BASE}/api/catalog/channel-connections/woocommerce`, payload, {
    headers: authHeaders()
  });
  return data as { data: any };
}

export async function testChannelConnection(id: string) {
  const { data } = await axios.post(`${API_BASE}/api/catalog/channel-connections/${id}/test`, {}, {
    headers: authHeaders()
  });
  return data as { data: { ok: boolean; productCount: number; message: string } };
}

export async function deleteChannelConnection(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/channel-connections/${id}`, {
    headers: authHeaders()
  });
  return status === 204;
}

// ─── WordPress Channel API ────────────────────────────────────────────────────

export type WordPressAuthMode = 'appPassword' | 'consumerKey';

export async function createWordPressConnection(payload: {
  organizationId: string;
  name: string;
  storeUrl: string;
  authMode: WordPressAuthMode;
  username?: string;
  appPassword?: string;
  consumerKey?: string;
  consumerSecret?: string;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/channel-connections/wordpress`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function browseWordPressProducts(params: {
  connectionId: string;
  organizationId: string;
  page?: number;
  perPage?: number;
  search?: string;
  status?: string;
  type?: string;
  stockStatus?: string;
  minPrice?: string;
  maxPrice?: string;
  orderby?: string;
  order?: string;
}) {
  const q = new URLSearchParams({ organizationId: params.organizationId });
  if (params.page) q.append('page', String(params.page));
  if (params.perPage) q.append('perPage', String(params.perPage));
  if (params.search) q.append('search', params.search);
  if (params.status) q.append('status', params.status);
  if (params.type) q.append('type', params.type);
  if (params.stockStatus) q.append('stockStatus', params.stockStatus);
  if (params.minPrice) q.append('minPrice', params.minPrice);
  if (params.maxPrice) q.append('maxPrice', params.maxPrice);
  if (params.orderby) q.append('orderby', params.orderby);
  if (params.order) q.append('order', params.order);

  const { data } = await axios.get(
    `${API_BASE}/api/catalog/wordpress-channels/${params.connectionId}/products?${q}`,
    { headers: authHeaders() }
  );
  return data as {
    data: Array<{
      id: number;
      name: string;
      sku: string;
      type: string;
      status: string;
      regular_price: string;
      stock_quantity: number | null;
      categories: Array<{ name: string }>;
      images: Array<{ src: string }>;
    }>;
    pagination: { page: number; perPage: number; total: number; totalPages: number };
  };
}

export async function importWordPressProducts(payload: {
  connectionId: string;
  organizationId: string;
  productIds?: number[];
  importAll?: boolean;
  options?: {
    businessUnitId?: string;
    warehouseId?: string;
    priceListId?: string;
    duplicateMode?: 'skip' | 'update';
    importProducts?: boolean;
    importVariants?: boolean;
    importInventory?: boolean;
    importPrices?: boolean;
    importMedia?: boolean;
    importChannelMappings?: boolean;
  };
}) {
  const { connectionId, ...body } = payload;
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/wordpress-channels/${connectionId}/import`,
    body,
    { headers: authHeaders(), timeout: 600000 }
  );
  return data as { data: { jobId: string; status: string; summary: Record<string, unknown> } };
}

export async function exportToWordPress(payload: {
  connectionId: string;
  organizationId: string;
  catalogItemIds?: string[];
  exportAll?: boolean;
  duplicateMode?: 'skip' | 'update';
}) {
  const { connectionId, ...body } = payload;
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/wordpress-channels/${connectionId}/export`,
    body,
    { headers: authHeaders(), timeout: 600000 }
  );
  return data as {
    data: {
      created: number;
      updated: number;
      skipped: number;
      errors: Array<{ sku: string; message: string }>;
    };
  };
}

export async function previewWordPressExport(params: {
  connectionId: string;
  organizationId: string;
  catalogItemIds?: string;
}) {
  const q = new URLSearchParams({ organizationId: params.organizationId });
  if (params.catalogItemIds) q.append('catalogItemIds', params.catalogItemIds);
  const { data } = await axios.get(
    `${API_BASE}/api/catalog/wordpress-channels/${params.connectionId}/preview-export?${q}`,
    { headers: authHeaders() }
  );
  return data as { data: { totalItems: number; items: Array<{ id: string; sku: string; name: string; status: string; category: string }> } };
}

export async function wpSyncStatus(params: {
  connectionId: string;
  organizationId: string;
  wcProductIds: number[];
}) {
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/wordpress-channels/${params.connectionId}/sync-status`,
    { organizationId: params.organizationId, wcProductIds: params.wcProductIds },
    { headers: authHeaders() }
  );
  return data as { data: Record<number, { inErp: boolean; catalogItemId?: string; sku?: string; name?: string; lastSynced?: string }> };
}

export async function wpSyncHealth(params: { connectionId: string; organizationId: string }) {
  const q = new URLSearchParams({ organizationId: params.organizationId });
  const { data } = await axios.get(
    `${API_BASE}/api/catalog/wordpress-channels/${params.connectionId}/sync-health?${q}`,
    { headers: authHeaders() }
  );
  return data as {
    data: {
      wpTotal: number;
      erpMapped: number;
      lastSync: string | null;
      recentJobs: Array<{ id: number; status: string; summary: Record<string, number> | null; createdAt: string }>;
    }
  };
}

export async function wpPushPrices(params: {
  connectionId: string;
  organizationId: string;
  catalogItemIds?: string[];
  pushAll?: boolean;
}) {
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/wordpress-channels/${params.connectionId}/push-prices`,
    { organizationId: params.organizationId, catalogItemIds: params.catalogItemIds, pushAll: params.pushAll },
    { headers: authHeaders(), timeout: 120000 }
  );
  return data as { data: { pushed: number; errors: number; errorDetails: string[] } };
}

// ─── Good Till / EPOS Channel API ─────────────────────────────────────────────

export async function createGoodTillConnection(payload: {
  organizationId: string;
  name: string;
  subdomain: string;
  username: string;
  password: string;
  outletId?: string;
  defaultVatCodeId?: string;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/channel-connections/goodtill`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function listEposConnections(params?: { organizationId?: string }) {
  const q = new URLSearchParams();
  if (params?.organizationId) q.append('organizationId', params.organizationId);
  const query = q.toString() ? `?${q.toString()}` : '';
  try {
    const { data } = await axios.get(`${API_BASE}/api/catalog/epos-channels/connections${query}`, {
      headers: authHeaders()
    });
    return data as { data: any[] };
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
    const { data } = await axios.get(
      `${API_BASE}/api/catalog/channel-connections?${new URLSearchParams({
        ...(params?.organizationId ? { organizationId: params.organizationId } : {}),
        channel: 'goodtill'
      })}`,
      { headers: authHeaders() }
    );
    const rows = (data.data ?? []).map((c: any) => ({
      ...c,
      subdomain: c.shopDomain ?? c.subdomain,
      outletId: null,
      defaultVatCodeId: null
    }));
    return { data: rows };
  }
}

// ---------------------------------------------------------------------------
// Channel order sync — pull orders + payments from the POS and linked websites
// ---------------------------------------------------------------------------

export interface OrderSyncConnection {
  id: string;
  name: string;
  kind: 'pos' | 'web';
  channel: string;
  storeUrl: string | null;
  status: string;
  organizationId: string | null;
  lastTestOk: boolean | null;
  lastTestedAt: string | null;
}

export interface OrderSyncRequest {
  organizationId: string;
  connectionId: string;
  from?: string;
  to?: string;
  includeVoided?: boolean;
  statuses?: string[];
  maxOrders?: number;
  createCustomers?: boolean;
  importPayments?: boolean;
  updateExisting?: boolean;
}

export interface OrderSyncPreview {
  connection: { id: string; name: string; channel: string };
  totalOrders: number;
  totalLines: number;
  totalPayments: number;
  totalValue: number;
  paymentsTotal: number;
  currency: string;
  byStatus: Record<string, number>;
  orders: Array<{
    externalId: string;
    externalNumber: string | null;
    orderNumber: string;
    orderDate: string;
    total: number;
    currency: string;
    status: string;
    paymentStatus: string;
    customerEmail: string | null;
    lineCount: number;
    paymentCount: number;
  }>;
}

export interface OrderSyncResult {
  connection: { id: string; name: string; channel: string };
  fetched: number;
  ordersCreated: number;
  ordersUpdated: number;
  ordersSkipped: number;
  linesCreated: number;
  linesUnmatched: number;
  paymentsCreated: number;
  paymentsSkipped: number;
  customersCreated: number;
  customersLinked: number;
  addressesCreated: number;
  errors: Array<{ order: string; message: string }>;
  unmatchedSkus: string[];
}

export async function listOrderSyncConnections(params?: { organizationId?: string }) {
  const q = new URLSearchParams();
  if (params?.organizationId) q.append('organizationId', params.organizationId);
  const query = q.toString() ? `?${q.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/orders/channel-sync/connections${query}`, {
    headers: authHeaders()
  });
  return data as { data: OrderSyncConnection[] };
}

export async function previewOrderSync(payload: OrderSyncRequest) {
  const { data } = await axios.post(`${API_BASE}/api/orders/channel-sync/preview`, payload, {
    headers: authHeaders(),
    timeout: 600000
  });
  return data as { data: OrderSyncPreview };
}

export async function runOrderSync(payload: OrderSyncRequest) {
  const { data } = await axios.post(`${API_BASE}/api/orders/channel-sync/import`, payload, {
    headers: authHeaders(),
    timeout: 600000
  });
  return data as { data: OrderSyncResult };
}

/**
 * Pulls new/updated orders + payments from every active POS and website
 * connection for the org. Each channel is synced separately (API is per-connection).
 */
export async function syncAllChannelOrders(params: {
  organizationId: string;
  from?: string;
  to?: string;
  includeVoided?: boolean;
  createCustomers?: boolean;
  importPayments?: boolean;
  updateExisting?: boolean;
  onProgress?: (done: number, total: number, name: string) => void;
}) {
  const { data: connections } = await listOrderSyncConnections({
    organizationId: params.organizationId
  });
  const active = (connections || []).filter((c) => c.status === 'active');
  const results: OrderSyncResult[] = [];
  const failures: Array<{ connectionId: string; name: string; message: string }> = [];

  for (let i = 0; i < active.length; i++) {
    const conn = active[i];
    params.onProgress?.(i + 1, active.length, conn.name);
    try {
      const { data } = await runOrderSync({
        organizationId: params.organizationId,
        connectionId: conn.id,
        from: params.from,
        to: params.to,
        includeVoided: params.includeVoided ?? false,
        createCustomers: params.createCustomers ?? true,
        importPayments: params.importPayments ?? true,
        updateExisting: params.updateExisting ?? true
      });
      results.push(data);
    } catch (e: any) {
      failures.push({
        connectionId: conn.id,
        name: conn.name,
        message: e?.response?.data?.error?.message || e?.message || 'Sync failed'
      });
    }
  }

  return {
    connections: active.length,
    results,
    failures,
    totals: results.reduce(
      (acc, r) => ({
        fetched: acc.fetched + r.fetched,
        ordersCreated: acc.ordersCreated + r.ordersCreated,
        ordersUpdated: acc.ordersUpdated + r.ordersUpdated,
        paymentsCreated: acc.paymentsCreated + r.paymentsCreated,
        customersCreated: acc.customersCreated + r.customersCreated,
        errors: acc.errors + r.errors.length
      }),
      {
        fetched: 0,
        ordersCreated: 0,
        ordersUpdated: 0,
        paymentsCreated: 0,
        customersCreated: 0,
        errors: 0
      }
    )
  };
}

export async function listGoodTillVatRates(params: { connectionId: string; organizationId: string }) {
  const q = new URLSearchParams({ organizationId: params.organizationId });
  const { data } = await axios.get(
    `${API_BASE}/api/catalog/epos-channels/${params.connectionId}/vat-rates?${q}`,
    { headers: authHeaders() }
  );
  return data as { data: Array<{ id: string; vat_name: string; vat_rate: string }> };
}

export async function browseGoodTillProducts(params: {
  connectionId: string;
  organizationId: string;
  page?: number;
  perPage?: number;
  search?: string;
}) {
  const q = new URLSearchParams({ organizationId: params.organizationId });
  if (params.page) q.append('page', String(params.page));
  if (params.perPage) q.append('perPage', String(params.perPage));
  if (params.search) q.append('search', params.search);

  const { data } = await axios.get(
    `${API_BASE}/api/catalog/epos-channels/${params.connectionId}/products?${q}`,
    { headers: authHeaders() }
  );
  return data as {
    data: Array<{
      product_id: string;
      product_name: string;
      product_sku: string;
      barcode: string | null;
      selling_price: string;
      inventory: string;
      category: string | null;
      has_variant: number;
      variants: any[];
    }>;
    pagination: { page: number; perPage: number; total: number; totalPages: number };
  };
}

export async function deleteGoodTillProduct(params: {
  connectionId: string;
  organizationId: string;
  productId: string;
}) {
  const q = new URLSearchParams({ organizationId: params.organizationId });
  const { data } = await axios.delete(
    `${API_BASE}/api/catalog/epos-channels/${params.connectionId}/epos-products/${encodeURIComponent(params.productId)}?${q}`,
    { headers: authHeaders(), timeout: 120000 }
  );
  return data as {
    data: {
      deleted: number;
      failed: number;
      skipped: number;
      errors: Array<{ productId: string; message: string }>;
    };
  };
}

export async function deleteGoodTillProducts(payload: {
  connectionId: string;
  organizationId: string;
  productIds?: string[];
  deleteAll?: boolean;
}) {
  const { connectionId, ...body } = payload;
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/epos-channels/${connectionId}/epos-products/delete`,
    body,
    { headers: authHeaders(), timeout: 600000 }
  );
  return data as {
    data: {
      deleted: number;
      failed: number;
      skipped: number;
      errors: Array<{ productId: string; message: string }>;
    };
  };
}

export async function importGoodTillProducts(payload: {
  connectionId: string;
  organizationId: string;
  productIds?: string[];
  importAll?: boolean;
  options?: {
    businessUnitId?: string;
    warehouseId?: string;
    priceListId?: string;
    duplicateMode?: 'skip' | 'update';
    importProducts?: boolean;
    importVariants?: boolean;
    importInventory?: boolean;
    importPrices?: boolean;
    importMedia?: boolean;
    importChannelMappings?: boolean;
  };
}) {
  const { connectionId, ...body } = payload;
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/epos-channels/${connectionId}/import`,
    body,
    { headers: authHeaders(), timeout: 600000 }
  );
  return data as { data: { jobId: string; status: string; summary: Record<string, unknown> } };
}

export async function exportToGoodTill(payload: {
  connectionId: string;
  organizationId: string;
  catalogItemIds?: string[];
  exportAll?: boolean;
  mode?: 'push' | 'sync';
  duplicateMode?: 'skip' | 'update';
  vatCodeId?: string;
  priceListId?: string;
  warehouseId?: string;
  generateBarcodes?: boolean;
}) {
  const { connectionId, ...body } = payload;
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/epos-channels/${connectionId}/export`,
    body,
    { headers: authHeaders(), timeout: 600000 }
  );
  return data as {
    data: {
      created: number;
      updated: number;
      skipped: number;
      unchanged: number;
      barcodesGenerated: number;
      errors: Array<{ sku: string; message: string }>;
    };
  };
}

export async function previewGoodTillExport(params: {
  connectionId: string;
  organizationId: string;
  catalogItemIds?: string;
}) {
  const q = new URLSearchParams({ organizationId: params.organizationId });
  if (params.catalogItemIds) q.append('catalogItemIds', params.catalogItemIds);
  const { data } = await axios.get(
    `${API_BASE}/api/catalog/epos-channels/${params.connectionId}/preview-export?${q}`,
    { headers: authHeaders() }
  );
  return data as { data: { totalItems: number; items: Array<{ id: string; sku: string; name: string; status: string; category: string }> } };
}

export async function generateEposProductBarcodes(payload: {
  connectionId: string;
  organizationId: string;
  productIds?: string[];
  generateAll?: boolean;
  forceRegenerate?: boolean;
}) {
  const { connectionId, ...body } = payload;
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/epos-channels/${connectionId}/epos-products/barcodes`,
    body,
    { headers: authHeaders(), timeout: 300000 }
  );
  return data as {
    data: {
      generated: number;
      updated: number;
      skipped: number;
      errors: Array<{ productId: string; sku: string; message: string }>;
      products: Array<{
        productId: string;
        productSku: string;
        productName: string;
        barcode: string;
        sellingPrice: string;
      }>;
    };
  };
}

export async function getEposBarcodeImage(params: { connectionId: string; barcode: string }) {
  const { data } = await axios.get(
    `${API_BASE}/api/catalog/epos-channels/${params.connectionId}/barcode-image/${encodeURIComponent(params.barcode)}`,
    { headers: authHeaders() }
  );
  return data as { data: { barcode: string; imageDataUrl: string } };
}

export async function generateEposBarcodes(payload: {
  connectionId: string;
  organizationId: string;
  catalogItemIds?: string[];
  exportAll?: boolean;
}) {
  const { connectionId, ...body } = payload;
  const { data } = await axios.post(
    `${API_BASE}/api/catalog/epos-channels/${connectionId}/generate-barcodes`,
    body,
    { headers: authHeaders(), timeout: 120000 }
  );
  return data as { data: { generated: number; skipped?: number; barcodes: Array<{ variantSku: string; barcode: string }> } };
}

export async function getEposQrCode(params: {
  connectionId: string;
  barcode: string;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/catalog/epos-channels/${params.connectionId}/qr/${encodeURIComponent(params.barcode)}`,
    { headers: authHeaders() }
  );
  return data as { data: { barcode: string; qrDataUrl: string } };
}

export async function executeProductImport(file: File, sourceType: string, options: ProductImportOptions) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('sourceType', sourceType);
  formData.append('options', JSON.stringify(options));
  const { data } = await axios.post(`${API_BASE}/api/catalog/import-channels/execute`, formData, {
    headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
    timeout: 600000
  });
  return data as { data: { jobId: string; status: string; summary: Record<string, unknown> } };
}

export async function listProductImportJobs(params?: { organizationId?: string; page?: number; limit?: number }) {
  return getPaginatedList('/api/catalog/import-channels/jobs', params);
}

// INVENTORY EXCEL SEED IMPORT
export async function previewInventoryExcelImport(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await axios.post(`${API_BASE}/api/catalog/inventory-import/preview`, formData, {
    headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  });
  return data as {
    data: {
      rowCount: number;
      sample: Array<Record<string, unknown>>;
      categories: string[];
      warehouses: string[];
      suppliers: string[];
      warnings: string[];
    };
  };
}

export async function executeInventoryExcelImport(
  file: File,
  options: {
    organizationId: string;
    businessUnitId?: string;
    duplicateMode?: 'skip' | 'update';
    importInventory?: boolean;
  }
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('organizationId', options.organizationId);
  if (options.businessUnitId) formData.append('businessUnitId', options.businessUnitId);
  formData.append('duplicateMode', options.duplicateMode ?? 'update');
  formData.append('importInventory', String(options.importInventory ?? true));
  const { data } = await axios.post(`${API_BASE}/api/catalog/inventory-import/execute`, formData, {
    headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
    timeout: 600000
  });
  return data as {
    data: {
      preview: Record<string, unknown>;
      result: {
        productsCreated: number;
        productsUpdated: number;
        productsSkipped: number;
        variantsCreated: number;
        barcodesCreated: number;
        warehousesCreated: number;
        binsCreated: number;
        suppliersCreated: number;
        stockItemsCreated: number;
        stockItemsUpdated: number;
        taxCodesCreated: number;
        errors: Array<{ sku: string; rowNumber: number; message: string }>;
      };
    };
  };
}

// COMPLIANCE DOCUMENTS
export async function listComplianceDocuments(params?: {
  catalogItemId?: string;
  type?: string;
  status?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.catalogItemId) queryParams.append('catalogItemId', params.catalogItemId);
  if (params?.type) queryParams.append('type', params.type);
  if (params?.status) queryParams.append('status', params.status);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/catalog/compliance-documents${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getComplianceDocument(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/catalog/compliance-documents/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createComplianceDocument(payload: {
  catalogItemId: string;
  type: 'msds' | 'certificate' | 'safety_data' | 'test_report' | 'other';
  name: string;
  documentNumber?: string;
  issuer?: string;
  issuedDate?: string;
  expiryDate?: string;
  status?: 'active' | 'expired' | 'pending';
}, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  Object.keys(payload).forEach(key => {
    const value = payload[key as keyof typeof payload];
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  });
  const { data } = await axios.post(`${API_BASE}/api/catalog/compliance-documents`, formData, {
    headers: {
      ...authHeaders(),
      'Content-Type': 'multipart/form-data'
    }
  });
  return data as { data: any };
}

export async function updateComplianceDocument(id: string, payload: {
  type?: 'msds' | 'certificate' | 'safety_data' | 'test_report' | 'other';
  name?: string;
  documentNumber?: string;
  issuer?: string;
  issuedDate?: string;
  expiryDate?: string;
  status?: 'active' | 'expired' | 'pending';
}, file?: File) {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }
  Object.keys(payload).forEach(key => {
    const value = payload[key as keyof typeof payload];
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  });
  const { data } = await axios.patch(`${API_BASE}/api/catalog/compliance-documents/${id}`, formData, {
    headers: {
      ...authHeaders(),
      'Content-Type': 'multipart/form-data'
    }
  });
  return data as { data: any };
}

export async function deleteComplianceDocument(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/catalog/compliance-documents/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ============================================================================
// INVENTORY API FUNCTIONS
// ============================================================================

// WAREHOUSES
export async function listWarehouses(params?: {
  locationId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/inventory/warehouses', params);
}

export async function getWarehouse(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/inventory/warehouses/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createWarehouse(payload: {
  locationId: string;
  code: string;
  name: string;
  type: 'main_hub' | 'distribution_center' | 'store' | 'third_party' | 'other';
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  countryCode: string;
  capacityCubicMeters?: number;
  isDefault?: boolean;
  status?: 'active' | 'inactive' | 'maintenance';
}) {
  const { data } = await axios.post(`${API_BASE}/api/inventory/warehouses`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateWarehouse(id: string, payload: {
  code?: string;
  name?: string;
  type?: 'main_hub' | 'distribution_center' | 'store' | 'third_party' | 'other';
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  countryCode?: string;
  capacityCubicMeters?: number;
  isDefault?: boolean;
  status?: 'active' | 'inactive' | 'maintenance';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/inventory/warehouses/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteWarehouse(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/inventory/warehouses/${id}`, { headers: authHeaders() });
  return status === 204;
}

// BINS
export async function listBins(params?: {
  warehouseId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/inventory/bins', params);
}

export async function getBin(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/inventory/bins/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createBin(payload: {
  warehouseId: string;
  code: string;
  name?: string;
  zone?: string;
  aisle?: string;
  rack?: string;
  shelf?: string;
  binType?: 'standard' | 'bulk' | 'cold_storage' | 'hazmat' | 'quarantine' | 'staging' | 'returns';
  capacityCubicMeters?: number;
  maxWeightKg?: number;
  barcode?: string;
  status?: 'active' | 'inactive' | 'full' | 'maintenance';
}) {
  const { data } = await axios.post(`${API_BASE}/api/inventory/bins`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateBin(id: string, payload: {
  code?: string;
  name?: string;
  zone?: string;
  aisle?: string;
  rack?: string;
  shelf?: string;
  binType?: 'standard' | 'bulk' | 'cold_storage' | 'hazmat' | 'quarantine' | 'staging' | 'returns';
  capacityCubicMeters?: number;
  maxWeightKg?: number;
  barcode?: string;
  status?: 'active' | 'inactive' | 'full' | 'maintenance';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/inventory/bins/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteBin(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/inventory/bins/${id}`, { headers: authHeaders() });
  return status === 204;
}

// SUPPLIERS
export async function listSuppliers(params?: {
  organizationId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/inventory/suppliers', params);
}

export async function getSupplier(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/inventory/suppliers/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createSupplier(payload: {
  organizationId: string;
  code: string;
  name: string;
  legalName?: string;
  email?: string;
  phone?: string;
  website?: string;
  taxId?: string;
  paymentTerms?: string;
  currency?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  countryCode?: string;
  leadTimeDays?: number;
  minimumOrderValue?: number;
  rating?: number;
  notes?: string;
  status?: 'active' | 'inactive' | 'blocked';
}) {
  const { data } = await axios.post(`${API_BASE}/api/inventory/suppliers`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateSupplier(id: string, payload: {
  code?: string;
  name?: string;
  legalName?: string;
  email?: string;
  phone?: string;
  website?: string;
  taxId?: string;
  paymentTerms?: string;
  currency?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  countryCode?: string;
  leadTimeDays?: number;
  minimumOrderValue?: number;
  rating?: number;
  notes?: string;
  status?: 'active' | 'inactive' | 'blocked';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/inventory/suppliers/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteSupplier(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/inventory/suppliers/${id}`, { headers: authHeaders() });
  return status === 204;
}

// PURCHASE ORDERS
export async function listPurchaseOrders(params?: {
  organizationId?: string;
  supplierId?: string;
  warehouseId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/inventory/purchase-orders', params);
}

export async function getPurchaseOrder(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/inventory/purchase-orders/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createPurchaseOrder(payload: {
  organizationId: string;
  supplierId: string;
  warehouseId: string;
  poNumber: string;
  reference?: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  currency?: string;
  subtotal?: number;
  taxAmount?: number;
  shippingCost?: number;
  otherCosts?: number;
  total?: number;
  status?: 'draft' | 'submitted' | 'confirmed' | 'partial_received' | 'received' | 'cancelled';
  notes?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/inventory/purchase-orders`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePurchaseOrder(id: string, payload: {
  poNumber?: string;
  reference?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  currency?: string;
  subtotal?: number;
  taxAmount?: number;
  shippingCost?: number;
  otherCosts?: number;
  total?: number;
  status?: 'draft' | 'submitted' | 'confirmed' | 'partial_received' | 'received' | 'cancelled';
  notes?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/inventory/purchase-orders/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deletePurchaseOrder(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/inventory/purchase-orders/${id}`, { headers: authHeaders() });
  return status === 204;
}

// STOCK ITEMS
export async function listStockItems(params?: {
  variantId?: string;
  warehouseId?: string;
  binId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/inventory/stock-items', params);
}

export async function getStockItem(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/inventory/stock-items/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createStockItem(payload: {
  variantId: string;
  warehouseId: string;
  binId?: string;
  lotNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
  manufactureDate?: string;
  quantityOnHand?: number;
  quantityReserved?: number;
  safetyStockLevel?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  status?: 'available' | 'reserved' | 'quarantine' | 'damaged' | 'expired';
  costPrice?: number;
}) {
  const { data } = await axios.post(`${API_BASE}/api/inventory/stock-items`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateStockItem(id: string, payload: {
  binId?: string;
  lotNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
  manufactureDate?: string;
  quantityOnHand?: number;
  quantityReserved?: number;
  safetyStockLevel?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  status?: 'available' | 'reserved' | 'quarantine' | 'damaged' | 'expired';
  costPrice?: number;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/inventory/stock-items/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteStockItem(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/inventory/stock-items/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ASN (Advanced Shipping Notices)
export async function listASN(params?: {
  organizationId?: string;
  purchaseOrderId?: string;
  supplierId?: string;
  warehouseId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/inventory/asn', params);
}

export async function getASN(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/inventory/asn/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createASN(payload: {
  organizationId: string;
  purchaseOrderId?: string;
  supplierId: string;
  warehouseId: string;
  asnNumber: string;
  reference?: string;
  expectedDate: string;
  carrier?: string;
  trackingNumber?: string;
  totalPallets?: number;
  totalCartons?: number;
  status?: 'pending' | 'in_transit' | 'arrived' | 'receiving' | 'completed' | 'cancelled';
  notes?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/inventory/asn`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateASN(id: string, payload: {
  asnNumber?: string;
  reference?: string;
  expectedDate?: string;
  carrier?: string;
  trackingNumber?: string;
  totalPallets?: number;
  totalCartons?: number;
  status?: 'pending' | 'in_transit' | 'arrived' | 'receiving' | 'completed' | 'cancelled';
  notes?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/inventory/asn/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteASN(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/inventory/asn/${id}`, { headers: authHeaders() });
  return status === 204;
}

// GRN (Goods Receipt Notes)
export async function listGRN(params?: {
  organizationId?: string;
  asnId?: string;
  purchaseOrderId?: string;
  warehouseId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/inventory/grn', params);
}

export async function getGRN(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/inventory/grn/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createGRN(payload: {
  organizationId: string;
  asnId?: string;
  purchaseOrderId?: string;
  warehouseId: string;
  grnNumber: string;
  receivedDate: string;
  receivedById: string;
  status?: 'draft' | 'qa_pending' | 'approved' | 'rejected' | 'put_away';
  notes?: string;
  lines: Array<{
    purchaseOrderLineId?: string;
    variantId: string;
    quantityExpected: number;
    quantityReceived: number;
    quantityRejected?: number;
    lotNumber?: string;
    serialNumbers?: string;
    expiryDate?: string;
    qaStatus?: 'pending' | 'passed' | 'failed' | 'quarantine';
    qaNotes?: string;
  }>;
}) {
  const { data } = await axios.post(`${API_BASE}/api/inventory/grn`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateGRN(id: string, payload: {
  grnNumber?: string;
  receivedDate?: string;
  status?: 'draft' | 'qa_pending' | 'approved' | 'rejected' | 'put_away';
  notes?: string;
  lines?: Array<{
    purchaseOrderLineId?: string;
    variantId: string;
    quantityExpected: number;
    quantityReceived: number;
    quantityRejected?: number;
    lotNumber?: string;
    serialNumbers?: string;
    expiryDate?: string;
    qaStatus?: 'pending' | 'passed' | 'failed' | 'quarantine';
    qaNotes?: string;
  }>;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/inventory/grn/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteGRN(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/inventory/grn/${id}`, { headers: authHeaders() });
  return status === 204;
}

// Stock Transfers
export async function listStockTransfers(params?: {
  organizationId?: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/inventory/stock-transfers', params);
}

export async function getStockTransfer(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/inventory/stock-transfers/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export interface TransferAvailability {
  variantId: string;
  variantSku: string;
  variantName: string | null;
  available: number;
}

/** Stock that can be sent from a warehouse right now, keyed by variant. */
export async function listTransferAvailability(params: { warehouseId: string; search?: string }) {
  const q = new URLSearchParams({ warehouseId: params.warehouseId });
  if (params.search) q.append('search', params.search);
  const { data } = await axios.get(
    `${API_BASE}/api/inventory/stock-transfers/availability?${q.toString()}`,
    { headers: authHeaders() }
  );
  return data as { data: TransferAvailability[] };
}

/**
 * Creates a transfer, which is approved and moves the stock immediately.
 * `transferNumber` is generated server-side when omitted.
 */
export async function createStockTransfer(payload: {
  organizationId: string;
  transferNumber?: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  transferDate: string;
  expectedArrivalDate?: string;
  notes?: string;
  lines: Array<{
    variantId: string;
    lotNumber?: string;
    quantitySent: number;
    notes?: string;
  }>;
}) {
  const { data } = await axios.post(`${API_BASE}/api/inventory/stock-transfers`, payload, { headers: authHeaders() });
  return data as { data: any };
}

/** Amends the document only; quantities are fixed once the stock has moved. */
export async function updateStockTransfer(id: string, payload: {
  transferNumber?: string;
  transferDate?: string;
  expectedArrivalDate?: string;
  notes?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/inventory/stock-transfers/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteStockTransfer(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/inventory/stock-transfers/${id}`, { headers: authHeaders() });
  return status === 204;
}

// Stock Adjustments
export async function listStockAdjustments(params?: {
  organizationId?: string;
  stockItemId?: string;
  adjustmentType?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/inventory/stock-adjustments', params);
}

export async function getStockAdjustment(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/inventory/stock-adjustments/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createStockAdjustment(payload: {
  organizationId: string;
  stockItemId: string;
  adjustmentNumber: string;
  adjustmentDate: string;
  adjustmentType: 'increase' | 'decrease' | 'correction' | 'write_off' | 'found' | 'damaged';
  quantityChange: number;
  reason: string;
  costImpact?: number;
  adjustedById: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/inventory/stock-adjustments`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateStockAdjustment(id: string, payload: {
  adjustmentNumber?: string;
  adjustmentDate?: string;
  adjustmentType?: 'increase' | 'decrease' | 'correction' | 'write_off' | 'found' | 'damaged';
  quantityChange?: number;
  reason?: string;
  costImpact?: number;
  approvedById?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/inventory/stock-adjustments/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteStockAdjustment(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/inventory/stock-adjustments/${id}`, { headers: authHeaders() });
  return status === 204;
}

// Cycle Counts
export async function listCycleCounts(params?: {
  organizationId?: string;
  warehouseId?: string;
  status?: string;
  countType?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/inventory/cycle-counts', params);
}

export async function getCycleCount(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/inventory/cycle-counts/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createCycleCount(payload: {
  organizationId: string;
  warehouseId: string;
  countNumber: string;
  countDate: string;
  countType: 'full' | 'partial' | 'abc_class_a' | 'abc_class_b' | 'abc_class_c' | 'spot_check';
  status?: 'planned' | 'in_progress' | 'completed' | 'reconciled' | 'cancelled';
  assignedToId?: string;
  notes?: string;
  lines?: Array<{
    stockItemId: string;
    expectedQuantity: number;
    countedQuantity?: number;
    notes?: string;
  }>;
}) {
  const { data } = await axios.post(`${API_BASE}/api/inventory/cycle-counts`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCycleCount(id: string, payload: {
  countNumber?: string;
  countDate?: string;
  countType?: 'full' | 'partial' | 'abc_class_a' | 'abc_class_b' | 'abc_class_c' | 'spot_check';
  status?: 'planned' | 'in_progress' | 'completed' | 'reconciled' | 'cancelled';
  assignedToId?: string;
  completedById?: string;
  notes?: string;
  lines?: Array<{
    stockItemId: string;
    expectedQuantity: number;
    countedQuantity?: number;
    notes?: string;
  }>;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/inventory/cycle-counts/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteCycleCount(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/inventory/cycle-counts/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ============================================================================
// ORDERS API FUNCTIONS
// ============================================================================

// CUSTOMERS
export async function listCustomers(params?: {
  organizationId?: string;
  status?: string;
  customerType?: string;
  tier?: string;
  marketingOptIn?: string;
  hasEmail?: string;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: string;
  sortDir?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/orders/customers', params);
}

export async function getCustomer(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/orders/customers/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createCustomer(payload: {
  organizationId: string;
  customerNumber?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  customerType?: 'individual' | 'business' | 'wholesale' | 'vip';
  tier?: 'standard' | 'silver' | 'gold' | 'platinum';
  taxId?: string;
  taxExempt?: boolean;
  languageCode?: string;
  marketingOptIn?: boolean;
  notes?: string;
  status?: 'active' | 'inactive' | 'blocked';
}) {
  const { data } = await axios.post(`${API_BASE}/api/orders/customers`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCustomer(id: string, payload: {
  customerNumber?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  customerType?: 'individual' | 'business' | 'wholesale' | 'vip';
  tier?: 'standard' | 'silver' | 'gold' | 'platinum';
  taxId?: string;
  taxExempt?: boolean;
  languageCode?: string;
  marketingOptIn?: boolean;
  notes?: string;
  status?: 'active' | 'inactive' | 'blocked';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/orders/customers/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteCustomer(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/orders/customers/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ORDERS
export async function listOrders(params?: {
  organizationId?: string;
  customerId?: string;
  status?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  channel?: string;
  connectionId?: string;
  dateFrom?: string;
  dateTo?: string;
  minTotal?: string | number;
  maxTotal?: string | number;
  currency?: string;
  hasLines?: string;
  sortBy?: string;
  sortDir?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/orders/orders', params);
}

export async function getOrder(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/orders/orders/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createOrder(payload: {
  organizationId: string;
  businessUnitId?: string;
  orderNumber: string;
  channel: 'amazon' | 'ebay' | 'tiktok' | 'etsy' | 'shopify' | 'woocommerce' | 'wix' | 'b2b_portal' | 'pos' | 'phone' | 'email' | 'other';
  channelOrderId?: string;
  channelOrderNumber?: string;
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  orderDate: string;
  currency?: string;
  subtotal?: number;
  discountAmount?: number;
  shippingAmount?: number;
  taxAmount?: number;
  total: number;
  paymentStatus?: 'pending' | 'authorized' | 'partially_paid' | 'paid' | 'refunded' | 'failed';
  fulfillmentStatus?: 'pending' | 'processing' | 'partially_fulfilled' | 'fulfilled' | 'cancelled';
  shippingMethod?: string;
  requestedDeliveryDate?: string;
  giftMessage?: string;
  internalNotes?: string;
  customerNotes?: string;
  ipAddress?: string;
  userAgent?: string;
  fraudScore?: number;
  fraudStatus?: 'clear' | 'review' | 'flagged' | 'blocked';
  tags?: string;
  status?: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled' | 'refunded' | 'on_hold';
}) {
  const { data } = await axios.post(`${API_BASE}/api/orders/orders`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateOrder(id: string, payload: {
  orderNumber?: string;
  channel?: 'amazon' | 'ebay' | 'tiktok' | 'etsy' | 'shopify' | 'woocommerce' | 'wix' | 'b2b_portal' | 'pos' | 'phone' | 'email' | 'other';
  channelOrderId?: string;
  channelOrderNumber?: string;
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  orderDate?: string;
  currency?: string;
  subtotal?: number;
  discountAmount?: number;
  shippingAmount?: number;
  taxAmount?: number;
  total?: number;
  paymentStatus?: 'pending' | 'authorized' | 'partially_paid' | 'paid' | 'refunded' | 'failed';
  fulfillmentStatus?: 'pending' | 'processing' | 'partially_fulfilled' | 'fulfilled' | 'cancelled';
  shippingMethod?: string;
  requestedDeliveryDate?: string;
  giftMessage?: string;
  internalNotes?: string;
  customerNotes?: string;
  ipAddress?: string;
  userAgent?: string;
  fraudScore?: number;
  fraudStatus?: 'clear' | 'review' | 'flagged' | 'blocked';
  tags?: string;
  status?: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled' | 'refunded' | 'on_hold';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/orders/orders/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteOrder(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/orders/orders/${id}`, { headers: authHeaders() });
  return status === 204;
}

// RETURNS
export async function listReturns(params?: {
  organizationId?: string;
  orderId?: string;
  customerId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/orders/returns', params);
}

export async function getReturn(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/orders/returns/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createReturn(payload: {
  organizationId: string;
  returnNumber: string;
  orderId: string;
  customerId: string;
  returnDate: string;
  reasonCode: 'defective' | 'wrong_item' | 'not_as_described' | 'size_issue' | 'changed_mind' | 'damaged_in_transit' | 'other';
  reasonNotes?: string;
  refundMethod?: 'original_payment' | 'store_credit' | 'exchange' | 'no_refund';
  refundAmount?: number;
  restockingFee?: number;
  returnShippingPaidBy?: 'customer' | 'merchant';
  status?: 'requested' | 'approved' | 'rejected' | 'received' | 'refunded' | 'completed' | 'cancelled';
  notes?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/orders/returns`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function refundReturn(id: string, amount?: number) {
  const { data } = await axios.post(
    `${API_BASE}/api/orders/returns/${id}/refund`,
    amount == null ? {} : { amount },
    { headers: authHeaders() }
  );
  return data as {
    data: any;
    refund: {
      channel: 'woocommerce' | 'shopify';
      externalRefundId: string;
      amount: number;
      currency: string;
      fullyRefunded: boolean;
    };
  };
}

export async function updateReturn(id: string, payload: {
  returnNumber?: string;
  returnDate?: string;
  reasonCode?: 'defective' | 'wrong_item' | 'not_as_described' | 'size_issue' | 'changed_mind' | 'damaged_in_transit' | 'other';
  reasonNotes?: string;
  refundMethod?: 'original_payment' | 'store_credit' | 'exchange' | 'no_refund';
  refundAmount?: number;
  restockingFee?: number;
  returnShippingPaidBy?: 'customer' | 'merchant';
  status?: 'requested' | 'approved' | 'rejected' | 'received' | 'refunded' | 'completed' | 'cancelled';
  notes?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/orders/returns/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteReturn(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/orders/returns/${id}`, { headers: authHeaders() });
  return status === 204;
}

// CUSTOMER ADDRESSES
export async function listCustomerAddresses(params?: {
  customerId?: string;
  addressType?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.customerId) queryParams.append('customerId', params.customerId);
  if (params?.addressType) queryParams.append('addressType', params.addressType);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/orders/customer-addresses${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getCustomerAddress(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/orders/customer-addresses/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createCustomerAddress(payload: {
  customerId: string;
  addressType: 'shipping' | 'billing' | 'both';
  firstName?: string;
  lastName?: string;
  company?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateProvince?: string;
  postalCode: string;
  countryCode: string;
  phone?: string;
  isDefault?: boolean;
}) {
  const { data } = await axios.post(`${API_BASE}/api/orders/customer-addresses`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCustomerAddress(id: string, payload: {
  addressType?: 'shipping' | 'billing' | 'both';
  firstName?: string;
  lastName?: string;
  company?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  countryCode?: string;
  phone?: string;
  isDefault?: boolean;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/orders/customer-addresses/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteCustomerAddress(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/orders/customer-addresses/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ORDER LINES
export async function listOrderLines(params?: {
  orderId?: string;
  variantId?: string;
  fulfillmentStatus?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.orderId) queryParams.append('orderId', params.orderId);
  if (params?.variantId) queryParams.append('variantId', params.variantId);
  if (params?.fulfillmentStatus) queryParams.append('fulfillmentStatus', params.fulfillmentStatus);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/orders/order-lines${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getOrderLine(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/orders/order-lines/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createOrderLine(payload: {
  orderId: string;
  variantId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  lineTotal: number;
  costPrice?: number;
  warehouseId?: string;
  fulfillmentStatus?: 'pending' | 'allocated' | 'picked' | 'packed' | 'shipped' | 'cancelled';
  notes?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/orders/order-lines`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateOrderLine(id: string, payload: {
  sku?: string;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  discountAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  lineTotal?: number;
  costPrice?: number;
  quantityFulfilled?: number;
  warehouseId?: string;
  fulfillmentStatus?: 'pending' | 'allocated' | 'picked' | 'packed' | 'shipped' | 'cancelled';
  notes?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/orders/order-lines/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteOrderLine(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/orders/order-lines/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ORDER ADDRESSES
export async function listOrderAddresses(params?: {
  orderId?: string;
  addressType?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.orderId) queryParams.append('orderId', params.orderId);
  if (params?.addressType) queryParams.append('addressType', params.addressType);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/orders/order-addresses${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getOrderAddress(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/orders/order-addresses/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createOrderAddress(payload: {
  orderId: string;
  addressType: 'shipping' | 'billing';
  firstName?: string;
  lastName?: string;
  company?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateProvince?: string;
  postalCode: string;
  countryCode: string;
  phone?: string;
  email?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/orders/order-addresses`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateOrderAddress(id: string, payload: {
  addressType?: 'shipping' | 'billing';
  firstName?: string;
  lastName?: string;
  company?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  countryCode?: string;
  phone?: string;
  email?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/orders/order-addresses/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteOrderAddress(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/orders/order-addresses/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ORDER NOTES
export async function listOrderNotes(params?: {
  orderId?: string;
  noteType?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.orderId) queryParams.append('orderId', params.orderId);
  if (params?.noteType) queryParams.append('noteType', params.noteType);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/orders/order-notes${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getOrderNote(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/orders/order-notes/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createOrderNote(payload: {
  orderId: string;
  noteType?: 'internal' | 'customer' | 'system';
  note: string;
  isCustomerVisible?: boolean;
}) {
  const { data } = await axios.post(`${API_BASE}/api/orders/order-notes`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateOrderNote(id: string, payload: {
  noteType?: 'internal' | 'customer' | 'system';
  note?: string;
  isCustomerVisible?: boolean;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/orders/order-notes/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteOrderNote(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/orders/order-notes/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ============================================================================
// FINANCE API FUNCTIONS
// ============================================================================

// CHART OF ACCOUNTS
export async function listChartOfAccounts(params?: {
  organizationId?: string;
  businessUnitId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/finance/chart-of-accounts', params);
}

export async function getChartOfAccounts(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/chart-of-accounts/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createChartOfAccounts(payload: {
  organizationId: string;
  businessUnitId?: string;
  name: string;
  isDefault?: boolean;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.post(`${API_BASE}/api/finance/chart-of-accounts`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateChartOfAccounts(id: string, payload: {
  businessUnitId?: string;
  name?: string;
  isDefault?: boolean;
  status?: 'active' | 'inactive';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/chart-of-accounts/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteChartOfAccounts(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/finance/chart-of-accounts/${id}`, { headers: authHeaders() });
  return status === 204;
}

// LEDGER ACCOUNTS
export async function listLedgerAccounts(params?: {
  chartOfAccountsId?: string;
  accountType?: string;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/finance/ledger-accounts', params);
}

export async function getLedgerAccount(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/ledger-accounts/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createLedgerAccount(payload: {
  chartOfAccountsId: string;
  parentAccountId?: string;
  accountCode: string;
  accountName: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost_of_goods_sold';
  accountSubtype?: string;
  normalBalance: 'debit' | 'credit';
  description?: string;
  isSystem?: boolean;
  isActive?: boolean;
}) {
  const { data } = await axios.post(`${API_BASE}/api/finance/ledger-accounts`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateLedgerAccount(id: string, payload: {
  parentAccountId?: string;
  accountCode?: string;
  accountName?: string;
  accountType?: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost_of_goods_sold';
  accountSubtype?: string;
  normalBalance?: 'debit' | 'credit';
  description?: string;
  isActive?: boolean;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/ledger-accounts/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteLedgerAccount(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/finance/ledger-accounts/${id}`, { headers: authHeaders() });
  return status === 204;
}

// COST CENTERS
export async function listCostCenters(params?: {
  organizationId?: string;
  businessUnitId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/finance/cost-centers', params);
}

export async function getCostCenter(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/cost-centers/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createCostCenter(payload: {
  organizationId: string;
  businessUnitId?: string;
  code: string;
  name: string;
  description?: string;
  managerId?: string;
  status?: 'active' | 'inactive' | 'closed';
}) {
  const { data } = await axios.post(`${API_BASE}/api/finance/cost-centers`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCostCenter(id: string, payload: {
  businessUnitId?: string;
  code?: string;
  name?: string;
  description?: string;
  managerId?: string;
  status?: 'active' | 'inactive' | 'closed';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/cost-centers/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteCostCenter(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/finance/cost-centers/${id}`, { headers: authHeaders() });
  return status === 204;
}

// FISCAL PERIODS
export async function listFiscalPeriods(params?: {
  organizationId?: string;
  fiscalYear?: number;
  isClosed?: boolean;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/finance/fiscal-periods', params);
}

export async function getFiscalPeriod(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/fiscal-periods/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createFiscalPeriod(payload: {
  organizationId: string;
  periodName: string;
  periodType: 'month' | 'quarter' | 'year';
  startDate: string;
  endDate: string;
  fiscalYear: number;
}) {
  const { data } = await axios.post(`${API_BASE}/api/finance/fiscal-periods`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateFiscalPeriod(id: string, payload: {
  periodName?: string;
  periodType?: 'month' | 'quarter' | 'year';
  startDate?: string;
  endDate?: string;
  fiscalYear?: number;
  isClosed?: boolean;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/fiscal-periods/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteFiscalPeriod(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/finance/fiscal-periods/${id}`, { headers: authHeaders() });
  return status === 204;
}

// JOURNAL ENTRIES
export async function listJournalEntries(params?: {
  organizationId?: string;
  fiscalPeriodId?: string;
  status?: string;
  entryType?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/finance/journal-entries', params);
}

export async function getJournalEntry(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/journal-entries/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createJournalEntry(payload: {
  organizationId: string;
  businessUnitId?: string;
  fiscalPeriodId: string;
  journalNumber: string;
  entryDate: string;
  entryType?: 'standard' | 'adjusting' | 'closing' | 'reversing' | 'recurring';
  sourceType?: 'manual' | 'invoice' | 'payment' | 'order' | 'payroll' | 'inventory' | 'other';
  sourceId?: string;
  description?: string;
  reference?: string;
  status?: 'draft' | 'posted' | 'voided';
  journalLines: Array<{
    ledgerAccountId: string;
    costCenterId?: string;
    lineNumber: number;
    description?: string;
    debitAmount: number;
    creditAmount: number;
    currency?: string;
    exchangeRate?: number;
  }>;
}) {
  const { data } = await axios.post(`${API_BASE}/api/finance/journal-entries`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateJournalEntry(id: string, payload: {
  businessUnitId?: string;
  fiscalPeriodId?: string;
  journalNumber?: string;
  entryDate?: string;
  entryType?: 'standard' | 'adjusting' | 'closing' | 'reversing' | 'recurring';
  sourceType?: 'manual' | 'invoice' | 'payment' | 'order' | 'payroll' | 'inventory' | 'other';
  sourceId?: string;
  description?: string;
  reference?: string;
  status?: 'draft' | 'posted' | 'voided';
  journalLines?: Array<{
    ledgerAccountId: string;
    costCenterId?: string;
    lineNumber: number;
    description?: string;
    debitAmount: number;
    creditAmount: number;
    currency?: string;
    exchangeRate?: number;
  }>;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/journal-entries/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteJournalEntry(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/finance/journal-entries/${id}`, { headers: authHeaders() });
  return status === 204;
}

// BANK ACCOUNTS
export async function listBankAccounts(params?: {
  organizationId?: string;
  businessUnitId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/finance/bank-accounts', params);
}

export async function getBankAccount(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/bank-accounts/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createBankAccount(payload: {
  organizationId: string;
  businessUnitId?: string;
  accountName: string;
  bankName: string;
  accountNumber?: string;
  routingNumber?: string;
  iban?: string;
  swiftCode?: string;
  currency?: string;
  currentBalance?: number;
  ledgerAccountId?: string;
  isDefault?: boolean;
  status?: 'active' | 'inactive' | 'closed';
}) {
  const { data } = await axios.post(`${API_BASE}/api/finance/bank-accounts`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateBankAccount(id: string, payload: {
  businessUnitId?: string;
  accountName?: string;
  bankName?: string;
  accountNumber?: string;
  routingNumber?: string;
  iban?: string;
  swiftCode?: string;
  currency?: string;
  currentBalance?: number;
  ledgerAccountId?: string;
  isDefault?: boolean;
  status?: 'active' | 'inactive' | 'closed';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/bank-accounts/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteBankAccount(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/finance/bank-accounts/${id}`, { headers: authHeaders() });
  return status === 204;
}

// BANK TRANSACTIONS
export async function listBankTransactions(params?: {
  bankAccountId?: string;
  isReconciled?: boolean;
  transactionType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/finance/bank-transactions', params);
}

export async function getBankTransaction(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/bank-transactions/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createBankTransaction(payload: {
  bankAccountId: string;
  transactionDate: string;
  postDate?: string;
  transactionType: 'debit' | 'credit' | 'fee' | 'interest' | 'other';
  amount: number;
  currency?: string;
  description?: string;
  reference?: string;
  payeePayer?: string;
  balance?: number;
  isReconciled?: boolean;
  journalEntryId?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/finance/bank-transactions`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateBankTransaction(id: string, payload: {
  transactionDate?: string;
  postDate?: string;
  transactionType?: 'debit' | 'credit' | 'fee' | 'interest' | 'other';
  amount?: number;
  currency?: string;
  description?: string;
  reference?: string;
  payeePayer?: string;
  balance?: number;
  isReconciled?: boolean;
  journalEntryId?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/bank-transactions/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteBankTransaction(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/finance/bank-transactions/${id}`, { headers: authHeaders() });
  return status === 204;
}

// VAT RETURNS
export async function listVatReturns(params?: {
  organizationId?: string;
  businessUnitId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/finance/vat-returns', params);
}

export async function getVatReturn(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/vat-returns/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createVatReturn(payload: {
  organizationId: string;
  businessUnitId?: string;
  returnNumber: string;
  periodStart: string;
  periodEnd: string;
  vatDueSales?: number;
  vatDueAcquisitions?: number;
  vatReclaimed?: number;
  totalValueSales?: number;
  totalValuePurchases?: number;
  totalValueGoodsSupplied?: number;
  totalAcquisitions?: number;
  status?: 'draft' | 'submitted' | 'accepted' | 'rejected';
  mtdReference?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/finance/vat-returns`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateVatReturn(id: string, payload: {
  businessUnitId?: string;
  returnNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  vatDueSales?: number;
  vatDueAcquisitions?: number;
  vatReclaimed?: number;
  totalValueSales?: number;
  totalValuePurchases?: number;
  totalValueGoodsSupplied?: number;
  totalAcquisitions?: number;
  status?: 'draft' | 'submitted' | 'accepted' | 'rejected';
  mtdReference?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/vat-returns/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteVatReturn(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/finance/vat-returns/${id}`, { headers: authHeaders() });
  return status === 204;
}

// BUDGET LINES
export async function listBudgetLines(params?: {
  organizationId?: string;
  businessUnitId?: string;
  costCenterId?: string;
  ledgerAccountId?: string;
  fiscalPeriodId?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/finance/budget-lines', params);
}

export async function getBudgetLine(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/budget-lines/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createBudgetLine(payload: {
  organizationId: string;
  businessUnitId?: string;
  costCenterId?: string;
  ledgerAccountId: string;
  fiscalPeriodId: string;
  budgetedAmount: number;
  actualAmount?: number;
  variancePercent?: number;
  notes?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/finance/budget-lines`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateBudgetLine(id: string, payload: {
  businessUnitId?: string;
  costCenterId?: string;
  ledgerAccountId?: string;
  fiscalPeriodId?: string;
  budgetedAmount?: number;
  actualAmount?: number;
  variancePercent?: number;
  notes?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/budget-lines/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteBudgetLine(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/finance/budget-lines/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ============================================================================
// HR MODULE
// ============================================================================

// EMPLOYEES
export async function listEmployees(params?: {
  organizationId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/hr/employees', params);
}

export async function getEmployee(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/hr/employees/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createEmployee(payload: {
  organizationId: string;
  userId?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed' | 'other';
  nationalId?: string;
  taxId?: string;
  niNumber?: string;
  taxCode?: string;
  department?: string;
  jobTitle?: string;
  annualSalary?: number;
  payFrequency?: string;
  passportNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  countryCode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  hireDate: string;
  terminationDate?: string;
  employmentType?: 'full_time' | 'part_time' | 'contract' | 'temporary' | 'intern';
  status?: 'active' | 'on_leave' | 'suspended' | 'terminated';
  photoUrl?: string;
  notes?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/hr/employees`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateEmployee(id: string, payload: {
  userId?: string;
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed' | 'other';
  nationalId?: string;
  taxId?: string;
  niNumber?: string;
  taxCode?: string;
  department?: string;
  jobTitle?: string;
  annualSalary?: number;
  payFrequency?: string;
  passportNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  countryCode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  hireDate?: string;
  terminationDate?: string;
  employmentType?: 'full_time' | 'part_time' | 'contract' | 'temporary' | 'intern';
  status?: 'active' | 'on_leave' | 'suspended' | 'terminated';
  photoUrl?: string;
  notes?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/employees/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteEmployee(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/hr/employees/${id}`, { headers: authHeaders() });
  return status === 204;
}

// EMPLOYMENT CONTRACTS
export async function listEmploymentContracts(params?: {
  employeeId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/hr/employment-contracts', params);
}

export async function getEmploymentContract(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/hr/employment-contracts/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createEmploymentContract(payload: {
  employeeId: string;
  businessUnitId: string;
  locationId?: string;
  costCenterId?: string;
  jobTitle: string;
  department?: string;
  reportingTo?: string;
  contractType: 'permanent' | 'fixed_term' | 'contract' | 'zero_hours';
  startDate: string;
  endDate?: string;
  salaryAmount: number;
  salaryCurrency?: string;
  salaryPeriod?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'annual';
  workingHoursPerWeek?: number;
  probationPeriodDays?: number;
  noticePeriodDays?: number;
  contractDocumentUrl?: string;
  isCurrent?: boolean;
  status?: 'draft' | 'active' | 'expired' | 'terminated';
}) {
  const { data } = await axios.post(`${API_BASE}/api/hr/employment-contracts`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateEmploymentContract(id: string, payload: {
  businessUnitId?: string;
  locationId?: string;
  costCenterId?: string;
  jobTitle?: string;
  department?: string;
  reportingTo?: string;
  contractType?: 'permanent' | 'fixed_term' | 'contract' | 'zero_hours';
  startDate?: string;
  endDate?: string;
  salaryAmount?: number;
  salaryCurrency?: string;
  salaryPeriod?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'annual';
  workingHoursPerWeek?: number;
  probationPeriodDays?: number;
  noticePeriodDays?: number;
  contractDocumentUrl?: string;
  isCurrent?: boolean;
  status?: 'draft' | 'active' | 'expired' | 'terminated';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/employment-contracts/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteEmploymentContract(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/hr/employment-contracts/${id}`, { headers: authHeaders() });
  return status === 204;
}

// EMPLOYEE DOCUMENTS
export async function listEmployeeDocuments(params?: {
  employeeId?: string;
  documentType?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/hr/employee-documents', params);
}

export async function getEmployeeDocument(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/hr/employee-documents/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createEmployeeDocument(payload: {
  employeeId: string;
  documentType: 'contract' | 'offer_letter' | 'id' | 'passport' | 'certificate' | 'performance_review' | 'warning' | 'other';
  documentName: string;
  documentUrl: string;
  documentNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  uploadedBy?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/hr/employee-documents`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateEmployeeDocument(id: string, payload: {
  documentType?: 'contract' | 'offer_letter' | 'id' | 'passport' | 'certificate' | 'performance_review' | 'warning' | 'other';
  documentName?: string;
  documentUrl?: string;
  documentNumber?: string;
  issueDate?: string;
  expiryDate?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/employee-documents/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteEmployeeDocument(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/hr/employee-documents/${id}`, { headers: authHeaders() });
  return status === 204;
}

// TIME ENTRIES
export async function listTimeEntries(params?: {
  employeeId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/hr/time-entries', params);
}

export async function getTimeEntry(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/hr/time-entries/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createTimeEntry(payload: {
  employeeId: string;
  businessUnitId: string;
  locationId?: string;
  entryDate: string;
  clockInTime: string;
  clockOutTime?: string;
  totalHours?: number;
  breakMinutes?: number;
  overtimeHours?: number;
  entryType?: 'regular' | 'overtime' | 'holiday' | 'sick' | 'unpaid';
  notes?: string;
  status?: 'pending' | 'approved' | 'rejected';
}) {
  const { data } = await axios.post(`${API_BASE}/api/hr/time-entries`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateTimeEntry(id: string, payload: {
  locationId?: string;
  entryDate?: string;
  clockInTime?: string;
  clockOutTime?: string;
  totalHours?: number;
  breakMinutes?: number;
  overtimeHours?: number;
  entryType?: 'regular' | 'overtime' | 'holiday' | 'sick' | 'unpaid';
  notes?: string;
  status?: 'pending' | 'approved' | 'rejected';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/time-entries/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteTimeEntry(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/hr/time-entries/${id}`, { headers: authHeaders() });
  return status === 204;
}

// LEAVE REQUESTS
export async function listLeaveRequests(params?: {
  employeeId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/hr/leave-requests', params);
}

export async function getLeaveRequest(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/hr/leave-requests/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createLeaveRequest(payload: {
  employeeId: string;
  leaveType: 'vacation' | 'sick' | 'personal' | 'maternity' | 'paternity' | 'bereavement' | 'unpaid' | 'other';
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string;
  notes?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/hr/leave-requests`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateLeaveRequest(id: string, payload: {
  leaveType?: 'vacation' | 'sick' | 'personal' | 'maternity' | 'paternity' | 'bereavement' | 'unpaid' | 'other';
  startDate?: string;
  endDate?: string;
  totalDays?: number;
  reason?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejectionReason?: string;
  notes?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/leave-requests/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteLeaveRequest(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/hr/leave-requests/${id}`, { headers: authHeaders() });
  return status === 204;
}

// SHIFTS
export async function listShifts(params?: {
  employeeId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/hr/shifts', params);
}

export async function getShift(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/hr/shifts/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createShift(payload: {
  employeeId: string;
  businessUnitId: string;
  locationId?: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  shiftType?: 'regular' | 'opening' | 'closing' | 'split' | 'on_call';
  notes?: string;
  status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
}) {
  const { data } = await axios.post(`${API_BASE}/api/hr/shifts`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateShift(id: string, payload: {
  locationId?: string;
  shiftDate?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  shiftType?: 'regular' | 'opening' | 'closing' | 'split' | 'on_call';
  notes?: string;
  status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/shifts/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteShift(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/hr/shifts/${id}`, { headers: authHeaders() });
  return status === 204;
}

// PAYROLL RUNS
export async function listPayrollRuns(params?: {
  organizationId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/hr/payroll-runs', params);
}

export async function getPayrollRun(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/hr/payroll-runs/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createPayrollRun(payload: {
  organizationId: string;
  businessUnitId?: string;
  payrollNumber: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  currency?: string;
  status?: 'draft' | 'calculated' | 'approved' | 'paid' | 'posted';
}) {
  const { data } = await axios.post(`${API_BASE}/api/hr/payroll-runs`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePayrollRun(id: string, payload: {
  businessUnitId?: string;
  payrollNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  paymentDate?: string;
  currency?: string;
  status?: 'draft' | 'calculated' | 'approved' | 'paid' | 'posted';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/payroll-runs/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deletePayrollRun(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/hr/payroll-runs/${id}`, { headers: authHeaders() });
  return status === 204;
}

// PAYROLL LINES
export async function listPayrollLines(params?: {
  payrollRunId?: string;
  employeeId?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/hr/payroll-lines', params);
}

export async function getPayrollLine(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/hr/payroll-lines/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createPayrollLine(payload: {
  payrollRunId: string;
  employeeId: string;
  costCenterId?: string;
  grossPay: number;
  taxDeduction?: number;
  nationalInsurance?: number;
  pensionDeduction?: number;
  otherDeductions?: number;
  employerNi?: number;
  employerPension?: number;
  regularHours?: number;
  overtimeHours?: number;
  holidayHours?: number;
  sickHours?: number;
  paymentMethod?: 'bank_transfer' | 'check' | 'cash' | 'paypal';
  payslipUrl?: string;
  notes?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/hr/payroll-lines`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePayrollLine(id: string, payload: {
  costCenterId?: string;
  grossPay?: number;
  taxDeduction?: number;
  nationalInsurance?: number;
  pensionDeduction?: number;
  otherDeductions?: number;
  employerNi?: number;
  employerPension?: number;
  regularHours?: number;
  overtimeHours?: number;
  holidayHours?: number;
  sickHours?: number;
  paymentMethod?: 'bank_transfer' | 'check' | 'cash' | 'paypal';
  payslipUrl?: string;
  notes?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/payroll-lines/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deletePayrollLine(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/hr/payroll-lines/${id}`, { headers: authHeaders() });
  return status === 204;
}

// TASKS
export async function listTasks(params?: {
  organizationId?: string;
  status?: string;
  assignedTo?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/hr/tasks', params);
}

export async function getTask(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/hr/tasks/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createTask(payload: {
  organizationId: string;
  title: string;
  description?: string;
  taskType?: 'order' | 'project' | 'maintenance' | 'support' | 'other';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  assignedBy?: string;
  businessUnitId?: string;
  locationId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  dueDate?: string;
  estimatedHours?: number;
  notes?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/hr/tasks`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateTask(id: string, payload: {
  title?: string;
  description?: string;
  taskType?: 'order' | 'project' | 'maintenance' | 'support' | 'other';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  businessUnitId?: string;
  locationId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  dueDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  status?: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  notes?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/tasks/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteTask(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/hr/tasks/${id}`, { headers: authHeaders() });
  return status === 204;
}

// KPI DEFINITIONS
export async function listKpiDefinitions(params?: {
  organizationId?: string;
  kpiCategory?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/hr/kpi-definitions', params);
}

export async function getKpiDefinition(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/hr/kpi-definitions/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createKpiDefinition(payload: {
  organizationId: string;
  kpiCode: string;
  kpiName: string;
  kpiCategory: 'sales' | 'operations' | 'finance' | 'customer_service' | 'hr' | 'marketing' | 'other';
  description?: string;
  unitOfMeasure?: string;
  targetValue?: number;
  calculationMethod?: string;
  isHigherBetter?: boolean;
  isActive?: boolean;
}) {
  const { data } = await axios.post(`${API_BASE}/api/hr/kpi-definitions`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateKpiDefinition(id: string, payload: {
  kpiCode?: string;
  kpiName?: string;
  kpiCategory?: 'sales' | 'operations' | 'finance' | 'customer_service' | 'hr' | 'marketing' | 'other';
  description?: string;
  unitOfMeasure?: string;
  targetValue?: number;
  calculationMethod?: string;
  isHigherBetter?: boolean;
  isActive?: boolean;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/kpi-definitions/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteKpiDefinition(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/hr/kpi-definitions/${id}`, { headers: authHeaders() });
  return status === 204;
}

// KPI RECORDS
export async function listKpiRecords(params?: {
  kpiDefinitionId?: string;
  employeeId?: string;
  businessUnitId?: string;
  page?: number;
  limit?: number;
}) {
  return getPaginatedList('/api/hr/kpi-records', params);
}

export async function getKpiRecord(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/hr/kpi-records/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createKpiRecord(payload: {
  kpiDefinitionId: string;
  businessUnitId?: string;
  locationId?: string;
  employeeId?: string;
  periodType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  periodStart: string;
  periodEnd: string;
  actualValue: number;
  targetValue?: number;
  variancePercent?: number;
  notes?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/hr/kpi-records`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateKpiRecord(id: string, payload: {
  businessUnitId?: string;
  locationId?: string;
  employeeId?: string;
  periodType?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  periodStart?: string;
  periodEnd?: string;
  actualValue?: number;
  targetValue?: number;
  variancePercent?: number;
  notes?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/kpi-records/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteKpiRecord(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/hr/kpi-records/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ============================================================================
// CRM API FUNCTIONS
// ============================================================================

// TICKETS
export async function listTickets(params?: {
  organizationId?: string;
  customerId?: string;
  orderId?: string;
  status?: string;
  priority?: string;
  category?: string;
}) {
  const queryParams = new URLSearchParams();
  if (params?.organizationId) queryParams.append('organizationId', params.organizationId);
  if (params?.customerId) queryParams.append('customerId', params.customerId);
  if (params?.orderId) queryParams.append('orderId', params.orderId);
  if (params?.status) queryParams.append('status', params.status);
  if (params?.priority) queryParams.append('priority', params.priority);
  if (params?.category) queryParams.append('category', params.category);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/crm/tickets${query}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getTicket(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/crm/tickets/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createTicket(payload: {
  organizationId: string;
  customerId?: string;
  orderId?: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'phone' | 'chat' | 'social_dm' | 'web_form';
  subject: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: 'order_inquiry' | 'return' | 'complaint' | 'technical' | 'billing' | 'general' | 'other';
}) {
  const { data } = await axios.post(`${API_BASE}/api/crm/tickets`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateTicket(id: string, payload: {
  subject?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: 'order_inquiry' | 'return' | 'complaint' | 'technical' | 'billing' | 'general' | 'other';
  status?: 'new' | 'open' | 'pending_customer' | 'pending_internal' | 'resolved' | 'closed' | 'cancelled';
  tags?: string;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/crm/tickets/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function addTicketMessage(id: string, payload: {
  senderType: 'customer' | 'agent' | 'system';
  senderId?: string;
  senderName?: string;
  senderEmail?: string;
  message: string;
  isInternal?: boolean;
  attachments?: any;
}) {
  const { data } = await axios.post(`${API_BASE}/api/crm/tickets/${id}/messages`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function assignTicket(id: string, payload: {
  assignedTo: string;
  notes?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/crm/tickets/${id}/assign`, payload, { headers: authHeaders() });
  return data as { data: any };
}

// CANNED RESPONSES
export async function listCannedResponses() {
  const { data } = await axios.get(`${API_BASE}/api/crm/canned-responses`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getCannedResponse(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/crm/canned-responses/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createCannedResponse(payload: {
  organizationId: string;
  title: string;
  shortcut?: string | null;
  content: string;
  category?: string | null;
  isActive?: boolean;
}) {
  const { data } = await axios.post(`${API_BASE}/api/crm/canned-responses`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCannedResponse(id: string, payload: {
  title?: string;
  shortcut?: string | null;
  content?: string;
  category?: string | null;
  isActive?: boolean;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/crm/canned-responses/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteCannedResponse(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/crm/canned-responses/${id}`, { headers: authHeaders() });
  return status === 204;
}

export async function incrementCannedResponseUsage(id: string) {
  const { data } = await axios.post(`${API_BASE}/api/crm/canned-responses/${id}/usage`, {}, { headers: authHeaders() });
  return data as { data: any };
}

// CUSTOMER TIERS
export async function listCustomerTiers() {
  const { data } = await axios.get(`${API_BASE}/api/crm/customer-tiers`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getCustomerTier(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/crm/customer-tiers/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createCustomerTier(payload: {
  organizationId: string;
  tierName: string;
  tierCode: string;
  minLifetimeValue?: number | null;
  minOrders?: number | null;
  benefits?: any | null;
  discountPercent?: number | null;
  prioritySupport?: boolean;
  position?: number;
  isActive?: boolean;
}) {
  const { data } = await axios.post(`${API_BASE}/api/crm/customer-tiers`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCustomerTier(id: string, payload: {
  tierName?: string;
  tierCode?: string;
  minLifetimeValue?: number | null;
  minOrders?: number | null;
  benefits?: any | null;
  discountPercent?: number | null;
  prioritySupport?: boolean;
  position?: number;
  isActive?: boolean;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/crm/customer-tiers/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteCustomerTier(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/crm/customer-tiers/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ---------------------------------------------------------------------------
// CRM SALES — see rabs-api/docs/CRM_API.md
// Account = ERP customers (id = customerId). Stages at /api/crm/stages.
// ---------------------------------------------------------------------------

function crmQuery(params?: Record<string, string | number | boolean | undefined | null>) {
  const q = new URLSearchParams();
  if (!params) return '';
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    q.append(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

// DASHBOARD
export async function getCrmDashboard(params?: { organizationId?: string }) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/dashboard${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as {
    data: {
      openTickets?: number;
      myOpenDeals?: number;
      openDealsTotal?: number;
      overdueActivities?: number;
      leadsByStatus?: Record<string, number>;
      asOf?: string;
      [key: string]: any;
    };
  };
}

export async function getCrmForecast(params?: {
  organizationId?: string;
  ownerUserId?: string;
  pipelineId?: string;
  from?: string;
  to?: string;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/forecast${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any; meta?: any };
}

export async function getCrmSettings(params?: { organizationId?: string }) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/settings${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function listCrmAssignableUsers(params?: { organizationId?: string }) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/assignable-users${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as {
    data: Array<{
      id: string;
      email: string;
      firstName?: string | null;
      lastName?: string | null;
      role?: string;
    }>;
    meta?: { total?: number };
  };
}

export async function updateCrmSettings(payload: {
  autoAssignLeads?: boolean;
  autoFollowupOnLead?: boolean;
  organizationId?: string;
}) {
  const { data } = await axios.patch(
    `${API_BASE}/api/crm/settings`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function listCrmContacts(params?: {
  organizationId?: string;
  customerId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/contacts${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createCrmContact(payload: {
  organizationId?: string;
  customerId: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
}) {
  const { data } = await axios.post(`${API_BASE}/api/crm/contacts`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCrmContact(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/crm/contacts/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteCrmContact(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/crm/contacts/${id}`, { headers: authHeaders() });
  return status === 204 || status === 200;
}

// ACCOUNTS (ERP customers + CRM enrichment; id === customerId)
export async function listCrmAccounts(params?: {
  organizationId?: string;
  search?: string;
  ownerUserId?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/accounts${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: { total?: number; page?: number; limit?: number } };
}

export async function getCrmAccount(customerId: string, params?: { orderLimit?: number }) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/accounts/${customerId}${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as {
    data: {
      customer?: any;
      addresses?: any[];
      recentOrders?: any[];
      openTickets?: any[];
      deals?: any[];
      activities?: any[];
      notes?: any[];
      contacts?: any[];
      tags?: any[];
      portalRetailer?: any | null;
      [key: string]: any;
    };
  };
}

export async function getCrmAccountTimeline(customerId: string, params?: { limit?: number }) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/accounts/${customerId}/timeline${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: Array<{ id: string; type: string; at: string; title: string; body?: string | null; meta?: any }>; meta?: any };
}

export async function updateCrmAccount(customerId: string, payload: { crmOwnerUserId?: string | null }) {
  const { data } = await axios.patch(
    `${API_BASE}/api/crm/accounts/${customerId}`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function listCrmAccountNotes(customerId: string) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/accounts/${customerId}/notes`,
    { headers: authHeaders() }
  );
  return data as { data: any[] };
}

export async function addCrmAccountNote(customerId: string, payload: {
  note: string;
  noteType?: string;
  isImportant?: boolean;
}) {
  const { data } = await axios.post(
    `${API_BASE}/api/crm/accounts/${customerId}/notes`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

// LEADS
export async function listCrmLeads(params?: {
  organizationId?: string;
  status?: string;
  ownerUserId?: string;
  priority?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/leads${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function getCrmLead(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/crm/leads/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createCrmLead(payload: {
  organizationId?: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: string;
  ownerUserId?: string | null;
  affiliateId?: string | null;
  notes?: string | null;
  score?: number | null;
  priority?: string;
  disqualifiedReason?: string | null;
}) {
  const { data } = await axios.post(`${API_BASE}/api/crm/leads`, payload, { headers: authHeaders() });
  return data as { data: any; meta?: any };
}

export async function updateCrmLead(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/crm/leads/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function bulkAssignCrmLeads(payload: {
  leadIds: string[];
  ownerUserId: string;
  organizationId?: string;
}) {
  const { data } = await axios.post(
    `${API_BASE}/api/crm/leads/bulk-assign`,
    payload,
    { headers: authHeaders() }
  );
  return data as {
    data: { updated: number; followUps: number; ownerUserId: string };
    meta?: { requested?: number; found?: number };
  };
}

export async function convertCrmLead(id: string, payload?: {
  customerId?: string;
  createDeal?: boolean;
  dealName?: string;
  dealAmount?: number;
  currency?: string;
  pipelineId?: string;
  stageId?: string;
  ownerUserId?: string;
  customerType?: string;
}) {
  const { data } = await axios.post(
    `${API_BASE}/api/crm/leads/${id}/convert`,
    payload || {},
    { headers: authHeaders() }
  );
  return data as { data: { lead?: any; customer?: any; deal?: any | null } };
}

// PIPELINES & STAGES
export async function listCrmPipelines(params?: { organizationId?: string }) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/pipelines${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[] };
}

export async function createCrmPipeline(payload: {
  organizationId?: string;
  name: string;
  type?: 'onboarding' | 'expansion' | 'credit';
  isDefault?: boolean;
}) {
  const { data } = await axios.post(`${API_BASE}/api/crm/pipelines`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCrmPipeline(id: string, payload: {
  name?: string;
  type?: string;
  isDefault?: boolean;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/crm/pipelines/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function listCrmStages(params?: { pipelineId?: string; organizationId?: string }) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/stages${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[] };
}

export async function createCrmStage(payload: {
  pipelineId: string;
  name: string;
  position?: number;
  probability?: number;
  isWon?: boolean;
  isLost?: boolean;
}) {
  const { data } = await axios.post(`${API_BASE}/api/crm/stages`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCrmStage(id: string, payload: {
  name?: string;
  position?: number;
  probability?: number;
  isWon?: boolean;
  isLost?: boolean;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/crm/stages/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteCrmStage(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/crm/stages/${id}`, { headers: authHeaders() });
  return status === 204 || status === 200;
}

/** @deprecated use createCrmStage — kept for call-site compatibility */
export async function createCrmPipelineStage(pipelineId: string, payload: {
  name: string;
  position?: number;
  probability?: number;
  isWon?: boolean;
  isLost?: boolean;
}) {
  return createCrmStage({ pipelineId, ...payload });
}

/** @deprecated use updateCrmStage */
export async function updateCrmPipelineStage(_pipelineId: string, stageId: string, payload: {
  name?: string;
  position?: number;
  probability?: number;
  isWon?: boolean;
  isLost?: boolean;
}) {
  return updateCrmStage(stageId, payload);
}

/** @deprecated use deleteCrmStage */
export async function deleteCrmPipelineStage(_pipelineId: string, stageId: string) {
  return deleteCrmStage(stageId);
}

// DEALS
export async function listCrmDeals(params?: {
  organizationId?: string;
  pipelineId?: string;
  stageId?: string;
  customerId?: string;
  ownerUserId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/deals${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function getCrmDeal(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/crm/deals/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createCrmDeal(payload: {
  organizationId?: string;
  pipelineId: string;
  stageId?: string;
  customerId?: string;
  name: string;
  amount?: number;
  currency?: string;
  expectedClose?: string;
  ownerUserId?: string;
  leadId?: string | null;
}) {
  const { data } = await axios.post(`${API_BASE}/api/crm/deals`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCrmDeal(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/crm/deals/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function moveCrmDeal(id: string, payload: {
  stageId: string;
  note?: string;
  lostReason?: string;
}) {
  const { data } = await axios.post(
    `${API_BASE}/api/crm/deals/${id}/move`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

// ACTIVITIES
export async function listCrmActivities(params?: {
  organizationId?: string;
  ownerUserId?: string;
  customerId?: string;
  leadId?: string;
  dealId?: string;
  ticketId?: string;
  type?: string;
  openOnly?: boolean | string;
  overdue?: boolean | string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/activities${crmQuery(params as any)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createCrmActivity(payload: {
  organizationId?: string;
  type: 'task' | 'call' | 'meeting' | 'note';
  subject: string;
  body?: string;
  dueAt?: string;
  ownerUserId?: string;
  customerId?: string;
  leadId?: string | null;
  dealId?: string | null;
  ticketId?: string | null;
  orderId?: string | null;
}) {
  const { data } = await axios.post(`${API_BASE}/api/crm/activities`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateCrmActivity(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/crm/activities/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

/** Complete via PATCH { completed: true } per CRM_API.md */
export async function completeCrmActivity(id: string) {
  return updateCrmActivity(id, { completed: true });
}

// ============================================================================
// FINANCE/PAYMENTS API FUNCTIONS
// ============================================================================

// GATEWAYS
export async function listGateways(organizationId: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/gateways?organizationId=${organizationId}`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getGateway(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/gateways/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createGateway(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/finance/gateways`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateGateway(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/gateways/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteGateway(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/finance/gateways/${id}`, { headers: authHeaders() });
  return status === 204 || status === 200;
}
export async function testGatewayConnection(id: string) {
  const { data } = await axios.post(`${API_BASE}/api/finance/gateways/${id}/test`, {}, { headers: authHeaders() });
  return data as { data: { ok: boolean; message: string; mode?: string; httpStatus?: number } };
}
export async function getPaymentDashboard(organizationId: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/payments/dashboard`, {
    params: { organizationId },
    headers: authHeaders()
  });
  return data as { data: any };
}

// PAYMENTS
export async function listPayments(
  organizationId: string,
  params?: {
    status?: string;
    paymentMethod?: string;
    paymentType?: string;
    currency?: string;
    channel?: string;
    connectionId?: string;
    dateFrom?: string;
    dateTo?: string;
    minAmount?: string | number;
    maxAmount?: string | number;
    search?: string;
    sortBy?: string;
    sortDir?: string;
    page?: number;
    limit?: number;
  }
) {
  return getPaginatedList('/api/finance/payments', { organizationId, ...params });
}
export async function getPayment(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/payments/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createPayment(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/finance/payments`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updatePayment(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/payments/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deletePayment(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/finance/payments/${id}`, { headers: authHeaders() });
  return status === 204;
}

// INVOICES
export async function listInvoices(
  organizationId: string,
  params?: {
    status?: string;
    channel?: string;
    connectionId?: string;
    currency?: string;
    dateFrom?: string;
    dateTo?: string;
    minAmount?: string | number;
    maxAmount?: string | number;
    outstanding?: string;
    search?: string;
    sortBy?: string;
    sortDir?: string;
    page?: number;
    limit?: number;
  }
) {
  return getPaginatedList('/api/finance/invoices', { organizationId, ...params });
}

export async function getInvoice(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/invoices/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function listUninvoicedOrders(organizationId: string) {
  const { data } = await axios.get(
    `${API_BASE}/api/finance/invoices/uninvoiced-orders?organizationId=${organizationId}`,
    { headers: authHeaders() }
  );
  return data as {
    data: {
      count: number;
      orderIds: string[];
      byChannel: Array<{ channel: string; store: string | null; count: number; value: number }>;
    };
  };
}

export async function generateInvoices(payload: {
  organizationId: string;
  orderIds?: string[];
  limit?: number;
}) {
  const { data } = await axios.post(`${API_BASE}/api/finance/invoices/generate`, payload, {
    headers: authHeaders(),
    timeout: 300000
  });
  return data as {
    data: {
      created: number;
      skipped: Array<{ orderId: string; reason: string }>;
      invoices: Array<{ id: string; invoiceNumber: string; orderId: string | null; total: number }>;
    };
  };
}
export async function createInvoice(payload: Record<string, unknown>) {
  const { data } = await axios.post(`${API_BASE}/api/finance/invoices`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateInvoice(id: string, payload: Record<string, unknown>) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/invoices/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteInvoice(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/finance/invoices/${id}`, { headers: authHeaders() });
  return status === 204;
}

// ==== Finance: Payouts & Settlements ====

export async function listPayouts(organizationId: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/payouts?organizationId=${organizationId}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getPayout(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/payouts/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createPayout(payload: Record<string, unknown>) {
  const { data } = await axios.post(`${API_BASE}/api/finance/payouts`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePayout(id: string, payload: Record<string, unknown>) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/payouts/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deletePayout(id: string) {
  const { data } = await axios.delete(`${API_BASE}/api/finance/payouts/${id}`, { headers: authHeaders() });
  return data;
}

export async function listSettlements(organizationId: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/settlements?organizationId=${organizationId}`, { headers: authHeaders() });
  return data as { data: any[] };
}

export async function getSettlement(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/finance/settlements/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createSettlement(payload: Record<string, unknown>) {
  const { data } = await axios.post(`${API_BASE}/api/finance/settlements`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateSettlement(id: string, payload: Record<string, unknown>) {
  const { data } = await axios.patch(`${API_BASE}/api/finance/settlements/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteSettlement(id: string) {
  const { data } = await axios.delete(`${API_BASE}/api/finance/settlements/${id}`, { headers: authHeaders() });
  return data;
}

// ============================================================================
// MARKETING API FUNCTIONS
// ============================================================================

// SEGMENTS
export async function listSegments() {
  const { data } = await axios.get(`${API_BASE}/api/marketing/segments`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getSegment(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/marketing/segments/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createSegment(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/marketing/segments`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateSegment(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/marketing/segments/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteSegment(id: string) {
  const { data } = await axios.delete(`${API_BASE}/api/marketing/segments/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function listSegmentMembers(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/marketing/segments/${id}/members`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function addSegmentMembers(id: string, customerIds: string[]) {
  const { data } = await axios.post(`${API_BASE}/api/marketing/segments/${id}/members`, { customerIds }, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function removeSegmentMember(id: string, customerId: string) {
  const { data } = await axios.delete(`${API_BASE}/api/marketing/segments/${id}/members/${customerId}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function recalculateSegment(id: string) {
  const { data } = await axios.post(`${API_BASE}/api/marketing/segments/${id}/recalculate`, {}, { headers: authHeaders() });
  return data as { data: any };
}

// CAMPAIGNS
export async function listCampaigns() {
  const { data } = await axios.get(`${API_BASE}/api/marketing/campaigns`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getCampaign(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/marketing/campaigns/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createCampaign(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/marketing/campaigns`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateCampaign(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/marketing/campaigns/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteCampaign(id: string) {
  const { data } = await axios.delete(`${API_BASE}/api/marketing/campaigns/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function listCampaignSends(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/marketing/campaigns/${id}/sends`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function sendCampaign(id: string, payload: any = {}) {
  const { data } = await axios.post(`${API_BASE}/api/marketing/campaigns/${id}/send`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function listCampaignSendLogs(sendId: string) {
  const { data } = await axios.get(`${API_BASE}/api/marketing/campaigns/sends/${sendId}/logs`, { headers: authHeaders() });
  return data as { data: any[] };
}

// COUPONS
export async function listCoupons() {
  const { data } = await axios.get(`${API_BASE}/api/marketing/coupons`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getCoupon(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/marketing/coupons/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createCoupon(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/marketing/coupons`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateCoupon(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/marketing/coupons/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteCoupon(id: string) {
  const { data } = await axios.delete(`${API_BASE}/api/marketing/coupons/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function listCouponUsage(couponId?: string) {
  const path = couponId ? `/api/marketing/coupons/${couponId}/usage` : `/api/marketing/coupons/usage`;
  const { data } = await axios.get(`${API_BASE}${path}`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function validateMarketingCoupon(payload: { couponCode: string; subtotal: number; customerId?: string }) {
  const { data } = await axios.post(`${API_BASE}/api/marketing/coupons/validate`, payload, { headers: authHeaders() });
  return data as { data: any };
}

// AFFILIATES
export async function listAffiliates() {
  const { data } = await axios.get(`${API_BASE}/api/marketing/affiliates`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getAffiliate(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/marketing/affiliates/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createAffiliate(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/marketing/affiliates`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateAffiliate(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/marketing/affiliates/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteAffiliate(id: string) {
  const { data } = await axios.delete(`${API_BASE}/api/marketing/affiliates/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function listAffiliateLinks(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/marketing/affiliates/${id}/links`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function createAffiliateLink(id: string, payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/marketing/affiliates/${id}/links`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function listAffiliateClicks(params?: { affiliateId?: string }) {
  const qs = params?.affiliateId ? `?affiliateId=${params.affiliateId}` : '';
  const { data } = await axios.get(`${API_BASE}/api/marketing/affiliates/clicks${qs}`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function listAffiliateConversions(params?: { affiliateId?: string; channel?: string }) {
  const q = new URLSearchParams();
  if (params?.affiliateId) q.set('affiliateId', params.affiliateId);
  if (params?.channel) q.set('channel', params.channel);
  const qs = q.toString() ? `?${q.toString()}` : '';
  const { data } = await axios.get(`${API_BASE}/api/marketing/affiliates/conversions${qs}`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function listAffiliatePayouts(params?: { affiliateId?: string }) {
  const qs = params?.affiliateId ? `?affiliateId=${params.affiliateId}` : '';
  const { data } = await axios.get(`${API_BASE}/api/marketing/affiliates/payouts${qs}`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function createAffiliatePayout(affiliateId: string, payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/marketing/affiliates/${affiliateId}/payouts`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateAffiliatePayout(payoutId: string, payload: { status: string }) {
  const { data } = await axios.patch(`${API_BASE}/api/marketing/affiliates/payouts/${payoutId}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function getMarketingDashboard() {
  const { data } = await axios.get(`${API_BASE}/api/marketing/dashboard`, { headers: authHeaders() });
  return data as { data: any };
}

// ============================================================================
// SOCIAL API FUNCTIONS
// ============================================================================

// SOCIAL ACCOUNTS
export async function listSocialAccounts() {
  const { data } = await axios.get(`${API_BASE}/api/social/accounts`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getSocialAccount(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/social/accounts/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createSocialAccount(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/social/accounts`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateSocialAccount(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/social/accounts/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteSocialAccount(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/social/accounts/${id}`, { headers: authHeaders() });
  return status === 204;
}

// SOCIAL POSTS
export async function listSocialPosts() {
  const { data } = await axios.get(`${API_BASE}/api/social/posts`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getSocialPost(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/social/posts/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createSocialPost(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/social/posts`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateSocialPost(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/social/posts/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteSocialPost(id: string) {
  const { data } = await axios.delete(`${API_BASE}/api/social/posts/${id}`, { headers: authHeaders() });
  return data; // Soft delete returns the data
}

// CREATORS
export async function listCreators() {
  const { data } = await axios.get(`${API_BASE}/api/social/creators`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getCreator(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/social/creators/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createCreator(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/social/creators`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateCreator(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/social/creators/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteCreator(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/social/creators/${id}`, { headers: authHeaders() });
  return status === 204;
}

// SOCIAL MESSAGES
export async function listSocialMessages() {
  const { data } = await axios.get(`${API_BASE}/api/social/messages`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function getSocialMessage(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/social/messages/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createSocialMessage(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/social/messages`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateSocialMessage(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/social/messages/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteSocialMessage(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/social/messages/${id}`, { headers: authHeaders() });
  return status === 204;
}

// META / FACEBOOK / INSTAGRAM
export async function getMetaStatus() {
  const { data } = await axios.get(`${API_BASE}/api/social/meta/status`, { headers: authHeaders() });
  return data as { data: any };
}
export async function getMetaConnectUrl(intent?: 'ads' | 'publish' | 'default') {
  const { data } = await axios.get(`${API_BASE}/api/social/meta/connect`, {
    headers: authHeaders(),
    params: intent && intent !== 'default' ? { intent } : undefined
  });
  return data as { data: { authUrl: string; redirectUri: string; configIdConfigured: boolean; webhookUrl: string; oauthScopes?: string; intent?: string } };
}
export async function getMetaCapabilities() {
  const { data } = await axios.get(`${API_BASE}/api/social/meta/capabilities`, { headers: authHeaders() });
  return data as { data: any };
}
export async function syncMetaAccounts() {
  const { data } = await axios.post(`${API_BASE}/api/social/meta/sync`, {}, { headers: authHeaders() });
  return data as { data: { refreshed: number; discovered: number; ads: number; errors: string[] } };
}
export async function listMetaFeed(params: {
  accountId: string;
  after?: string;
  mediaType?: string;
  since?: string;
  until?: string;
  limit?: number;
}) {
  const { data } = await axios.get(`${API_BASE}/api/social/meta/feed`, { headers: authHeaders(), params });
  return data as { data: any[]; paging?: { after?: string; before?: string }; account?: any };
}
export async function getMetaFeedPost(accountId: string, postId: string) {
  const { data } = await axios.get(
    `${API_BASE}/api/social/meta/feed/${accountId}/posts/${encodeURIComponent(postId)}`,
    { headers: authHeaders() }
  );
  return data as { data: any };
}
export async function listMetaInbox(params?: { accountId?: string; platform?: string }) {
  const { data } = await axios.get(`${API_BASE}/api/social/meta/inbox`, { headers: authHeaders(), params });
  return data as { data: any[]; unreadTotal?: number; igLocked?: any };
}
export async function getMetaThread(threadId: string, accountId: string) {
  const { data } = await axios.get(`${API_BASE}/api/social/meta/inbox/${encodeURIComponent(threadId)}`, {
    headers: authHeaders(),
    params: { accountId }
  });
  return data as { data: { conversation: any; messages: any[] } };
}
export async function getMetaInsights(params: { accountId: string; preset?: string }) {
  const { data } = await axios.get(`${API_BASE}/api/social/meta/insights`, { headers: authHeaders(), params });
  return data as { data: any };
}
export async function publishSocialNow(payload: {
  accountIds: string[];
  content: string;
  postType?: string;
  mediaUrls?: string[];
  files?: File[];
  linkUrl?: string;
  hashtags?: string;
}) {
  const form = new FormData();
  form.append('accountIds', JSON.stringify(payload.accountIds));
  form.append('content', payload.content || '');
  if (payload.postType) form.append('postType', payload.postType);
  if (payload.hashtags) form.append('hashtags', payload.hashtags);
  if (payload.linkUrl) form.append('linkUrl', payload.linkUrl);
  if (payload.mediaUrls?.length) form.append('mediaUrls', JSON.stringify(payload.mediaUrls));
  for (const file of payload.files || []) {
    form.append('media', file);
  }
  const { data } = await axios.post(`${API_BASE}/api/social/posts/publish-now`, form, {
    headers: authHeaders(),
    timeout: 180000
  });
  return data as { data: any[] };
}
export async function publishSocialPostToMeta(id: string) {
  const { data } = await axios.post(`${API_BASE}/api/social/posts/${id}/publish`, {}, { headers: authHeaders() });
  return data as { data: any };
}
export async function editSocialPostOnMeta(id: string, content: string) {
  const { data } = await axios.post(`${API_BASE}/api/social/posts/${id}/edit-remote`, { content }, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteSocialPostOnMeta(id: string) {
  const { data } = await axios.post(`${API_BASE}/api/social/posts/${id}/delete-remote`, {}, { headers: authHeaders() });
  return data as { data: any };
}
export async function syncSocialPostInsights(id: string) {
  const { data } = await axios.post(`${API_BASE}/api/social/posts/${id}/sync-insights`, {}, { headers: authHeaders() });
  return data as { data: any };
}
export async function syncAllSocialPostInsights() {
  const { data } = await axios.post(`${API_BASE}/api/social/posts/sync-insights`, {}, { headers: authHeaders() });
  return data as { data: { synced: number; failed: number } };
}
export async function replySocialMessageViaMeta(payload: {
  socialAccountId: string;
  recipientId: string;
  messageText: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/social/messages/reply`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function listMetaAdAccounts() {
  const { data } = await axios.get(`${API_BASE}/api/social/meta/ads`, { headers: authHeaders() });
  return data as { data: any[]; permission?: { granted: boolean; message?: string; missingPermission?: string } };
}
export async function listMetaAdCampaigns(accountId: string) {
  const { data } = await axios.get(`${API_BASE}/api/social/meta/ads/${accountId}/campaigns`, { headers: authHeaders() });
  return data as { data: any[] };
}
export async function listMetaAdSets(accountId: string, campaignId: string) {
  const { data } = await axios.get(
    `${API_BASE}/api/social/meta/ads/${accountId}/campaigns/${campaignId}/adsets`,
    { headers: authHeaders() }
  );
  return data as { data: any[] };
}
export async function listMetaAdsInSet(accountId: string, adsetId: string) {
  const { data } = await axios.get(`${API_BASE}/api/social/meta/ads/${accountId}/adsets/${adsetId}/ads`, {
    headers: authHeaders()
  });
  return data as { data: any[] };
}

// ==========================================
// ANALYTICS & REPORTING ENDPOINTS
// ==========================================

export async function listReportDefinitions(params?: any) {
  const { data } = await axios.get(`${API_BASE}/api/analytics/reports`, { params, headers: authHeaders() });
  return data as { data: any[] };
}
export async function getReportDefinition(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/analytics/reports/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createReportDefinition(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/analytics/reports`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateReportDefinition(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/analytics/reports/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteReportDefinition(id: string) {
  const { data } = await axios.delete(`${API_BASE}/api/analytics/reports/${id}`, { headers: authHeaders() });
  return data;
}

export async function listScheduledReports(params?: any) {
  const { data } = await axios.get(`${API_BASE}/api/analytics/scheduled-reports`, { params, headers: authHeaders() });
  return data as { data: any[] };
}
export async function getScheduledReport(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/analytics/scheduled-reports/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createScheduledReport(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/analytics/scheduled-reports`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateScheduledReport(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/analytics/scheduled-reports/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteScheduledReport(id: string) {
  const { data } = await axios.delete(`${API_BASE}/api/analytics/scheduled-reports/${id}`, { headers: authHeaders() });
  return data;
}

export async function listDashboards(params?: any) {
  const { data } = await axios.get(`${API_BASE}/api/analytics/dashboards`, { params, headers: authHeaders() });
  return data as { data: any[] };
}
export async function getDashboard(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/analytics/dashboards/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createDashboard(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/analytics/dashboards`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateDashboard(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/analytics/dashboards/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteDashboard(id: string) {
  const { data } = await axios.delete(`${API_BASE}/api/analytics/dashboards/${id}`, { headers: authHeaders() });
  return data;
}

export async function listDataExports(params?: any) {
  const { data } = await axios.get(`${API_BASE}/api/analytics/exports`, { params, headers: authHeaders() });
  return data as { data: any[] };
}
export async function getDataExport(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/analytics/exports/${id}`, { headers: authHeaders() });
  return data as { data: any };
}
export async function createDataExport(payload: any) {
  const { data } = await axios.post(`${API_BASE}/api/analytics/exports`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateDataExport(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/analytics/exports/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function deleteDataExport(id: string) {
  const { data } = await axios.delete(`${API_BASE}/api/analytics/exports/${id}`, { headers: authHeaders() });
  return data;
}

// B2B SALE CHANNEL
export async function getB2bDashboard(organizationId: string) {
  const { data } = await axios.get(`${API_BASE}/api/b2b/admin/dashboard`, { params: { organizationId }, headers: authHeaders() });
  return data as { data: any };
}
export async function getB2bSettings(organizationId: string) {
  const { data } = await axios.get(`${API_BASE}/api/b2b/admin/settings`, { params: { organizationId }, headers: authHeaders() });
  return data as { data: any };
}
export async function updateB2bSettings(payload: {
  organizationId: string;
  enabled?: boolean;
  publishMode?: 'all_active' | 'mapped_only';
  defaultPriceListId?: string | null;
  defaultWarehouseId?: string | null;
  assignedRepName?: string | null;
  assignedRepPhone?: string | null;
  assignedRepEmail?: string | null;
}) {
  const { data } = await axios.patch(`${API_BASE}/api/b2b/admin/settings`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function listB2bProducts(params?: {
  organizationId?: string;
  search?: string;
  published?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(`${API_BASE}/api/b2b/admin/products`, { params, headers: authHeaders() });
  return data as { data: any[]; pagination?: any };
}
export async function publishB2bProducts(payload: { organizationId: string; catalogItemIds: string[] }) {
  const { data } = await axios.post(`${API_BASE}/api/b2b/admin/products/publish`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function unpublishB2bProducts(payload: { organizationId: string; catalogItemIds: string[] }) {
  const { data } = await axios.post(`${API_BASE}/api/b2b/admin/products/unpublish`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function listB2bRetailers(params?: { organizationId?: string; search?: string }) {
  const { data } = await axios.get(`${API_BASE}/api/b2b/admin/retailers`, { params, headers: authHeaders() });
  return data as { data: any[] };
}
export async function createB2bRetailer(payload: {
  organizationId: string;
  customerId?: string;
  email: string;
  password: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  taxId?: string;
  customerNumber?: string;
  tier?: 'standard' | 'silver' | 'gold' | 'platinum';
  creditLimit?: number;
  paymentTerms?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/b2b/admin/retailers`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function updateB2bRetailer(id: string, payload: {
  status?: 'active' | 'invited' | 'disabled';
  password?: string;
  creditLimit?: number;
  creditUsed?: number;
  paymentTerms?: string | null;
  tier?: 'standard' | 'silver' | 'gold' | 'platinum';
}) {
  const { data } = await axios.patch(`${API_BASE}/api/b2b/admin/retailers/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function listB2bOrders(params?: {
  organizationId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(`${API_BASE}/api/b2b/admin/orders`, { params, headers: authHeaders() });
  return data as { data: any[]; pagination?: any };
}
export async function listB2bShipments(params?: { organizationId?: string }) {
  const { data } = await axios.get(`${API_BASE}/api/b2b/admin/shipments`, { params, headers: authHeaders() });
  return data as { data: any[] };
}
export async function updateB2bShipment(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/b2b/admin/shipments/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

/** DHL Express MyDHL — create / label / track / cancel */
export async function getDhlStatus() {
  const { data } = await axios.get(`${API_BASE}/api/fulfillment/dhl/status`, { headers: authHeaders() });
  return data as { data: any };
}
export async function listDhlShipments(params?: { organizationId?: string; orderId?: string; limit?: number }) {
  const { data } = await axios.get(`${API_BASE}/api/fulfillment/dhl/shipments`, { params, headers: authHeaders() });
  return data as { data: any[] };
}
export async function createDhlShipment(payload: {
  orderId: string;
  organizationId?: string;
  productCode?: string;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  pieces?: number;
  description?: string;
  pickupRequested?: boolean;
}) {
  const { data } = await axios.post(`${API_BASE}/api/fulfillment/dhl/shipments`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function getDhlShipmentLabel(shipmentId: string) {
  const { data } = await axios.get(`${API_BASE}/api/fulfillment/dhl/shipments/${shipmentId}/label`, {
    headers: authHeaders()
  });
  return data as { data: any };
}
export async function trackDhlShipment(params: { shipmentId?: string; trackingNumber?: string }) {
  if (params.shipmentId) {
    const { data } = await axios.get(`${API_BASE}/api/fulfillment/dhl/shipments/${params.shipmentId}/track`, {
      headers: authHeaders()
    });
    return data as { data: any };
  }
  const { data } = await axios.post(
    `${API_BASE}/api/fulfillment/dhl/track`,
    { trackingNumber: params.trackingNumber },
    { headers: authHeaders() }
  );
  return data as { data: any };
}
export async function cancelDhlShipment(shipmentId: string) {
  const { data } = await axios.delete(`${API_BASE}/api/fulfillment/dhl/shipments/${shipmentId}`, {
    headers: authHeaders()
  });
  return data as { data: any };
}

export async function listB2bShippingMethods(params?: { organizationId?: string }) {
  const { data } = await axios.get(`${API_BASE}/api/b2b/admin/shipping-methods`, { params, headers: authHeaders() });
  return data as { data: any[] };
}
export async function upsertB2bShippingMethod(payload: {
  organizationId: string;
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  price?: number;
  freeOverAmount?: number | null;
  minOrderAmount?: number | null;
  etaLabel?: string | null;
  icon?: string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  const { data } = await axios.post(`${API_BASE}/api/b2b/admin/shipping-methods`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function listB2bCreditRequests(params?: { organizationId?: string }) {
  const { data } = await axios.get(`${API_BASE}/api/b2b/admin/credit-requests`, { params, headers: authHeaders() });
  return data as { data: any[] };
}
export async function reviewB2bCreditRequest(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/b2b/admin/credit-requests/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}
export async function listB2bReferrals(params?: { organizationId?: string }) {
  const { data } = await axios.get(`${API_BASE}/api/b2b/admin/referrals`, { params, headers: authHeaders() });
  return data as { data: any[] };
}
export async function updateB2bReferral(id: string, payload: any) {
  const { data } = await axios.patch(`${API_BASE}/api/b2b/admin/referrals/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

// ============================================================================
// CRM INTEGRATIONS + MARKETING EMAIL CAMPAIGNS
// ============================================================================

/** Public inbound lead webhook (external systems; not staff JWT). */
export const CRM_LEAD_INGEST_WEBHOOK_URL = `${API_BASE}/api/integrations/leads`;

export async function listCrmIntegrationKeys(params?: { organizationId?: string }) {
  const { data } = await axios.get(
    `${API_BASE}/api/crm/integration-keys${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[] };
}

export async function createCrmIntegrationKey(payload: {
  organizationId?: string;
  name: string;
  source?: 'salesforce' | 'hubspot' | 'zapier' | 'generic';
}) {
  const { data } = await axios.post(`${API_BASE}/api/crm/integration-keys`, payload, {
    headers: authHeaders(),
  });
  return data as { data: any };
}

export async function regenerateCrmIntegrationKey(id: string) {
  const { data } = await axios.post(
    `${API_BASE}/api/crm/integration-keys/${id}/regenerate`,
    {},
    { headers: authHeaders() }
  );
  return data as { data: any; meta?: { replacedKeyId?: string } };
}

export async function deactivateCrmIntegrationKey(id: string) {
  const { data } = await axios.post(
    `${API_BASE}/api/crm/integration-keys/${id}/deactivate`,
    {},
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function syncCrmLeadToMarketing(id: string) {
  const { data } = await axios.post(
    `${API_BASE}/api/crm/leads/${id}/sync-to-marketing`,
    {},
    { headers: authHeaders() }
  );
  return data as { data: { segmentId: string; customerId: string | null; added: boolean; skipped?: string } };
}

export async function listMarketingEmailCampaigns(params?: {
  organizationId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/marketing/email-campaigns${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as {
    data: any[];
    meta?: { total?: number; page?: number; limit?: number; smtpConfigured?: boolean };
  };
}

export async function getMarketingEmailCampaign(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/marketing/email-campaigns/${id}`, {
    headers: authHeaders(),
  });
  return data as { data: any; meta?: { smtpConfigured?: boolean } };
}

export async function createMarketingEmailCampaign(payload: {
  organizationId?: string;
  name: string;
  subject: string;
  htmlBody?: string;
  /** API expects a JSON string (see MARKETING_EMAIL_PROVIDERS.md) */
  builderJson?: Record<string, unknown> | string | null;
  connectorId?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  source?: 'crm_leads' | 'segment' | 'manual';
  audienceType?: 'crm_leads' | 'segment' | 'manual';
  segmentId?: string | null;
  status?: string;
  scheduledAt?: string | null;
}) {
  const body = {
    ...payload,
    audienceType: payload.audienceType || payload.source,
    builderJson:
      payload.builderJson == null
        ? payload.builderJson
        : typeof payload.builderJson === 'string'
          ? payload.builderJson
          : JSON.stringify(payload.builderJson),
  };
  const { data } = await axios.post(`${API_BASE}/api/marketing/email-campaigns`, body, {
    headers: authHeaders(),
  });
  return data as { data: any };
}

export async function updateMarketingEmailCampaign(id: string, payload: Record<string, any>) {
  const body = { ...payload };
  if (body.builderJson != null && typeof body.builderJson !== 'string') {
    body.builderJson = JSON.stringify(body.builderJson);
  }
  if (body.source && !body.audienceType) body.audienceType = body.source;
  const { data } = await axios.patch(`${API_BASE}/api/marketing/email-campaigns/${id}`, body, {
    headers: authHeaders(),
  });
  return data as { data: any };
}

// ---------------------------------------------------------------------------
// Marketing email connectors (SendGrid, Gmail SMTP, Brevo, SES, …)
// See rabs-api/docs/MARKETING_EMAIL_PROVIDERS.md when present
// ---------------------------------------------------------------------------

export type MarketingEmailProvider = 'sendgrid' | 'gmail_smtp' | 'brevo' | 'ses' | 'mailchimp';

export async function listMarketingEmailConnectors(params?: {
  organizationId?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/marketing/email-connectors${crmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as {
    data: any[];
    meta?: { total?: number; page?: number; limit?: number };
  };
}

export async function getMarketingEmailConnector(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/marketing/email-connectors/${id}`, {
    headers: authHeaders(),
  });
  return data as { data: any };
}

export async function createMarketingEmailConnector(payload: {
  organizationId?: string;
  name: string;
  provider: MarketingEmailProvider;
  credentials: Record<string, unknown>;
  isDefault?: boolean;
  status?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/marketing/email-connectors`, payload, {
    headers: authHeaders(),
  });
  return data as { data: any };
}

export async function updateMarketingEmailConnector(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/marketing/email-connectors/${id}`, payload, {
    headers: authHeaders(),
  });
  return data as { data: any };
}

export async function deleteMarketingEmailConnector(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/marketing/email-connectors/${id}`, {
    headers: authHeaders(),
  });
  return status === 204 || status === 200;
}

export async function testMarketingEmailConnector(id: string) {
  const { data } = await axios.post(
    `${API_BASE}/api/marketing/email-connectors/${id}/test`,
    {},
    { headers: authHeaders() }
  );
  return data as {
    data: { ok?: boolean; message?: string; connector?: any; [key: string]: any };
  };
}

/** Prefer PATCH isDefault — no dedicated set-default route in API docs. */
export async function setDefaultMarketingEmailConnector(id: string) {
  return updateMarketingEmailConnector(id, { isDefault: true });
}

export async function sendMarketingEmailCampaign(
  id: string,
  payload?: { emails?: string[]; full?: boolean; connectorId?: string | null },
  params?: { full?: boolean }
) {
  const qs = crmQuery({
    full: params?.full || payload?.full ? '1' : undefined,
  });
  const { data } = await axios.post(
    `${API_BASE}/api/marketing/email-campaigns/${id}/send${qs}`,
    payload || {},
    { headers: authHeaders() }
  );
  return data as {
    data: {
      campaign?: any;
      queued: number;
      sent: number;
      failed: number;
      capped: number;
      smtpConfigured: boolean;
    };
  };
}

export async function deleteMarketingEmailCampaign(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/marketing/email-campaigns/${id}`, {
    headers: authHeaders(),
  });
  return status === 204 || status === 200;
}

export async function listMarketingEmailCampaignSends(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/marketing/email-campaigns/${id}/sends`, {
    headers: authHeaders(),
  });
  return data as { data: any[] };
}

// ---------------------------------------------------------------------------
// PROJECT MANAGEMENT — see rabs-api/docs/PROJECT_MANAGEMENT_API.md
// Base path: /api/pm  (projects, work orders, tasks, milestones, schedule)
// ---------------------------------------------------------------------------

function pmQuery(params?: Record<string, string | number | boolean | undefined | null>) {
  return crmQuery(params);
}

export async function getPmDashboard(params?: { organizationId?: string }) {
  const { data } = await axios.get(
    `${API_BASE}/api/pm/dashboard${pmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as {
    data: {
      activeProjects?: number;
      projectsByStatus?: Record<string, number>;
      overdueTasks?: number | any[];
      overdueTasksCount?: number;
      upcomingMilestones?: any[];
      openWorkOrders?: number;
      myOpenTasks?: number;
      asOf?: string;
      [key: string]: any;
    };
  };
}

export async function listPmProjects(params?: {
  organizationId?: string;
  status?: string;
  customerId?: string;
  ownerUserId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/pm/projects${pmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: { total?: number; page?: number; limit?: number } };
}

export async function getPmProject(id: string, params?: { organizationId?: string }) {
  const { data } = await axios.get(
    `${API_BASE}/api/pm/projects/${id}${pmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function createPmProject(payload: {
  organizationId?: string;
  name: string;
  code?: string | null;
  customerId?: string | null;
  orderId?: string | null;
  scope?: string | null;
  objectives?: string | null;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number;
  currency?: string;
  ownerUserId?: string | null;
}) {
  const { data } = await axios.post(`${API_BASE}/api/pm/projects`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePmProject(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/pm/projects/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function getPmProjectProgress(id: string) {
  const { data } = await axios.get(
    `${API_BASE}/api/pm/projects/${id}/progress`,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function markPmProjectProductionReady(id: string, payload?: { productionReady?: boolean }) {
  const { data } = await axios.post(
    `${API_BASE}/api/pm/projects/${id}/mark-production-ready`,
    payload || { productionReady: true },
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function completePmProject(id: string) {
  const { data } = await axios.post(
    `${API_BASE}/api/pm/projects/${id}/complete`,
    {},
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function listPmDeliverables(projectId: string) {
  const { data } = await axios.get(
    `${API_BASE}/api/pm/projects/${projectId}/deliverables`,
    { headers: authHeaders() }
  );
  return data as { data: any[] };
}

export async function createPmDeliverable(
  projectId: string,
  payload: {
    title: string;
    description?: string | null;
    status?: string;
    dueDate?: string | null;
  }
) {
  const { data } = await axios.post(
    `${API_BASE}/api/pm/projects/${projectId}/deliverables`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function updatePmDeliverable(
  projectId: string,
  deliverableId: string,
  payload: Record<string, any>
) {
  const { data } = await axios.patch(
    `${API_BASE}/api/pm/projects/${projectId}/deliverables/${deliverableId}`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function deletePmDeliverable(projectId: string, deliverableId: string) {
  const { status } = await axios.delete(
    `${API_BASE}/api/pm/projects/${projectId}/deliverables/${deliverableId}`,
    { headers: authHeaders() }
  );
  return status === 204 || status === 200;
}

export async function listPmWorkOrders(params?: {
  organizationId?: string;
  projectId?: string;
  status?: string;
  assigneeUserId?: string;
  stageId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/pm/work-orders${pmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function getPmWorkOrder(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/pm/work-orders/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createPmWorkOrder(payload: {
  organizationId?: string;
  projectId: string;
  title: string;
  description?: string | null;
  status?: string;
  assigneeUserId?: string | null;
  stageId?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
}) {
  const { data } = await axios.post(`${API_BASE}/api/pm/work-orders`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePmWorkOrder(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/pm/work-orders/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function listPmStages(params?: {
  organizationId?: string;
  projectId?: string | null;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/pm/stages${pmQuery(params as any)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[] };
}

export async function createPmStage(payload: {
  organizationId?: string;
  projectId?: string | null;
  name: string;
  position?: number;
}) {
  const { data } = await axios.post(`${API_BASE}/api/pm/stages`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePmStage(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/pm/stages/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deletePmStage(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/pm/stages/${id}`, { headers: authHeaders() });
  return status === 204 || status === 200;
}

export async function listPmTasks(params?: {
  organizationId?: string;
  projectId?: string;
  workOrderId?: string;
  status?: string;
  assigneeUserId?: string;
  priority?: string;
  overdue?: boolean | string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/pm/tasks${pmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function getPmTask(id: string) {
  const { data } = await axios.get(`${API_BASE}/api/pm/tasks/${id}`, { headers: authHeaders() });
  return data as { data: any };
}

export async function createPmTask(payload: {
  organizationId?: string;
  projectId: string;
  workOrderId?: string | null;
  title: string;
  description?: string | null;
  assigneeUserId?: string | null;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  estimateHours?: number;
  loggedHours?: number;
  progressPct?: number;
}) {
  const { data } = await axios.post(`${API_BASE}/api/pm/tasks`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePmTask(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/pm/tasks/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function completePmTask(id: string) {
  const { data } = await axios.post(
    `${API_BASE}/api/pm/tasks/${id}/complete`,
    {},
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function addPmTaskDependency(taskId: string, payload: { dependsOnTaskId: string }) {
  const { data } = await axios.post(
    `${API_BASE}/api/pm/tasks/${taskId}/dependencies`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function removePmTaskDependency(taskId: string, dependsOnTaskId: string) {
  const { status } = await axios.delete(
    `${API_BASE}/api/pm/tasks/${taskId}/dependencies/${dependsOnTaskId}`,
    { headers: authHeaders() }
  );
  return status === 204 || status === 200;
}

export async function listPmMilestones(params?: {
  organizationId?: string;
  projectId?: string;
  status?: string;
  upcoming?: boolean | string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/pm/milestones${pmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createPmMilestone(payload: {
  projectId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  status?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/pm/milestones`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePmMilestone(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/pm/milestones/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deletePmMilestone(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/pm/milestones/${id}`, { headers: authHeaders() });
  return status === 204 || status === 200;
}

export async function listPmSchedule(params?: {
  organizationId?: string;
  userId?: string;
  projectId?: string;
  taskId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/pm/schedule-blocks${pmQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createPmScheduleBlock(payload: {
  organizationId?: string;
  userId: string;
  projectId?: string | null;
  taskId?: string | null;
  startAt: string;
  endAt: string;
  notes?: string | null;
}) {
  const { data } = await axios.post(`${API_BASE}/api/pm/schedule-blocks`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePmScheduleBlock(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/pm/schedule-blocks/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deletePmScheduleBlock(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/pm/schedule-blocks/${id}`, { headers: authHeaders() });
  return status === 204 || status === 200;
}

export async function listPmProjectMembers(projectId: string) {
  const { data } = await axios.get(
    `${API_BASE}/api/pm/projects/${projectId}/members`,
    { headers: authHeaders() }
  );
  return data as { data: any[] };
}

export async function addPmProjectMember(projectId: string, payload: {
  userId: string;
  role?: string;
}) {
  const { data } = await axios.post(
    `${API_BASE}/api/pm/projects/${projectId}/members`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function updatePmProjectMember(projectId: string, memberId: string, payload: { role: string }) {
  const { data } = await axios.patch(
    `${API_BASE}/api/pm/projects/${projectId}/members/${memberId}`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function removePmProjectMember(projectId: string, memberId: string) {
  const { status } = await axios.delete(
    `${API_BASE}/api/pm/projects/${projectId}/members/${memberId}`,
    { headers: authHeaders() }
  );
  return status === 204 || status === 200;
}

// ============================================================================
// UK HR EXTENSIONS (Aziz list) — paths follow docs/HR_API.md when available
// ============================================================================

function hrQuery(params?: Record<string, string | number | boolean | undefined | null>) {
  if (!params) return '';
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Employee 360 payload (personal, job, immigration, leave, documents). */
export async function getEmployee360(id: string) {
  try {
    const { data } = await axios.get(`${API_BASE}/api/hr/employees/${id}/360`, { headers: authHeaders() });
    return data as { data: any };
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
    const { data } = await axios.get(`${API_BASE}/api/hr/employees/${id}`, { headers: authHeaders() });
    return data as { data: any };
  }
}

export async function getHrReportsSummary(params?: { organizationId?: string }) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/reports/summary${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function listVisaExpiring(params?: {
  organizationId?: string;
  withinDays?: number;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/compliance/visa-expiring${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  // API returns `{ data: { expiring: [...], alerts, ... } }` — normalize to an array for UI `.map`
  const payload = data?.data;
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.expiring)
      ? payload.expiring
      : [];
  return { data: rows, meta: data?.meta, raw: payload } as {
    data: any[];
    meta?: any;
    raw?: any;
  };
}

export async function listComplianceAlerts(params?: {
  organizationId?: string;
  type?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/compliance/alerts${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function listImmigration(params?: {
  organizationId?: string;
  employeeId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/immigration${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createImmigration(payload: Record<string, any>) {
  const { data } = await axios.post(`${API_BASE}/api/hr/immigration`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateImmigration(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/immigration/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function listRtwDocuments(params?: {
  employeeId?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/rtw-documents${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createRtwDocument(payload: Record<string, any>) {
  const { data } = await axios.post(`${API_BASE}/api/hr/rtw-documents`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function uploadRtwDocument(formData: FormData) {
  try {
    const { data } = await axios.post(`${API_BASE}/api/hr/rtw-documents/upload`, formData, {
      headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
    });
    return data as { data: any };
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
    const { data } = await axios.post(`${API_BASE}/api/hr/documents/upload`, formData, {
      headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
    });
    return data as { data: any };
  }
}

export async function presignHrDocument(payload: {
  employeeId: string;
  fileName: string;
  contentType: string;
  documentType?: string;
}) {
  const { data } = await axios.post(`${API_BASE}/api/hr/documents/presign`, payload, { headers: authHeaders() });
  return data as { data: { uploadUrl: string; fileUrl?: string; key?: string; documentUrl?: string } };
}

export async function approveLeaveRequest(id: string, payload?: { notes?: string }) {
  try {
    const { data } = await axios.post(
      `${API_BASE}/api/hr/leave-requests/${id}/approve`,
      payload || {},
      { headers: authHeaders() }
    );
    return data as { data: any };
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
    const { data } = await axios.patch(
      `${API_BASE}/api/hr/leave-requests/${id}`,
      { status: 'approved', ...(payload || {}) },
      { headers: authHeaders() }
    );
    return data as { data: any };
  }
}

export async function rejectLeaveRequest(id: string, payload?: { rejectionReason?: string; notes?: string }) {
  try {
    const { data } = await axios.post(
      `${API_BASE}/api/hr/leave-requests/${id}/reject`,
      payload || {},
      { headers: authHeaders() }
    );
    return data as { data: any };
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
    const { data } = await axios.patch(
      `${API_BASE}/api/hr/leave-requests/${id}`,
      { status: 'rejected', ...(payload || {}) },
      { headers: authHeaders() }
    );
    return data as { data: any };
  }
}

export async function listLeaveBalances(params?: {
  employeeId?: string;
  organizationId?: string;
  year?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/leave-balances${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function listSickEpisodes(params?: {
  employeeId?: string;
  organizationId?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/sick-episodes${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createSickEpisode(payload: Record<string, any>) {
  const { data } = await axios.post(`${API_BASE}/api/hr/sick-episodes`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateSickEpisode(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/sick-episodes/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function listPensions(params?: {
  employeeId?: string;
  organizationId?: string;
  enrolled?: boolean;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/pension${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function upsertPension(payload: Record<string, any>) {
  const { data } = await axios.post(`${API_BASE}/api/hr/pension`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updatePension(id: string, payload: Record<string, any>) {
  // Prefer upsert by employeeId when provided (API has POST|PUT /pension only)
  if (payload.employeeId) {
    const { data } = await axios.post(`${API_BASE}/api/hr/pension`, payload, { headers: authHeaders() });
    return data as { data: any };
  }
  try {
    const { data } = await axios.patch(`${API_BASE}/api/hr/pension/${id}`, payload, { headers: authHeaders() });
    return data as { data: any };
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
    const { data } = await axios.put(`${API_BASE}/api/hr/pension`, { id, ...payload }, { headers: authHeaders() });
    return data as { data: any };
  }
}

export async function listPayslips(params?: {
  employeeId?: string;
  payrollRunId?: string;
  organizationId?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/payslips${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function listTaxDocuments(params?: {
  employeeId?: string;
  organizationId?: string;
  documentType?: 'p45' | 'p60' | string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/tax-documents${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createTaxDocument(payload: Record<string, any>) {
  const { data } = await axios.post(`${API_BASE}/api/hr/tax-documents`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function listJobPostings(params?: {
  organizationId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/job-postings${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createJobPosting(payload: Record<string, any>) {
  const { data } = await axios.post(`${API_BASE}/api/hr/job-postings`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateJobPosting(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/job-postings/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function listApplicants(params?: {
  jobPostingId?: string;
  organizationId?: string;
  stage?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/applicants${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createApplicant(payload: Record<string, any>) {
  const { data } = await axios.post(`${API_BASE}/api/hr/applicants`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateApplicant(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/applicants/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function listOnboardingChecklists(params?: {
  employeeId?: string;
  organizationId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/onboarding${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createOnboardingChecklist(payload: Record<string, any>) {
  const { data } = await axios.post(`${API_BASE}/api/hr/onboarding`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function seedOnboardingChecklist(employeeId: string) {
  const { data } = await axios.post(
    `${API_BASE}/api/hr/onboarding/seed`,
    { employeeId },
    { headers: authHeaders() }
  );
  return data as { data: any[] };
}

export async function updateOnboardingChecklist(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(
    `${API_BASE}/api/hr/onboarding/${id}`,
    payload,
    { headers: authHeaders() }
  );
  return data as { data: any };
}

export async function getHrMe() {
  const { data } = await axios.get(`${API_BASE}/api/hr/me`, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateHrMe(payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/me`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function listHrMeLeaveRequests(params?: { page?: number; limit?: number }) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/me/leave-requests${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createHrMeLeaveRequest(payload: Record<string, any>) {
  const { data } = await axios.post(`${API_BASE}/api/hr/me/leave-requests`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function listHrMePayslips(params?: { page?: number; limit?: number }) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/me/payslips${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function listHrMeDocuments(params?: { page?: number; limit?: number }) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/me/documents${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

/** UK HR attendance (`hr_attendance`) — preferred over legacy `/time-entries`. */
export async function listHrAttendance(params?: {
  employeeId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/attendance${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function upsertHrAttendance(payload: Record<string, any>) {
  const { data } = await axios.post(`${API_BASE}/api/hr/attendance`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function listHrOvertime(params?: {
  employeeId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/overtime${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createHrOvertime(payload: Record<string, any>) {
  const { data } = await axios.post(`${API_BASE}/api/hr/overtime`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateHrOvertime(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/overtime/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

/** UK HR documents (`hr_documents`) — preferred over legacy `/employee-documents`. */
export async function listHrDocuments(params?: {
  employeeId?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await axios.get(
    `${API_BASE}/api/hr/documents${hrQuery(params)}`,
    { headers: authHeaders() }
  );
  return data as { data: any[]; meta?: any };
}

export async function createHrDocument(payload: Record<string, any>) {
  const { data } = await axios.post(`${API_BASE}/api/hr/documents`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function updateHrDocument(id: string, payload: Record<string, any>) {
  const { data } = await axios.patch(`${API_BASE}/api/hr/documents/${id}`, payload, { headers: authHeaders() });
  return data as { data: any };
}

export async function deleteHrDocument(id: string) {
  const { status } = await axios.delete(`${API_BASE}/api/hr/documents/${id}`, { headers: authHeaders() });
  return status === 204;
}
