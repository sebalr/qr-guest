import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEventApi, getTicketsApi, addTicketsApi, cancelTicketApi, getTicketQRApi, Event, Ticket } from '../api';
import { db } from '../db';
import QRCodeDisplay from '../components/QRCodeDisplay';

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

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<p className="text-gray-500">Loading…</p>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-50">
			<header className="bg-blue-700 text-white px-6 py-4 flex items-center gap-4 shadow">
				<button
					onClick={() => navigate('/events')}
					className="text-white opacity-80 hover:opacity-100">
					← Back
				</button>
				<h1 className="text-xl font-bold flex-1">{event?.name ?? 'Event'}</h1>
				<button
					onClick={() => navigate(`/events/${id}/scan`)}
					className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg font-medium text-sm">
					📷 Scanner
				</button>
			</header>

			<main className="max-w-3xl mx-auto px-4 py-6">
				{event && (
					<div className="bg-white rounded-xl shadow p-5 mb-6">
						<p className="text-sm text-gray-500">
							{new Date(event.startsAt).toLocaleString()} – {new Date(event.endsAt).toLocaleString()}
						</p>
						<div className="flex gap-6 mt-3">
							<div className="text-center">
								<p className="text-2xl font-bold text-blue-700">{tickets.length}</p>
								<p className="text-xs text-gray-500">Total Tickets</p>
							</div>
							<div className="text-center">
								<p className="text-2xl font-bold text-green-600">{totalScanned}</p>
								<p className="text-xs text-gray-500">Scanned</p>
							</div>
							<div className="text-center">
								<p className="text-2xl font-bold text-red-500">{tickets.filter(t => t.status === 'cancelled').length}</p>
								<p className="text-xs text-gray-500">Cancelled</p>
							</div>
						</div>
					</div>
				)}

				<div className="flex justify-between items-center mb-4">
					<h2 className="text-lg font-semibold text-gray-800">Tickets</h2>
					<button
						onClick={() => setShowBulk(v => !v)}
						className="bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-800">
						{showBulk ? 'Cancel' : '+ Add Tickets'}
					</button>
				</div>

				{showBulk && (
					<form
						onSubmit={handleAddTickets}
						className="bg-white rounded-xl shadow p-5 mb-5 space-y-3">
						<label className="block text-sm font-medium text-gray-700">Guest names (one per line)</label>
						<textarea
							rows={5}
							value={bulkNames}
							onChange={e => setBulkNames(e.target.value)}
							className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="Alice Smith&#10;Bob Jones&#10;Carol White"
						/>
						{bulkError && <p className="text-red-600 text-sm">{bulkError}</p>}
						<button
							type="submit"
							disabled={adding}
							className="bg-blue-700 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-60">
							{adding ? 'Adding…' : 'Add Tickets'}
						</button>
					</form>
				)}

				<ul className="space-y-3">
					{tickets.map(ticket => (
						<li
							key={ticket.id}
							className="bg-white rounded-xl shadow p-4">
							<div className="flex justify-between items-start">
								<div>
									<p className="font-medium text-gray-800">{ticket.name}</p>
									<p className="text-xs text-gray-400 mt-0.5 font-mono">{ticket.id}</p>
									<span
										className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${
											ticket.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
										}`}>
										{ticket.status}
									</span>
									{scanCounts[ticket.id] ? (
										<span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
											Scanned {scanCounts[ticket.id]}×
										</span>
									) : null}
								</div>
								<div className="flex gap-2 ml-4">
									<button
										onClick={() => handleShowQR(ticket.id)}
										className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded">
										{qrMap[ticket.id] ? 'Hide QR' : 'QR'}
									</button>
									{ticket.status === 'active' && (
										<button
											onClick={() => handleCancel(ticket.id)}
											className="text-xs bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1 rounded">
											Cancel
										</button>
									)}
								</div>
							</div>
							{qrMap[ticket.id] && (
								<div className="mt-3 flex justify-center">
									<QRCodeDisplay value={qrMap[ticket.id]} />
								</div>
							)}
						</li>
					))}
					{tickets.length === 0 && <p className="text-gray-400 text-center py-8">No tickets yet.</p>}
				</ul>
			</main>
		</div>
	);
}
