/**
 * ChaptersPage Component
 * Shows all chapters in an organization as cards.
 * Clicking a chapter opens its videos page.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../context/ToastContext';
import { slugify } from '../utils/slugify';
import { stringToColor } from '../utils/colors';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS } from '../config/api.config';
import {
  ArrowLeft,
  Plus,
  BookOpen,
  Trash2,
  Edit2,
  Video,
  X,
  Search,
  Loader2,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================
interface Chapter {
  id: number;
  name: string;
  video_count?: number;
  created_at: string;
  updated_at: string;
}

interface Organization {
  id: number;
  name: string;
  slug?: string;
  logo_url?: string | null;
}

interface Category {
  id: number;
  name: string;
  slug?: string;
}

// =============================================================================
// CHAPTER MODAL
// =============================================================================
const ChapterModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  initialValue?: string;
  title: string;
}> = ({ isOpen, onClose, onSave, initialValue = '', title }) => {
  const [name, setName] = useState(initialValue);
  useEffect(() => { setName(initialValue); }, [initialValue, isOpen]);
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) { onSave(name.trim()); setName(''); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="modal-close"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="chapter-name">Chapter Name</label>
            <input
              id="chapter-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chapter 1 — Boolean Algebra"
              autoFocus
              required
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn modal-btn--secondary">Cancel</button>
            <button type="submit" className="modal-btn modal-btn--primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const ChaptersPage: React.FC = () => {
  const { categorySlug, organizationSlug } = useParams<{ categorySlug: string; organizationSlug: string }>();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { addToast } = useToast();

  const [organization, setOrganization] = useState<Organization>({ id: 0, name: '' });
  const [category, setCategory] = useState<Category>({ id: 0, name: '' });
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [chapterModal, setChapterModal] = useState<{ isOpen: boolean; editId?: number; initialName?: string }>({ isOpen: false });
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, [categorySlug, organizationSlug]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [categoriesRes, orgsRes] = await Promise.all([
        axiosInstance.get(API_ENDPOINTS.VAULT.CATEGORIES),
        axiosInstance.get(API_ENDPOINTS.VAULT.ORGANIZATIONS),
      ]);

      const foundCategory = categoriesRes.data.find(
        (cat: any) => (cat.slug || slugify(cat.name)) === categorySlug
      );
      const foundOrg = orgsRes.data.find(
        (org: any) => (org.slug || slugify(org.name)) === organizationSlug
      );

      if (!foundCategory || !foundOrg) {
        navigate('/home');
        return;
      }

      setCategory(foundCategory);
      setOrganization(foundOrg);

      const chaptersRes = await axiosInstance.get(`${API_ENDPOINTS.VAULT.CHAPTERS}?organization=${foundOrg.id}`);
      setChapters(chaptersRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      navigate('/home');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchChapters = async () => {
    if (!organization.id) return;
    try {
      const res = await axiosInstance.get(`${API_ENDPOINTS.VAULT.CHAPTERS}?organization=${organization.id}`);
      setChapters(res.data);
    } catch (error) {
      console.error('Failed to fetch chapters:', error);
    }
  };

  // ── Chapter CRUD ──
  const handleCreateChapter = async (name: string) => {
    try {
      await axiosInstance.post(API_ENDPOINTS.VAULT.CHAPTERS, {
        name,
        organization: organization.id,
      });
      await fetchChapters();
      setChapterModal({ isOpen: false });
      addToast('Chapter created', 'success');
    } catch (error: any) {
      const msg = error.response?.data?.non_field_errors?.[0]
        || error.response?.data?.name?.[0]
        || 'Failed to create chapter';
      addToast(msg, 'error');
    }
  };

  const handleUpdateChapter = async (name: string) => {
    if (!chapterModal.editId) return;
    try {
      await axiosInstance.patch(`${API_ENDPOINTS.VAULT.CHAPTERS}${chapterModal.editId}/`, {
        name,
        organization: organization.id,
      });
      await fetchChapters();
      setChapterModal({ isOpen: false });
      addToast('Chapter updated', 'success');
    } catch (error: any) {
      const msg = error.response?.data?.non_field_errors?.[0]
        || error.response?.data?.name?.[0]
        || 'Failed to update chapter';
      addToast(msg, 'error');
    }
  };

  const handleDeleteChapter = async (id: number) => {
    try {
      await axiosInstance.delete(`${API_ENDPOINTS.VAULT.CHAPTERS}${id}/`);
      await fetchChapters();
      addToast('Chapter deleted', 'success');
    } catch {
      addToast('Failed to delete chapter', 'error');
    }
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    handleDeleteChapter(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const filteredChapters = chapters.filter((ch) =>
    ch.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="yt-page">
        <Navbar theme={theme} onThemeToggle={toggleTheme} />
        <div className="org-videos-loading">
          <Loader2 size={48} className="spin-animation" />
          <p>Loading chapters...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yt-page">
      <Navbar theme={theme} onThemeToggle={toggleTheme} />

      <main className="org-videos-main">
        {/* Breadcrumb */}
        <nav className="org-breadcrumb">
          <span className="org-breadcrumb-item" onClick={() => navigate('/home')}>{category.name}</span>
          <span className="org-breadcrumb-sep">›</span>
          <span className="org-breadcrumb-current">{organization.name}</span>
        </nav>

        {/* Header */}
        <div className="org-videos-header">
          <div className="org-header-left">
            <button onClick={() => navigate('/home')} className="org-back-btn">
              <ArrowLeft size={20} />
              <span className="org-back-btn-text">Back</span>
            </button>

            <div className="org-info-header">
              {organization.logo_url && (
                <img src={organization.logo_url} alt="" className="org-logo-large" />
              )}
              <div className="org-info-text">
                <h1 className="org-name-large">{organization.name}</h1>
                <p className="org-video-count">{chapters.length} chapter{chapters.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>

          <div className="org-header-actions">
            <button
              className="org-upload-btn"
              onClick={() => setChapterModal({ isOpen: true })}
            >
              <Plus size={20} />
              <span className="org-btn-text">New Chapter</span>
            </button>
          </div>
        </div>

        {/* Search */}
        {chapters.length > 0 && (
          <div className="home-toolbar" style={{ marginBottom: '1rem' }}>
            <div className="home-search">
              <Search size={18} className="home-search-icon" />
              <input
                type="text"
                placeholder="Search chapters…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="home-search-input"
              />
              {searchQuery && (
                <button className="home-search-clear" onClick={() => setSearchQuery('')}><X size={14} /></button>
              )}
            </div>
          </div>
        )}

        {/* Chapters Grid */}
        {filteredChapters.length === 0 ? (
          <div className="org-videos-empty">
            <BookOpen size={64} />
            <h2>{searchQuery ? 'No chapters found' : 'No chapters yet'}</h2>
            <p>{searchQuery ? `Nothing matches "${searchQuery}"` : 'Create your first chapter to organize videos'}</p>
            {!searchQuery && (
              <button className="org-upload-btn-large" onClick={() => setChapterModal({ isOpen: true })}>
                <Plus size={20} />
                Create Chapter
              </button>
            )}
          </div>
        ) : (
          <div className="chapters-grid">
            {filteredChapters.map((chapter) => (
              <div
                key={chapter.id}
                className="chapter-card"
                style={{ '--chapter-color': stringToColor(chapter.name) } as React.CSSProperties}
                onClick={() =>
                  navigate(
                    `/${categorySlug}/${organizationSlug}/${slugify(chapter.name)}`,
                    { state: { chapterId: chapter.id } }
                  )
                }
              >
                <div className="chapter-card-accent" />
                <div className="chapter-card-body">
                  <div className="chapter-card-icon" style={{ color: 'var(--chapter-color)' }}>
                    <BookOpen size={28} />
                  </div>
                  <div className="chapter-card-info">
                    <h3 className="chapter-card-name">{chapter.name}</h3>
                    <span className="chapter-card-count">
                      <Video size={14} />
                      {chapter.video_count ?? 0} video{(chapter.video_count ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="chapter-card-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setChapterModal({ isOpen: true, editId: chapter.id, initialName: chapter.name });
                    }}
                    className="org-mini-btn"
                    title="Edit"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm({ id: chapter.id, name: chapter.name });
                    }}
                    className="org-mini-btn org-mini-btn--danger"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content modal-content--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete Chapter</h3>
              <button onClick={() => setDeleteConfirm(null)} className="modal-close"><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
                Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{deleteConfirm.name}</strong>?
                {' '}All videos inside will also be deleted. This cannot be undone.
              </p>
            </div>
            <div className="modal-actions">
              <button onClick={() => setDeleteConfirm(null)} className="modal-btn modal-btn--secondary">Cancel</button>
              <button onClick={confirmDelete} className="modal-btn modal-btn--danger">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Chapter Modal */}
      <ChapterModal
        isOpen={chapterModal.isOpen}
        onClose={() => setChapterModal({ isOpen: false })}
        onSave={chapterModal.editId ? handleUpdateChapter : handleCreateChapter}
        initialValue={chapterModal.initialName}
        title={chapterModal.editId ? 'Edit Chapter' : 'New Chapter'}
      />
    </div>
  );
};

export default ChaptersPage;
