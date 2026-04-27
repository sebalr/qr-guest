import axios from 'axios';

const api = axios.create({
	baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
});

api.interceptors.request.use(config => {
	const token = localStorage.getItem('token');
	if (token) config.headers.Authorization = `Bearer ${token}`;
	return config;
});

interface TenantScopedRequestOptions {
	tenantId?: string;
}

function tenantScopedParams(options?: TenantScopedRequestOptions): { tenantId: string } | undefined {
	if (!options?.tenantId) return undefined;
	return { tenantId: options.tenantId };
}

export interface Event {
	id: string;
	name: string;
	description?: string | null;
	imageUrl?: string | null;
	maxGuests?: number | null;
	startsAt?: string | null;
	endsAt?: string | null;
	tenantId: string;
}

export interface Ticket {
	id: string;
	eventId: string;
	guestId?: string | null;
	ticketTypeId?: string | null;
	ticketType?: TicketType | null;
	name: string;
	status: string;
	version: number;
	scanCount?: number;
}

export interface TicketListPagination {
	pageSize: number;
	hasMore: boolean;
	nextCursorCreatedAt: string | null;
	nextCursorId: string | null;
}

export interface TicketListResponse {
	data: Ticket[];
	pagination?: TicketListPagination;
}

export interface TicketType {
	id: string;
	eventId: string;
	name: string;
	price: number;
	version: number;
	createdAt: string;
	updatedAt: string;
}

export interface Guest {
	id: string;
	name: string;
	tenantId: string;
	createdAt: string;
	events: { eventId: string; eventName: string }[];
}

export interface TicketScanDetail {
	id: string;
	scannedAt: string;
	deviceId: string;
	userId: string;
	scannedBy: string;
}

export interface SyncPayload {
	eventId: string;
	deviceId: string;
	lastTicketVersion: number;
	lastTicketIdCursor?: string;
	lastScanCursor: string;
	lastScanIdCursor?: string;
	localScans: {
		id: string;
		ticketId: string;
		scannedAt: string;
		deviceId: string;
	}[];
}

export interface RemoteScan {
	id: string;
	ticketId: string;
	eventId: string;
	scannedAt: string;
	deviceId: string;
}

export interface SyncResponse {
	ticketUpdates: {
		id: string;
		eventId: string;
		name: string;
		status: string;
		version: number;
		ticketTypeId?: string | null;
	}[];
	scanUpdates: RemoteScan[];
	newTicketVersion: number;
	newTicketIdCursor?: string;
	newScanCursor: string;
	newScanIdCursor?: string;
	hasMoreTicketUpdates?: boolean;
	hasMoreScanUpdates?: boolean;
}

export interface EventStats {
	totalGuests: number;
	scannedGuests: number;
	notScannedGuests: number;
	totalScans: number;
	uniqueTickets: number;
	duplicates: number;
	scansByHour: { hour: string; count: number }[];
	scansByInterval: { bucket: string; count: number }[];
	topGuests: { ticketId: string; name: string; scanCount: number }[];
	userScanRanking: { userId: string; email: string; scanCount: number }[];
	duplicateTickets: { ticketId: string; name: string; scanCount: number }[];
	firstScansByInterval: { bucket: string; count: number }[];
}

export interface AdminTenant {
	id: string;
	name: string;
	plan: string;
	createdAt: string;
	_count: { users: number; events: number };
}

export interface AdminEvent {
	id: string;
	name: string;
	startsAt: string;
	endsAt: string;
	maxGuests?: number | null;
	tenantId: string;
	tenant: { id: string; name: string; plan: string };
	_count: { tickets: number; scans: number };
}

export interface AdminUser {
	id: string;
	email: string;
	accountStatus: 'active' | 'pending_verification' | 'invited';
	role: string;
	isSuperAdmin: boolean;
	createdAt: string;
	tenantId?: string;
	emailDispatched?: boolean;
	tenant?: { id: string; name: string; plan: string };
}

export interface DeviceEventDebugUploadPayload {
	eventId: string;
	deviceId: string;
	payload: Record<string, unknown>;
}

export interface DeviceEventDebugUploadResponse {
	id: string;
	eventId: string;
	deviceId: string;
	createdAt: string;
}

export interface EventDeviceDebugDataItem {
	id: string;
	eventId: string;
	deviceId: string;
	userId: string;
	uploaderEmail: string;
	payloadSizeBytes: number;
	createdAt: string;
}

export interface EventDeviceDebugDataDetail extends EventDeviceDebugDataItem {
	payload: Record<string, unknown>;
}

interface Tenant {
	id: string;
	name: string;
	role: string;
}

export type ManageableUserRole = 'admin' | 'scanner';

export interface AuthActionResponse {
	message: string;
}

export interface TemporaryScanner {
	id: string;
	eventId: string;
	name: string;
	loginToken: string;
	isActive: boolean;
	lastUsedAt: string | null;
	createdAt: string;
}

// Auth
export const loginApi = (email: string, password: string, recaptchaToken?: string) =>
	api.post<{ data: { token?: string; tenants?: Tenant[]; userId?: string } }>('/auth/login', { email, password, recaptchaToken });

export const registerApi = (email: string, password: string, name: string, recaptchaToken?: string) =>
	api.post<{ data: { requiresEmailVerification: boolean; emailDispatched: boolean; message: string } }>('/auth/register', {
		tenantName: name,
		email,
		password,
		recaptchaToken,
	});

export const selectTenantApi = (userId: string, tenantId: string) =>
	api.post<{ data: { token: string } }>('/auth/select-tenant', { userId, tenantId });
export const resendVerificationApi = (email: string) => api.post<{ data: AuthActionResponse }>('/auth/resend-verification', { email });
export const verifyEmailApi = (token: string) => api.post<{ data: AuthActionResponse }>('/auth/verify-email', { token });
export const forgotPasswordApi = (email: string) => api.post<{ data: AuthActionResponse }>('/auth/forgot-password', { email });
export const resetPasswordApi = (token: string, password: string) =>
	api.post<{ data: AuthActionResponse }>('/auth/reset-password', { token, password });
export const acceptInvitationApi = (token: string, password: string) =>
	api.post<{ data: { token?: string; tenants?: Tenant[]; userId?: string } }>('/auth/accept-invitation', { token, password });
export const temporalLoginApi = (token: string) =>
	api.post<{ data: { token: string; eventId: string } }>(`/auth/temporal-login`, { token });

// Events
export const getEventsApi = () => api.get<{ data: Event[] }>('/events');

export const createEventApi = (data: { name: string; startsAt?: string; endsAt?: string; description?: string; imageUrl?: string }) =>
	api.post<{ data: Event }>('/events', data);

export const getEventApi = (id: string, options?: TenantScopedRequestOptions) =>
	api.get<{ data: Event }>(`/events/${id}`, { params: tenantScopedParams(options) });
export const updateEventApi = (id: string, data: { maxGuests: number }, options?: TenantScopedRequestOptions) =>
	api.patch<{ data: Event }>(`/events/${id}`, data, { params: tenantScopedParams(options) });
export const getEventTicketTypesApi = (eventId: string, options?: TenantScopedRequestOptions) =>
	api.get<{ data: TicketType[] }>(`/events/${eventId}/ticket-types`, { params: tenantScopedParams(options) });
export const createEventTicketTypeApi = (eventId: string, data: { name: string; price: number }, options?: TenantScopedRequestOptions) =>
	api.post<{ data: TicketType }>(`/events/${eventId}/ticket-types`, data, { params: tenantScopedParams(options) });
export const updateEventTicketTypeApi = (
	ticketTypeId: string,
	data: { name?: string; price?: number },
	options?: TenantScopedRequestOptions,
) => api.patch<{ data: TicketType }>(`/events/ticket-types/${ticketTypeId}`, data, { params: tenantScopedParams(options) });
export const deleteEventTicketTypeApi = (ticketTypeId: string, options?: TenantScopedRequestOptions) =>
	api.delete<{ data: { id: string } }>(`/events/ticket-types/${ticketTypeId}`, { params: tenantScopedParams(options) });
export const getEventTemporaryScannersApi = (eventId: string, options?: TenantScopedRequestOptions) =>
	api.get<{ data: TemporaryScanner[] }>(`/events/${eventId}/temporary-scanners`, { params: tenantScopedParams(options) });
export const createEventTemporaryScannerApi = (eventId: string, data: { name: string }, options?: TenantScopedRequestOptions) =>
	api.post<{ data: TemporaryScanner }>(`/events/${eventId}/temporary-scanners`, data, { params: tenantScopedParams(options) });
export const updateEventTemporaryScannerApi = (
	eventId: string,
	scannerId: string,
	data: { isActive: boolean },
	options?: TenantScopedRequestOptions,
) =>
	api.patch<{ data: TemporaryScanner }>(`/events/${eventId}/temporary-scanners/${scannerId}`, data, {
		params: tenantScopedParams(options),
	});
export const sendEventTemporaryScannerEmailApi = (
	eventId: string,
	scannerId: string,
	data: { email: string },
	options?: TenantScopedRequestOptions,
) =>
	api.post<{ data: AuthActionResponse }>(`/events/${eventId}/temporary-scanners/${scannerId}/send-email`, data, {
		params: tenantScopedParams(options),
	});

// Tickets
export const getTicketsApi = (
	eventId: string,
	params?: { pageSize?: number; cursorCreatedAt?: string; cursorId?: string },
	options?: TenantScopedRequestOptions,
) => api.get<TicketListResponse>(`/events/${eventId}/tickets`, { params: { ...params, ...tenantScopedParams(options) } });

export const addTicketsApi = (
	eventId: string,
	tickets: Array<string | { name: string; ticketTypeId?: string }>,
	options?: TenantScopedRequestOptions,
) => {
	const normalized = tickets.map(t => (typeof t === 'string' ? { name: t } : t));
	return api.post<{ data: Ticket[] }>(`/events/${eventId}/tickets/bulk`, { tickets: normalized }, { params: tenantScopedParams(options) });
};

export const createTicketApi = (
	eventId: string,
	data: { name?: string; guestId?: string; ticketTypeId?: string },
	options?: TenantScopedRequestOptions,
) => api.post<{ data: Ticket }>(`/events/${eventId}/tickets`, data, { params: tenantScopedParams(options) });

export const updateTicketApi = (ticketId: string, data: { ticketTypeId: string | null }, options?: TenantScopedRequestOptions) =>
	api.patch<{ data: Ticket }>(`/tickets/${ticketId}`, data, { params: tenantScopedParams(options) });

export const cancelTicketApi = (ticketId: string, options?: TenantScopedRequestOptions) =>
	api.post<{ data: Ticket }>(`/tickets/${ticketId}/cancel`, undefined, { params: tenantScopedParams(options) });
export const getTicketScansApi = (ticketId: string, options?: TenantScopedRequestOptions) =>
	api.get<{ data: TicketScanDetail[] }>(`/tickets/${ticketId}/scans`, { params: tenantScopedParams(options) });

// Guests
export const searchGuestsApi = (q: string) => api.get<{ data: Guest[] }>('/guests', { params: { q } });

export const getTicketQRApi = (ticketId: string, options?: TenantScopedRequestOptions) =>
	api.get<{ data: { qrToken: string } }>(`/tickets/${ticketId}/qr`, { params: tenantScopedParams(options) });

// Stats
export const getEventStatsApi = (eventId: string, interval?: string) =>
	api.get<{ data: EventStats }>(`/events/${eventId}/stats`, interval ? { params: { interval } } : {});

// Scan
export const postScanApi = (
	ticketId: string,
	eventId: string,
	deviceId: string,
	scannedAt: string,
	scanId: string,
	qrToken?: string,
	confirmed?: boolean,
) =>
	api.post('/scan', {
		id: scanId,
		ticketId,
		eventId,
		deviceId,
		scannedAt,
		...(qrToken !== undefined && { qrToken }),
		...(confirmed !== undefined && { confirmed }),
	});

export const uploadDeviceEventDebugDataApi = (payload: DeviceEventDebugUploadPayload) =>
	api.post<{ data: DeviceEventDebugUploadResponse }>('/scan/device-event-debug', payload);

export const getEventDeviceDebugDataApi = (eventId: string) =>
	api.get<{ data: EventDeviceDebugDataItem[] }>(`/events/${eventId}/device-debug-data`);

export const getEventDeviceDebugDataItemApi = (eventId: string, dumpId: string) =>
	api.get<{ data: EventDeviceDebugDataDetail }>(`/events/${eventId}/device-debug-data/${dumpId}`);

// Sync
export const syncApi = (payload: SyncPayload) => api.post<{ data: SyncResponse }>('/sync', payload);

// Super admin
export const getAdminTenantsApi = () => api.get<{ data: AdminTenant[] }>('/admin/tenants');
export const getAdminEventsApi = (tenantId: string) => api.get<{ data: AdminEvent[] }>('/admin/events', { params: { tenantId } });
export const getAdminUsersApi = (tenantId?: string) =>
	tenantId ? api.get<{ data: AdminUser[] }>('/admin/users', { params: { tenantId } }) : api.get<{ data: AdminUser[] }>('/admin/users');
export const createAdminUserApi = (email: string, role: ManageableUserRole, tenantId?: string) =>
	tenantId
		? api.post<{ data: AdminUser }>('/admin/users', { email, role, tenantId })
		: api.post<{ data: AdminUser }>('/admin/users', { email, role });
export const upgradeTenantApi = (tenantId: string) => api.post<{ data: AdminTenant }>(`/admin/tenants/${tenantId}/upgrade`);
export const downgradeTenantApi = (tenantId: string) => api.post<{ data: AdminTenant }>(`/admin/tenants/${tenantId}/downgrade`);
export const updateUserRoleApi = (userId: string, role: ManageableUserRole, tenantId?: string) =>
	tenantId
		? api.patch<{ data: AdminUser }>(`/admin/users/${userId}/role`, { role, tenantId })
		: api.patch<{ data: AdminUser }>(`/admin/users/${userId}/role`, { role });

export default api;
