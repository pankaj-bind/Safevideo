/**
 * SchedulePage Component
 * Full daily schedule planner — visual timeline, intuitive CRUD,
 * browser notifications 2 min before each event.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../context/ToastContext';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit2,
  Clock,
  CheckCircle,
  Circle,
  Calendar,
  X,
  Bell,
  BellOff,
  Copy,
  ArrowLeft,
  GripVertical,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES & HELPERS
   ═══════════════════════════════════════════════════════════════════════ */
interface ScheduleItem {
  id: string;
  time: string;        // "HH:mm"
  endTime?: string;
  subject: string;
  description?: string;
  status: 'upcoming' | 'current' | 'completed';
}

const STORAGE_PREFIX = 'sv-schedule:';
const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const to12h = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${(h % 12 || 12)}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const sortByTime = (a: ScheduleItem, b: ScheduleItem) => a.time.localeCompare(b.time);

const loadSchedule = (dateKey: string): ScheduleItem[] => {
  try { const raw = localStorage.getItem(STORAGE_PREFIX + dateKey); if (raw) return (JSON.parse(raw) as ScheduleItem[]).sort(sortByTime); } catch { /* */ }
  return [];
};

const saveSchedule = (dateKey: string, items: ScheduleItem[]) => {
  localStorage.setItem(STORAGE_PREFIX + dateKey, JSON.stringify(items.sort(sortByTime)));
};

const formatDateLabel = (d: Date) => {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString('en-US', opts);
};

const isToday = (d: Date) => {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

const timeToMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/* ═══════════════════════════════════════════════════════════════════════════
   ADD / EDIT MODAL
   ═══════════════════════════════════════════════════════════════════════ */
const ItemModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: ScheduleItem) => void;
  initial?: ScheduleItem | null;
  title: string;
}> = ({ isOpen, onClose, onSave, initial, title }) => {
  const [time, setTime] = useState(initial?.time ?? '09:00');
  const [endTime, setEndTime] = useState(initial?.endTime ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  useEffect(() => {
    setTime(initial?.time ?? '09:00');
    setEndTime(initial?.endTime ?? '');
    setSubject(initial?.subject ?? '');
    setDescription(initial?.description ?? '');
  }, [initial, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    onSave({ id: initial?.id ?? Date.now().toString(), time, endTime: endTime || undefined, subject: subject.trim(), description: description.trim() || undefined, status: initial?.status ?? 'upcoming' });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="modal-close"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="sched-form-row">
            <div className="form-group">
              <label htmlFor="sched-start">Start Time</label>
              <input id="sched-start" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="sched-end">End Time <span className="form-hint">(optional)</span></label>
              <input id="sched-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="sched-subject">What are you studying?</label>
            <input id="sched-subject" type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. DSA — Arrays & Hashing" autoFocus required />
          </div>
          <div className="form-group">
            <label htmlFor="sched-desc">Notes <span className="form-hint">(optional)</span></label>
            <textarea id="sched-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Links, chapters, goals…" rows={3} />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn modal-btn--secondary">Cancel</button>
            <button type="submit" className="modal-btn modal-btn--primary">{initial ? 'Update' : 'Add to Schedule'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN SCHEDULE PAGE
   ═══════════════════════════════════════════════════════════════════════ */
const SchedulePage: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { addToast } = useToast();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateKey = toDateKey(selectedDate);
  const [schedule, setSchedule] = useState<ScheduleItem[]>(() => loadSchedule(toDateKey(new Date())));
  const [modal, setModal] = useState<{ open: boolean; item: ScheduleItem | null }>({ open: false, item: null });
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const notifiedRef = useRef<Set<string>>(new Set());

  // ── Load schedule when date changes ──
  useEffect(() => { setSchedule(loadSchedule(dateKey)); notifiedRef.current = new Set(); }, [dateKey]);

  // ── Auto-update status for today ──
  useEffect(() => {
    if (!isToday(selectedDate)) return;
    const tick = () => {
      const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
      setSchedule((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          if (item.status === 'completed') return item;
          const start = timeToMinutes(item.time);
          const end = item.endTime ? timeToMinutes(item.endTime) : start + 60;
          let ns: ScheduleItem['status'] = 'upcoming';
          if (nowMins >= end) ns = 'completed';
          else if (nowMins >= start) ns = 'current';
          if (ns !== item.status) { changed = true; return { ...item, status: ns }; }
          return item;
        });
        if (changed) saveSchedule(dateKey, next);
        return changed ? next : prev;
      });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [dateKey, selectedDate]);

  // ── Browser notifications 2 min before ──
  useEffect(() => {
    if (!notificationsEnabled || !isToday(selectedDate)) return;
    const check = () => {
      const now = new Date();
      const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      schedule.forEach((item) => {
        if (item.status === 'completed') return;
        const eventSecs = timeToMinutes(item.time) * 60; // convert min → sec
        const diffSecs = eventSecs - nowSecs;
        // Fire when event is within 2 minutes (120s) and hasn't started yet
        if (diffSecs > 0 && diffSecs <= 120 && !notifiedRef.current.has(item.id)) {
          notifiedRef.current.add(item.id);
          const minsLeft = Math.ceil(diffSecs / 60);
          new Notification('📅 SafeVideo Schedule', { body: `Starting in ${minsLeft} min: ${item.subject}`, icon: '/favicon.ico', tag: item.id });
          addToast(`Starting in ${minsLeft} min: ${item.subject}`, 'info');
        }
      });
    };
    check();
    const id = setInterval(check, 10_000); // Check every 10s for precision
    return () => clearInterval(id);
  }, [schedule, notificationsEnabled, selectedDate, addToast]);

  const persist = useCallback((next: ScheduleItem[]) => { const s = [...next].sort(sortByTime); setSchedule(s); saveSchedule(dateKey, s); }, [dateKey]);

  // ── CRUD ──
  const handleSave = (item: ScheduleItem) => {
    const exists = schedule.find((s) => s.id === item.id);
    persist(exists ? schedule.map((s) => s.id === item.id ? item : s) : [...schedule, item]);
    addToast(exists ? 'Updated' : 'Added to schedule', 'success');
    setModal({ open: false, item: null });
  };

  const handleDelete = (id: string) => { persist(schedule.filter((s) => s.id !== id)); addToast('Removed', 'info'); };

  const cycleStatus = (id: string) => {
    const order: ScheduleItem['status'][] = ['upcoming', 'current', 'completed'];
    persist(schedule.map((s) => { if (s.id !== id) return s; return { ...s, status: order[(order.indexOf(s.status) + 1) % 3] }; }));
  };

  const copyToTomorrow = () => {
    const tmrw = new Date(selectedDate); tmrw.setDate(tmrw.getDate() + 1);
    const key = toDateKey(tmrw);
    const existing = loadSchedule(key);
    const copied = schedule.map((s) => ({ ...s, id: Date.now().toString() + Math.random().toString(36).slice(2), status: 'upcoming' as const }));
    saveSchedule(key, [...existing, ...copied]);
    addToast(`Copied ${copied.length} items to tomorrow`, 'success');
  };

  const clearAll = () => { persist([]); addToast('Schedule cleared', 'info'); };

  // ── Navigation ──
  const goDay = (n: number) => { const d = new Date(selectedDate); d.setDate(d.getDate() + n); setSelectedDate(d); };
  const goToday = () => setSelectedDate(new Date());

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') { addToast('Notifications not supported', 'warning'); return; }
    const perm = await Notification.requestPermission();
    setNotificationsEnabled(perm === 'granted');
    addToast(perm === 'granted' ? 'Notifications enabled! 2 min reminders active.' : 'Permission denied', perm === 'granted' ? 'success' : 'warning');
  };

  // ── Computed ──
  const completedCount = schedule.filter((s) => s.status === 'completed').length;
  const progressPct = schedule.length ? Math.round((completedCount / schedule.length) * 100) : 0;

  const weekDates: Date[] = [];
  const startOfWeek = new Date(selectedDate);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  for (let i = 0; i < 7; i++) { const d = new Date(startOfWeek); d.setDate(d.getDate() + i); weekDates.push(d); }

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="home-page">
      <Navbar theme={theme} onThemeToggle={toggleTheme} />

      <main className="sp-main" id="main-content">
        <div className="sp-container">

          {/* ── Back link ── */}
          <Link to="/home" className="sp-back"><ArrowLeft size={16} /> Back to Home</Link>

          {/* ── Header ── */}
          <div className="sp-header">
            <div className="sp-header-left">
              <h1 className="sp-title">
                <Calendar size={22} className="sp-title-icon" />
                {isToday(selectedDate) ? "Today's Plan" : formatDateLabel(selectedDate)}
              </h1>
              {isToday(selectedDate) && <p className="sp-subtitle">{formatDateLabel(selectedDate)}</p>}
            </div>
            <div className="sp-header-actions">
              <button className="sp-icon-btn" onClick={requestNotifications} title={notificationsEnabled ? 'Notifications on' : 'Enable notifications'}>
                {notificationsEnabled ? <Bell size={18} /> : <BellOff size={18} />}
              </button>
              {schedule.length > 0 && (
                <button className="sp-icon-btn" onClick={copyToTomorrow} title="Copy to tomorrow"><Copy size={18} /></button>
              )}
              <button className="sp-add-btn" onClick={() => setModal({ open: true, item: null })}>
                <Plus size={18} /> Add Event
              </button>
            </div>
          </div>

          {/* ── Week Strip ── */}
          <div className="sp-week">
            <button className="sp-week-arrow" onClick={() => goDay(-7)}><ChevronLeft size={18} /></button>
            <div className="sp-week-days">
              {weekDates.map((d, i) => {
                const active = toDateKey(d) === dateKey;
                const today = isToday(d);
                const hasItems = loadSchedule(toDateKey(d)).length > 0;
                return (
                  <button key={toDateKey(d)} className={`sp-day${active ? ' sp-day--active' : ''}${today && !active ? ' sp-day--today' : ''}`} onClick={() => setSelectedDate(new Date(d))}>
                    <span className="sp-day-label">{dayLabels[i]}</span>
                    <span className="sp-day-num">{d.getDate()}</span>
                    {hasItems && <span className="sp-day-dot" />}
                  </button>
                );
              })}
            </div>
            <button className="sp-week-arrow" onClick={() => goDay(7)}><ChevronRight size={18} /></button>
            {!isToday(selectedDate) && <button className="sp-today-btn" onClick={goToday}>Today</button>}
          </div>

          {/* ── Progress ── */}
          {schedule.length > 0 && (
            <div className="sp-progress">
              <div className="sp-progress-track">
                <div className="sp-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="sp-progress-label">
                {completedCount} of {schedule.length} done
                {progressPct === 100 && ' 🎉'}
              </span>
            </div>
          )}

          {/* ── Timeline ── */}
          <div className="sp-timeline">
            {schedule.length === 0 ? (
              <div className="sp-empty">
                <div className="sp-empty-icon"><Calendar size={44} /></div>
                <h3>Nothing planned</h3>
                <p>Add your first event to start organizing your day</p>
                <button className="sp-add-btn" onClick={() => setModal({ open: true, item: null })} style={{ marginTop: '1rem' }}>
                  <Plus size={18} /> Add Event
                </button>
              </div>
            ) : (
              schedule.map((item, idx) => (
                <div key={item.id} className={`sp-event sp-event--${item.status}`}>
                  {/* Timeline connector */}
                  <div className="sp-event-rail">
                    <button className="sp-event-dot" onClick={() => cycleStatus(item.id)} title="Click to change status">
                      {item.status === 'completed' ? <CheckCircle size={18} /> : item.status === 'current' ? <Clock size={18} /> : <Circle size={18} />}
                    </button>
                    {idx < schedule.length - 1 && <div className="sp-event-line" />}
                  </div>

                  {/* Content */}
                  <div className="sp-event-card">
                    <div className="sp-event-top">
                      <span className="sp-event-time">
                        {to12h(item.time)}
                        {item.endTime && <span className="sp-event-endtime"> — {to12h(item.endTime)}</span>}
                      </span>
                      <span className={`sp-event-badge sp-event-badge--${item.status}`}>
                        {item.status === 'completed' ? 'Done' : item.status === 'current' ? 'Now' : 'Upcoming'}
                      </span>
                    </div>
                    <h4 className="sp-event-subject">{item.subject}</h4>
                    {item.description && <p className="sp-event-desc">{item.description}</p>}
                    <div className="sp-event-actions">
                      <button className="sp-event-btn" onClick={() => setModal({ open: true, item })} title="Edit"><Edit2 size={13} /> Edit</button>
                      <button className="sp-event-btn sp-event-btn--danger" onClick={() => handleDelete(item.id)} title="Delete"><Trash2 size={13} /> Remove</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ── Footer action ── */}
          {schedule.length > 0 && (
            <div className="sp-footer">
              <button className="sp-clear-btn" onClick={clearAll}>Clear all events</button>
            </div>
          )}
        </div>
      </main>

      <ItemModal isOpen={modal.open} onClose={() => setModal({ open: false, item: null })} onSave={handleSave} initial={modal.item} title={modal.item ? 'Edit Event' : 'New Event'} />
    </div>
  );
};

export default SchedulePage;
