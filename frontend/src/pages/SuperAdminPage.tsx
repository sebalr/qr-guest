import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../auth/AuthContext';
import {
	AdminEvent,
	AdminTenant,
	AdminUser,
	createAdminUserApi,
	createAdminEventApi,
	createAdminGuestApi,
	createTenantWithAdminApi,
	downgradeTenantApi,
	getAdminEventsApi,
	getAdminTenantsApi,
	getAdminUsersApi,
	ManageableUserRole,
	updateUserRoleApi,
	upgradeTenantApi,
} from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, LogOut, Building2, Users, Calendar, Star, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ROLE_OPTIONS: ManageableUserRole[] = ['admin', 'scanner'];

export default function SuperAdminPage() {
	const navigate = useNavigate();
	const { user, logout } = useAuth();
	const [tenants, setTenants] = useState<AdminTenant[]>([]);
	const [selectedTenantId, setSelectedTenantId] = useState('');
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
	const isSuperAdmin = user?.isSuperAdmin === true;
	const canManageUsers = user?.role === 'owner' || user?.role === 'admin' || isSuperAdmin;
	const selectedTenant = useMemo(() => tenants.find(t => t.id === selectedTenantId) ?? null, [tenants, selectedTenantId]);

	const summary = useMemo(() => {
		const proTenants = tenants.filter(t => t.plan === 'pro').length;
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
			setLoading(true);
			setError('');
			getAdminTenantsApi()
				.then(tenantRes => {
					const loadedTenants = tenantRes.data.data;
					setTenants(loadedTenants);
					setSelectedTenantId(prev => prev || loadedTenants[0]?.id || '');
				})
				.catch(() => setError('Failed to load super admin data.'))
				.finally(() => setLoading(false));
			return;
		}

		setLoading(true);
		setError('');
		getAdminUsersApi()
			.then(userRes => {
				setUsers(userRes.data.data);
				setEvents([]);
			})
			.catch(() => setError('Failed to load super admin data.'))
			.finally(() => setLoading(false));
	}, [canManageUsers, isSuperAdmin, navigate]);

	useEffect(() => {
		if (!isSuperAdmin || !selectedTenantId) return;

		setTenantDataLoading(true);
		setError('');
		Promise.all([getAdminUsersApi(selectedTenantId), getAdminEventsApi(selectedTenantId)])
			.then(([userRes, eventRes]) => {
				setUsers(userRes.data.data);
				setEvents(eventRes.data.data);
			})
			.catch(() => setError('Failed to load tenant data.'))
			.finally(() => setTenantDataLoading(false));
	}, [isSuperAdmin, selectedTenantId]);

	async function updatePlan(tenantId: string, nextPlan: 'pro' | 'free') {
		setPlanSaving(prev => ({ ...prev, [tenantId]: true }));
		try {
			const updated = nextPlan === 'pro' ? (await upgradeTenantApi(tenantId)).data.data : (await downgradeTenantApi(tenantId)).data.data;

			setTenants(prev => prev.map(t => (t.id === tenantId ? { ...t, plan: updated.plan } : t)));
			setUsers(prev => prev.map(u => (u.tenantId === tenantId && u.tenant ? { ...u, tenant: { ...u.tenant, plan: updated.plan } } : u)));
			setEvents(prev => prev.map(e => (e.tenantId === tenantId ? { ...e, tenant: { ...e.tenant, plan: updated.plan } } : e)));
		} catch {
			setError('Failed to update tenant plan.');
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
			setError('Failed to update user role.');
		} finally {
			setRoleSaving(prev => ({ ...prev, [userId]: false }));
		}
	}

	async function handleCreateUser() {
		setError('');
		if (isSuperAdmin && !selectedTenantId) {
			setError('Select a tenant before creating a user.');
			return;
		}
		setCreatingUser(true);
		try {
			const created = (await createAdminUserApi(createEmail, createRole, isSuperAdmin ? selectedTenantId : undefined)).data.data;
			setUsers(prev => [created, ...prev]);
			setCreateEmail('');
			setCreateRole('scanner');
			if (created.emailDispatched === false) {
				setError('User created, but the invitation email could not be sent.');
			}
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError((err.response?.data as { error?: string } | undefined)?.error ?? 'Failed to create user.');
			} else {
				setError('Failed to create user.');
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
			setUsers([created.user]);
			setEvents([]);
			setCreateTenantName('');
			setCreateTenantAdminEmail('');
			if (created.user.emailDispatched === false) {
				setError('Tenant and admin were created, but invitation email could not be sent.');
			}
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError((err.response?.data as { error?: string } | undefined)?.error ?? 'Failed to create tenant and invite admin.');
			} else {
				setError('Failed to create tenant and invite admin.');
			}
		} finally {
			setCreatingTenant(false);
		}
	}

	async function handleCreateEvent() {
		setError('');
		if (!selectedTenantId) {
			setError('Select a tenant before creating an event.');
			return;
		}
		if (!createEventName.trim()) {
			setError('Event name is required.');
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
			const eventRes = await getAdminEventsApi(selectedTenantId);
			setEvents(eventRes.data.data);
			setCreateEventName('');
			setCreateEventDescription('');
			setSelectedEventId(created.id);
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError((err.response?.data as { error?: string } | undefined)?.error ?? 'Failed to create event.');
			} else {
				setError('Failed to create event.');
			}
		} finally {
			setCreatingEvent(false);
		}
	}

	async function handleCreateGuest() {
		setError('');
		if (!selectedTenantId) {
			setError('Select a tenant before creating a guest.');
			return;
		}
		if (!selectedEventId) {
			setError('Select an event before creating a guest.');
			return;
		}
		if (!createGuestName.trim()) {
			setError('Guest name is required.');
			return;
		}
		setCreatingGuest(true);
		try {
			await createAdminGuestApi(selectedTenantId, selectedEventId, {
				name: createGuestName.trim(),
			});
			setCreateGuestName('');
			// Reload events to update ticket count
			const eventRes = await getAdminEventsApi(selectedTenantId);
			setEvents(eventRes.data.data);
		} catch (err) {
			if (axios.isAxiosError(err)) {
				setError((err.response?.data as { error?: string } | undefined)?.error ?? 'Failed to create guest.');
			} else {
				setError('Failed to create guest.');
			}
		} finally {
			setCreatingGuest(false);
		}
	}

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<p className="text-muted-foreground">Loading user management…</p>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-slate-50">
			<header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-10">
				<div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<Button
							variant="ghost"
							size="icon"
							className="text-slate-300 hover:text-white hover:bg-slate-800"
							onClick={() => navigate('/events')}>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<div>
							<h1 className="font-bold text-lg">{isSuperAdmin ? 'Super Admin' : 'User Management'}</h1>
							<p className="text-xs text-slate-400">
								{isSuperAdmin ? 'Global tenant, event and user management' : 'Manage users and scanning roles in your tenant'}
							</p>
						</div>
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="text-slate-300 hover:text-white hover:bg-slate-800 gap-1.5"
						onClick={logout}>
						<LogOut className="h-3.5 w-3.5" />
						Logout
					</Button>
				</div>
			</header>

			<main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
				{error && (
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				{isSuperAdmin && (
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						<Card>
							<CardContent className="pt-6">
								<div className="flex items-center gap-3">
									<div className="p-2 rounded-lg bg-blue-50">
										<Building2 className="h-5 w-5 text-blue-600" />
									</div>
									<div>
										<p className="text-2xl font-bold">{summary.tenants}</p>
										<p className="text-xs text-muted-foreground">Tenants</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="pt-6">
								<div className="flex items-center gap-3">
									<div className="p-2 rounded-lg bg-purple-50">
										<Users className="h-5 w-5 text-purple-600" />
									</div>
									<div>
										<p className="text-2xl font-bold">{summary.users}</p>
										<p className="text-xs text-muted-foreground">Users</p>
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
										<p className="text-xs text-muted-foreground">Events</p>
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
										<p className="text-xs text-muted-foreground">Pro Tenants</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>
				)}

				{isSuperAdmin && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Create Tenant &amp; Invite Admin</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid md:grid-cols-2 gap-3 items-end">
								<div className="space-y-2">
									<Label>Tenant Name</Label>
									<Input
										value={createTenantName}
										onChange={e => setCreateTenantName(e.target.value)}
										placeholder="Acme Events"
									/>
								</div>
								<div className="space-y-2">
									<Label>Admin Email</Label>
									<Input
										type="email"
										value={createTenantAdminEmail}
										onChange={e => setCreateTenantAdminEmail(e.target.value)}
										placeholder="admin@company.com"
									/>
								</div>
							</div>
							<div className="mt-4">
								<Button
									onClick={handleCreateTenantWithAdmin}
									disabled={creatingTenant || !createTenantName.trim() || !createTenantAdminEmail.trim()}>
									{creatingTenant ? 'Creating…' : 'Create Tenant and Send Invitation'}
								</Button>
							</div>
							<p className="mt-3 text-xs text-muted-foreground">
								The invitation email includes a link where the admin sets their password on first access.
							</p>
						</CardContent>
					</Card>
				)}

				{isSuperAdmin && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Selected Tenant</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid md:grid-cols-3 gap-3 items-end">
								<div className="space-y-2 md:col-span-2">
									<Label>Tenant</Label>
									<Select
										value={selectedTenantId}
										onValueChange={setSelectedTenantId}>
										<SelectTrigger>
											<SelectValue placeholder="Select tenant" />
										</SelectTrigger>
										<SelectContent>
											{tenants.map(tenant => (
												<SelectItem
													key={tenant.id}
													value={tenant.id}>
													{tenant.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="text-sm text-muted-foreground">
									{tenantDataLoading ? 'Loading tenant data…' : (selectedTenant?.name ?? 'No tenant selected')}
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Tenant user creation */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Create User{isSuperAdmin && selectedTenant ? ` for ${selectedTenant.name}` : ''}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid md:grid-cols-4 gap-3 items-end">
							<div className="space-y-2 md:col-span-3">
								<Label>Email</Label>
								<Input
									type="email"
									value={createEmail}
									onChange={e => setCreateEmail(e.target.value)}
									placeholder="user@company.com"
								/>
							</div>
							<div className="space-y-2">
								<Label>Role</Label>
								<Select
									value={createRole}
									onValueChange={value => setCreateRole(value as ManageableUserRole)}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ROLE_OPTIONS.map(role => (
											<SelectItem
												key={role}
												value={role}>
												{role}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="mt-4">
							<Button
								onClick={handleCreateUser}
								disabled={creatingUser || !createEmail || (isSuperAdmin && !selectedTenantId)}>
								{creatingUser ? 'Creating…' : 'Send Invitation'}
							</Button>
						</div>
					</CardContent>
				</Card>

				{isSuperAdmin && selectedTenantId && (
					<>
						{/* Create Event */}
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Create Event in {selectedTenant?.name}</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-3">
									<div className="space-y-2">
										<Label>Event Name</Label>
										<Input
											value={createEventName}
											onChange={e => setCreateEventName(e.target.value)}
											placeholder="Conference 2025"
										/>
									</div>
									<div className="space-y-2">
										<Label>Description (Optional)</Label>
										<Input
											value={createEventDescription}
											onChange={e => setCreateEventDescription(e.target.value)}
											placeholder="Add event details…"
										/>
									</div>
									<Button
										onClick={handleCreateEvent}
										disabled={creatingEvent || !createEventName.trim()}>
										{creatingEvent ? 'Creating…' : 'Create Event'}
									</Button>
								</div>
							</CardContent>
						</Card>

						{/* Create Guest */}
						{events.length > 0 && (
							<Card>
								<CardHeader>
									<CardTitle className="text-base">Add Guest in {selectedTenant?.name}</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="space-y-3">
										<div className="space-y-2">
											<Label>Select Event</Label>
											<Select
												value={selectedEventId}
												onValueChange={setSelectedEventId}>
												<SelectTrigger>
													<SelectValue placeholder="Select an event" />
												</SelectTrigger>
												<SelectContent>
													{events.map(event => (
														<SelectItem
															key={event.id}
															value={event.id}>
															{event.name} ({event._count.tickets} tickets)
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-2">
											<Label>Guest Name</Label>
											<Input
												value={createGuestName}
												onChange={e => setCreateGuestName(e.target.value)}
												placeholder="John Doe"
											/>
										</div>
										<Button
											onClick={handleCreateGuest}
											disabled={creatingGuest || !createGuestName.trim() || !selectedEventId}>
											{creatingGuest ? 'Adding…' : 'Add Guest'}
										</Button>
									</div>
								</CardContent>
							</Card>
						)}
					</>
				)}

				{isSuperAdmin && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Tenants &amp; Plans</CardTitle>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Tenant</TableHead>
										<TableHead>Plan</TableHead>
										<TableHead>Users</TableHead>
										<TableHead>Events</TableHead>
										<TableHead>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{tenants.map(tenant => (
										<TableRow key={tenant.id}>
											<TableCell className="font-medium">{tenant.name}</TableCell>
											<TableCell>
												<Badge variant={tenant.plan === 'pro' ? 'default' : 'secondary'}>{tenant.plan}</Badge>
											</TableCell>
											<TableCell>{tenant._count.users}</TableCell>
											<TableCell>{tenant._count.events}</TableCell>
											<TableCell>
												<Button
													size="sm"
													variant={tenant.plan === 'pro' ? 'outline' : 'default'}
													disabled={planSaving[tenant.id]}
													onClick={() => updatePlan(tenant.id, tenant.plan === 'pro' ? 'free' : 'pro')}>
													{planSaving[tenant.id] ? 'Saving…' : tenant.plan === 'pro' ? 'Downgrade' : 'Upgrade to Pro'}
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				)}

				{/* Users table */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Users &amp; Roles</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Email</TableHead>
									<TableHead>Tenant</TableHead>
									<TableHead>Plan</TableHead>
									<TableHead>Role</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Super Admin</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{users.map(entry => (
									<TableRow key={entry.id}>
										<TableCell>{entry.email}</TableCell>
										<TableCell>{entry.tenant?.name ?? 'Multiple tenants'}</TableCell>
										<TableCell>
											<Badge variant={entry.tenant?.plan === 'pro' ? 'default' : 'secondary'}>{entry.tenant?.plan ?? 'n/a'}</Badge>
										</TableCell>
										<TableCell>
											{entry.role === 'owner' ? (
												<>
													<Badge variant="secondary">owner</Badge>
													<p className="text-xs text-muted-foreground mt-1">Owner is immutable</p>
												</>
											) : (
												<Select
													value={entry.role as ManageableUserRole}
													disabled={roleSaving[entry.id] || entry.isSuperAdmin}
													onValueChange={value => updateRole(entry.id, value as ManageableUserRole)}>
													<SelectTrigger className="w-32">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{ROLE_OPTIONS.map(role => (
															<SelectItem
																key={role}
																value={role}>
																{role}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											)}
										</TableCell>
										<TableCell>
											<Badge variant={entry.accountStatus === 'active' ? 'default' : 'secondary'}>
												{entry.accountStatus.replace('_', ' ')}
											</Badge>
										</TableCell>
										<TableCell>
											{entry.isSuperAdmin ? (
												<Badge variant="default">Yes</Badge>
											) : (
												<span className="text-muted-foreground text-xs">No</span>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				{isSuperAdmin && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Events{selectedTenant ? ` in ${selectedTenant.name}` : ''}</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{events.map(event => (
									<div
										key={event.id}
										className="border rounded-lg px-4 py-3 flex justify-between items-center">
										<div className="min-w-0">
											<p className="font-medium truncate">{event.name}</p>
											<p className="text-xs text-muted-foreground mt-0.5">
												{event.tenant.name} ·{' '}
												<Badge
													variant={event.tenant.plan === 'pro' ? 'default' : 'secondary'}
													className="text-[10px] py-0">
													{event.tenant.plan}
												</Badge>{' '}
												· {new Date(event.startsAt).toLocaleString()}
											</p>
										</div>
										<div className="text-right text-xs text-muted-foreground shrink-0 ml-4">
											<p>{event._count.tickets} tickets</p>
											<p>{event._count.scans} scans</p>
											<p>max {typeof event.maxGuests === 'number' ? event.maxGuests : 'Unlimited'}</p>
											<Button
												className="mt-2"
												size="sm"
												onClick={() => navigate(`/events/${event.id}?tenantId=${encodeURIComponent(selectedTenantId)}`)}>
												Open
											</Button>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				)}
			</main>
		</div>
	);
}
