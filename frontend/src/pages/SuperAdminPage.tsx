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
			<div className="min-h-screen bg-gray-50 flex items-center justify-center">
				<p className="text-gray-500">Loading super admin dashboard...</p>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-50">
			<header className="bg-slate-900 text-white px-6 py-4 shadow flex items-center justify-between">
				<div>
					<h1 className="text-xl font-bold">Super Admin Dashboard</h1>
					<p className="text-xs opacity-80">Global tenant, event and user management</p>
				</div>
				<div className="flex items-center gap-3">
					<button
						onClick={() => navigate('/events')}
						className="bg-slate-700 hover:bg-slate-600 text-sm px-3 py-1.5 rounded">
						Back to Events
					</button>
					<button
						onClick={logout}
						className="bg-slate-700 hover:bg-slate-600 text-sm px-3 py-1.5 rounded">
						Logout
					</button>
				</div>
			</header>

			<main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
				{error ? <p className="text-red-600 text-sm">{error}</p> : null}

				<section className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<div className="bg-white rounded-xl shadow p-4">
						<p className="text-xs text-gray-500">Tenants</p>
						<p className="text-2xl font-bold">{summary.tenants}</p>
					</div>
					<div className="bg-white rounded-xl shadow p-4">
						<p className="text-xs text-gray-500">Users</p>
						<p className="text-2xl font-bold">{summary.users}</p>
					</div>
					<div className="bg-white rounded-xl shadow p-4">
						<p className="text-xs text-gray-500">Events</p>
						<p className="text-2xl font-bold">{summary.events}</p>
					</div>
					<div className="bg-white rounded-xl shadow p-4">
						<p className="text-xs text-gray-500">Pro Tenants</p>
						<p className="text-2xl font-bold">{summary.proTenants}</p>
					</div>
				</section>

				<section className="bg-white rounded-xl shadow p-4">
					<h2 className="font-semibold mb-3">Tenants and Plan</h2>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left border-b">
									<th className="py-2">Tenant</th>
									<th className="py-2">Plan</th>
									<th className="py-2">Users</th>
									<th className="py-2">Events</th>
									<th className="py-2">Actions</th>
								</tr>
							</thead>
							<tbody>
								{tenants.map(tenant => (
									<tr
										key={tenant.id}
										className="border-b last:border-0">
										<td className="py-2">{tenant.name}</td>
										<td className="py-2">{tenant.plan}</td>
										<td className="py-2">{tenant._count.users}</td>
										<td className="py-2">{tenant._count.events}</td>
										<td className="py-2">
											<button
												onClick={() => updatePlan(tenant.id, tenant.plan === 'pro' ? 'free' : 'pro')}
												disabled={planSaving[tenant.id]}
												className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded disabled:opacity-60">
												{planSaving[tenant.id] ? 'Saving...' : tenant.plan === 'pro' ? 'Downgrade to Free' : 'Upgrade to Pro'}
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>

				<section className="bg-white rounded-xl shadow p-4">
					<h2 className="font-semibold mb-3">Users and Roles</h2>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left border-b">
									<th className="py-2">Email</th>
									<th className="py-2">Tenant</th>
									<th className="py-2">Plan</th>
									<th className="py-2">Role</th>
									<th className="py-2">Super Admin</th>
								</tr>
							</thead>
							<tbody>
								{users.map(entry => (
									<tr
										key={entry.id}
										className="border-b last:border-0">
										<td className="py-2">{entry.email}</td>
										<td className="py-2">{entry.tenant.name}</td>
										<td className="py-2">{entry.tenant.plan}</td>
										<td className="py-2">
											<select
												value={entry.role}
												onChange={e => updateRole(entry.id, e.target.value)}
												disabled={roleSaving[entry.id] || entry.isSuperAdmin}
												className="border border-gray-300 rounded px-2 py-1">
												{ROLE_OPTIONS.map(role => (
													<option
														key={role}
														value={role}>
														{role}
													</option>
												))}
											</select>
										</td>
										<td className="py-2">{entry.isSuperAdmin ? 'Yes' : 'No'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>

				<section className="bg-white rounded-xl shadow p-4">
					<h2 className="font-semibold mb-3">All Events</h2>
					<ul className="space-y-2">
						{events.map(event => (
							<li
								key={event.id}
								className="border rounded-lg px-3 py-2 flex justify-between items-center">
								<div>
									<p className="font-medium">{event.name}</p>
									<p className="text-xs text-gray-500">
										{event.tenant.name} ({event.tenant.plan}) - {new Date(event.startsAt).toLocaleString()} to{' '}
										{new Date(event.endsAt).toLocaleString()}
									</p>
								</div>
								<p className="text-xs text-gray-600">
									Tickets: {event._count.tickets} | Scans: {event._count.scans}
								</p>
							</li>
						))}
					</ul>
				</section>
			</main>
		</div>
	);
}
