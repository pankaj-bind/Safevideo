/**
 * LandingPage Component
 * Welcome page for non-authenticated users
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import { 
  Shield, 
  Cloud, 
  Zap, 
  Lock,
  CheckCircle 
} from 'lucide-react';

// SafeVideo Shield Logo
const SafeVideoShield: React.FC = () => (
  <div className="landing-shield">
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="landing-shield-svg"
    >
      <defs>
        <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <path
        d="M40 8L12 20V36C12 54.78 23.84 72.12 40 76C56.16 72.12 68 54.78 68 36V20L40 8Z"
        fill="url(#shieldGradient)"
      />
      <path
        d="M35 42L30 37L27 40L35 48L53 30L50 27L35 42Z"
        fill="white"
      />
    </svg>
  </div>
);

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('sv-theme');
    return stored === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sv-theme', theme);
  }, [theme]);

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleThemeToggle = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const features = [
    { icon: Shield, text: 'Secure Video Storage' },
    { icon: Cloud, text: 'Google Drive Integration' },
    { icon: Zap, text: 'Lightning-Fast Processing' },
    { icon: Lock, text: 'End-to-End Encryption' },
  ];

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="landing-page">
      <Navbar theme={theme} onThemeToggle={handleThemeToggle} />
      
      <main className="landing-main">
        <div className="landing-content">
          {/* Shield Icon */}
          <SafeVideoShield />

          {/* Hero Text */}
          <h1 className="landing-title">
            Welcome to <span className="landing-highlight">SafeVideo</span>
          </h1>
          
          <p className="landing-description">
            Your secure video storage platform with seamless Google Drive integration.
            Upload, process, and stream your videos with enterprise-grade security
            and lightning-fast performance.
          </p>

          {/* CTA Buttons */}
          <div className="landing-cta">
            <button 
              onClick={() => navigate('/login')} 
              className="landing-btn landing-btn--primary"
            >
              Log in to your account
            </button>
            <button 
              onClick={() => navigate('/signup')} 
              className="landing-btn landing-btn--secondary"
            >
              Create free account
            </button>
          </div>

          {/* Features */}
          <div className="landing-features">
            {features.map((feature, index) => (
              <div key={index} className="landing-feature">
                <CheckCircle size={18} className="landing-feature-icon" />
                <span>{feature.text}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default LandingPage;
