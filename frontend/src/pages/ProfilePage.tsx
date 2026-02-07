/**
 * ProfilePage – Telegram Integration Settings
 * Users configure API credentials and verify via OTP
 */
import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useTheme } from '../hooks/useTheme';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS } from '../config/api.config';
import {
  ArrowLeft,
  Save,
  Send,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ProfilePage: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Credentials
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [showHash, setShowHash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // OTP
  const [phone, setPhone] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [otpStep, setOtpStep] = useState<'idle' | 'sending' | 'sent' | 'verifying'>('idle');
  const [otp, setOtp] = useState('');
  const [phoneHash, setPhoneHash] = useState('');
  const [otpMsg, setOtpMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await axiosInstance.get(API_ENDPOINTS.TELEGRAM.CONFIG);
      setApiId(res.data.api_id || '');
      setApiHash(res.data.api_hash || '');
      setPhone(res.data.phone_number || '');
      setIsVerified(res.data.is_verified || false);
    } catch {
      // No config yet – that's fine
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await axiosInstance.post(API_ENDPOINTS.TELEGRAM.CONFIG, {
        api_id: apiId,
        api_hash: apiHash,
      });
      setIsVerified(res.data.is_verified);
      setSaveMsg({ type: 'ok', text: 'Credentials saved.' });
    } catch (err: any) {
      setSaveMsg({ type: 'err', text: err.response?.data?.error || 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendOtp = async () => {
    setOtpStep('sending');
    setOtpMsg(null);
    try {
      const res = await axiosInstance.post(API_ENDPOINTS.TELEGRAM.SEND_OTP, {
        phone_number: phone,
      });
      setPhoneHash(res.data.phone_hash);
      setOtpStep('sent');
      setOtpMsg({ type: 'ok', text: 'OTP sent to your Telegram app.' });
    } catch (err: any) {
      setOtpStep('idle');
      setOtpMsg({ type: 'err', text: err.response?.data?.error || 'Failed to send OTP.' });
    }
  };

  const handleVerify = async () => {
    setOtpStep('verifying');
    setOtpMsg(null);
    try {
      await axiosInstance.post(API_ENDPOINTS.TELEGRAM.VERIFY_OTP, {
        otp,
        phone_hash: phoneHash,
      });
      setIsVerified(true);
      setOtpStep('idle');
      setOtpMsg({ type: 'ok', text: 'Phone verified successfully!' });
    } catch (err: any) {
      setOtpStep('sent');
      setOtpMsg({ type: 'err', text: err.response?.data?.error || 'Verification failed.' });
    }
  };

  return (
    <div className="yt-page">
      <Navbar theme={theme} onThemeToggle={toggleTheme} />

      <main className="profile-main">
        <button onClick={() => navigate('/home')} className="org-back-btn">
          <ArrowLeft size={20} />
          Back to Home
        </button>

        <h1 className="profile-heading">Profile &amp; Telegram Settings</h1>

        {/* ─── API Credentials ─── */}
        <section className="profile-card">
          <h2 className="profile-card__title">
            <ShieldCheck size={20} />
            Telegram API Credentials
          </h2>
          <p className="profile-card__desc">
            Get your API ID and Hash from{' '}
            <a href="https://my.telegram.org" target="_blank" rel="noreferrer">
              my.telegram.org
            </a>
          </p>

          <div className="profile-form">
            <label className="profile-label">
              API ID
              <input
                className="profile-input"
                value={apiId}
                onChange={(e) => setApiId(e.target.value)}
                placeholder="e.g. 30674835"
              />
            </label>

            <label className="profile-label">
              API Hash
              <div className="profile-input-group">
                <input
                  className="profile-input"
                  type={showHash ? 'text' : 'password'}
                  value={apiHash}
                  onChange={(e) => setApiHash(e.target.value)}
                  placeholder="e.g. ffaf7c47ef53dcfb..."
                />
                <button
                  type="button"
                  className="profile-input-toggle"
                  onClick={() => setShowHash(!showHash)}
                >
                  {showHash ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <button
              className="btn btn--primary profile-save-btn"
              onClick={handleSave}
              disabled={saving || !apiId || !apiHash}
            >
              {saving ? <Loader2 size={16} className="spin-animation" /> : <Save size={16} />}
              {saving ? 'Saving…' : 'Save Credentials'}
            </button>

            {saveMsg && (
              <div className={`profile-msg profile-msg--${saveMsg.type}`}>
                {saveMsg.type === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                {saveMsg.text}
              </div>
            )}
          </div>
        </section>

        {/* ─── Phone Verification ─── */}
        <section className="profile-card">
          <h2 className="profile-card__title">
            <Send size={20} />
            Phone Verification
            {isVerified && (
              <span className="profile-verified-badge">
                <CheckCircle size={14} /> Verified
              </span>
            )}
          </h2>
          <p className="profile-card__desc">
            Verify your phone number to access Telegram group files.
          </p>

          <div className="profile-form">
            <label className="profile-label">
              Phone Number
              <input
                className="profile-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
                disabled={otpStep === 'sending' || otpStep === 'verifying'}
              />
            </label>

            {otpStep !== 'sent' && otpStep !== 'verifying' && (
              <button
                className="btn btn--primary profile-save-btn"
                onClick={handleSendOtp}
                disabled={!phone || !apiId || !apiHash || otpStep === 'sending'}
              >
                {otpStep === 'sending' ? (
                  <Loader2 size={16} className="spin-animation" />
                ) : (
                  <Send size={16} />
                )}
                {otpStep === 'sending' ? 'Sending…' : 'Send OTP'}
              </button>
            )}

            {(otpStep === 'sent' || otpStep === 'verifying') && (
              <>
                <label className="profile-label">
                  OTP Code
                  <input
                    className="profile-input"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter the code from Telegram"
                    autoFocus
                  />
                </label>
                <button
                  className="btn btn--primary profile-save-btn"
                  onClick={handleVerify}
                  disabled={!otp || otpStep === 'verifying'}
                >
                  {otpStep === 'verifying' ? (
                    <Loader2 size={16} className="spin-animation" />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  {otpStep === 'verifying' ? 'Verifying…' : 'Verify OTP'}
                </button>
              </>
            )}

            {otpMsg && (
              <div className={`profile-msg profile-msg--${otpMsg.type}`}>
                {otpMsg.type === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                {otpMsg.text}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ProfilePage;
