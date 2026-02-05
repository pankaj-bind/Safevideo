/**
 * ProtectedLayout Component
 * Wrapper for protected routes requiring authentication
 * 
 * Features:
 * - Automatic redirect to login if not authenticated
 * - Loading state during session verification
 * - Layout wrapper for dashboard pages
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { ProtectedLayoutProps } from '../types/api.types';

const ProtectedLayout: React.FC<ProtectedLayoutProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading spinner during session verification
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Verifying session...</p>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="protected-layout">
      {/* Main Content */}
      <main className="protected-main">
        {children}
      </main>

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>&copy; 2026 SafeVideo. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default ProtectedLayout;
