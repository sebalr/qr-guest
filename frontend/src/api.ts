import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface Event {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  tenant_id: string;
}

export interface Ticket {
  id: string;
  event_id: string;
  name: string;
  status: string;
  version: number;
  scan_count?: number;
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

export interface SyncResponse {
  ticketUpdates: {
    id: string;
    event_id: string;
    name: string;
    status: string;
    version: number;
  }[];
  newTicketVersion: number;
  newScanCursor: string;
}

// Auth
export const loginApi = (email: string, password: string, recaptchaToken?: string) =>
  api.post<{ token: string }>('/auth/login', { email, password, recaptchaToken });

export const registerApi = (email: string, password: string, name: string, recaptchaToken?: string) =>
  api.post<{ token: string }>('/auth/register', { tenantName: name, email, password, recaptchaToken });

// Events
export const getEventsApi = () => api.get<{ data: Event[] }>('/events');

export const createEventApi = (data: { name: string; starts_at: string; ends_at: string }) =>
  api.post<{ data: Event }>('/events', data);

export const getEventApi = (id: string) => api.get<{ data: Event }>(`/events/${id}`);

// Tickets
export const getTicketsApi = (eventId: string) =>
  api.get<{ data: Ticket[] }>(`/events/${eventId}/tickets`);

export const addTicketsApi = (eventId: string, names: string[]) =>
  api.post<{ data: Ticket[] }>(`/events/${eventId}/tickets/bulk`, { names });

export const cancelTicketApi = (ticketId: string) =>
  api.patch<{ data: Ticket }>(`/tickets/${ticketId}/cancel`);

export const getTicketQRApi = (ticketId: string) =>
  api.get<{ data: string }>(`/tickets/${ticketId}/qr`);

// Scan
export const postScanApi = (ticketId: string, eventId: string, deviceId: string) =>
  api.post('/scan', { ticketId, eventId, deviceId });

// Sync
export const syncApi = (payload: SyncPayload) =>
  api.post<{ data: SyncResponse }>('/sync', payload);

export default api;
