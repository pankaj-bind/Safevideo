/**
 * App Router Configuration
 * Defines all routes with protected route handling
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedLayout from './components/ProtectedLayout';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import OrganizationVideosPage from './pages/OrganizationVideosPage';
import OrganizationDetailPage from './pages/OrganizationDetailPage';
import WatchPage from './pages/WatchPage';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Landing Page */}
          <Route path="/" element={<LandingPage />} />

          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Protected Routes */}
          <Route
            path="/home"
            element={
              <ProtectedLayout>
                <HomePage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/videos"
            element={
              <ProtectedLayout>
                <DashboardPage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/watch/:videoId"
            element={
              <ProtectedLayout>
                <WatchPage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/:categorySlug/:organizationSlug"
            element={
              <ProtectedLayout>
                <OrganizationVideosPage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/:categorySlug/:organizationSlug/:videoSlug"
            element={
              <ProtectedLayout>
                <OrganizationDetailPage />
              </ProtectedLayout>
            }
          />
          
          {/* Backward compatibility - redirect old routes to home */}
          <Route path="/category/:categoryId/organization/:organizationId" element={<Navigate to="/home" replace />} />
          <Route path="/dashboard" element={<Navigate to="/home" replace />} />
          
          {/* 404 Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
