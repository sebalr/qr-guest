import { Router, Request, Response } from 'express';
import { resolveRlsContext } from '../lib/tenantContext';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { withRls } from '../prisma';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['owner', 'admin']));

/**
 * GET /guests?q=<query>
 * Search guests by name within the current tenant.
 * Returns up to 20 matches, each decorated with the events they have attended.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
	const rawQ = typeof req.query.q === 'string' ? req.query.q.trim() : '';
	// Limit query length to prevent overly expensive LIKE queries
	const q = rawQ.slice(0, 100);

	const context = resolveRlsContext(req, { allowSuperAdminTenantOverride: true });

	const guests = await withRls(context, async tenantPrisma => {
		return tenantPrisma.guest.findMany({
			where: {
				...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
			},
			include: {
				tickets: {
					include: { event: { select: { id: true, name: true } } },
					orderBy: { createdAt: 'desc' },
					take: 3,
				},
			},
			orderBy: { name: 'asc' },
			take: 20,
		});
	});

	const result = guests.map(g => ({
		id: g.id,
		name: g.name,
		createdAt: g.createdAt,
		events: g.tickets.map(t => ({ eventId: t.event.id, eventName: t.event.name })),
	}));

	res.json({ data: result });
});

export default router;
