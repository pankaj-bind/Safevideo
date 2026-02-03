/**
 * Dashboard Page Component
 * Protected page displaying user data from backend
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS } from '../config/api.config';
import type { DashboardResponse, DashboardData } from '../types/api.types';

const DashboardPage: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  
  const { logout } = useAuth();

  /**
   * Fetch dashboard data from protected endpoint
   * Token refresh is handled automatically by axios interceptor
   */
  const fetchDashboardData = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError('');
      const response = await axiosInstance.get<DashboardResponse>(API_ENDPOINTS.DASHBOARD);
      
      if (response.data.success && response.data.data) {
        setDashboardData(response.data.data);
      }
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error('Dashboard fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []); // Empty dependency array - fetch only once on mount

  const handleLogout = async (): Promise<void> => {
    await logout();
  };

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <p>{error}</p>
        <button onClick={fetchDashboardData} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header-section">
        <h2>Dashboard</h2>
        <button onClick={handleLogout} className="logout-button">
          Sign Out
        </button>
      </div>

      {dashboardData && (
        <div className="dashboard-content">
          {/* User Profile Card */}
          <div className="dashboard-card">
            <h3>Profile Information</h3>
            <div className="profile-info">
              <div className="info-row">
                <span className="info-label">Username:</span>
                <span className="info-value">{dashboardData.user.username}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Email:</span>
                <span className="info-value">{dashboardData.user.email}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Member since:</span>
                <span className="info-value">
                  {new Date(dashboardData.user.date_joined).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Permissions Card */}
          <div className="dashboard-card">
            <h3>Permissions</h3>
            {dashboardData.permissions.length > 0 ? (
              <ul className="permissions-list">
                {dashboardData.permissions.map((permission) => (
                  <li key={permission}>{permission}</li>
                ))}
              </ul>
            ) : (
              <p className="no-data">No special permissions</p>
            )}
          </div>

          {/* Groups Card */}
          <div className="dashboard-card">
            <h3>Groups</h3>
            {dashboardData.groups.length > 0 ? (
              <ul className="groups-list">
                {dashboardData.groups.map((group) => (
                  <li key={group}>{group}</li>
                ))}
              </ul>
            ) : (
              <p className="no-data">No group memberships</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
