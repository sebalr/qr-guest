import { useState, useEffect, useRef, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { archiveAdminEventApi, createEventApi, deleteAdminEventApi, getEventsApi, Event, unarchiveAdminEventApi } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Calendar, AlertCircle } from 'lucide-react';

import { PageHeading, WorkspaceState, FormSection } from '../components/WorkspaceLayout';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Search, CalendarDays, ArrowUpRight, ArrowRight, MoreHorizontal, Archive, Trash2 } from 'lucide-react';

type EventActionType = 'archive' | 'unarchive' | 'delete';

interface PendingEventAction {
	eventId: string;
	action: EventActionType;
}

export default function EventsPage() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const navigate = useNavigate();
	const createButton = useRef<HTMLButtonElement>(null);
	const canManageEvents = user?.isSuperAdmin || user?.role === 'owner' || user?.role === 'admin';
	const [search, setSearch] = useState('');
	const [loadError, setLoadError] = useState(false);
	const [reload, setReload] = useState(0);
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
		let cancelled = false;
		setLoading(true);
		setLoadError(false);
		getEventsApi(showArchivedEvents)
			.then(r => {
				if (!cancelled) setEvents(r.data.data);
			})
			.catch(() => {
				if (!cancelled) setLoadError(true);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [showArchivedEvents, reload]);

	async function refreshEvents(includeArchived = showArchivedEvents) {
		const response = await getEventsApi(includeArchived);
		setEvents(response.data.data);
	}

	async function handleCreate(e: FormEvent) {
		e.preventDefault();
		setFormError('');
		if (!name.trim()) {
			setFormError(t('superAdmin.page.errors.eventNameRequired'));
			return;
		}
		if (startsAt && endsAt && endsAt <= startsAt) {
			setFormError(t('workspace.invalidDates'));
			return;
		}
		setCreating(true);
		try {
			const res = await createEventApi({
				name: name.trim(),
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
			navigate(`/events/${res.data.data.id}`);
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
		setFormError('');
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

	const visibleEvents = events.filter(
		ev => Boolean(ev.archivedAt) === showArchivedEvents && ev.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
	);
	return (
		<div>
			<PageHeading
				title={t('eventsPage.title')}
				description={t(canManageEvents ? 'eventsPage.subtitle.manage' : 'eventsPage.subtitle.browse')}>
				{canManageEvents && (
					<Button
						ref={createButton}
						onClick={() => {
							setFormError('');
							setShowForm(true);
						}}>
						<Plus size={17} />
						{t('eventsPage.actions.newEvent')}
					</Button>
				)}
			</PageHeading>
			<main>
				<div className="ws-toolbar">
					<div className="ws-search">
						<Search size={17} />
						<Input
							aria-label={t('workspace.searchEvents')}
							placeholder={t('workspace.searchEvents')}
							value={search}
							onChange={e => setSearch(e.target.value)}
						/>
					</div>
					{canManageEvents && (
						<div className="ws-segments" aria-label={t('workspace.eventStatus')}>
							<button aria-pressed={!showArchivedEvents} onClick={() => setShowArchivedEvents(false)}>
								{t('workspace.active')}
							</button>
							<button aria-pressed={showArchivedEvents} onClick={() => setShowArchivedEvents(true)}>
								{t('workspace.archived')}
							</button>
						</div>
					)}
				</div>
				{loading ? (
					<WorkspaceState loading title={t('eventsPage.loading')} />
				) : loadError ? (
					<WorkspaceState
						title={t('workspace.loadFailed')}
						description={t('workspace.tryAgain')}
						action={
							<Button variant="outline" onClick={() => setReload(n => n + 1)}>
								{t('workspace.retry')}
							</Button>
						}
					/>
				) : visibleEvents.length === 0 ? (
					<WorkspaceState
						title={t(search ? 'workspace.noMatches' : showArchivedEvents ? 'workspace.noArchived' : 'eventsPage.empty')}
						description={t(search ? 'workspace.adjustSearch' : 'workspace.firstEvent')}
						action={
							canManageEvents && !search && !showArchivedEvents ? (
								<Button onClick={() => setShowForm(true)}>
									<Plus size={17} />
									{t('eventsPage.actions.newEvent')}
								</Button>
							) : undefined
						}
					/>
				) : (
					<div className="ws-event-grid">
						{visibleEvents.map(ev => (
							<article className="ws-event-card" key={ev.id}>
								<div className="ws-event-art">
									<CalendarDays aria-hidden="true" />
									{ev.imageUrl && (
										<img
											src={ev.imageUrl}
											alt=""
											onError={e => {
												e.currentTarget.hidden = true;
											}}
										/>
									)}
									<span className="ws-status">{t(ev.archivedAt ? 'workspace.archived' : 'workspace.active')}</span>
								</div>
								<div className="ws-event-card-body">
									<h2>{ev.archivedAt ? ev.name : <Link to={`/events/${ev.id}`}>{ev.name}</Link>}</h2>
									<p className="ws-event-description">{ev.description || t('workspace.eventReady')}</p>
									<p className="ws-event-date">
										<Calendar size={15} />
										{formatDateRange(ev) || t('workspace.noSchedule')}
									</p>
									<div className="ws-event-card-footer">
										{!ev.archivedAt ? (
											<Button variant="ghost" asChild>
												<Link to={`/events/${ev.id}${canManageEvents ? '' : '/scan'}`}>
													{t(canManageEvents ? 'workspace.manageEvent' : 'eventsPage.actions.scan')}
													<ArrowUpRight size={16} />
												</Link>
											</Button>
										) : (
											<span className="text-xs text-muted-foreground">{t('workspace.archived')}</span>
										)}
										{canManageEvents && (
											<Popover>
												<PopoverTrigger asChild>
													<Button size="icon" variant="ghost" aria-label={t('workspace.eventActions', { name: ev.name })}>
														<MoreHorizontal size={20} />
													</Button>
												</PopoverTrigger>
												<PopoverContent align="end" className="w-48 p-2">
													<div className="ws-action-list">
														<Button
															variant="ghost"
															disabled={eventActionSaving[ev.id]}
															onClick={() => requestEventAction(ev.id, ev.archivedAt ? 'unarchive' : 'archive')}>
															<Archive size={16} />
															{t(ev.archivedAt ? 'superAdmin.events.actions.unarchive' : 'superAdmin.events.actions.archive')}
														</Button>
														<Button
															variant="ghost"
															className="text-destructive"
															disabled={eventActionSaving[ev.id]}
															onClick={() => requestEventAction(ev.id, 'delete')}>
															<Trash2 size={16} />
															{t('superAdmin.events.actions.delete')}
														</Button>
													</div>
												</PopoverContent>
											</Popover>
										)}
									</div>
								</div>
							</article>
						))}
					</div>
				)}
				<Dialog
					open={showForm && canManageEvents}
					onOpenChange={open => {
						if (!creating) setShowForm(open);
					}}>
					<DialogContent
						className="ws-create-dialog"
						onCloseAutoFocus={event => {
							event.preventDefault();
							createButton.current?.focus();
						}}>
						<DialogHeader>
							<DialogTitle className="text-2xl tracking-tight">{t('eventsPage.form.title')}</DialogTitle>
							<DialogDescription>{t('workspace.createHint')}</DialogDescription>
						</DialogHeader>
						<form onSubmit={handleCreate}>
							<FormSection title={t('workspace.details')}>
								<div>
									<Label htmlFor="event-name">{t('eventsPage.form.eventName')} *</Label>
									<Input
										id="event-name"
										required
										value={name}
										placeholder={t('eventsPage.form.eventNamePlaceholder')}
										onChange={e => setName(e.target.value)}
									/>
								</div>
								<div>
									<Label htmlFor="event-description">{t('eventsPage.form.description')}</Label>
									<Textarea
										id="event-description"
										rows={3}
										value={description}
										placeholder={t('eventsPage.form.descriptionPlaceholder')}
										onChange={e => setDescription(e.target.value)}
									/>
								</div>
							</FormSection>
							<FormSection title={t('workspace.schedule')}>
								<div className="grid sm:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="event-start">{t('eventsPage.form.startDateTime')}</Label>
										<DateTimePicker
											id="event-start"
											value={startsAt}
											onChange={setStartsAt}
											placeholder={t('eventsPage.form.startDateTimePlaceholder')}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="event-end">{t('eventsPage.form.endDateTime')}</Label>
										<DateTimePicker
											id="event-end"
											value={endsAt}
											onChange={setEndsAt}
											placeholder={t('eventsPage.form.endDateTimePlaceholder')}
										/>
									</div>
								</div>
							</FormSection>
							<details className="ws-details">
								<summary>{t('workspace.appearance')}</summary>
								<Label htmlFor="image-url">{t('eventsPage.form.imageUrl')}</Label>
								<Input
									className="mt-2"
									id="image-url"
									type="url"
									value={imageUrl}
									placeholder={t('eventsPage.form.imageUrlPlaceholder')}
									onChange={e => setImageUrl(e.target.value)}
								/>
							</details>
							{formError && (
								<Alert variant="destructive" className="my-4">
									<AlertCircle size={16} />
									<AlertDescription>{formError}</AlertDescription>
								</Alert>
							)}
							<div className="ws-form-actions mt-6">
								<Button type="button" variant="outline" disabled={creating} onClick={() => setShowForm(false)}>
									{t('common.cancel')}
								</Button>
								<Button type="submit" disabled={creating}>
									{creating ? t('eventsPage.form.creating') : t('eventsPage.form.create')}
									<ArrowRight size={16} />
								</Button>
							</div>
						</form>
					</DialogContent>
				</Dialog>
				<Dialog
					open={pendingEventAction !== null}
					onOpenChange={open => {
						if (!open && !eventActionSaving[pendingEventAction?.eventId ?? '']) setPendingEventAction(null);
					}}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{pendingActionCopy.title}</DialogTitle>
							<DialogDescription>{pendingActionCopy.description}</DialogDescription>
						</DialogHeader>
						{formError && (
							<Alert variant="destructive">
								<AlertDescription>{formError}</AlertDescription>
							</Alert>
						)}
						<DialogFooter>
							<Button
								variant="outline"
								disabled={!!eventActionSaving[pendingEventAction?.eventId ?? '']}
								onClick={() => setPendingEventAction(null)}>
								{t('common.cancel')}
							</Button>
							<Button
								variant={pendingEventAction?.action === 'delete' ? 'destructive' : 'default'}
								onClick={confirmPendingEventAction}
								disabled={!!eventActionSaving[pendingEventAction?.eventId ?? '']}>
								{eventActionSaving[pendingEventAction?.eventId ?? '']
									? t('superAdmin.events.actions.saving')
									: pendingActionCopy.confirmLabel}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</main>
		</div>
	);
}
