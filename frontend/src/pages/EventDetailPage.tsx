import { useState, useEffect, useRef, useMemo, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
	getEventApi,
	getEventTicketTypesApi,
	createEventTicketTypeApi,
	updateEventTicketTypeApi,
	deleteEventTicketTypeApi,
	getTicketsApi,
	addTicketsApi,
	createTicketApi,
	updateTicketApi,
	cancelTicketApi,
	getTicketQRApi,
	searchGuestsApi,
	getTicketScansApi,
	Event,
	Ticket,
	TicketType,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

type GuestListView = 'full' | 'compact';
const COMPACT_VIEW_DEFAULT_THRESHOLD = 300;
const COMPACT_GRID_COLUMNS = 4;

export default function EventDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { user } = useAuth();
	const canManageTickets = user?.isSuperAdmin || user?.role === 'owner' || user?.role === 'admin';
	const [event, setEvent] = useState<Event | null>(null);
	const [tickets, setTickets] = useState<Ticket[]>([]);
	const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
	const [loading, setLoading] = useState(true);

	// Bulk add
	const [bulkNames, setBulkNames] = useState('');
	const [showBulk, setShowBulk] = useState(false);
	const [adding, setAdding] = useState(false);
	const [bulkError, setBulkError] = useState('');
	const [bulkTicketTypeId, setBulkTicketTypeId] = useState<string>('none');

	// Single add – guest search
	const [singleName, setSingleName] = useState('');
	const [addingSingle, setAddingSingle] = useState(false);
	const [singleError, setSingleError] = useState('');
	const [singleTicketTypeId, setSingleTicketTypeId] = useState<string>('none');
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
	const [guestListView, setGuestListView] = useState<GuestListView>('full');
	const [hasManualGuestListViewSelection, setHasManualGuestListViewSelection] = useState(false);
	const [scanHistoryOpen, setScanHistoryOpen] = useState(false);
	const [scanHistoryTicket, setScanHistoryTicket] = useState<Ticket | null>(null);
	const [scanHistoryItems, setScanHistoryItems] = useState<ScanHistoryItem[]>([]);
	const [scanHistoryLoading, setScanHistoryLoading] = useState(false);
	const [scanHistoryError, setScanHistoryError] = useState('');
	const [cancelTargetTicketId, setCancelTargetTicketId] = useState<string | null>(null);
	const [cancelingTicket, setCancelingTicket] = useState(false);
	const [errorDialogMessage, setErrorDialogMessage] = useState<string | null>(null);
	const [newTicketTypeName, setNewTicketTypeName] = useState('');
	const [newTicketTypePrice, setNewTicketTypePrice] = useState('');
	const [ticketTypeError, setTicketTypeError] = useState('');
	const [savingTicketType, setSavingTicketType] = useState(false);
	const [editingTicketTypeId, setEditingTicketTypeId] = useState<string | null>(null);
	const [editingTicketTypeName, setEditingTicketTypeName] = useState('');
	const [editingTicketTypePrice, setEditingTicketTypePrice] = useState('');
	const [updatingTicketType, setUpdatingTicketType] = useState(false);
	const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
	const [editingTicketTypeSelection, setEditingTicketTypeSelection] = useState<string>('none');
	const [updatingTicket, setUpdatingTicket] = useState(false);
	const [ticketTypesDialogOpen, setTicketTypesDialogOpen] = useState(false);
	const compactListRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!id) return;
		setHasManualGuestListViewSelection(false);
		setGuestListView('full');
		Promise.all([getEventApi(id), getTicketsApi(id), getEventTicketTypesApi(id)])
			.then(([evRes, tkRes, typeRes]) => {
				setEvent(evRes.data.data);
				const tks = tkRes.data.data;
				setTickets(tks);
				setTicketTypes(typeRes.data.data);
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

	useEffect(() => {
		if (hasManualGuestListViewSelection) return;
		setGuestListView(tickets.length > COMPACT_VIEW_DEFAULT_THRESHOLD ? 'compact' : 'full');
	}, [tickets.length, hasManualGuestListViewSelection]);

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
			const payload = {
				...(selectedGuest ? { guestId: selectedGuest.id } : { name: singleName.trim() }),
				...(singleTicketTypeId !== 'none' ? { ticketTypeId: singleTicketTypeId } : {}),
			};
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
			setSingleTicketTypeId('none');
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
			const payload = names.map(name => ({
				name,
				...(bulkTicketTypeId !== 'none' ? { ticketTypeId: bulkTicketTypeId } : {}),
			}));
			const res = await addTicketsApi(id, payload);
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
			setBulkTicketTypeId('none');
			setShowBulk(false);
		} catch {
			setBulkError('Failed to add tickets.');
		} finally {
			setAdding(false);
		}
	}

	async function handleCreateTicketType(e: FormEvent) {
		e.preventDefault();
		if (!id) return;
		setTicketTypeError('');
		setSavingTicketType(true);
		const name = newTicketTypeName.trim();
		const price = Number(newTicketTypePrice);

		if (!name) {
			setTicketTypeError('Ticket type name is required.');
			setSavingTicketType(false);
			return;
		}
		if (!Number.isFinite(price) || price < 0) {
			setTicketTypeError('Price must be a valid non-negative number.');
			setSavingTicketType(false);
			return;
		}

		try {
			const res = await createEventTicketTypeApi(id, { name, price });
			setTicketTypes(prev => [...prev, res.data.data]);
			setNewTicketTypeName('');
			setNewTicketTypePrice('');
		} catch {
			setTicketTypeError('Failed to create ticket type.');
		} finally {
			setSavingTicketType(false);
		}
	}

	function startEditTicketType(type: TicketType) {
		setEditingTicketTypeId(type.id);
		setEditingTicketTypeName(type.name);
		setEditingTicketTypePrice(type.price.toFixed(2));
		setTicketTypeError('');
	}

	async function handleSaveEditedTicketType() {
		if (!editingTicketTypeId) return;
		setTicketTypeError('');
		setUpdatingTicketType(true);
		const name = editingTicketTypeName.trim();
		const price = Number(editingTicketTypePrice);

		if (!name) {
			setTicketTypeError('Ticket type name is required.');
			setUpdatingTicketType(false);
			return;
		}
		if (!Number.isFinite(price) || price < 0) {
			setTicketTypeError('Price must be a valid non-negative number.');
			setUpdatingTicketType(false);
			return;
		}

		try {
			const res = await updateEventTicketTypeApi(editingTicketTypeId, { name, price });
			const updatedType = res.data.data;
			setTicketTypes(prev => prev.map(t => (t.id === editingTicketTypeId ? res.data.data : t)));
			setTickets(prev => prev.map(t => (t.ticketTypeId === editingTicketTypeId ? { ...t, ticketType: updatedType } : t)));
			setEditingTicketTypeId(null);
			setEditingTicketTypeName('');
			setEditingTicketTypePrice('');
		} catch {
			setTicketTypeError('Failed to update ticket type.');
		} finally {
			setUpdatingTicketType(false);
		}
	}

	async function handleDeleteTicketType(ticketTypeId: string) {
		try {
			await deleteEventTicketTypeApi(ticketTypeId);
			setTicketTypes(prev => prev.filter(t => t.id !== ticketTypeId));
			setTickets(prev => prev.map(t => (t.ticketTypeId === ticketTypeId ? { ...t, ticketTypeId: null, ticketType: null } : t)));
		} catch {
			setTicketTypeError('Failed to delete ticket type.');
		}
	}

	function openEditTicketDialog(ticket: Ticket) {
		setEditingTicket(ticket);
		setEditingTicketTypeSelection(ticket.ticketTypeId ?? 'none');
	}

	async function handleSaveTicketTypeForTicket() {
		if (!editingTicket) return;
		setUpdatingTicket(true);
		try {
			const res = await updateTicketApi(editingTicket.id, {
				ticketTypeId: editingTicketTypeSelection === 'none' ? null : editingTicketTypeSelection,
			});
			const updated = res.data.data;
			setTickets(prev => prev.map(t => (t.id === updated.id ? updated : t)));
			setEditingTicket(null);
		} catch {
			setErrorDialogMessage('Failed to update ticket type.');
		} finally {
			setUpdatingTicket(false);
		}
	}

	async function handleCancelConfirmed() {
		if (!cancelTargetTicketId) return;
		setCancelingTicket(true);
		try {
			await cancelTicketApi(cancelTargetTicketId);
			setTickets(prev => prev.map(t => (t.id === cancelTargetTicketId ? { ...t, status: 'cancelled' } : t)));
			db.tickets.update(cancelTargetTicketId, { status: 'cancelled' });
			setCancelTargetTicketId(null);
		} catch {
			setErrorDialogMessage('Failed to cancel ticket.');
		} finally {
			setCancelingTicket(false);
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
			setErrorDialogMessage('Failed to load QR code.');
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
	const cancelTargetTicket = cancelTargetTicketId ? (tickets.find(t => t.id === cancelTargetTicketId) ?? null) : null;
	const compactRows = useMemo(() => {
		const rows: Ticket[][] = [];
		for (let i = 0; i < tickets.length; i += COMPACT_GRID_COLUMNS) {
			rows.push(tickets.slice(i, i + COMPACT_GRID_COLUMNS));
		}
		return rows;
	}, [tickets]);
	const compactRowVirtualizer = useVirtualizer({
		count: compactRows.length,
		getScrollElement: () => compactListRef.current,
		estimateSize: () => 190,
		overscan: 10,
	});

	function setGuestListMode(view: GuestListView) {
		setHasManualGuestListViewSelection(true);
		setGuestListView(view);
		if (compactListRef.current) {
			compactListRef.current.scrollTop = 0;
		}
		if (view === 'compact') {
			compactRowVirtualizer.scrollToIndex(0);
		}
	}

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
							className="flex-1 relative"
							ref={suggestionRef}>
							<div className="flex gap-2 items-start">
								<div className="relative flex-1">
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
								<div className="w-44 shrink-0">
									<Select
										value={singleTicketTypeId}
										onValueChange={setSingleTicketTypeId}>
										<SelectTrigger>
											<SelectValue placeholder="Ticket type" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">No type</SelectItem>
											{ticketTypes.map(type => (
												<SelectItem
													key={type.id}
													value={type.id}>
													{type.name} (${type.price.toFixed(2)})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
							{singleError && <p className="text-xs text-destructive mt-1">{singleError}</p>}

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
						<div className="inline-flex items-center rounded-md border bg-background p-0.5">
							<Button
								type="button"
								size="sm"
								variant={guestListView === 'full' ? 'secondary' : 'ghost'}
								className="h-7 px-2"
								onClick={() => setGuestListMode('full')}>
								Full
							</Button>
							<Button
								type="button"
								size="sm"
								variant={guestListView === 'compact' ? 'secondary' : 'ghost'}
								className="h-7 px-2"
								onClick={() => setGuestListMode('compact')}>
								Compact
							</Button>
						</div>
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
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setTicketTypeError('');
									setTicketTypesDialogOpen(true);
								}}>
								Ticket Types
							</Button>
							<Button
								variant={showBulk ? 'outline' : 'default'}
								size="sm"
								className="gap-1.5"
								onClick={() => setShowBulk(v => !v)}>
								{showBulk ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
								{showBulk ? 'Cancel' : 'Bulk Add'}
							</Button>
						</div>
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
								<div className="space-y-2">
									<Label>Ticket Type (applies to all)</Label>
									<Select
										value={bulkTicketTypeId}
										onValueChange={setBulkTicketTypeId}>
										<SelectTrigger>
											<SelectValue placeholder="Select ticket type" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">No type</SelectItem>
											{ticketTypes.map(type => (
												<SelectItem
													key={type.id}
													value={type.id}>
													{type.name} (${type.price.toFixed(2)})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
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
					) : guestListView === 'compact' ? (
						<div
							ref={compactListRef}
							className="h-[560px] overflow-y-auto border rounded-lg bg-background">
							<div
								style={{
									height: `${compactRowVirtualizer.getTotalSize()}px`,
									width: '100%',
									position: 'relative',
								}}>
								{compactRowVirtualizer.getVirtualItems().map(virtualRow => {
									const rowTickets = compactRows[virtualRow.index];
									if (!rowTickets || rowTickets.length === 0) return null;

									return (
										<div
											key={`compact-row-${virtualRow.index}`}
											data-index={virtualRow.index}
											ref={compactRowVirtualizer.measureElement}
											style={{
												position: 'absolute',
												top: 0,
												left: 0,
												width: '100%',
												transform: `translateY(${virtualRow.start}px)`,
											}}
											className="px-3 py-3 border-b last:border-b-0">
											<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
												{rowTickets.map(ticket => (
													<div
														key={ticket.id}
														className="aspect-square rounded-lg border bg-background p-3 flex flex-col gap-2">
														<div className="flex items-start justify-between gap-2 min-w-0">
															<p className="text-sm font-medium leading-tight break-words">{ticket.name}</p>
															{canManageTickets && (
																<Checkbox
																	checked={selected.has(ticket.id)}
																	onChange={() => toggleSelect(ticket.id)}
																	id={`chk-compact-${ticket.id}`}
																/>
															)}
														</div>
														<div className="flex items-center gap-1.5 flex-wrap">
															<Badge variant={ticket.status === 'active' ? 'success' : 'destructive'}>{ticket.status}</Badge>
															{ticket.ticketType ? <Badge variant="outline">{ticket.ticketType.name}</Badge> : null}
															{scanCounts[ticket.id] ? (
																<button
																	type="button"
																	onClick={() => openScanHistory(ticket)}
																	className="inline-flex items-center rounded-full border border-transparent bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
																	Scanned {scanCounts[ticket.id]}x
																</button>
															) : null}
														</div>
														{canManageTickets && ticket.status === 'active' && (
															<div className="mt-auto pt-1 flex gap-1.5 flex-wrap">
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() => openEditTicketDialog(ticket)}>
																	Type
																</Button>
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() => handleShowQR(ticket.id)}>
																	<QrCode className="h-3.5 w-3.5" />
																</Button>
																<Button
																	variant="outline"
																	size="sm"
																	disabled={generatingPdf}
																	onClick={() => handleGeneratePdf([ticket.id])}>
																	<Share2 className="h-3.5 w-3.5" />
																</Button>
																<Button
																	variant="destructive"
																	size="sm"
																	onClick={() => setCancelTargetTicketId(ticket.id)}>
																	Cancel
																</Button>
															</div>
														)}
													</div>
												))}
											</div>
										</div>
									);
								})}
							</div>
						</div>
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
													{ticket.ticketType ? <Badge variant="outline">{ticket.ticketType.name}</Badge> : null}
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
													onClick={() => openEditTicketDialog(ticket)}>
													Type
												</Button>
											)}
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
													onClick={() => setCancelTargetTicketId(ticket.id)}>
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
				open={ticketTypesDialogOpen}
				onOpenChange={setTicketTypesDialogOpen}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Ticket Types</DialogTitle>
						<DialogDescription>Create, edit, and delete ticket types for this event.</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<form
							onSubmit={handleCreateTicketType}
							className="grid gap-3 md:grid-cols-[1fr_160px_auto] items-end">
							<div className="space-y-1">
								<Label htmlFor="new-ticket-type-name">Name</Label>
								<Input
									id="new-ticket-type-name"
									placeholder="VIP"
									value={newTicketTypeName}
									onChange={e => setNewTicketTypeName(e.target.value)}
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="new-ticket-type-price">Price</Label>
								<Input
									id="new-ticket-type-price"
									type="number"
									inputMode="decimal"
									min="0"
									step="0.01"
									placeholder="49.90"
									value={newTicketTypePrice}
									onChange={e => setNewTicketTypePrice(e.target.value)}
								/>
							</div>
							<Button
								type="submit"
								disabled={savingTicketType}>
								{savingTicketType ? 'Saving…' : 'Add Type'}
							</Button>
						</form>

						{ticketTypeError && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{ticketTypeError}</AlertDescription>
							</Alert>
						)}

						{ticketTypes.length === 0 ? (
							<p className="text-sm text-muted-foreground">No ticket types configured yet.</p>
						) : (
							<div className="space-y-2 max-h-72 overflow-y-auto pr-1">
								{ticketTypes.map(type => (
									<div
										key={type.id}
										className="rounded-lg border p-3 flex items-center justify-between gap-3">
										<div>
											<p className="font-medium">{type.name}</p>
											<p className="text-xs text-muted-foreground">${type.price.toFixed(2)}</p>
										</div>
										<div className="flex gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => startEditTicketType(type)}>
												Edit
											</Button>
											<Button
												variant="destructive"
												size="sm"
												onClick={() => handleDeleteTicketType(type.id)}>
												Delete
											</Button>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!cancelTargetTicketId}
				onOpenChange={open => {
					if (!open && !cancelingTicket) setCancelTargetTicketId(null);
				}}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Cancel ticket?</DialogTitle>
						<DialogDescription>
							{cancelTargetTicket
								? `This will mark ${cancelTargetTicket.name}'s ticket as cancelled.`
								: 'This will mark this ticket as cancelled.'}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							disabled={cancelingTicket}
							onClick={() => setCancelTargetTicketId(null)}>
							Keep Active
						</Button>
						<Button
							variant="destructive"
							disabled={cancelingTicket}
							onClick={handleCancelConfirmed}>
							{cancelingTicket ? 'Cancelling…' : 'Cancel Ticket'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!editingTicketTypeId}
				onOpenChange={open => {
					if (!open && !updatingTicketType) {
						setEditingTicketTypeId(null);
						setEditingTicketTypeName('');
						setEditingTicketTypePrice('');
					}
				}}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Edit Ticket Type</DialogTitle>
						<DialogDescription>Update ticket type name and price.</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="space-y-1">
							<Label htmlFor="edit-ticket-type-name">Name</Label>
							<Input
								id="edit-ticket-type-name"
								value={editingTicketTypeName}
								onChange={e => setEditingTicketTypeName(e.target.value)}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="edit-ticket-type-price">Price</Label>
							<Input
								id="edit-ticket-type-price"
								type="number"
								inputMode="decimal"
								min="0"
								step="0.01"
								value={editingTicketTypePrice}
								onChange={e => setEditingTicketTypePrice(e.target.value)}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							disabled={updatingTicketType}
							onClick={() => setEditingTicketTypeId(null)}>
							Cancel
						</Button>
						<Button
							disabled={updatingTicketType}
							onClick={handleSaveEditedTicketType}>
							{updatingTicketType ? 'Saving…' : 'Save'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!editingTicket}
				onOpenChange={open => {
					if (!open && !updatingTicket) {
						setEditingTicket(null);
					}
				}}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Change Ticket Type</DialogTitle>
						<DialogDescription>{editingTicket ? `${editingTicket.name} (${editingTicket.id})` : ''}</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label>Ticket Type</Label>
						<Select
							value={editingTicketTypeSelection}
							onValueChange={setEditingTicketTypeSelection}>
							<SelectTrigger>
								<SelectValue placeholder="Select ticket type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">No type</SelectItem>
								{ticketTypes.map(type => (
									<SelectItem
										key={type.id}
										value={type.id}>
										{type.name} (${type.price.toFixed(2)})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							disabled={updatingTicket}
							onClick={() => setEditingTicket(null)}>
							Cancel
						</Button>
						<Button
							disabled={updatingTicket}
							onClick={handleSaveTicketTypeForTicket}>
							{updatingTicket ? 'Saving…' : 'Save'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!errorDialogMessage}
				onOpenChange={open => {
					if (!open) setErrorDialogMessage(null);
				}}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Action failed</DialogTitle>
						<DialogDescription>{errorDialogMessage}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setErrorDialogMessage(null)}>OK</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

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
