import axios from 'axios';

const api = axios.create({
	baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
});

api.interceptors.request.use(config => {
	const token = localStorage.getItem('token');
	if (token) config.headers.Authorization = `Bearer ${token}`;
	return config;
});

export interface Event {
	id: string;
	name: string;
	description?: string | null;
	imageUrl?: string | null;
	startsAt?: string | null;
	endsAt?: string | null;
	tenantId: string;
}

export interface Ticket {
	id: string;
	eventId: string;
	name: string;
	status: string;
	version: number;
	scanCount?: number;
}

export interface SyncPayload {
	eventId: string;
	lastTicketVersion: number;
	lastScanCursor: string;
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
	}[];
	scanUpdates: RemoteScan[];
	newTicketVersion: number;
	newScanCursor: string;
}

export interface EventStats {
	totalGuests: number;
	scannedGuests: number;
	notScannedGuests: number;
	totalScans: number;
	uniqueTickets: number;
	duplicates: number;
	scansByHour: { hour: string; count: number }[];
	topGuests: { ticketId: string; name: string; scanCount: number }[];
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
	tenantId: string;
	tenant: { id: string; name: string; plan: string };
	_count: { tickets: number; scans: number };
}

export interface AdminUser {
	id: string;
	email: string;
	role: string;
	isSuperAdmin: boolean;
	createdAt: string;
	tenantId: string;
	tenant: { id: string; name: string; plan: string };
}

// Auth
export const loginApi = (email: string, password: string, recaptchaToken?: string) =>
	api.post<{ data: { token: string } }>('/auth/login', { email, password, recaptchaToken });

export const registerApi = (email: string, password: string, name: string, recaptchaToken?: string) =>
	api.post<{ data: { token: string } }>('/auth/register', { tenantName: name, email, password, recaptchaToken });

// Events
export const getEventsApi = () => api.get<{ data: Event[] }>('/events');

export const createEventApi = (data: { name: string; startsAt?: string; endsAt?: string; description?: string; imageUrl?: string }) =>
	api.post<{ data: Event }>('/events', data);

export const getEventApi = (id: string) => api.get<{ data: Event }>(`/events/${id}`);

// Tickets
export const getTicketsApi = (eventId: string) => api.get<{ data: Ticket[] }>(`/events/${eventId}/tickets`);

export const addTicketsApi = (eventId: string, names: string[]) =>
	api.post<{ data: Ticket[] }>(`/events/${eventId}/tickets/bulk`, { tickets: names.map(name => ({ name })) });

export const createTicketApi = (eventId: string, name: string) =>
	api.post<{ data: Ticket }>(`/events/${eventId}/tickets`, { name });

export const cancelTicketApi = (ticketId: string) => api.post<{ data: Ticket }>(`/tickets/${ticketId}/cancel`);

export const getTicketQRApi = (ticketId: string) => api.get<{ data: { qrToken: string } }>(`/tickets/${ticketId}/qr`);

// Stats
export const getEventStatsApi = (eventId: string) => api.get<{ data: EventStats }>(`/events/${eventId}/stats`);

// Scan
export const postScanApi = (ticketId: string, eventId: string, deviceId: string, scannedAt: string) =>
	api.post('/scan', { ticketId, eventId, deviceId, scannedAt });

// Sync
export const syncApi = (payload: SyncPayload) => api.post<{ data: SyncResponse }>('/sync', payload);

// Super admin
export const getAdminTenantsApi = () => api.get<{ data: AdminTenant[] }>('/admin/tenants');
export const getAdminEventsApi = () => api.get<{ data: AdminEvent[] }>('/admin/events');
export const getAdminUsersApi = () => api.get<{ data: AdminUser[] }>('/admin/users');
export const upgradeTenantApi = (tenantId: string) => api.post<{ data: AdminTenant }>(`/admin/tenants/${tenantId}/upgrade`);
export const downgradeTenantApi = (tenantId: string) => api.post<{ data: AdminTenant }>(`/admin/tenants/${tenantId}/downgrade`);
export const updateUserRoleApi = (userId: string, role: string) => api.patch<{ data: AdminUser }>(`/admin/users/${userId}/role`, { role });

export default api;
