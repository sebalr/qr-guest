import { Request } from 'express';
import prisma from './prisma';

async function test(req: Request) {
  const eventId: string = req.params.id;
  const result = await prisma.event.findFirst({
    where: { id: eventId, tenantId: req.user!.tenantId }
  });
}

export {};
