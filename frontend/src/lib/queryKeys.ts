export const eventQueryKeys = {
	all: ['events'] as const,
	tenant: (tenantId?: string) => [...eventQueryKeys.all, tenantId ?? 'default-tenant'] as const,
	event: (eventId: string, tenantId?: string) => [...eventQueryKeys.tenant(tenantId), 'event', eventId] as const,
	tickets: (eventId: string, tenantId?: string) => [...eventQueryKeys.event(eventId, tenantId), 'tickets'] as const,
	ticketTypes: (eventId: string, tenantId?: string) => [...eventQueryKeys.event(eventId, tenantId), 'ticket-types'] as const,
	temporaryScanners: (eventId: string, tenantId?: string) => [...eventQueryKeys.event(eventId, tenantId), 'temporary-scanners'] as const,
};
