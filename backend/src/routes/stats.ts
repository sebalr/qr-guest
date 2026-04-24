import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import prisma from '../prisma';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['owner', 'admin']));

router.get('/:id/stats', async (req, res): Promise<void> => {
  const eventId = req.params.id;

  const event = await prisma.event.findFirst({
    where: { id: eventId, tenantId: req.user!.tenantId },
  });
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const [totalScans, uniqueTicketsResult] = await Promise.all([
    prisma.scan.count({ where: { eventId } }),
    prisma.scan.groupBy({
      by: ['ticketId'],
      where: { eventId },
    }),
  ]);

  const uniqueTickets = uniqueTicketsResult.length;
  const duplicates = totalScans - uniqueTickets;

  res.json({ data: { totalScans, uniqueTickets, duplicates } });
});

export { router as statsRouter };
export default router;
