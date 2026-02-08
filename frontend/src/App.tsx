/**
 * App Router Configuration
 * Defines all routes with protected route handling
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedLayout from './components/ProtectedLayout';

const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const SignupPage = React.lazy(() => import('./pages/SignupPage'));
const HomePage = React.lazy(() => import('./pages/HomePage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const ChaptersPage = React.lazy(() => import('./pages/ChaptersPage'));
const OrganizationVideosPage = React.lazy(() => import('./pages/OrganizationVideosPage'));
const OrganizationDetailPage = React.lazy(() => import('./pages/OrganizationDetailPage'));
const WatchPage = React.lazy(() => import('./pages/WatchPage'));
const SchedulePage = React.lazy(() => import('./pages/SchedulePage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));

const App: React.FC = () => {
  return (
    <ToastProvider>
      <BrowserRouter>
        <a href="#main-content" className="skip-to-content">Skip to content</a>
        <AuthProvider>
          <React.Suspense fallback={
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-canvas)' }}>
              <div className="landing-loader" />
            </div>
          }>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />

              <Route path="/home" element={<ProtectedLayout><HomePage /></ProtectedLayout>} />
              <Route path="/schedule" element={<ProtectedLayout><SchedulePage /></ProtectedLayout>} />
              <Route path="/profile" element={<ProtectedLayout><ProfilePage /></ProtectedLayout>} />
              <Route path="/videos" element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
              <Route path="/watch/:videoId" element={<ProtectedLayout><WatchPage /></ProtectedLayout>} />
              <Route path="/:categorySlug/:organizationSlug" element={<ProtectedLayout><ChaptersPage /></ProtectedLayout>} />
              <Route path="/:categorySlug/:organizationSlug/:chapterSlug" element={<ProtectedLayout><OrganizationVideosPage /></ProtectedLayout>} />
              <Route path="/:categorySlug/:organizationSlug/:chapterSlug/:videoSlug" element={<ProtectedLayout><OrganizationDetailPage /></ProtectedLayout>} />

              <Route path="/category/:categoryId/organization/:organizationId" element={<Navigate to="/home" replace />} />
              <Route path="/dashboard" element={<Navigate to="/home" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </React.Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  );
};

export default App;
