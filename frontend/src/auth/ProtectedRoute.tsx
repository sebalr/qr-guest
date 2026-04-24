import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  roles?: string[];
}

export function ProtectedRoute({ children, roles }: Props) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/events" replace />;
  }

  return <>{children}</>;
}
