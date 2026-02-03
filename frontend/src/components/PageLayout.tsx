/**
 * PageLayout - Consistent layout wrapper for all authenticated pages
 * Includes header with user info and logout
 */
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Shield } from 'lucide-react';
import Breadcrumb from './Breadcrumb';
import type { BreadcrumbData } from './Breadcrumb';

// ============================================================================
// TYPES
// ============================================================================

export interface PageLayoutProps {
  children: React.ReactNode;
  title: string;
  breadcrumb?: BreadcrumbData;
  currentLevel?: 'dashboard' | 'vault' | 'subject' | 'chapter';
  isLoading?: boolean;
  actions?: React.ReactNode;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  title,
  breadcrumb,
  currentLevel = 'dashboard',
  isLoading = false,
  actions,
}) => {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      {/* Modern Header */}
      <header className="bg-[#1a1a1a] border-b border-[#2d2d2d] sticky top-0 z-50 backdrop-blur-sm bg-opacity-95">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Brand */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-semibold text-white">SafeVideo</span>
            </div>

            {/* User Section */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <p className="text-sm font-medium text-white">
                  {user?.first_name || user?.username || 'User'}
                </p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#262626] transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        {currentLevel !== 'dashboard' && breadcrumb && (
          <div className="mb-6">
            <Breadcrumb 
              data={breadcrumb} 
              currentLevel={currentLevel}
              currentTitle={title}
            />
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">
              {title}
            </h1>
          </div>
          {actions && (
            <div className="flex items-center gap-3">
              {actions}
            </div>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
};

export default PageLayout;
