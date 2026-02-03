/**
 * ChapterListPage - Shows chapters within a subject
 * Third level in the hierarchy: Dashboard > Vault > Subject > [Chapters]
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS } from '../config/api.config';
import PageLayout from '../components/PageLayout';
import ResourceGrid from '../components/ResourceGrid';
import ResourceModal from '../components/ResourceModal';
import type { FieldConfig } from '../components/ResourceModal';
import type { Subject, Chapter, ChapterCreate, BreadcrumbItem } from '../types/api.types';
import { AlertCircle } from 'lucide-react';

// ============================================================================
// MODAL FIELD CONFIGURATION
// ============================================================================

const chapterFields: FieldConfig[] = [
  {
    name: 'title',
    label: 'Chapter Name',
    type: 'text',
    required: true,
    placeholder: 'e.g., Boolean Algebra, Arrays & Pointers',
  },
  {
    name: 'description',
    label: 'Description',
    type: 'textarea',
    placeholder: 'Describe what this chapter covers...',
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ChapterListPage: React.FC = () => {
  const navigate = useNavigate();
  const { subjectId } = useParams<{ subjectId: string }>();
  
  // State
  const [subject, setSubject] = useState<Subject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<Chapter | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchData = useCallback(async () => {
    if (!subjectId) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch subject details (which includes vault info) and chapters
      const [subjectRes, chaptersRes] = await Promise.all([
        axiosInstance.get(API_ENDPOINTS.SUBJECTS.DETAIL(parseInt(subjectId))),
        axiosInstance.get(API_ENDPOINTS.CHAPTERS.BY_SUBJECT(parseInt(subjectId))),
      ]);
      
      setSubject(subjectRes.data);
      setChapters(chaptersRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load chapters. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleChapterClick = (chapter: Chapter) => {
    navigate(`/chapter/${chapter.id}`);
  };

  const handleAdd = () => {
    setEditingChapter(null);
    setIsModalOpen(true);
  };

  const handleEdit = (chapter: Chapter) => {
    setEditingChapter(chapter);
    setIsModalOpen(true);
  };

  const handleDelete = (chapter: Chapter) => {
    setDeleteTarget(chapter);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      setIsDeleting(true);
      await axiosInstance.delete(API_ENDPOINTS.CHAPTERS.DELETE(deleteTarget.id));
      setChapters((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete chapter:', err);
      setError('Failed to delete chapter. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (data: Record<string, string>) => {
    if (!subjectId) return;
    
    try {
      setIsSubmitting(true);
      
      const payload: ChapterCreate = {
        subject: parseInt(subjectId),
        title: data.title,
        description: data.description || '',
      };

      if (editingChapter) {
        // Update existing chapter
        const response = await axiosInstance.patch(
          API_ENDPOINTS.CHAPTERS.UPDATE(editingChapter.id),
          payload
        );
        setChapters((prev) =>
          prev.map((c) => (c.id === editingChapter.id ? response.data : c))
        );
      } else {
        // Create new chapter
        const response = await axiosInstance.post(API_ENDPOINTS.CHAPTERS.CREATE, payload);
        setChapters((prev) => [...prev, response.data]);
      }

      setIsModalOpen(false);
      setEditingChapter(null);
    } catch (err) {
      console.error('Failed to save chapter:', err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // TRANSFORM CHAPTERS FOR GRID
  // ============================================================================

  const gridItems = chapters.map((chapter) => ({
    ...chapter,
    count: chapter.video_count || 0,
    countLabel: (chapter.video_count || 0) === 1 ? 'video' : 'videos',
  }));

  // ============================================================================
  // BREADCRUMB DATA
  // ============================================================================

  const breadcrumbData = subject
    ? {
        vault: { id: subject.vault, title: subject.vault_title || 'Vault' } as BreadcrumbItem,
        subject: { id: subject.id, title: subject.title } as BreadcrumbItem,
      }
    : undefined;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <PageLayout 
      title={subject?.title || 'Loading...'}
      breadcrumb={breadcrumbData}
      currentLevel="subject"
      isLoading={isLoading && !subject}
    >
      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Chapter Grid */}
      <ResourceGrid
        items={gridItems}
        isLoading={isLoading}
        resourceType="chapter"
        onItemClick={handleChapterClick}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        addLabel="Add Chapter"
      />

      {/* Create/Edit Modal */}
      <ResourceModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingChapter(null);
        }}
        onSubmit={handleSubmit}
        title={editingChapter ? 'Edit Chapter' : 'Add New Chapter'}
        fields={chapterFields}
        initialData={
          editingChapter
            ? {
                title: editingChapter.title,
                description: editingChapter.description,
              }
            : {}
        }
        submitLabel={editingChapter ? 'Save Changes' : 'Add Chapter'}
        isLoading={isSubmitting}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Delete Chapter?
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>"{deleteTarget.title}"</strong>? 
              This will permanently delete all videos inside it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default ChapterListPage;
