import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEventApi, getTicketsApi, addTicketsApi, createTicketApi, cancelTicketApi, getTicketQRApi, Event, Ticket } from '../api';
import { db } from '../db';
import QRCodeDisplay from '../components/QRCodeDisplay';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { generateQrPdf, sharePdfOrDownload } from '@/lib/generateQrPdf';
import {
	ArrowLeft,
	QrCode,
	Camera,
	Plus,
	X,
	AlertCircle,
	Users,
	CheckCircle2,
	XCircle,
	BarChart2,
	Download,
	Share2,
	UserPlus,
} from 'lucide-react';

export default function EventDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [event, setEvent] = useState<Event | null>(null);
	const [tickets, setTickets] = useState<Ticket[]>([]);
	const [loading, setLoading] = useState(true);

	// Bulk add
	const [bulkNames, setBulkNames] = useState('');
	const [showBulk, setShowBulk] = useState(false);
	const [adding, setAdding] = useState(false);
	const [bulkError, setBulkError] = useState('');

	// Single add
	const [singleName, setSingleName] = useState('');
	const [addingSingle, setAddingSingle] = useState(false);
	const [singleError, setSingleError] = useState('');

	// QR map and scan counts
	const [qrMap, setQrMap] = useState<Record<string, string>>({});
	const [scanCounts, setScanCounts] = useState<Record<string, number>>({});

	// Multi-select
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [generatingPdf, setGeneratingPdf] = useState(false);
	const [pdfToast, setPdfToast] = useState('');

	useEffect(() => {
		if (!id) return;
		Promise.all([getEventApi(id), getTicketsApi(id)])
			.then(([evRes, tkRes]) => {
				setEvent(evRes.data.data);
				const tks = tkRes.data.data;
				setTickets(tks);
				db.tickets.bulkPut(
					tks.map(t => ({
						id: t.id,
						event_id: t.eventId,
						name: t.name,
						status: t.status,
						version: t.version,
					})),
				);
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

	async function handleAddSingle(e: FormEvent) {
		e.preventDefault();
		if (!id) return;
		setSingleError('');
		setAddingSingle(true);
		try {
			const res = await createTicketApi(id, singleName.trim());
			const newTicket = res.data.data;
			setTickets(prev => [...prev, newTicket]);
			db.tickets.put({
				id: newTicket.id,
				event_id: newTicket.eventId,
				name: newTicket.name,
				status: newTicket.status,
				version: newTicket.version,
			});
			setSingleName('');
		} catch {
			setSingleError('Failed to add guest.');
		} finally {
			setAddingSingle(false);
		}
	}

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

	async function fetchQrToken(ticketId: string): Promise<string> {
		if (qrMap[ticketId]) return qrMap[ticketId];
		const res = await getTicketQRApi(ticketId);
		const token = res.data.data.qrToken;
		setQrMap(prev => ({ ...prev, [ticketId]: token }));
		return token;
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
			await fetchQrToken(ticketId);
		} catch {
			alert('Failed to load QR code.');
		}
	}

	function toggleSelect(ticketId: string) {
		setSelected(prev => {
			const next = new Set(prev);
			if (next.has(ticketId)) next.delete(ticketId);
			else next.add(ticketId);
			return next;
		});
	}

	function toggleSelectAll() {
		if (selected.size === tickets.length) {
			setSelected(new Set());
		} else {
			setSelected(new Set(tickets.map(t => t.id)));
		}
	}

	async function buildGuestPdfData(ticketIds: string[]) {
		return Promise.all(
			ticketIds.map(async tid => {
				const token = await fetchQrToken(tid);
				const ticket = tickets.find(t => t.id === tid)!;
				return { id: tid, name: ticket.name, qrToken: token };
			}),
		);
	}

	async function handleGeneratePdf(ticketIds: string[]) {
		if (!event) return;
		setGeneratingPdf(true);
		setPdfToast('');
		try {
			const guests = await buildGuestPdfData(ticketIds);
			const blob = await generateQrPdf(guests, event.name);
			const filename = `${event.name.replace(/[^a-z0-9]/gi, '_')}-guests.pdf`;
			const shared = await sharePdfOrDownload(blob, filename, `${event.name} – Guest QR Codes`);
			if (!shared) {
				setPdfToast('PDF downloaded. Open WhatsApp and attach it manually.');
			}
		} catch {
			setPdfToast('Failed to generate PDF.');
		} finally {
			setGeneratingPdf(false);
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
					<div className="flex-1 min-w-0 flex items-center gap-3">
						{event?.imageUrl && (
							<img
								src={event.imageUrl}
								alt={event.name}
								className="h-8 w-8 rounded-md object-cover shrink-0"
								onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
							/>
						)}
						<h1 className="font-bold text-lg flex-1 truncate">{event?.name ?? 'Event'}</h1>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5"
						onClick={() => navigate(`/events/${id}/dashboard`)}>
						<BarChart2 className="h-4 w-4" />
						<span className="hidden sm:inline">Dashboard</span>
					</Button>
					<Button
						size="sm"
						className="gap-1.5"
						onClick={() => navigate(`/events/${id}/scan`)}>
						<Camera className="h-4 w-4" />
						<span className="hidden sm:inline">Scanner</span>
					</Button>
				</div>
			</header>

			<main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
				{event && (
					<Card>
						<CardContent className="pt-6">
							{event.description && <p className="text-sm text-muted-foreground mb-3">{event.description}</p>}
							{(event.startsAt || event.endsAt) && (
								<p className="text-sm text-muted-foreground mb-4">
									{event.startsAt && new Date(event.startsAt).toLocaleString()}
									{event.startsAt && event.endsAt && ' – '}
									{event.endsAt && new Date(event.endsAt).toLocaleString()}
								</p>
							)}
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

				{/* Single guest add */}
				<form
					onSubmit={handleAddSingle}
					className="flex gap-2 items-start">
					<div className="flex-1 space-y-1">
						<Input
							placeholder="Add guest by name…"
							value={singleName}
							onChange={e => setSingleName(e.target.value)}
						/>
						{singleError && <p className="text-xs text-destructive">{singleError}</p>}
					</div>
					<Button
						type="submit"
						size="sm"
						disabled={addingSingle || !singleName.trim()}
						className="gap-1.5 shrink-0">
						<UserPlus className="h-3.5 w-3.5" />
						{addingSingle ? 'Adding…' : 'Add'}
					</Button>
				</form>

				<div className="flex justify-between items-center">
					<div className="flex items-center gap-2">
						<h2 className="text-lg font-semibold">Guests</h2>
						{tickets.length > 0 && (
							<button
								type="button"
								className="text-xs text-muted-foreground hover:text-foreground underline"
								onClick={toggleSelectAll}>
								{selected.size === tickets.length ? 'Deselect all' : 'Select all'}
							</button>
						)}
					</div>
					<Button
						variant={showBulk ? 'outline' : 'default'}
						size="sm"
						className="gap-1.5"
						onClick={() => setShowBulk(v => !v)}>
						{showBulk ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
						{showBulk ? 'Cancel' : 'Bulk Add'}
					</Button>
				</div>

				{showBulk && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Bulk Add Guests</CardTitle>
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
									{adding ? 'Adding…' : 'Add Guests'}
								</Button>
							</form>
						</CardContent>
					</Card>
				)}

				<div className="space-y-3">
					{tickets.length === 0 ? (
						<Card className="py-12 text-center">
							<CardContent>
								<p className="text-muted-foreground">No guests yet.</p>
							</CardContent>
						</Card>
					) : (
						tickets.map(ticket => (
							<Card key={ticket.id}>
								<CardContent className="p-4">
									<div className="flex justify-between items-start gap-4">
										<div className="flex items-start gap-3 min-w-0">
											<Checkbox
												className="mt-1"
												checked={selected.has(ticket.id)}
												onChange={() => toggleSelect(ticket.id)}
												id={`chk-${ticket.id}`}
											/>
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
										</div>
										<div className="flex gap-2 shrink-0 flex-wrap justify-end">
											<Button
												variant="outline"
												size="sm"
												onClick={() => handleShowQR(ticket.id)}>
												<QrCode className="h-3.5 w-3.5 mr-1" />
												{qrMap[ticket.id] ? 'Hide' : 'QR'}
											</Button>
											<Button
												variant="outline"
												size="sm"
												disabled={generatingPdf}
												onClick={() => handleGeneratePdf([ticket.id])}>
												<Share2 className="h-3.5 w-3.5" />
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

			{/* Toast */}
			{pdfToast && (
				<div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-foreground text-background text-sm px-4 py-2 rounded-lg shadow-lg max-w-xs text-center z-50">
					{pdfToast}
					<button
						className="ml-2 opacity-70 hover:opacity-100"
						onClick={() => setPdfToast('')}>
						×
					</button>
				</div>
			)}

			{/* Floating action bar */}
			{selected.size > 0 && (
				<div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-background border shadow-xl rounded-2xl px-5 py-3 z-50">
					<span className="text-sm font-medium">{selected.size} selected</span>
					<Button
						size="sm"
						variant="outline"
						disabled={generatingPdf}
						className="gap-1.5"
						onClick={() => handleGeneratePdf(Array.from(selected))}>
						<Download className="h-3.5 w-3.5" />
						PDF
					</Button>
					<Button
						size="sm"
						disabled={generatingPdf}
						className="gap-1.5"
						onClick={() => handleGeneratePdf(Array.from(selected))}>
						<Share2 className="h-3.5 w-3.5" />
						{generatingPdf ? 'Sharing…' : 'Share'}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => setSelected(new Set())}>
						<X className="h-4 w-4" />
					</Button>
				</div>
			)}
		</div>
	);
}
