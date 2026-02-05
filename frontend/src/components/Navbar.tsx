/**
 * Navbar Component
 * Global navigation bar with branding, theme toggle, and auth controls
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sun, Moon, LogOut, LogIn } from 'lucide-react';

// SafeVideo Logo SVG Component
const SafeVideoLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3b82f6" />
        <stop offset="100%" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>
    <rect width="48" height="48" rx="12" fill="url(#logoGradient)" />
    <path
      d="M18 16C18 14.8954 18.8954 14 20 14H28C29.1046 14 30 14.8954 30 16V32C30 33.1046 29.1046 34 28 34H20C18.8954 34 18 33.1046 18 32V16Z"
      fill="white"
      fillOpacity="0.3"
    />
    <path
      d="M20 18L32 24L20 30V18Z"
      fill="white"
    />
    <circle cx="16" cy="24" r="3" fill="white" fillOpacity="0.6" />
  </svg>
);

interface NavbarProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ theme, onThemeToggle }) => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
  };

  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="navbar-container">
        {/* Left: Brand */}
        <Link to="/" className="navbar-brand">
          <SafeVideoLogo className="navbar-logo" />
          <div className="navbar-brand-text">
            <span className="navbar-title">SafeVideo</span>
            <span className="navbar-subtitle">Secure Video Platform</span>
          </div>
        </Link>

        {/* Right: Actions */}
        <div className="navbar-actions">
          {/* Theme Toggle */}
          <button
            onClick={onThemeToggle}
            className="navbar-btn navbar-btn--icon"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* Auth Button */}
          {isAuthenticated ? (
            <>
              <span className="navbar-user">
                Welcome, <strong>{user?.username}</strong>
              </span>
              <button onClick={handleLogout} className="navbar-btn navbar-btn--danger">
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <button onClick={handleLogin} className="navbar-btn navbar-btn--primary">
              <LogIn size={18} />
              <span>Log in</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
