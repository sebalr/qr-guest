import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import ScannerPage from './pages/ScannerPage';
import SuperAdminPage from './pages/SuperAdminPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
	return (
		<AuthProvider>
			<BrowserRouter>
				<Routes>
					<Route
						path="/login"
						element={<LoginPage />}
					/>
					<Route
						path="/register"
						element={<RegisterPage />}
					/>
					<Route
						path="/events"
						element={
							<ProtectedRoute roles={['scanner', 'admin', 'owner']}>
								<EventsPage />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/events/:id"
						element={
							<ProtectedRoute roles={['scanner', 'admin', 'owner']}>
								<EventDetailPage />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/events/:id/scan"
						element={
							<ProtectedRoute roles={['scanner', 'admin', 'owner']}>
								<ScannerPage />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/events/:id/dashboard"
						element={
							<ProtectedRoute roles={['admin', 'owner']}>
								<DashboardPage />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/super-admin"
						element={
							<ProtectedRoute roles={['owner', 'admin']}>
								<SuperAdminPage />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/"
						element={
							<Navigate
								to="/events"
								replace
							/>
						}
					/>
					<Route
						path="*"
						element={
							<Navigate
								to="/events"
								replace
							/>
						}
					/>
				</Routes>
			</BrowserRouter>
		</AuthProvider>
	);
}
