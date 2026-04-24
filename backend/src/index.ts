import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import authRouter from './routes/auth';
import eventsRouter from './routes/events';
import ticketsRouter from './routes/tickets';
import scansRouter from './routes/scans';
import syncRouter from './routes/sync';
import adminRouter from './routes/admin';
import statsRouter from './routes/stats';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRouter);
app.use('/events', eventsRouter);
app.use('/', ticketsRouter);
app.use('/scan', scansRouter);
app.use('/sync', syncRouter);
app.use('/admin', adminRouter);
app.use('/events', statsRouter);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

export default app;
