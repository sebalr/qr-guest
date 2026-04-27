import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
	createEventTemporaryScannerApi,
	createEventTicketTypeApi,
	deleteEventTicketTypeApi,
	getEventApi,
	getEventTemporaryScannersApi,
	getEventTicketTypesApi,
	sendEventTemporaryScannerEmailApi,
	TemporaryScanner,
	TicketType,
	updateEventTemporaryScannerApi,
	updateEventTicketTypeApi,
} from '../api';
import { useAuth } from '../auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, AlertCircle, Share2 } from 'lucide-react';
import QRCodeDisplay from '../components/QRCodeDisplay';

type SettingsTab = 'ticket-types' | 'temporal-scanners';

export default function EventSettingsPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { user } = useAuth();
	const tenantId = (searchParams.get('tenantId') ?? '').trim() || undefined;
	const tenantScope = useMemo(() => ({ ...(tenantId ? { tenantId } : {}) }), [tenantId]);

	const [eventName, setEventName] = useState('Event');
	const [loading, setLoading] = useState(true);
	const [activeTab, setActiveTab] = useState<SettingsTab>('ticket-types');

	const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
	const [newTicketTypeName, setNewTicketTypeName] = useState('');
	const [newTicketTypePrice, setNewTicketTypePrice] = useState('');
	const [ticketTypeError, setTicketTypeError] = useState('');
	const [savingTicketType, setSavingTicketType] = useState(false);
	const [editingTicketTypeId, setEditingTicketTypeId] = useState<string | null>(null);
	const [editingTicketTypeName, setEditingTicketTypeName] = useState('');
	const [editingTicketTypePrice, setEditingTicketTypePrice] = useState('');
	const [updatingTicketType, setUpdatingTicketType] = useState(false);

	const [temporalScanners, setTemporalScanners] = useState<TemporaryScanner[]>([]);
	const [newScannerName, setNewScannerName] = useState('');
	const [scannerError, setScannerError] = useState('');
	const [creatingScanner, setCreatingScanner] = useState(false);
	const [updatingScannerId, setUpdatingScannerId] = useState<string | null>(null);
	const [qrShareLink, setQrShareLink] = useState<string | null>(null);
	const [qrShareName, setQrShareName] = useState('');
	const [feedbackToast, setFeedbackToast] = useState<{ text: string; visible: boolean; tone: 'success' | 'error' }>({
		text: '',
		visible: false,
		tone: 'success',
	});
	const [emailDialogOpen, setEmailDialogOpen] = useState(false);
	const [emailDialogScanner, setEmailDialogScanner] = useState<TemporaryScanner | null>(null);
	const [emailRecipient, setEmailRecipient] = useState('');
	const [sendingScannerEmail, setSendingScannerEmail] = useState(false);

	useEffect(() => {
		if (!id) return;
		setLoading(true);

		Promise.all([getEventApi(id, tenantScope), getEventTicketTypesApi(id, tenantScope), getEventTemporaryScannersApi(id, tenantScope)])
			.then(([eventRes, ticketTypeRes, temporalRes]) => {
				setEventName(eventRes.data.data.name);
				setTicketTypes(ticketTypeRes.data.data);
				setTemporalScanners(temporalRes.data.data);
			})
			.catch(() => {
				setTicketTypeError('Failed to load settings data.');
			})
			.finally(() => setLoading(false));
	}, [id, tenantScope]);

	function scannerLoginLink(loginToken: string): string {
		return `${window.location.origin}/temporal-scanner-login?token=${encodeURIComponent(loginToken)}`;
	}

	function showToast(text: string, tone: 'success' | 'error' = 'success') {
		setFeedbackToast({ text, visible: true, tone });
		window.setTimeout(() => {
			setFeedbackToast(current => (current.visible ? { ...current, visible: false } : current));
		}, 1800);
	}

	async function copyScannerLink(loginToken: string) {
		try {
			await navigator.clipboard.writeText(scannerLoginLink(loginToken));
			showToast('Link copied successfully', 'success');
		} catch {
			setScannerError('Unable to copy link to clipboard.');
			showToast('Unable to copy link to clipboard', 'error');
		}
	}

	function openSendEmailDialog(scanner: TemporaryScanner) {
		setEmailDialogScanner(scanner);
		setEmailRecipient('');
		setScannerError('');
		setEmailDialogOpen(true);
	}

	async function handleSendScannerEmail(e: FormEvent) {
		e.preventDefault();
		if (!id || !emailDialogScanner) return;

		const email = emailRecipient.trim().toLowerCase();
		if (!email) {
			setScannerError('Email is required.');
			return;
		}

		setSendingScannerEmail(true);
		setScannerError('');
		try {
			await sendEventTemporaryScannerEmailApi(id, emailDialogScanner.id, { email }, tenantScope);
			setEmailDialogOpen(false);
			setEmailDialogScanner(null);
			setEmailRecipient('');
			showToast('Email sent successfully', 'success');
		} catch {
			setScannerError('Failed to send email.');
			showToast('Failed to send email', 'error');
		} finally {
			setSendingScannerEmail(false);
		}
	}

	function sendScannerEmail(scanner: TemporaryScanner) {
		const link = scannerLoginLink(scanner.loginToken);
		const subject = encodeURIComponent(`Scanner access for ${eventName}`);
		const body = encodeURIComponent(`Hi ${scanner.name},\n\nUse this link to access the scanner for ${eventName}:\n${link}`);
		window.location.href = `mailto:?subject=${subject}&body=${body}`;
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
			const res = await createEventTicketTypeApi(id, { name, price }, tenantScope);
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
			const res = await updateEventTicketTypeApi(editingTicketTypeId, { name, price }, tenantScope);
			setTicketTypes(prev => prev.map(t => (t.id === editingTicketTypeId ? res.data.data : t)));
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
			await deleteEventTicketTypeApi(ticketTypeId, tenantScope);
			setTicketTypes(prev => prev.filter(t => t.id !== ticketTypeId));
		} catch {
			setTicketTypeError('Failed to delete ticket type.');
		}
	}

	async function handleCreateTemporalScanner(e: FormEvent) {
		e.preventDefault();
		if (!id) return;
		setScannerError('');
		const name = newScannerName.trim();
		if (!name) {
			setScannerError('Name is required.');
			return;
		}

		setCreatingScanner(true);
		try {
			const res = await createEventTemporaryScannerApi(id, { name }, tenantScope);
			setTemporalScanners(prev => [res.data.data, ...prev]);
			setNewScannerName('');
		} catch {
			setScannerError('Failed to create temporary scanner.');
		} finally {
			setCreatingScanner(false);
		}
	}

	async function toggleScannerActive(scanner: TemporaryScanner, isActive: boolean) {
		if (!id) return;
		setUpdatingScannerId(scanner.id);
		setScannerError('');
		try {
			const res = await updateEventTemporaryScannerApi(id, scanner.id, { isActive }, tenantScope);
			setTemporalScanners(prev => prev.map(entry => (entry.id === scanner.id ? res.data.data : entry)));
		} catch {
			setScannerError('Failed to update temporary scanner access.');
		} finally {
			setUpdatingScannerId(null);
		}
	}

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-slate-50">
				<p className="text-muted-foreground">Loading settings...</p>
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
						onClick={() => navigate(`/events/${id}${tenantId && user?.isSuperAdmin ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`)}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div className="min-w-0">
						<h1 className="font-bold text-lg truncate">Event Settings</h1>
						<p className="text-xs text-muted-foreground truncate">{eventName}</p>
					</div>
				</div>
			</header>

			<main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
				{feedbackToast.visible && (
					<div
						className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-md px-3 py-2 text-sm font-medium text-white shadow-lg ${
							feedbackToast.tone === 'success' ? 'bg-emerald-600' : 'bg-red-600'
						}`}>
						{feedbackToast.text}
					</div>
				)}

				<div className="inline-flex rounded-lg border bg-background p-1">
					<Button
						type="button"
						variant={activeTab === 'ticket-types' ? 'default' : 'ghost'}
						size="sm"
						onClick={() => setActiveTab('ticket-types')}>
						Ticket Types
					</Button>
					<Button
						type="button"
						variant={activeTab === 'temporal-scanners' ? 'default' : 'ghost'}
						size="sm"
						onClick={() => setActiveTab('temporal-scanners')}>
						Temporal Scanners
					</Button>
				</div>

				{activeTab === 'ticket-types' && (
					<Card>
						<CardHeader>
							<CardTitle>Ticket Types</CardTitle>
							<CardDescription>Create, edit, and delete ticket types for this event.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
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
									{savingTicketType ? 'Saving...' : 'Add Type'}
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
								<div className="space-y-2">
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
						</CardContent>
					</Card>
				)}

				{activeTab === 'temporal-scanners' && (
					<div className="space-y-4">
						<Alert>
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>
								Users created here have scanner-only access for this event only. They cannot manage users, settings, or other events.
							</AlertDescription>
						</Alert>

						<Card>
							<CardHeader>
								<CardTitle>Temporal Scanners</CardTitle>
								<CardDescription>Create and manage temporary scanner links for this event.</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<form
									onSubmit={handleCreateTemporalScanner}
									className="flex gap-2">
									<Input
										value={newScannerName}
										onChange={e => setNewScannerName(e.target.value)}
										placeholder="Scanner name"
									/>
									<Button
										type="submit"
										disabled={creatingScanner}>
										{creatingScanner ? 'Creating...' : 'Create'}
									</Button>
								</form>

								{scannerError && (
									<Alert variant="destructive">
										<AlertDescription>{scannerError}</AlertDescription>
									</Alert>
								)}

								<div className="space-y-2">
									{temporalScanners.length === 0 ? (
										<p className="text-sm text-muted-foreground">No temporal scanners created yet.</p>
									) : (
										temporalScanners.map(scanner => (
											<div
												key={scanner.id}
												className="rounded-lg border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
												<div>
													<p className="font-medium">{scanner.name}</p>
													<p className="text-xs text-muted-foreground">Created {new Date(scanner.createdAt).toLocaleString()}</p>
													<p className="text-xs text-muted-foreground">
														Last used {scanner.lastUsedAt ? new Date(scanner.lastUsedAt).toLocaleString() : 'Never'}
													</p>
												</div>
												<div className="flex flex-wrap items-center gap-2">
													<Button
														variant={scanner.isActive ? 'destructive' : 'default'}
														size="sm"
														disabled={updatingScannerId === scanner.id}
														onClick={() => toggleScannerActive(scanner, !scanner.isActive)}>
														{updatingScannerId === scanner.id ? 'Saving...' : scanner.isActive ? 'Disable Access' : 'Enable Access'}
													</Button>
													<Popover>
														<PopoverTrigger asChild>
															<Button
																variant="outline"
																size="sm"
																className="gap-1.5">
																<Share2 className="h-3.5 w-3.5" />
																Share
															</Button>
														</PopoverTrigger>
														<PopoverContent className="w-44 p-2">
															<div className="space-y-1">
																<Button
																	variant="ghost"
																	size="sm"
																	className="w-full justify-start"
																	onClick={() => copyScannerLink(scanner.loginToken)}>
																	Copy Link
																</Button>
																<Button
																	variant="ghost"
																	size="sm"
																	className="w-full justify-start"
																	onClick={() => {
																		setQrShareName(scanner.name);
																		setQrShareLink(scannerLoginLink(scanner.loginToken));
																	}}>
																	Show QR
																</Button>
																<Button
																	variant="ghost"
																	size="sm"
																	className="w-full justify-start"
																	onClick={() => openSendEmailDialog(scanner)}>
																	Send Email
																</Button>
															</div>
														</PopoverContent>
													</Popover>
												</div>
											</div>
										))
									)}
								</div>
							</CardContent>
						</Card>
					</div>
				)}
			</main>

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
							{updatingTicketType ? 'Saving...' : 'Save'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!qrShareLink}
				onOpenChange={open => {
					if (!open) {
						setQrShareLink(null);
						setQrShareName('');
					}
				}}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Scanner QR</DialogTitle>
						<DialogDescription>{qrShareName ? `Share this QR with ${qrShareName}.` : 'Share this scanner access QR.'}</DialogDescription>
					</DialogHeader>
					<div className="flex justify-center">{qrShareLink ? <QRCodeDisplay value={qrShareLink} /> : null}</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								if (qrShareLink) {
									void navigator.clipboard.writeText(qrShareLink).then(() => {
										showToast('Link copied successfully', 'success');
									});
								}
							}}>
							Copy Link
						</Button>
						<Button onClick={() => setQrShareLink(null)}>Close</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={emailDialogOpen}
				onOpenChange={open => {
					if (!sendingScannerEmail) {
						setEmailDialogOpen(open);
						if (!open) {
							setEmailDialogScanner(null);
							setEmailRecipient('');
						}
					}
				}}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Send Scanner Access Email</DialogTitle>
						<DialogDescription>
							{emailDialogScanner
								? `Send login access for ${emailDialogScanner.name} using your Resend setup.`
								: 'Send scanner access email.'}
						</DialogDescription>
					</DialogHeader>
					<form
						onSubmit={handleSendScannerEmail}
						className="space-y-3">
						<div className="space-y-1">
							<Label htmlFor="scanner-email-recipient">Recipient Email</Label>
							<Input
								id="scanner-email-recipient"
								type="email"
								placeholder="scanner@example.com"
								value={emailRecipient}
								onChange={e => setEmailRecipient(e.target.value)}
								required
							/>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								disabled={sendingScannerEmail}
								onClick={() => setEmailDialogOpen(false)}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={sendingScannerEmail}>
								{sendingScannerEmail ? 'Sending...' : 'Send Email'}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
