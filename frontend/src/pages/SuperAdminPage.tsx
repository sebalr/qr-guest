import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
	AdminEvent,
	AdminTenant,
	AdminUser,
	downgradeTenantApi,
	getAdminEventsApi,
	getAdminTenantsApi,
	getAdminUsersApi,
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

const ROLE_OPTIONS = ['owner', 'admin', 'scanner'];

export default function SuperAdminPage() {
	const navigate = useNavigate();
	const { user, logout } = useAuth();
	const [tenants, setTenants] = useState<AdminTenant[]>([]);
	const [events, setEvents] = useState<AdminEvent[]>([]);
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [roleSaving, setRoleSaving] = useState<Record<string, boolean>>({});
	const [planSaving, setPlanSaving] = useState<Record<string, boolean>>({});

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
		if (!user?.isSuperAdmin) {
			navigate('/events', { replace: true });
			return;
		}

		Promise.all([getAdminTenantsApi(), getAdminEventsApi(), getAdminUsersApi()])
			.then(([tenantRes, eventRes, userRes]) => {
				setTenants(tenantRes.data.data);
				setEvents(eventRes.data.data);
				setUsers(userRes.data.data);
			})
			.catch(() => setError('Failed to load super admin data.'))
			.finally(() => setLoading(false));
	}, [navigate, user?.isSuperAdmin]);

	async function updatePlan(tenantId: string, nextPlan: 'pro' | 'free') {
		setPlanSaving(prev => ({ ...prev, [tenantId]: true }));
		try {
			const updated = nextPlan === 'pro' ? (await upgradeTenantApi(tenantId)).data.data : (await downgradeTenantApi(tenantId)).data.data;

			setTenants(prev => prev.map(t => (t.id === tenantId ? { ...t, plan: updated.plan } : t)));
			setUsers(prev => prev.map(u => (u.tenantId === tenantId ? { ...u, tenant: { ...u.tenant, plan: updated.plan } } : u)));
			setEvents(prev => prev.map(e => (e.tenantId === tenantId ? { ...e, tenant: { ...e.tenant, plan: updated.plan } } : e)));
		} catch {
			setError('Failed to update tenant plan.');
		} finally {
			setPlanSaving(prev => ({ ...prev, [tenantId]: false }));
		}
	}

	async function updateRole(userId: string, role: string) {
		setRoleSaving(prev => ({ ...prev, [userId]: true }));
		try {
			const updated = (await updateUserRoleApi(userId, role)).data.data;
			setUsers(prev => prev.map(u => (u.id === userId ? { ...u, role: updated.role } : u)));
		} catch {
			setError('Failed to update user role.');
		} finally {
			setRoleSaving(prev => ({ ...prev, [userId]: false }));
		}
	}

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<p className="text-muted-foreground">Loading super admin dashboard…</p>
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
							<h1 className="font-bold text-lg">Super Admin</h1>
							<p className="text-xs text-slate-400">Global tenant, event and user management</p>
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

				{/* Summary stats */}
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

				{/* Tenants table */}
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
									<TableHead>Super Admin</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{users.map(entry => (
									<TableRow key={entry.id}>
										<TableCell>{entry.email}</TableCell>
										<TableCell>{entry.tenant.name}</TableCell>
										<TableCell>
											<Badge variant={entry.tenant.plan === 'pro' ? 'default' : 'secondary'}>{entry.tenant.plan}</Badge>
										</TableCell>
										<TableCell>
											<Select
												value={entry.role}
												disabled={roleSaving[entry.id] || entry.isSuperAdmin}
												onValueChange={value => updateRole(entry.id, value)}>
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
										</TableCell>
										<TableCell>
											{entry.isSuperAdmin ? <Badge variant="default">Yes</Badge> : <span className="text-muted-foreground text-xs">No</span>}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				{/* Events list */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base">All Events</CardTitle>
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
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}

