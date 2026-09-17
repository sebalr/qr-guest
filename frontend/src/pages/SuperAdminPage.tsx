import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import ContactRequests from '../components/ContactRequests';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import {
	AdminEvent,
	AdminTenant,
	AdminUser,
	adjustAdminEventCreditsApi,
	archiveAdminEventApi,
	createAdminUserApi,
	createAdminEventApi,
	createAdminGuestApi,
	deleteAdminEventApi,
	createTenantWithAdminApi,
	downgradeTenantApi,
	getAdminEventsApi,
	getAdminTenantsApi,
	getAdminUsersApi,
	ManageableUserRole,
	unarchiveAdminEventApi,
	updateUserRoleApi,
	upgradeTenantApi,
} from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoreHorizontal, Building2, Users, Calendar, Star, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { PageHeading, WorkspaceState } from '../components/WorkspaceLayout';

const ROLE_OPTIONS: ManageableUserRole[] = ['admin', 'scanner'];
type EventActionType = 'archive' | 'unarchive' | 'delete';

interface PendingEventAction {
	eventId: string;
	action: EventActionType;
}

export default function SuperAdminPage() {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { user } = useAuth();
	const [tenants, setTenants] = useState<AdminTenant[]>([]);
	const [searchParams, setSearchParams] = useSearchParams();
	const [reload, setReload] = useState(0);
	const [selectedTenantId, setSelectedTenantId] = useState(searchParams.get('tenantId') ?? '');
	const [events, setEvents] = useState<AdminEvent[]>([]);
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [loading, setLoading] = useState(true);
	const [tenantDataLoading, setTenantDataLoading] = useState(false);
	const [error, setError] = useState('');
	const [roleSaving, setRoleSaving] = useState<Record<string, boolean>>({});
	const [planSaving, setPlanSaving] = useState<Record<string, boolean>>({});
	const [createEmail, setCreateEmail] = useState('');
	const [createRole, setCreateRole] = useState<ManageableUserRole>('scanner');
	const [creatingUser, setCreatingUser] = useState(false);
	const [createTenantName, setCreateTenantName] = useState('');
	const [createTenantAdminEmail, setCreateTenantAdminEmail] = useState('');
	const [creatingTenant, setCreatingTenant] = useState(false);
	const [createEventName, setCreateEventName] = useState('');
	const [createEventDescription, setCreateEventDescription] = useState('');
	const [creatingEvent, setCreatingEvent] = useState(false);
	const [createGuestName, setCreateGuestName] = useState('');
	const [selectedEventId, setSelectedEventId] = useState('');
	const [creatingGuest, setCreatingGuest] = useState(false);
	const [creditQuantity, setCreditQuantity] = useState('');
	const [adjustingCredits, setAdjustingCredits] = useState<'add' | 'remove' | null>(null);
	const [showArchivedEvents, setShowArchivedEvents] = useState(false);
	const [eventActionSaving, setEventActionSaving] = useState<Record<string, boolean>>({});
	const [pendingEventAction, setPendingEventAction] = useState<PendingEventAction | null>(null);
	const isSuperAdmin = user?.isSuperAdmin === true;
	const requestedSection = searchParams.get('section') ?? 'overview';
	const section = isSuperAdmin
		? ['overview', 'organizations', 'users', 'events', 'requests'].includes(requestedSection)
			? requestedSection
			: 'overview'
		: 'users';
	const canManageUsers = user?.role === 'owner' || user?.role === 'admin' || isSuperAdmin;
	const selectedTenant = useMemo(() => tenants.find(t => t.id === selectedTenantId) ?? null, [tenants, selectedTenantId]);
	const activeEvents = useMemo(() => events.filter(event => !event.archivedAt), [events]);

	const summary = useMemo(() => {
		const proTenants = tenants.filter(t => t.plan === 'personal').length;
		return {
			tenants: tenants.length,
			users: users.length,
			events: events.length,
			proTenants,
		};
	}, [tenants, users, events]);

	useEffect(() => {
		if (!canManageUsers) {
			navigate('/events', { replace: true });
			return;
		}

		if (isSuperAdmin) {
			let cancelled = false;
			setLoading(true);
			setError('');
			getAdminTenantsApi()
				.then(tenantRes => {
					if (cancelled) return;
					const loadedTenants = tenantRes.data.data;
					setTenants(loadedTenants);
					setSelectedTenantId(prev => (loadedTenants.some(tenant => tenant.id === prev) ? prev : loadedTenants[0]?.id || ''));
				})
				.catch(() => {
					if (!cancelled) setError(t('superAdmin.page.errors.loadSuperAdminDataFailed'));
				})
				.finally(() => {
					if (!cancelled) setLoading(false);
				});
			return () => {
				cancelled = true;
			};
		}

		setLoading(true);
		setError('');
		getAdminUsersApi()
			.then(userRes => {
				setUsers(userRes.data.data);
				setEvents([]);
			})
			.catch(() => setError(t('superAdmin.page.errors.loadSuperAdminDataFailed')))
			.finally(() => setLoading(false));
	}, [canManageUsers, isSuperAdmin, navigate, t, reload]);

	useEffect(() => {
		if (!isSuperAdmin || !selectedTenantId) return;
		let cancelled = false;

		setTenantDataLoading(true);
		setError('');
		Promise.all([getAdminUsersApi(selectedTenantId), getAdminEventsApi(selectedTenantId, showArchivedEvents)])
			.then(([userRes, eventRes]) => {
				if (cancelled) return;
				setUsers(userRes.data.data);
				setEvents(eventRes.data.data);
				setSelectedEventId(current =>
					eventRes.data.data.some(event => event.id === current && !event.archivedAt)
						? current
						: (eventRes.data.data.find(event => !event.archivedAt)?.id ?? ''),
				);
			})
			.catch(() => {
				if (!cancelled) setError(t('superAdmin.page.errors.loadTenantDataFailed'));
			})
			.finally(() => {
				if (!cancelled) setTenantDataLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [isSuperAdmin, selectedTenantId, showArchivedEvents, t, reload]);

	useEffect(() => {
		const tenant = searchParams.get('tenantId');
		if (tenant && tenants.some(item => item.id === tenant)) setSelectedTenantId(tenant);
	}, [searchParams, tenants]);

	async function refreshEvents(tenantId = selectedTenantId) {
		if (!tenantId) return;
		const eventRes = await getAdminEventsApi(tenantId, showArchivedEvents);
		setEvents(eventRes.data.data);
	}

	async function updatePlan(tenantId: string, nextPlan: 'personal' | 'free') {
		setPlanSaving(prev => ({ ...prev, [tenantId]: true }));
		try {
			const updated =
				nextPlan === 'personal' ? (await upgradeTenantApi(tenantId)).data.data : (await downgradeTenantApi(tenantId)).data.data;

			setTenants(prev => prev.map(t => (t.id === tenantId ? { ...t, plan: updated.plan } : t)));
			setUsers(prev => prev.map(u => (u.tenantId === tenantId && u.tenant ? { ...u, tenant: { ...u.tenant, plan: updated.plan } } : u)));
			setEvents(prev => prev.map(e => (e.tenantId === tenantId ? { ...e, tenant: { ...e.tenant, plan: updated.plan } } : e)));
		} catch {
			setError(t('superAdmin.page.errors.updateTenantPlanFailed'));
		} finally {
			setPlanSaving(prev => ({ ...prev, [tenantId]: false }));
		}
	}

	async function updateRole(userId: string, role: ManageableUserRole) {
		setRoleSaving(prev => ({ ...prev, [userId]: true }));
		try {
			const updated = (await updateUserRoleApi(userId, role, isSuperAdmin ? selectedTenantId : undefined)).data.data;
			setUsers(prev => prev.map(u => (u.id === userId ? { ...u, role: updated.role } : u)));
		} catch {
			setError(t('superAdmin.page.errors.updateUserRoleFailed'));
		} finally {
			setRoleSaving(prev => ({ ...prev, [userId]: false }));
		}
	}

	async function handleCreateUser() {
		setError('');
		if (isSuperAdmin && !selectedTenantId) {
			setError(t('superAdmin.page.errors.selectTenantBeforeCreateUser'));
			return;
		}
		setCreatingUser(true);
		try {
			const created = (await createAdminUserApi(createEmail, createRole, isSuperAdmin ? selectedTenantId : undefined)).data.data;
			setUsers(prev => [created, ...prev]);
			setCreateEmail('');
			setCreateRole('scanner');
			if (created.emailDispatched === false) {
				setError(t('superAdmin.page.errors.userCreatedEmailNotSent'));
			}
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError((err.response?.data as { error?: string } | undefined)?.error ?? t('superAdmin.page.errors.createUserFailed'));
			} else {
				setError(t('superAdmin.page.errors.createUserFailed'));
			}
		} finally {
			setCreatingUser(false);
		}
	}

	async function handleCreateTenantWithAdmin() {
		setError('');
		setCreatingTenant(true);
		try {
			const created = (await createTenantWithAdminApi(createTenantName, createTenantAdminEmail)).data.data;
			setTenants(prev => [created.tenant, ...prev]);
			setSelectedTenantId(created.tenant.id);
			setSearchParams(prev => {
				const next = new URLSearchParams(prev);
				next.set('tenantId', created.tenant.id);
				return next;
			});
			setUsers([created.user]);
			setEvents([]);
			setCreateTenantName('');
			setCreateTenantAdminEmail('');
			if (created.user.emailDispatched === false) {
				setError(t('superAdmin.page.errors.tenantAdminCreatedEmailNotSent'));
			}
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError(
					(err.response?.data as { error?: string } | undefined)?.error ?? t('superAdmin.page.errors.createTenantInviteAdminFailed'),
				);
			} else {
				setError(t('superAdmin.page.errors.createTenantInviteAdminFailed'));
			}
		} finally {
			setCreatingTenant(false);
		}
	}

	async function handleCreateEvent() {
		setError('');
		if (!selectedTenantId) {
			setError(t('superAdmin.page.errors.selectTenantBeforeCreateEvent'));
			return;
		}
		if (!createEventName.trim()) {
			setError(t('superAdmin.page.errors.eventNameRequired'));
			return;
		}
		setCreatingEvent(true);
		try {
			const created = (
				await createAdminEventApi(selectedTenantId, {
					name: createEventName.trim(),
					description: createEventDescription.trim() || undefined,
				})
			).data.data;
			setCreateEventName('');
			setCreateEventDescription('');
			setSelectedEventId(created.id);
			navigate(`/events/${created.id}?tenantId=${encodeURIComponent(selectedTenantId)}`);
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError((err.response?.data as { error?: string } | undefined)?.error ?? t('superAdmin.page.errors.createEventFailed'));
			} else {
				setError(t('superAdmin.page.errors.createEventFailed'));
			}
		} finally {
			setCreatingEvent(false);
		}
	}

	async function handleCreateGuest() {
		setError('');
		if (!selectedTenantId) {
			setError(t('superAdmin.page.errors.selectTenantBeforeCreateGuest'));
			return;
		}
		if (!selectedEventId) {
			setError(t('superAdmin.page.errors.selectEventBeforeCreateGuest'));
			return;
		}
		if (!createGuestName.trim()) {
			setError(t('superAdmin.page.errors.guestNameRequired'));
			return;
		}
		setCreatingGuest(true);
		try {
			await createAdminGuestApi(selectedTenantId, selectedEventId, {
				name: createGuestName.trim(),
			});
			setCreateGuestName('');
			await refreshEvents(selectedTenantId);
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError((err.response?.data as { error?: string } | undefined)?.error ?? t('superAdmin.page.errors.createGuestFailed'));
			} else {
				setError(t('superAdmin.page.errors.createGuestFailed'));
			}
		} finally {
			setCreatingGuest(false);
		}
	}

	async function handleAdjustCredits(action: 'add' | 'remove') {
		setError('');
		const quantity = Number(creditQuantity);
		if (!selectedTenantId || !selectedEventId) {
			setError(t('superAdmin.page.errors.selectEventBeforeAdjustCredits'));
			return;
		}
		if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
			setError(t('superAdmin.page.errors.creditQuantityInvalid'));
			return;
		}

		setAdjustingCredits(action);
		try {
			await adjustAdminEventCreditsApi(selectedTenantId, selectedEventId, action, quantity);
			if (action === 'add') {
				setTenants(current => current.map(tenant => (tenant.id === selectedTenantId ? { ...tenant, plan: 'personal' } : tenant)));
			}
			setCreditQuantity('');
			await refreshEvents(selectedTenantId);
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError((err.response?.data as { error?: string } | undefined)?.error ?? t('superAdmin.page.errors.adjustCreditsFailed'));
			} else {
				setError(t('superAdmin.page.errors.adjustCreditsFailed'));
			}
		} finally {
			setAdjustingCredits(null);
		}
	}

	function requestEventAction(eventId: string, action: EventActionType) {
		setPendingEventAction({ eventId, action });
	}

	async function confirmPendingEventAction() {
		if (!pendingEventAction) return;

		const { eventId, action } = pendingEventAction;
		setError('');
		setEventActionSaving(prev => ({ ...prev, [eventId]: true }));
		try {
			if (action === 'archive') {
				await archiveAdminEventApi(eventId);
			} else if (action === 'unarchive') {
				await unarchiveAdminEventApi(eventId);
			} else {
				await deleteAdminEventApi(eventId);
				if (selectedEventId === eventId) {
					setSelectedEventId('');
				}
			}

			await refreshEvents();
			setPendingEventAction(null);
		} catch {
			if (action === 'archive') {
				setError(t('superAdmin.events.errors.archiveFailed'));
			} else if (action === 'unarchive') {
				setError(t('superAdmin.events.errors.unarchiveFailed'));
			} else {
				setError(t('superAdmin.events.errors.deleteFailed'));
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

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<p className="text-muted-foreground">{t('superAdmin.page.loading')}</p>
			</div>
		);
	}

	const sectionHref = (next: string) => {
		const params = new URLSearchParams(searchParams);
		params.set('section', next);
		if (selectedTenantId) params.set('tenantId', selectedTenantId);
		return `/super-admin?${params}`;
	};
	return (
		<div>
			<PageHeading
				title={t(isSuperAdmin ? 'workspace.adminTitle' : 'superAdmin.page.title.userManagement')}
				description={t(isSuperAdmin ? 'workspace.adminDescription' : 'superAdmin.page.subtitle.userManagement')}
			/>
			<main className="space-y-6">
				{isSuperAdmin && (
					<div className="ws-tenant-bar">
						<Building2 size={24} />
						<div>
							<Label htmlFor="admin-tenant">{t('workspace.organization')}</Label>
							<Select
								disabled={
									creatingUser ||
									creatingEvent ||
									creatingGuest ||
									creatingTenant ||
									adjustingCredits !== null ||
									Object.values(roleSaving).some(Boolean) ||
									Object.values(eventActionSaving).some(Boolean)
								}
								value={selectedTenantId}
								onValueChange={value => {
									setSelectedTenantId(value);
									setUsers([]);
									setEvents([]);
									setSelectedEventId('');
									setPendingEventAction(null);
									setSearchParams(prev => {
										const next = new URLSearchParams(prev);
										next.set('tenantId', value);
										return next;
									});
								}}>
								<SelectTrigger id="admin-tenant">
									<SelectValue placeholder={t('superAdmin.page.form.selectTenant')} />
								</SelectTrigger>
								<SelectContent>
									{tenants.map(tenant => (
										<SelectItem key={tenant.id} value={tenant.id}>
											{tenant.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<span className="ws-status">{t(`billing.${selectedTenant?.plan ?? 'free'}`)}</span>
					</div>
				)}
				<nav className="ws-segments" aria-label={t('workspace.adminSections')}>
					{(isSuperAdmin ? ['overview', 'organizations', 'users', 'events', 'requests'] : ['users']).map(key => (
						<Link key={key} aria-current={section === key ? 'page' : undefined} to={sectionHref(key)}>
							{t(`workspace.sections.${key}`)}
						</Link>
					))}
				</nav>
				{error && (
					<Alert variant="destructive">
						<AlertCircle size={16} />
						<AlertDescription>
							{error}
							<Button className="ml-3" variant="outline" size="sm" onClick={() => setReload(n => n + 1)}>
								{t('workspace.retry')}
							</Button>
						</AlertDescription>
					</Alert>
				)}
				{isSuperAdmin && section === 'overview' && (
					<>
						<div className="ws-overview-banner">
							<h2>{t('workspace.overviewTitle')}</h2>
							<p>{t('workspace.overviewBody', { name: selectedTenant?.name ?? '' })}</p>
							<Link to={sectionHref('events')}>
								{t('workspace.manageEvents')}
								<Calendar size={16} />
							</Link>
						</div>
						<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
							<Card>
								<CardContent className="pt-6">
									<div className="flex items-center gap-3">
										<div className="p-2 rounded-lg bg-secondary">
											<Building2 className="h-5 w-5 text-primary" />
										</div>
										<div>
											<p className="text-2xl font-bold">{summary.tenants}</p>
											<p className="text-xs text-muted-foreground">{t('superAdmin.page.summary.tenants')}</p>
										</div>
									</div>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="pt-6">
									<div className="flex items-center gap-3">
										<div className="p-2 rounded-lg bg-secondary">
											<Users className="h-5 w-5 text-primary" />
										</div>
										<div>
											<p className="text-2xl font-bold">{summary.users}</p>
											<p className="text-xs text-muted-foreground">{t('superAdmin.page.summary.users')}</p>
										</div>
									</div>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="pt-6">
									<div className="flex items-center gap-3">
										<div className="p-2 rounded-lg bg-green-50">
											<Calendar className="h-5 w-5 text-green-600" />
										</div>
										<div>
											<p className="text-2xl font-bold">{summary.events}</p>
											<p className="text-xs text-muted-foreground">{t('superAdmin.page.summary.events')}</p>
										</div>
									</div>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="pt-6">
									<div className="flex items-center gap-3">
										<div className="p-2 rounded-lg bg-amber-50">
											<Star className="h-5 w-5 text-amber-600" />
										</div>
										<div>
											<p className="text-2xl font-bold">{summary.proTenants}</p>
											<p className="text-xs text-muted-foreground">{t('superAdmin.page.summary.proTenants')}</p>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>
						<p className="text-xs text-muted-foreground">{t('workspace.summaryContext')}</p>
					</>
				)}
				{isSuperAdmin && section === 'organizations' && (
					<>
						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('superAdmin.page.cards.createTenantInviteAdmin')}</CardTitle>
							</CardHeader>
							<CardContent>
								<form
									onSubmit={e => {
										e.preventDefault();
										void handleCreateTenantWithAdmin();
									}}>
									<div className="grid md:grid-cols-2 gap-3 items-end">
										<div className="space-y-2">
											<Label htmlFor="admin-field-1">{t('superAdmin.page.form.tenantName')}</Label>
											<Input
												required
												id="admin-field-1"
												value={createTenantName}
												onChange={e => setCreateTenantName(e.target.value)}
												placeholder={t('superAdmin.page.form.tenantNamePlaceholder')}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="admin-field-2">{t('superAdmin.page.form.adminEmail')}</Label>
											<Input
												required
												id="admin-field-2"
												type="email"
												value={createTenantAdminEmail}
												onChange={e => setCreateTenantAdminEmail(e.target.value)}
												placeholder={t('superAdmin.page.form.adminEmailPlaceholder')}
											/>
										</div>
									</div>
									<div className="mt-4">
										<Button type="submit" disabled={creatingTenant || !createTenantName.trim() || !createTenantAdminEmail.trim()}>
											{creatingTenant ? t('superAdmin.page.actions.creating') : t('superAdmin.page.actions.createTenantSendInvitation')}
										</Button>
									</div>
									<p className="mt-3 text-xs text-muted-foreground">{t('superAdmin.page.hints.invitationLinkHint')}</p>
								</form>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle className="text-base">{t('workspace.organizationsPlans')}</CardTitle>
							</CardHeader>
							<CardContent>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>{t('workspace.organization')}</TableHead>
											<TableHead>{t('workspace.plan')}</TableHead>
											<TableHead>{t('workspace.users')}</TableHead>
											<TableHead>{t('workspace.events')}</TableHead>
											<TableHead>{t('workspace.actions')}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{tenants.map(tenant => (
											<TableRow key={tenant.id}>
												<TableCell className="font-medium">{tenant.name}</TableCell>
												<TableCell>
													<Badge variant={tenant.plan === 'personal' ? 'default' : 'secondary'}>{tenant.plan}</Badge>
												</TableCell>
												<TableCell>{tenant._count.users}</TableCell>
												<TableCell>{tenant._count.events}</TableCell>
												<TableCell>
													<Button
														size="sm"
														variant={tenant.plan === 'personal' ? 'outline' : 'default'}
														disabled={planSaving[tenant.id]}
														onClick={() => updatePlan(tenant.id, tenant.plan === 'personal' ? 'free' : 'personal')}>
														{t(
															planSaving[tenant.id]
																? 'superAdmin.events.actions.saving'
																: tenant.plan === 'personal'
																	? 'workspace.downgrade'
																	: 'workspace.upgrade',
														)}
													</Button>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
						{tenants.length === 0 && <WorkspaceState title={t('workspace.noOrganizations')} />}
					</>
				)}
				{section === 'users' && (
					<>
						<Card>
							<CardHeader>
								<CardTitle className="text-base">
									{isSuperAdmin && selectedTenant
										? t('superAdmin.page.cards.createUserForTenant', { tenantName: selectedTenant.name })
										: t('superAdmin.page.cards.createUser')}
								</CardTitle>
							</CardHeader>
							<CardContent>
								<form
									onSubmit={e => {
										e.preventDefault();
										void handleCreateUser();
									}}>
									<div className="grid md:grid-cols-4 gap-3 items-end">
										<div className="space-y-2 md:col-span-3">
											<Label htmlFor="admin-field-3">{t('superAdmin.page.form.email')}</Label>
											<Input
												required
												id="admin-field-3"
												type="email"
												value={createEmail}
												onChange={e => setCreateEmail(e.target.value)}
												placeholder={t('superAdmin.page.form.userEmailPlaceholder')}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor="admin-field-4">{t('superAdmin.page.form.role')}</Label>
											<Select value={createRole} onValueChange={value => setCreateRole(value as ManageableUserRole)}>
												<SelectTrigger id="admin-field-4">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{ROLE_OPTIONS.map(role => (
														<SelectItem key={role} value={role}>
															{t(`workspace.roles.${role}`)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
									<div className="mt-4">
										<Button
											type="submit"
											disabled={creatingUser || tenantDataLoading || !createEmail || (isSuperAdmin && !selectedTenantId)}>
											{creatingUser ? t('superAdmin.page.actions.creating') : t('superAdmin.page.actions.sendInvitation')}
										</Button>
									</div>
								</form>
							</CardContent>
						</Card>
						{tenantDataLoading ? (
							<WorkspaceState loading title={t('superAdmin.page.loading')} />
						) : (
							<>
								<Card>
									<CardHeader>
										<CardTitle className="text-base">{t('workspace.usersRoles')}</CardTitle>
									</CardHeader>
									<CardContent>
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>{t('workspace.email')}</TableHead>
													<TableHead>{t('workspace.organization')}</TableHead>
													<TableHead>{t('workspace.plan')}</TableHead>
													<TableHead>{t('workspace.role')}</TableHead>
													<TableHead>{t('workspace.status')}</TableHead>
													<TableHead>{t('workspace.administrator')}</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{users.map(entry => (
													<TableRow key={entry.id}>
														<TableCell>{entry.email}</TableCell>
														<TableCell>{entry.tenant?.name ?? t('workspace.multipleOrganizations')}</TableCell>
														<TableCell>
															<Badge variant={entry.tenant?.plan === 'personal' ? 'default' : 'secondary'}>
																{entry.tenant?.plan ?? 'n/a'}
															</Badge>
														</TableCell>
														<TableCell>
															{entry.role === 'owner' ? (
																<>
																	<Badge variant="secondary">{t('workspace.roles.owner')}</Badge>
																	<p className="text-xs text-muted-foreground mt-1">{t('workspace.ownerImmutable')}</p>
																</>
															) : (
																<Select
																	value={entry.role as ManageableUserRole}
																	disabled={roleSaving[entry.id] || entry.isSuperAdmin}
																	onValueChange={value => updateRole(entry.id, value as ManageableUserRole)}>
																	<SelectTrigger className="w-32" aria-label={t('workspace.roleFor', { email: entry.email })}>
																		<SelectValue />
																	</SelectTrigger>
																	<SelectContent>
																		{ROLE_OPTIONS.map(role => (
																			<SelectItem key={role} value={role}>
																				{t(`workspace.roles.${role}`)}
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															)}
														</TableCell>
														<TableCell>
															<Badge variant={entry.accountStatus === 'active' ? 'default' : 'secondary'}>
																{t(`workspace.accountStatus.${entry.accountStatus}`, {
																	defaultValue: entry.accountStatus.replace('_', ' '),
																})}
															</Badge>
														</TableCell>
														<TableCell>
															{entry.isSuperAdmin ? (
																<Badge variant="default">{t('workspace.yes')}</Badge>
															) : (
																<span className="text-muted-foreground text-xs">{t('workspace.no')}</span>
															)}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</CardContent>
								</Card>
								{users.length === 0 && !error && <WorkspaceState title={t('workspace.noUsers')} />}
							</>
						)}
					</>
				)}
				{isSuperAdmin &&
					section === 'events' &&
					(tenantDataLoading ? (
						<WorkspaceState loading title={t('eventsPage.loading')} />
					) : (
						<>
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between gap-3">
										<CardTitle className="text-base">{t('workspace.eventsIn', { name: selectedTenant?.name ?? '' })}</CardTitle>
										<Button
											variant={showArchivedEvents ? 'default' : 'outline'}
											size="sm"
											onClick={() => setShowArchivedEvents(prev => !prev)}>
											{showArchivedEvents ? t('superAdmin.events.actions.hideArchived') : t('superAdmin.events.actions.showArchived')}
										</Button>
									</div>
								</CardHeader>
								<CardContent>
									<div className="space-y-2">
										{events.map(event => (
											<div key={event.id} className="border rounded-xl p-4 flex flex-wrap gap-4 justify-between items-center">
												<div className="min-w-0">
													<p className="font-medium truncate">{event.name}</p>
													<p className="text-xs text-muted-foreground mt-0.5">
														{event.tenant.name} ·{' '}
														<Badge variant={event.tenant.plan === 'personal' ? 'default' : 'secondary'} className="text-[10px] py-0">
															{event.tenant.plan}
														</Badge>{' '}
														{event.archivedAt ? (
															<Badge variant="outline" className="text-[10px] py-0">
																{t('superAdmin.events.labels.archived')}
															</Badge>
														) : null}{' '}
														· {event.startsAt ? new Date(event.startsAt).toLocaleString() : t('workspace.noSchedule')}
													</p>
												</div>
												<div className="text-right text-xs text-muted-foreground shrink-0 ml-4">
													<p>{t('workspace.ticketCount', { count: event._count.tickets })}</p>
													<p>{t('workspace.creditCount', { count: event.paidCredits })}</p>
													<p>{t('workspace.scanCount', { count: event._count.scans })}</p>
													<p>{t('workspace.capacity', { value: event.maxGuests ?? t('workspace.unlimited') })}</p>
													<div className="mt-2 flex flex-wrap justify-end gap-2">
														<Button
															size="sm"
															variant="outline"
															disabled={eventActionSaving[event.id]}
															onClick={() => navigate(`/events/${event.id}?tenantId=${encodeURIComponent(selectedTenantId)}`)}>
															{t('superAdmin.events.actions.open')}
														</Button>
														<Popover>
															<PopoverTrigger asChild>
																<Button variant="ghost" size="icon" aria-label={t('workspace.eventActions', { name: event.name })}>
																	<MoreHorizontal size={19} />
																</Button>
															</PopoverTrigger>
															<PopoverContent align="end" className="w-48 p-2">
																<div className="ws-action-list">
																	{event.archivedAt ? (
																		<Button
																			size="sm"
																			variant="ghost"
																			disabled={eventActionSaving[event.id]}
																			onClick={() => requestEventAction(event.id, 'unarchive')}>
																			{eventActionSaving[event.id]
																				? t('superAdmin.events.actions.saving')
																				: t('superAdmin.events.actions.unarchive')}
																		</Button>
																	) : (
																		<Button
																			size="sm"
																			variant="ghost"
																			disabled={eventActionSaving[event.id]}
																			onClick={() => requestEventAction(event.id, 'archive')}>
																			{eventActionSaving[event.id]
																				? t('superAdmin.events.actions.saving')
																				: t('superAdmin.events.actions.archive')}
																		</Button>
																	)}
																	<Button
																		size="sm"
																		variant="ghost"
																		className="text-destructive"
																		disabled={eventActionSaving[event.id]}
																		onClick={() => requestEventAction(event.id, 'delete')}>
																		{eventActionSaving[event.id]
																			? t('superAdmin.events.actions.saving')
																			: t('superAdmin.events.actions.delete')}
																	</Button>
																</div>
															</PopoverContent>
														</Popover>
													</div>
												</div>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
							{events.length === 0 && !error && <WorkspaceState title={t('eventsPage.empty')} />}
							{selectedTenantId && (
								<div className="ws-admin-grid">
									<Card>
										<CardHeader>
											<CardTitle className="text-base">{t('workspace.createEventIn', { name: selectedTenant?.name })}</CardTitle>
										</CardHeader>
										<CardContent>
											<form
												onSubmit={e => {
													e.preventDefault();
													void handleCreateEvent();
												}}>
												<div className="space-y-3">
													<div className="space-y-2">
														<Label htmlFor="admin-field-5">{t('workspace.eventName')}</Label>
														<Input
															required
															id="admin-field-5"
															value={createEventName}
															onChange={e => setCreateEventName(e.target.value)}
															placeholder={t('eventsPage.form.eventNamePlaceholder')}
														/>
													</div>
													<div className="space-y-2">
														<Label htmlFor="admin-field-6">{t('workspace.descriptionOptional')}</Label>
														<Input
															id="admin-field-6"
															value={createEventDescription}
															onChange={e => setCreateEventDescription(e.target.value)}
															placeholder={t('eventsPage.form.descriptionPlaceholder')}
														/>
													</div>
													<Button type="submit" disabled={creatingEvent || !createEventName.trim()}>
														{creatingEvent ? t('eventsPage.form.creating') : t('eventsPage.form.create')}
													</Button>
												</div>
											</form>
										</CardContent>
									</Card>
									{activeEvents.length > 0 && (
										<>
											<Card>
												<CardHeader>
													<CardTitle className="text-base">{t('superAdmin.page.cards.adjustEventCredits')}</CardTitle>
												</CardHeader>
												<CardContent>
													<div className="grid md:grid-cols-2 gap-3 items-end">
														<div className="space-y-2">
															<Label htmlFor="admin-field-7">{t('superAdmin.page.form.event')}</Label>
															<Select value={selectedEventId} onValueChange={setSelectedEventId}>
																<SelectTrigger id="admin-field-7">
																	<SelectValue placeholder={t('superAdmin.page.form.selectEvent')} />
																</SelectTrigger>
																<SelectContent>
																	{activeEvents.map(event => (
																		<SelectItem key={event.id} value={event.id}>
																			{event.name} ({event.paidCredits} {t('superAdmin.page.labels.creditsAvailable')})
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
														</div>
														<div className="space-y-2">
															<Label htmlFor="admin-field-8">{t('superAdmin.page.form.qrQuantity')}</Label>
															<Input
																id="admin-field-8"
																type="number"
																min={1}
																max={1000000}
																step={1}
																value={creditQuantity}
																onChange={event => setCreditQuantity(event.target.value)}
																placeholder="100"
															/>
														</div>
													</div>
													<div className="mt-4 flex flex-wrap gap-2">
														<Button
															onClick={() => handleAdjustCredits('add')}
															disabled={adjustingCredits !== null || !selectedEventId || !creditQuantity}>
															{adjustingCredits === 'add'
																? t('superAdmin.page.actions.adjustingCredits')
																: t('superAdmin.page.actions.addCredits')}
														</Button>
														<Button
															variant="destructive"
															onClick={() => handleAdjustCredits('remove')}
															disabled={adjustingCredits !== null || !selectedEventId || !creditQuantity}>
															{adjustingCredits === 'remove'
																? t('superAdmin.page.actions.adjustingCredits')
																: t('superAdmin.page.actions.removeCredits')}
														</Button>
													</div>
													<p className="mt-3 text-xs text-muted-foreground">{t('superAdmin.page.hints.creditAdjustment')}</p>
												</CardContent>
											</Card>
											<Card>
												<CardHeader>
													<CardTitle className="text-base">{t('workspace.addGuestIn', { name: selectedTenant?.name })}</CardTitle>
												</CardHeader>
												<CardContent>
													<form
														onSubmit={e => {
															e.preventDefault();
															void handleCreateGuest();
														}}>
														<div className="space-y-3">
															<div className="space-y-2">
																<Label htmlFor="admin-field-9">{t('workspace.selectEvent')}</Label>
																<Select value={selectedEventId} onValueChange={setSelectedEventId}>
																	<SelectTrigger id="admin-field-9">
																		<SelectValue placeholder={t('superAdmin.page.form.selectEvent')} />
																	</SelectTrigger>
																	<SelectContent>
																		{activeEvents.map(event => (
																			<SelectItem key={event.id} value={event.id}>
																				{event.name} ({t('workspace.ticketCount', { count: event._count.tickets })})
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															</div>
															<div className="space-y-2">
																<Label htmlFor="admin-field-10">{t('workspace.guestName')}</Label>
																<Input
																	required
																	id="admin-field-10"
																	value={createGuestName}
																	onChange={e => setCreateGuestName(e.target.value)}
																	placeholder={t('workspace.guestPlaceholder')}
																/>
															</div>
															<Button type="submit" disabled={creatingGuest || !createGuestName.trim() || !selectedEventId}>
																{creatingGuest ? t('eventDetailPage.actions.adding') : t('eventDetailPage.actions.add')}
															</Button>
														</div>
													</form>
												</CardContent>
											</Card>
										</>
									)}
								</div>
							)}
						</>
					))}
				{isSuperAdmin &&
					section === 'requests' &&
					(selectedTenantId ? (
						<ContactRequests key={selectedTenantId} tenantId={selectedTenantId} />
					) : (
						<WorkspaceState title={t('superAdmin.page.noTenantSelected')} />
					))}

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
						{error && (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<DialogFooter>
							<Button variant="outline" onClick={() => setPendingEventAction(null)}>
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
		</div>
	);
}
