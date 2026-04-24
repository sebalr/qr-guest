import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/roles';

const router = Router();

router.use(authMiddleware);
router.use(requireSuperAdmin);

router.get('/tenants', async (_req: Request, res: Response): Promise<void> => {
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({ data: tenants });
});

router.post('/tenants/:id/upgrade', async (req: Request, res: Response): Promise<void> => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }
  const updated = await prisma.tenant.update({
    where: { id: req.params.id },
    data: { plan: 'pro' },
  });
  res.json({ data: updated });
});

router.post('/tenants/:id/downgrade', async (req: Request, res: Response): Promise<void> => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }
  const updated = await prisma.tenant.update({
    where: { id: req.params.id },
    data: { plan: 'free' },
  });
  res.json({ data: updated });
});

export default router;
