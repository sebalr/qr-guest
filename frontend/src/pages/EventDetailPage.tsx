import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEventApi, getTicketsApi, addTicketsApi, cancelTicketApi, getTicketQRApi, Event, Ticket } from '../api';
import { db } from '../db';
import QRCodeDisplay from '../components/QRCodeDisplay';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, QrCode, Camera, Plus, X, AlertCircle, Users, CheckCircle2, XCircle } from 'lucide-react';

export default function EventDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [event, setEvent] = useState<Event | null>(null);
	const [tickets, setTickets] = useState<Ticket[]>([]);
	const [loading, setLoading] = useState(true);
	const [bulkNames, setBulkNames] = useState('');
	const [showBulk, setShowBulk] = useState(false);
	const [adding, setAdding] = useState(false);
	const [bulkError, setBulkError] = useState('');
	const [qrMap, setQrMap] = useState<Record<string, string>>({});
	const [scanCounts, setScanCounts] = useState<Record<string, number>>({});

	useEffect(() => {
		if (!id) return;
		Promise.all([getEventApi(id), getTicketsApi(id)])
			.then(([evRes, tkRes]) => {
				setEvent(evRes.data.data);
				const tks = tkRes.data.data;
				setTickets(tks);
				// Cache tickets in IndexedDB
				db.tickets.bulkPut(
					tks.map(t => ({
						id: t.id,
						event_id: t.eventId,
						name: t.name,
						status: t.status,
						version: t.version,
					})),
				);
				// Load scan counts from local DB
				return Promise.all(
					tks.map(t =>
						db.scans
							.where('ticket_id')
							.equals(t.id)
							.count()
							.then(c => ({ id: t.id, count: c })),
					),
				);
			})
			.then(counts => {
				const map: Record<string, number> = {};
				counts.forEach(({ id: tid, count }) => {
					map[tid] = count;
				});
				setScanCounts(map);
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [id]);

	async function handleAddTickets(e: FormEvent) {
		e.preventDefault();
		if (!id) return;
		setBulkError('');
		setAdding(true);
		const names = bulkNames
			.split('\n')
			.map(n => n.trim())
			.filter(Boolean);
		if (names.length === 0) {
			setBulkError('Enter at least one name.');
			setAdding(false);
			return;
		}
		try {
			const res = await addTicketsApi(id, names);
			const newTickets = res.data.data;
			setTickets(prev => [...prev, ...newTickets]);
			db.tickets.bulkPut(
				newTickets.map(t => ({
					id: t.id,
					event_id: t.eventId,
					name: t.name,
					status: t.status,
					version: t.version,
				})),
			);
			setBulkNames('');
			setShowBulk(false);
		} catch {
			setBulkError('Failed to add tickets.');
		} finally {
			setAdding(false);
		}
	}

	async function handleCancel(ticketId: string) {
		if (!confirm('Cancel this ticket?')) return;
		try {
			await cancelTicketApi(ticketId);
			setTickets(prev => prev.map(t => (t.id === ticketId ? { ...t, status: 'cancelled' } : t)));
			db.tickets.update(ticketId, { status: 'cancelled' });
		} catch {
			alert('Failed to cancel ticket.');
		}
	}

	async function handleShowQR(ticketId: string) {
		if (qrMap[ticketId]) {
			setQrMap(prev => {
				const n = { ...prev };
				delete n[ticketId];
				return n;
			});
			return;
		}
		try {
			const res = await getTicketQRApi(ticketId);
			setQrMap(prev => ({ ...prev, [ticketId]: res.data.data.qrToken }));
		} catch {
			alert('Failed to load QR code.');
		}
	}

	const totalScanned = Object.values(scanCounts).reduce((a, b) => a + b, 0);
	const cancelledCount = tickets.filter(t => t.status === 'cancelled').length;

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<p className="text-muted-foreground">Loading…</p>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-slate-50">
			<header className="bg-background border-b sticky top-0 z-10">
				<div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => navigate('/events')}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<h1 className="font-bold text-lg flex-1 truncate">{event?.name ?? 'Event'}</h1>
					<Button
						size="sm"
						className="gap-1.5"
						onClick={() => navigate(`/events/${id}/scan`)}>
						<Camera className="h-4 w-4" />
						Scanner
					</Button>
				</div>
			</header>

			<main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
				{event && (
					<Card>
						<CardContent className="pt-6">
							<p className="text-sm text-muted-foreground mb-4">
								{new Date(event.startsAt).toLocaleString()} – {new Date(event.endsAt).toLocaleString()}
							</p>
							<div className="grid grid-cols-3 gap-4">
								<div className="flex flex-col items-center p-3 rounded-lg bg-slate-50 border">
									<Users className="h-5 w-5 text-muted-foreground mb-1" />
									<p className="text-2xl font-bold">{tickets.length}</p>
									<p className="text-xs text-muted-foreground">Total</p>
								</div>
								<div className="flex flex-col items-center p-3 rounded-lg bg-green-50 border border-green-100">
									<CheckCircle2 className="h-5 w-5 text-green-600 mb-1" />
									<p className="text-2xl font-bold text-green-600">{totalScanned}</p>
									<p className="text-xs text-muted-foreground">Scanned</p>
								</div>
								<div className="flex flex-col items-center p-3 rounded-lg bg-red-50 border border-red-100">
									<XCircle className="h-5 w-5 text-red-500 mb-1" />
									<p className="text-2xl font-bold text-red-500">{cancelledCount}</p>
									<p className="text-xs text-muted-foreground">Cancelled</p>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				<div className="flex justify-between items-center">
					<h2 className="text-lg font-semibold">Tickets</h2>
					<Button
						variant={showBulk ? 'outline' : 'default'}
						size="sm"
						className="gap-1.5"
						onClick={() => setShowBulk(v => !v)}>
						{showBulk ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
						{showBulk ? 'Cancel' : 'Add Tickets'}
					</Button>
				</div>

				{showBulk && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Add Guest Tickets</CardTitle>
						</CardHeader>
						<CardContent>
							<form
								onSubmit={handleAddTickets}
								className="space-y-3">
								<div className="space-y-2">
									<Label>Guest names (one per line)</Label>
									<Textarea
										rows={5}
										value={bulkNames}
										onChange={e => setBulkNames(e.target.value)}
										placeholder={'Alice Smith\nBob Jones\nCarol White'}
									/>
								</div>
								{bulkError && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
										<AlertDescription>{bulkError}</AlertDescription>
									</Alert>
								)}
								<Button
									type="submit"
									disabled={adding}>
									{adding ? 'Adding…' : 'Add Tickets'}
								</Button>
							</form>
						</CardContent>
					</Card>
				)}

				<div className="space-y-3">
					{tickets.length === 0 ? (
						<Card className="py-12 text-center">
							<CardContent>
								<p className="text-muted-foreground">No tickets yet.</p>
							</CardContent>
						</Card>
					) : (
						tickets.map(ticket => (
							<Card key={ticket.id}>
								<CardContent className="p-4">
									<div className="flex justify-between items-start gap-4">
										<div className="min-w-0">
											<p className="font-medium truncate">{ticket.name}</p>
											<p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{ticket.id}</p>
											<div className="flex flex-wrap gap-1.5 mt-2">
												<Badge variant={ticket.status === 'active' ? 'success' : 'destructive'}>{ticket.status}</Badge>
												{scanCounts[ticket.id] ? (
													<Badge variant="secondary">Scanned {scanCounts[ticket.id]}×</Badge>
												) : null}
											</div>
										</div>
										<div className="flex gap-2 shrink-0">
											<Button
												variant="outline"
												size="sm"
												onClick={() => handleShowQR(ticket.id)}>
												<QrCode className="h-3.5 w-3.5 mr-1" />
												{qrMap[ticket.id] ? 'Hide' : 'QR'}
											</Button>
											{ticket.status === 'active' && (
												<Button
													variant="destructive"
													size="sm"
													onClick={() => handleCancel(ticket.id)}>
													Cancel
												</Button>
											)}
										</div>
									</div>
									{qrMap[ticket.id] && (
										<>
											<Separator className="my-3" />
											<div className="flex justify-center">
												<QRCodeDisplay value={qrMap[ticket.id]} />
											</div>
										</>
									)}
								</CardContent>
							</Card>
						))
					)}
				</div>
			</main>
		</div>
	);
}

