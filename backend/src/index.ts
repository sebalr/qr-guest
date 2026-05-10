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
import guestsRouter from './routes/guests';
import { assertRlsSafeDatabaseRole } from './prisma';

const app = express();

const configuredCorsOrigins = (process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? '')
	.split(',')
	.map(origin => origin.trim().replace(/\/$/, ''))
	.filter(Boolean);

const corsOptions: cors.CorsOptions = {
	origin(origin, callback) {
		if (!origin) {
			callback(null, true);
			return;
		}

		if (configuredCorsOrigins.length === 0 || configuredCorsOrigins.includes(origin)) {
			callback(null, true);
			return;
		}

		callback(new Error(`CORS blocked origin: ${origin}`));
	},
	methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

app.use('/auth', authRouter);
app.use('/events', eventsRouter);
app.use('/', ticketsRouter);
app.use('/scan', scansRouter);
app.use('/sync', syncRouter);
app.use('/admin', adminRouter);
app.use('/events', statsRouter);
app.use('/guests', guestsRouter);

app.get('/health', (_req: Request, res: Response) => {
	res.json({ status: 'ok' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
	console.error(err);
	res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT ?? 3000;

async function startServer(): Promise<void> {
	await assertRlsSafeDatabaseRole();

	app.listen(PORT, () => {
		console.log(`Server listening on port ${PORT}`);
	});
}

startServer().catch(error => {
	console.error('Failed to start server:', error);
	process.exit(1);
});

export default app;
