import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/hooks/use-auth';

const Dashboard = lazy(() => import('@/pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Incidents = lazy(() => import('@/pages/Incidents').then((module) => ({ default: module.Incidents })));
const Login = lazy(() => import('@/pages/Login').then((module) => ({ default: module.Login })));
const NotFound = lazy(() => import('@/pages/NotFound').then((module) => ({ default: module.NotFound })));
const Notifications = lazy(() => import('@/pages/Notifications').then((module) => ({ default: module.Notifications })));
const Register = lazy(() => import('@/pages/Register').then((module) => ({ default: module.Register })));
const Settings = lazy(() => import('@/pages/Settings').then((module) => ({ default: module.Settings })));
const WebsiteDetail = lazy(() =>
  import('@/pages/WebsiteDetail').then((module) => ({ default: module.WebsiteDetail })),
);
const Websites = lazy(() => import('@/pages/Websites').then((module) => ({ default: module.Websites })));

function FullScreenLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading your workspace…
      </div>
    </div>
  );
}

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function GuestRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="websites" element={<Websites />} />
            <Route path="websites/:id" element={<WebsiteDetail />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
