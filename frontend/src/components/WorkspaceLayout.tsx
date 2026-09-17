import { ReactNode, useLayoutEffect, useState, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Shield, QrCode, Menu, LogOut, ArrowUpRight, Users, BarChart3, Settings2, ScanLine } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import './WorkspaceLayout.css';

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
	const { user, logout } = useAuth();
	const { t, i18n } = useTranslation();
	const { pathname, search } = useLocation();
	const menuButton = useRef<HTMLButtonElement>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const active = !!user && (pathname.startsWith('/events') || pathname === '/super-admin');
	const scanner = pathname.endsWith('/scan');
	const eventId = pathname.match(/^\/events\/([^/]+)/)?.[1];
	const tenantId = new URLSearchParams(search).get('tenantId');
	const context = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
	const canManage = !!user && (user.isSuperAdmin || ['admin', 'owner'].includes(user.role));
	useLayoutEffect(() => {
		if (active) document.body.classList.add('workspace-theme');
		return () => document.body.classList.remove('workspace-theme');
	}, [active]);
	if (!active || scanner) return <>{children}</>;
	const navigation = (
		<>
			<Link to="/events" className="ws-brand" onClick={() => setMenuOpen(false)}>
				<QrCode size={27} />
				tiqra<span>®</span>
			</Link>
			<p className="ws-nav-label">{t('workspace.workspace')}</p>
			<nav aria-label={t('workspace.navigation')} className="ws-navigation">
				<NavLink to="/events" onClick={() => setMenuOpen(false)}>
					<CalendarDays size={19} />
					{t('workspace.events')}
				</NavLink>
				{canManage && (
					<NavLink to={`/super-admin${context}`} onClick={() => setMenuOpen(false)}>
						<Shield size={19} />
						{t('workspace.admin')}
					</NavLink>
				)}
			</nav>
			<div className="ws-sidebar-note">
				<span className="ws-note-icon">
					<QrCode size={23} />
				</span>
				<strong>{t('workspace.noteTitle')}</strong>
				<p>{t('workspace.noteBody')}</p>
				<Link to="/" onClick={() => setMenuOpen(false)}>
					{t('workspace.visitSite')}
					<ArrowUpRight size={15} />
				</Link>
			</div>
			<div className="ws-account">
				<span className="ws-avatar">{(user.email || 'T').slice(0, 1).toUpperCase()}</span>
				<div>
					<strong>{t(user.isSuperAdmin ? 'workspace.administrator' : `workspace.roles.${user.role}`, { defaultValue: user.role })}</strong>
					<span title={user.email}>{user.email}</span>
				</div>
				<button aria-label={t('eventsPage.actions.logout')} onClick={logout}>
					<LogOut size={18} />
				</button>
			</div>
		</>
	);
	return (
		<div className="ws-shell">
			<a className="ws-skip" href="#workspace-content">
				{t('workspace.skip')}
			</a>
			<aside className="ws-sidebar">{navigation}</aside>
			<div className="ws-body">
				<header className="ws-topbar">
					<Button
						variant="ghost"
						size="icon"
						ref={menuButton}
						className="ws-menu"
						onClick={() => setMenuOpen(true)}
						aria-label={t('workspace.openMenu')}>
						<Menu size={21} />
					</Button>
					<div className="ws-breadcrumb">
						<span>tiqra</span>
						<span>/</span>
						<strong>{t(pathname === '/super-admin' ? 'workspace.admin' : 'workspace.events')}</strong>
						{eventId && (
							<>
								<span>/</span>
								<span>{t('workspace.eventWorkspace')}</span>
							</>
						)}
					</div>
					<button
						className="ws-language"
						onClick={() => void i18n.changeLanguage(i18n.resolvedLanguage === 'es' ? 'en' : 'es')}
						aria-label={t('landing.language')}>
						{i18n.resolvedLanguage === 'es' ? 'EN' : 'ES'}
					</button>
				</header>
				{eventId && (
					<nav className="ws-event-nav" aria-label={t('workspace.eventNavigation')}>
						<NavLink end to={`/events/${eventId}${context}`}>
							<Users size={17} />
							{t('workspace.guests')}
						</NavLink>
						{canManage && (
							<>
								<NavLink to={`/events/${eventId}/dashboard${context}`}>
									<BarChart3 size={17} />
									{t('workspace.analytics')}
								</NavLink>
								<NavLink to={`/events/${eventId}/settings${context}`}>
									<Settings2 size={17} />
									{t('workspace.settings')}
								</NavLink>
							</>
						)}
						<Link className="ws-scan" to={`/events/${eventId}/scan${context}`}>
							<ScanLine size={17} />
							{t('workspace.scan')}
						</Link>
					</nav>
				)}
				<div id="workspace-content" tabIndex={-1} className="ws-content">
					{children}
				</div>
			</div>
			<Dialog open={menuOpen} onOpenChange={setMenuOpen}>
				<DialogContent
					className="ws-drawer"
					onCloseAutoFocus={event => {
						event.preventDefault();
						menuButton.current?.focus();
					}}>
					<DialogTitle className="sr-only">{t('workspace.navigation')}</DialogTitle>
					<DialogDescription className="sr-only">{t('workspace.workspace')}</DialogDescription>
					{navigation}
				</DialogContent>
			</Dialog>
		</div>
	);
}

export function PageHeading({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
	return (
		<div className="ws-page-heading">
			<div>
				<h1>{title}</h1>
				{description && <p>{description}</p>}
			</div>
			{children && <div className="ws-heading-actions">{children}</div>}
		</div>
	);
}
export function WorkspaceState({
	title,
	description,
	action,
	loading = false,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
	loading?: boolean;
}) {
	return (
		<div className="ws-state" role={loading ? 'status' : undefined}>
			<CalendarDays size={30} aria-hidden="true" />
			<h2>{title}</h2>
			{description && <p>{description}</p>}
			{action}
		</div>
	);
}
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<fieldset className="ws-form-section">
			<legend>{title}</legend>
			{children}
		</fieldset>
	);
}
