import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { archiveAdminEventApi, createEventApi, deleteAdminEventApi, getEventsApi, Event, unarchiveAdminEventApi } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QrCode, Plus, X, Calendar, ChevronRight, AlertCircle, LogOut, Shield, Image } from 'lucide-react';

type EventActionType = 'archive' | 'unarchive' | 'delete';

interface PendingEventAction {
	eventId: string;
	action: EventActionType;
}

export default function EventsPage() {
	const { t } = useTranslation();
	const { logout, user } = useAuth();
	const navigate = useNavigate();
	const canManageEvents = user?.isSuperAdmin || user?.role === 'owner' || user?.role === 'admin';
	const [events, setEvents] = useState<Event[]>([]);
	const [loading, setLoading] = useState(true);
	const [showArchivedEvents, setShowArchivedEvents] = useState(false);
	const [showForm, setShowForm] = useState(false);
	const [name, setName] = useState('');
	const [startsAt, setStartsAt] = useState<Date | undefined>(undefined);
	const [endsAt, setEndsAt] = useState<Date | undefined>(undefined);
	const [description, setDescription] = useState('');
	const [imageUrl, setImageUrl] = useState('');
	const [formError, setFormError] = useState('');
	const [creating, setCreating] = useState(false);
	const [pendingEventAction, setPendingEventAction] = useState<PendingEventAction | null>(null);
	const [eventActionSaving, setEventActionSaving] = useState<Record<string, boolean>>({});

	useEffect(() => {
		getEventsApi(showArchivedEvents)
			.then(r => setEvents(r.data.data))
			.catch(() => setEvents([]))
			.finally(() => setLoading(false));
	}, [showArchivedEvents]);

	async function refreshEvents(includeArchived = showArchivedEvents) {
		const response = await getEventsApi(includeArchived);
		setEvents(response.data.data);
	}

	async function handleCreate(e: FormEvent) {
		e.preventDefault();
		setFormError('');
		setCreating(true);
		try {
			const res = await createEventApi({
				name,
				startsAt: startsAt?.toISOString(),
				endsAt: endsAt?.toISOString(),
				description: description || undefined,
				imageUrl: imageUrl || undefined,
			});
			setEvents(prev => [res.data.data, ...prev]);
			setShowForm(false);
			setName('');
			setStartsAt(undefined);
			setEndsAt(undefined);
			setDescription('');
			setImageUrl('');
			await refreshEvents();
		} catch (error: unknown) {
			const errorMsg =
				(error as { response?: { data?: { error?: string } } })?.response?.data?.error || t('eventsPage.errors.createFailed');
			setFormError(errorMsg);
		} finally {
			setCreating(false);
		}
	}

	function formatDateRange(ev: Event) {
		if (!ev.startsAt && !ev.endsAt) return null;
		if (ev.startsAt && ev.endsAt) {
			return `${new Date(ev.startsAt).toLocaleString()} – ${new Date(ev.endsAt).toLocaleString()}`;
		}
		if (ev.startsAt) return t('eventsPage.dateRange.from', { value: new Date(ev.startsAt).toLocaleString() });
		if (ev.endsAt) return t('eventsPage.dateRange.until', { value: new Date(ev.endsAt).toLocaleString() });
		return null;
	}

	function requestEventAction(eventId: string, action: EventActionType) {
		setPendingEventAction({ eventId, action });
	}

	async function confirmPendingEventAction() {
		if (!pendingEventAction) return;

		const { eventId, action } = pendingEventAction;
		setEventActionSaving(prev => ({ ...prev, [eventId]: true }));
		setFormError('');
		try {
			if (action === 'archive') {
				await archiveAdminEventApi(eventId);
			} else if (action === 'unarchive') {
				await unarchiveAdminEventApi(eventId);
			} else {
				await deleteAdminEventApi(eventId);
			}

			setPendingEventAction(null);
			await refreshEvents();
		} catch {
			if (action === 'archive') {
				setFormError(t('superAdmin.events.errors.archiveFailed'));
			} else if (action === 'unarchive') {
				setFormError(t('superAdmin.events.errors.unarchiveFailed'));
			} else {
				setFormError(t('superAdmin.events.errors.deleteFailed'));
			}
		} finally {
			setEventActionSaving(prev => ({ ...prev, [eventId]: false }));
		}
	}

	function getPendingActionCopy(action: EventActionType | undefined) {
		if (action === 'archive') {
			return {
				title: t('superAdmin.events.dialog.archiveTitle'),
				description: t('superAdmin.events.dialog.archiveDescription'),
				confirmLabel: t('superAdmin.events.actions.archive'),
			};
		}

		if (action === 'unarchive') {
			return {
				title: t('superAdmin.events.dialog.unarchiveTitle'),
				description: t('superAdmin.events.dialog.unarchiveDescription'),
				confirmLabel: t('superAdmin.events.actions.unarchive'),
			};
		}

		return {
			title: t('superAdmin.events.dialog.deleteTitle'),
			description: t('superAdmin.events.dialog.deleteDescription'),
			confirmLabel: t('superAdmin.events.actions.delete'),
		};
	}

	const pendingActionCopy = getPendingActionCopy(pendingEventAction?.action);

	return (
		<div className="min-h-screen bg-slate-50">
			<header className="bg-background border-b sticky top-0 z-10">
				<div className="max-w-3xl mx-auto px-4 py-3 flex justify-between items-center">
					<div className="flex items-center gap-2">
						<div className="bg-primary rounded-lg p-1.5">
							<QrCode className="h-5 w-5 text-primary-foreground" />
						</div>
						<span className="font-bold text-lg tracking-tight">Tiqra</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
						{(user?.isSuperAdmin || user?.role === 'owner' || user?.role === 'admin') && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => navigate('/super-admin')}
								className="gap-1.5">
								<Shield className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">{t('eventsPage.actions.users')}</span>
							</Button>
						)}
						<Button
							variant="ghost"
							size="sm"
							onClick={logout}
							className="gap-1.5">
							<LogOut className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">{t('eventsPage.actions.logout')}</span>
						</Button>
					</div>
				</div>
			</header>

			<main className="max-w-3xl mx-auto px-4 py-8">
				<div className="flex justify-between items-center mb-6">
					<div>
						<h1 className="text-2xl font-bold tracking-tight">{t('eventsPage.title')}</h1>
						<p className="text-muted-foreground text-sm">
							{canManageEvents ? t('eventsPage.subtitle.manage') : t('eventsPage.subtitle.browse')}
						</p>
					</div>
					{canManageEvents && (
						<div className="flex items-center gap-2">
							<Button
								variant={showArchivedEvents ? 'default' : 'outline'}
								onClick={() => setShowArchivedEvents(prev => !prev)}>
								{showArchivedEvents ? t('superAdmin.events.actions.hideArchived') : t('superAdmin.events.actions.showArchived')}
							</Button>
							<Button
								onClick={() => setShowForm(v => !v)}
								className="gap-2">
								{showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
								{showForm ? t('common.cancel') : t('eventsPage.actions.newEvent')}
							</Button>
						</div>
					)}
				</div>

				{canManageEvents && showForm && (
					<Card className="mb-6">
						<CardHeader>
							<CardTitle className="text-lg">{t('eventsPage.form.title')}</CardTitle>
						</CardHeader>
						<CardContent>
							<form
								onSubmit={handleCreate}
								className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="event-name">
										{t('eventsPage.form.eventName')} <span className="text-destructive">*</span>
									</Label>
									<Input
										id="event-name"
										type="text"
										placeholder={t('eventsPage.form.eventNamePlaceholder')}
										required
										value={name}
										onChange={e => setName(e.target.value)}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="event-description">{t('eventsPage.form.description')}</Label>
									<Textarea
										id="event-description"
										rows={3}
										placeholder={t('eventsPage.form.descriptionPlaceholder')}
										value={description}
										onChange={e => setDescription(e.target.value)}
									/>
								</div>
								<div className="grid gap-4">
									<div className="space-y-2">
										<Label>{t('eventsPage.form.startDateTime')}</Label>
										<DateTimePicker
											value={startsAt}
											onChange={setStartsAt}
											placeholder={t('eventsPage.form.startDateTimePlaceholder')}
										/>
									</div>
									<div className="space-y-2">
										<Label>{t('eventsPage.form.endDateTime')}</Label>
										<DateTimePicker
											value={endsAt}
											onChange={setEndsAt}
											placeholder={t('eventsPage.form.endDateTimePlaceholder')}
										/>
									</div>
								</div>
								<div className="space-y-2">
									<Label htmlFor="image-url">
										<Image className="inline h-3.5 w-3.5 mr-1" />
										{t('eventsPage.form.imageUrl')}
									</Label>
									<Input
										id="image-url"
										type="url"
										placeholder={t('eventsPage.form.imageUrlPlaceholder')}
										value={imageUrl}
										onChange={e => setImageUrl(e.target.value)}
									/>
								</div>
								{formError && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
										<AlertDescription>{formError}</AlertDescription>
									</Alert>
								)}
								<Button
									type="submit"
									disabled={creating}>
									{creating ? t('eventsPage.form.creating') : t('eventsPage.form.create')}
								</Button>
							</form>
						</CardContent>
					</Card>
				)}

				{loading ? (
					<div className="text-center py-16 text-muted-foreground">{t('eventsPage.loading')}</div>
				) : events.length === 0 ? (
					<Card className="py-16 text-center">
						<CardContent>
							<Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
							<p className="text-muted-foreground">{t('eventsPage.empty')}</p>
						</CardContent>
					</Card>
				) : (
					<div className="space-y-3">
						{events.map(ev => (
							<Card
								key={ev.id}
								className="cursor-pointer hover:shadow-md transition-shadow"
								onClick={() => {
									if (!ev.archivedAt) {
										navigate(`/events/${ev.id}`);
									}
								}}>
								<CardContent className="p-5 flex justify-between items-center gap-4">
									<div className="flex items-center gap-4 min-w-0">
										{ev.imageUrl && (
											<img
												src={ev.imageUrl}
												alt={ev.name}
												className="h-12 w-12 rounded-lg object-cover shrink-0"
												onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
											/>
										)}
										<div className="min-w-0">
											<p className="font-semibold truncate">{ev.name}</p>
											{ev.archivedAt ? (
												<p className="text-xs text-muted-foreground mt-0.5">{t('superAdmin.events.labels.archived')}</p>
											) : null}
											{ev.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{ev.description}</p>}
											{formatDateRange(ev) && <p className="text-sm text-muted-foreground mt-0.5">{formatDateRange(ev)}</p>}
										</div>
									</div>
									{canManageEvents ? (
										<div className="flex items-center gap-2 shrink-0">
											{ev.archivedAt ? (
												<Button
													size="sm"
													variant="secondary"
													disabled={eventActionSaving[ev.id]}
													onClick={e => {
														e.stopPropagation();
														requestEventAction(ev.id, 'unarchive');
													}}>
													{eventActionSaving[ev.id] ? t('superAdmin.events.actions.saving') : t('superAdmin.events.actions.unarchive')}
												</Button>
											) : (
												<Button
													size="sm"
													variant="secondary"
													disabled={eventActionSaving[ev.id]}
													onClick={e => {
														e.stopPropagation();
														requestEventAction(ev.id, 'archive');
													}}>
													{eventActionSaving[ev.id] ? t('superAdmin.events.actions.saving') : t('superAdmin.events.actions.archive')}
												</Button>
											)}
											<Button
												size="sm"
												variant="destructive"
												disabled={eventActionSaving[ev.id]}
												onClick={e => {
													e.stopPropagation();
													requestEventAction(ev.id, 'delete');
												}}>
												{eventActionSaving[ev.id] ? t('superAdmin.events.actions.saving') : t('superAdmin.events.actions.delete')}
											</Button>
											{!ev.archivedAt ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : null}
										</div>
									) : (
										<div className="flex gap-2 shrink-0">
											<Button
												size="sm"
												onClick={e => {
													e.stopPropagation();
													navigate(`/events/${ev.id}/scan`);
												}}>
												{t('eventsPage.actions.scan')}
											</Button>
										</div>
									)}
								</CardContent>
							</Card>
						))}
					</div>
				)}

				<Dialog
					open={pendingEventAction !== null}
					onOpenChange={open => {
						if (!open) {
							setPendingEventAction(null);
						}
					}}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{pendingActionCopy.title}</DialogTitle>
							<DialogDescription>{pendingActionCopy.description}</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setPendingEventAction(null)}>
								{t('common.cancel')}
							</Button>
							<Button
								variant={pendingEventAction?.action === 'delete' ? 'destructive' : 'default'}
								onClick={confirmPendingEventAction}
								disabled={pendingEventAction ? eventActionSaving[pendingEventAction.eventId] : false}>
								{pendingEventAction && eventActionSaving[pendingEventAction.eventId]
									? t('superAdmin.events.actions.saving')
									: pendingActionCopy.confirmLabel}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</main>

			<Separator className="hidden" />
		</div>
	);
}
