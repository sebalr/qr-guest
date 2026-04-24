import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';

const router = Router();

/** Verifies a reCAPTCHA token with Google's API.
 *  Returns true if verification passes or RECAPTCHA_SECRET is not configured (dev mode). */
async function verifyRecaptcha(token: string | undefined): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return true; // Skip verification if not configured
  if (!token) return false;

  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }).toString(),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { tenantName, email, password, recaptchaToken } = req.body;
  if (!tenantName || !email || !password) {
    res.status(400).json({ error: 'tenantName, email, and password are required' });
    return;
  }

  const captchaOk = await verifyRecaptcha(recaptchaToken as string | undefined);
  if (!captchaOk) {
    res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already in use' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const tenant = await prisma.tenant.create({ data: { name: tenantName } });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      passwordHash,
      role: 'owner',
    },
  });

  const secret = process.env.JWT_SECRET!;
  const token = jwt.sign(
    { userId: user.id, tenantId: tenant.id, role: user.role, isSuperAdmin: user.isSuperAdmin },
    secret,
    { expiresIn: '7d' }
  );

  res.status(201).json({ data: { token } });
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password, recaptchaToken } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const captchaOk = await verifyRecaptcha(recaptchaToken as string | undefined);
  if (!captchaOk) {
    res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: true },
  });

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (user.role === 'scanner' && user.tenant.plan === 'free') {
    res.status(403).json({ error: 'Scanner role not allowed on free plan' });
    return;
  }

  const secret = process.env.JWT_SECRET!;
  const token = jwt.sign(
    { userId: user.id, tenantId: user.tenantId, role: user.role, isSuperAdmin: user.isSuperAdmin },
    secret,
    { expiresIn: '7d' }
  );

  res.json({ data: { token } });
});

export default router;
