/**
 * SubjectListPage - Shows subjects within a vault
 * Second level in the hierarchy: Dashboard > Vault > [Subjects]
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS } from '../config/api.config';
import PageLayout from '../components/PageLayout';
import ResourceGrid from '../components/ResourceGrid';
import ResourceModal from '../components/ResourceModal';
import type { FieldConfig } from '../components/ResourceModal';
import type { Vault, Subject, SubjectCreate } from '../types/api.types';
import { AlertCircle } from 'lucide-react';

// ============================================================================
// MODAL FIELD CONFIGURATION
// ============================================================================

const subjectFields: FieldConfig[] = [
  {
    name: 'title',
    label: 'Subject Name',
    type: 'text',
    required: true,
    placeholder: 'e.g., Digital Logic, Data Structures',
  },
  {
    name: 'description',
    label: 'Description',
    type: 'textarea',
    placeholder: 'Describe what this subject covers...',
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const SubjectListPage: React.FC = () => {
  const navigate = useNavigate();
  const { vaultId } = useParams<{ vaultId: string }>();
  
  // State
  const [vault, setVault] = useState<Vault | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchData = useCallback(async () => {
    if (!vaultId) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch vault details and subjects in parallel
      const [vaultRes, subjectsRes] = await Promise.all([
        axiosInstance.get(API_ENDPOINTS.VAULTS.DETAIL(parseInt(vaultId))),
        axiosInstance.get(API_ENDPOINTS.SUBJECTS.BY_VAULT(parseInt(vaultId))),
      ]);
      
      setVault(vaultRes.data);
      setSubjects(subjectsRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load subjects. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [vaultId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSubjectClick = (subject: Subject) => {
    navigate(`/subject/${subject.id}`);
  };

  const handleAdd = () => {
    setEditingSubject(null);
    setIsModalOpen(true);
  };

  const handleEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setIsModalOpen(true);
  };

  const handleDelete = (subject: Subject) => {
    setDeleteTarget(subject);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      setIsDeleting(true);
      await axiosInstance.delete(API_ENDPOINTS.SUBJECTS.DELETE(deleteTarget.id));
      setSubjects((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete subject:', err);
      setError('Failed to delete subject. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (data: Record<string, string>) => {
    if (!vaultId) return;
    
    try {
      setIsSubmitting(true);
      
      const payload: SubjectCreate = {
        vault: parseInt(vaultId),
        title: data.title,
        description: data.description || '',
      };

      if (editingSubject) {
        // Update existing subject
        const response = await axiosInstance.patch(
          API_ENDPOINTS.SUBJECTS.UPDATE(editingSubject.id),
          payload
        );
        setSubjects((prev) =>
          prev.map((s) => (s.id === editingSubject.id ? response.data : s))
        );
      } else {
        // Create new subject
        const response = await axiosInstance.post(API_ENDPOINTS.SUBJECTS.CREATE, payload);
        setSubjects((prev) => [...prev, response.data]);
      }

      setIsModalOpen(false);
      setEditingSubject(null);
    } catch (err) {
      console.error('Failed to save subject:', err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // TRANSFORM SUBJECTS FOR GRID
  // ============================================================================

  const gridItems = subjects.map((subject) => ({
    ...subject,
    count: subject.chapter_count,
    countLabel: subject.chapter_count === 1 ? 'chapter' : 'chapters',
  }));

  // ============================================================================
  // BREADCRUMB DATA
  // ============================================================================

  const breadcrumbData = vault
    ? { vault: { id: vault.id, title: vault.title } }
    : undefined;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <PageLayout 
      title={vault?.title || 'Loading...'}
      breadcrumb={breadcrumbData}
      currentLevel="vault"
      isLoading={isLoading && !vault}
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

      {/* Subject Grid */}
      <ResourceGrid
        items={gridItems}
        isLoading={isLoading}
        resourceType="subject"
        onItemClick={handleSubjectClick}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        addLabel="Add Subject"
      />

      {/* Create/Edit Modal */}
      <ResourceModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSubject(null);
        }}
        onSubmit={handleSubmit}
        title={editingSubject ? 'Edit Subject' : 'Add New Subject'}
        fields={subjectFields}
        initialData={
          editingSubject
            ? {
                title: editingSubject.title,
                description: editingSubject.description,
              }
            : {}
        }
        submitLabel={editingSubject ? 'Save Changes' : 'Add Subject'}
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
              Delete Subject?
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>"{deleteTarget.title}"</strong>? 
              This will permanently delete all chapters and videos inside it.
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

export default SubjectListPage;
