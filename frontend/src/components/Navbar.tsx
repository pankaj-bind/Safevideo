/**
 * Navbar Component
 * Minimal, professional navigation bar - blends with dark graphite theme
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sun, Moon, LogOut, LogIn } from 'lucide-react';

// Minimal Play Logo - Clean geometric design
const PlayLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ width: 28, height: 28 }}
  >
    <rect width="32" height="32" rx="8" fill="#3ea6ff" />
    <path
      d="M12 10L23 16L12 22V10Z"
      fill="white"
    />
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
      <div className="navbar__container">
        {/* Brand */}
        <Link to="/" className="navbar__brand">
          <PlayLogo className="navbar__logo" />
          <span className="navbar__title">SafeVideo</span>
        </Link>

        {/* Actions */}
        <div className="navbar__actions">
          {/* Theme Toggle */}
          <button
            onClick={onThemeToggle}
            className="btn btn--ghost btn--icon"
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Auth */}
          {isAuthenticated ? (
            <>
              <span className="navbar__user">
                <strong>{user?.username}</strong>
              </span>
              <button onClick={handleLogout} className="btn btn--ghost">
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <button onClick={handleLogin} className="btn btn--primary">
              <LogIn size={16} />
              <span>Sign in</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
