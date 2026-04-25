import { useState, useEffect, useRef, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
	getEventApi,
	getTicketsApi,
	addTicketsApi,
	createTicketApi,
	cancelTicketApi,
	getTicketQRApi,
	searchGuestsApi,
	getTicketScansApi,
	Event,
	Ticket,
	Guest,
	TicketScanDetail,
} from '../api';
import { useAuth } from '../auth/AuthContext';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

type ScanHistoryItem = TicketScanDetail & {
	pendingSync?: boolean;
};

export default function EventDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { user } = useAuth();
	const canManageTickets = user?.isSuperAdmin || user?.role === 'owner' || user?.role === 'admin';
	const [event, setEvent] = useState<Event | null>(null);
	const [tickets, setTickets] = useState<Ticket[]>([]);
	const [loading, setLoading] = useState(true);

	// Bulk add
	const [bulkNames, setBulkNames] = useState('');
	const [showBulk, setShowBulk] = useState(false);
	const [adding, setAdding] = useState(false);
	const [bulkError, setBulkError] = useState('');

	// Single add – guest search
	const [singleName, setSingleName] = useState('');
	const [addingSingle, setAddingSingle] = useState(false);
	const [singleError, setSingleError] = useState('');
	const [guestSuggestions, setGuestSuggestions] = useState<Guest[]>([]);
	const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const suggestionRef = useRef<HTMLDivElement>(null);

	// QR map and scan counts
	const [qrMap, setQrMap] = useState<Record<string, string>>({});
	const [scanCounts, setScanCounts] = useState<Record<string, number>>({});

	// Multi-select
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [generatingPdf, setGeneratingPdf] = useState(false);
	const [pdfToast, setPdfToast] = useState('');
	const [scanHistoryOpen, setScanHistoryOpen] = useState(false);
	const [scanHistoryTicket, setScanHistoryTicket] = useState<Ticket | null>(null);
	const [scanHistoryItems, setScanHistoryItems] = useState<ScanHistoryItem[]>([]);
	const [scanHistoryLoading, setScanHistoryLoading] = useState(false);
	const [scanHistoryError, setScanHistoryError] = useState('');

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
							.then(c => ({ id: t.id, count: Math.max(c, t.scanCount ?? 0) })),
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

	// Close suggestions on outside click
	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (suggestionRef.current && !suggestionRef.current.contains(e.target as Node)) {
				setShowSuggestions(false);
			}
		}
		document.addEventListener('mousedown', handleClick);
		return () => document.removeEventListener('mousedown', handleClick);
	}, []);

	function handleSingleNameChange(value: string) {
		setSingleName(value);
		setSelectedGuest(null);
		if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
		if (!value.trim()) {
			setGuestSuggestions([]);
			setShowSuggestions(false);
			return;
		}
		searchTimerRef.current = setTimeout(async () => {
			try {
				const res = await searchGuestsApi(value.trim());
				setGuestSuggestions(res.data.data);
				setShowSuggestions(true);
			} catch {
				setGuestSuggestions([]);
			}
		}, 300);
	}

	function handleSelectGuest(guest: Guest) {
		setSelectedGuest(guest);
		setSingleName(guest.name);
		setShowSuggestions(false);
		setGuestSuggestions([]);
	}

	async function handleAddSingle(e: FormEvent) {
		e.preventDefault();
		if (!id) return;
		setSingleError('');
		setAddingSingle(true);
		try {
			const payload = selectedGuest ? { guestId: selectedGuest.id } : { name: singleName.trim() };
			const res = await createTicketApi(id, payload);
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
			setSelectedGuest(null);
			setGuestSuggestions([]);
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
		const ticket = tickets.find(t => t.id === ticketId);
		if (!ticket || ticket.status === 'cancelled') {
			throw new Error('Ticket is cancelled');
		}
		const res = await getTicketQRApi(ticketId);
		const token = res.data.data.qrToken;
		setQrMap(prev => ({ ...prev, [ticketId]: token }));
		return token;
	}

	async function handleShowQR(ticketId: string) {
		const ticket = tickets.find(t => t.id === ticketId);
		if (!ticket || ticket.status === 'cancelled') {
			setPdfToast('Cancelled tickets cannot display QR codes.');
			return;
		}

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
		const activeTicketIds = ticketIds.filter(tid => tickets.find(t => t.id === tid)?.status !== 'cancelled');
		return Promise.all(
			activeTicketIds.map(async tid => {
				const token = await fetchQrToken(tid);
				const ticket = tickets.find(t => t.id === tid)!;
				return { id: tid, name: ticket.name, qrToken: token };
			}),
		);
	}

	async function handleGeneratePdf(ticketIds: string[]) {
		if (!event) return;
		const activeTicketIds = ticketIds.filter(tid => tickets.find(t => t.id === tid)?.status !== 'cancelled');
		const skippedCount = ticketIds.length - activeTicketIds.length;

		if (activeTicketIds.length === 0) {
			setPdfToast('Selected tickets are cancelled and cannot be shared as QR.');
			return;
		}

		setGeneratingPdf(true);
		setPdfToast('');
		try {
			const guests = await buildGuestPdfData(activeTicketIds);
			const blob = await generateQrPdf(guests, event.name);
			const filename = `${event.name.replace(/[^a-z0-9]/gi, '_')}-guests.pdf`;
			const shared = await sharePdfOrDownload(blob, filename, `${event.name} – Guest QR Codes`);
			if (!shared) {
				setPdfToast(
					skippedCount > 0
						? `PDF downloaded. ${skippedCount} cancelled ticket(s) were skipped.`
						: 'PDF downloaded. Open WhatsApp and attach it manually.',
				);
			} else if (skippedCount > 0) {
				setPdfToast(`${skippedCount} cancelled ticket(s) were skipped.`);
			}
		} catch {
			setPdfToast('Failed to generate PDF.');
		} finally {
			setGeneratingPdf(false);
		}
	}

	async function openScanHistory(ticket: Ticket) {
		setScanHistoryTicket(ticket);
		setScanHistoryOpen(true);
		setScanHistoryLoading(true);
		setScanHistoryError('');
		setScanHistoryItems([]);

		try {
			let remoteScans: TicketScanDetail[] = [];
			let remoteFailed = false;

			try {
				const res = await getTicketScansApi(ticket.id);
				remoteScans = res.data.data;
			} catch {
				remoteFailed = true;
			}

			const localScans = await db.scans.where('ticket_id').equals(ticket.id).toArray();
			const remoteIds = new Set(remoteScans.map(scan => scan.id));
			const localOnlyScans: ScanHistoryItem[] = localScans
				.filter(scan => !remoteIds.has(scan.id))
				.map(scan => ({
					id: scan.id,
					scannedAt: scan.scanned_at,
					deviceId: 'local-device',
					userId: 'local',
					scannedBy: scan.synced ? 'Recorded on this device' : 'Pending sync (this device)',
					pendingSync: !scan.synced,
				}));

			const merged = [...remoteScans, ...localOnlyScans].sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());

			setScanHistoryItems(merged);
			if (remoteFailed) {
				setScanHistoryError('Server history unavailable. Showing local records only.');
			}
		} catch {
			setScanHistoryError('Failed to load scan history.');
		} finally {
			setScanHistoryLoading(false);
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
					{canManageTickets && (
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5"
							onClick={() => navigate(`/events/${id}/dashboard`)}>
							<BarChart2 className="h-4 w-4" />
							<span className="hidden sm:inline">Dashboard</span>
						</Button>
					)}
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

				{/* Single guest add with autocomplete */}
				{canManageTickets && (
					<form
						onSubmit={handleAddSingle}
						className="flex gap-2 items-start">
						<div
							className="flex-1 space-y-1 relative"
							ref={suggestionRef}>
							<div className="relative">
								<Input
									placeholder="Add guest by name…"
									value={singleName}
									onChange={e => handleSingleNameChange(e.target.value)}
									onFocus={() => guestSuggestions.length > 0 && setShowSuggestions(true)}
									autoComplete="off"
								/>
								{selectedGuest && (
									<span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-green-600 font-medium pointer-events-none">
										Existing guest
									</span>
								)}
							</div>
							{singleError && <p className="text-xs text-destructive">{singleError}</p>}

							{/* Suggestions dropdown */}
							{showSuggestions && guestSuggestions.length > 0 && (
								<div className="absolute z-30 top-full mt-1 w-full bg-background border rounded-lg shadow-lg overflow-hidden">
									<p className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b bg-slate-50">
										Existing guests in your organisation
									</p>
									<ul className="max-h-56 overflow-y-auto divide-y">
										{guestSuggestions.map(g => (
											<li key={g.id}>
												<button
													type="button"
													className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
													onMouseDown={e => {
														e.preventDefault();
														handleSelectGuest(g);
													}}>
													<p className="text-sm font-medium">{g.name}</p>
													{g.events.length > 0 && (
														<p className="text-xs text-muted-foreground truncate">{g.events.map(ev => ev.eventName).join(', ')}</p>
													)}
												</button>
											</li>
										))}
									</ul>
									<div className="border-t px-3 py-2 bg-slate-50">
										<p className="text-xs text-muted-foreground">
											Not listed?{' '}
											<button
												type="button"
												className="underline hover:text-foreground"
												onMouseDown={e => {
													e.preventDefault();
													setShowSuggestions(false);
												}}>
												Create new guest &quot;{singleName}&quot;
											</button>
										</p>
									</div>
								</div>
							)}
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
				)}

				<div className="flex justify-between items-center">
					<div className="flex items-center gap-2">
						<h2 className="text-lg font-semibold">Guests</h2>
						{canManageTickets && tickets.length > 0 && (
							<button
								type="button"
								className="text-xs text-muted-foreground hover:text-foreground underline"
								onClick={toggleSelectAll}>
								{selected.size === tickets.length ? 'Deselect all' : 'Select all'}
							</button>
						)}
					</div>
					{canManageTickets && (
						<Button
							variant={showBulk ? 'outline' : 'default'}
							size="sm"
							className="gap-1.5"
							onClick={() => setShowBulk(v => !v)}>
							{showBulk ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
							{showBulk ? 'Cancel' : 'Bulk Add'}
						</Button>
					)}
				</div>

				{canManageTickets && showBulk && (
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
											{canManageTickets && (
												<Checkbox
													className="mt-1"
													checked={selected.has(ticket.id)}
													onChange={() => toggleSelect(ticket.id)}
													id={`chk-${ticket.id}`}
												/>
											)}
											<div className="min-w-0">
												<p className="font-medium truncate">{ticket.name}</p>
												<p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{ticket.id}</p>
												<div className="flex flex-wrap gap-1.5 mt-2">
													<Badge variant={ticket.status === 'active' ? 'success' : 'destructive'}>{ticket.status}</Badge>
													{scanCounts[ticket.id] ? (
														<button
															type="button"
															onClick={() => openScanHistory(ticket)}
															className="inline-flex items-center rounded-full border border-transparent bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
															Scanned {scanCounts[ticket.id]}x
														</button>
													) : null}
												</div>
											</div>
										</div>
										<div className="flex gap-2 shrink-0 flex-wrap justify-end">
											{canManageTickets && ticket.status === 'active' && (
												<Button
													variant="outline"
													size="sm"
													onClick={() => handleShowQR(ticket.id)}>
													<QrCode className="h-3.5 w-3.5 mr-1" />
													{qrMap[ticket.id] ? 'Hide' : 'QR'}
												</Button>
											)}
											{canManageTickets && ticket.status === 'active' && (
												<Button
													variant="outline"
													size="sm"
													disabled={generatingPdf}
													onClick={() => handleGeneratePdf([ticket.id])}>
													<Share2 className="h-3.5 w-3.5" />
												</Button>
											)}
											{canManageTickets && ticket.status === 'active' && (
												<Button
													variant="destructive"
													size="sm"
													onClick={() => handleCancel(ticket.id)}>
													Cancel
												</Button>
											)}
										</div>
									</div>
									{canManageTickets && qrMap[ticket.id] && (
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
			{canManageTickets && selected.size > 0 && (
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

			<Dialog
				open={scanHistoryOpen}
				onOpenChange={setScanHistoryOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Scan History</DialogTitle>
						<DialogDescription>
							{scanHistoryTicket ? `${scanHistoryTicket.name} (${scanHistoryTicket.id})` : 'Loading ticket details...'}
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-80 overflow-y-auto rounded-md border">
						{scanHistoryLoading ? (
							<p className="p-4 text-sm text-muted-foreground">Loading scans...</p>
						) : scanHistoryError ? (
							<p className="p-4 text-sm text-destructive">{scanHistoryError}</p>
						) : scanHistoryItems.length === 0 ? (
							<p className="p-4 text-sm text-muted-foreground">No scans recorded for this ticket.</p>
						) : (
							<ul className="divide-y">
								{scanHistoryItems.map((scan, index) => (
									<li
										key={scan.id}
										className="p-3">
										<div className="flex items-center gap-2">
											<p className="text-sm font-medium">{scan.scannedBy}</p>
											{scan.pendingSync ? (
												<Badge
													variant="warning"
													className="text-[10px] px-1.5 py-0">
													Pending sync
												</Badge>
											) : null}
										</div>
										<p className="text-xs text-muted-foreground mt-0.5">{new Date(scan.scannedAt).toLocaleString()}</p>
										<p className="text-[11px] text-muted-foreground mt-1">Scan #{scanHistoryItems.length - index}</p>
									</li>
								))}
							</ul>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
