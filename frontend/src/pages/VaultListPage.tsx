/**
 * VaultListPage - Dashboard showing all user's vaults
 * Entry point to the hierarchical content vault system
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { API_ENDPOINTS } from '../config/api.config';
import PageLayout from '../components/PageLayout';
import ResourceGrid from '../components/ResourceGrid';
import ResourceModal from '../components/ResourceModal';
import type { FieldConfig } from '../components/ResourceModal';
import type { Vault, VaultCreate } from '../types/api.types';
import { AlertCircle } from 'lucide-react';

// ============================================================================
// MODAL FIELD CONFIGURATION
// ============================================================================

const vaultFields: FieldConfig[] = [
  {
    name: 'title',
    label: 'Vault Name',
    type: 'text',
    required: true,
    placeholder: 'e.g., GATE Preparation, SDE Interview',
  },
  {
    name: 'description',
    label: 'Description',
    type: 'textarea',
    placeholder: 'Describe what this vault contains...',
  },
  {
    name: 'icon',
    label: 'Icon',
    type: 'select',
    options: [
      { value: 'folder', label: '📁 Folder' },
      { value: 'book', label: '📚 Book' },
      { value: 'code', label: '💻 Code' },
      { value: 'video', label: '🎬 Video' },
    ],
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const VaultListPage: React.FC = () => {
  const navigate = useNavigate();
  
  // State
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVault, setEditingVault] = useState<Vault | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<Vault | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchVaults = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await axiosInstance.get(API_ENDPOINTS.VAULTS.LIST);
      setVaults(response.data);
    } catch (err) {
      console.error('Failed to fetch vaults:', err);
      setError('Failed to load vaults. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVaults();
  }, [fetchVaults]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleVaultClick = (vault: Vault) => {
    navigate(`/vault/${vault.id}`);
  };

  const handleAdd = () => {
    setEditingVault(null);
    setIsModalOpen(true);
  };

  const handleEdit = (vault: Vault) => {
    setEditingVault(vault);
    setIsModalOpen(true);
  };

  const handleDelete = (vault: Vault) => {
    setDeleteTarget(vault);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      setIsDeleting(true);
      await axiosInstance.delete(API_ENDPOINTS.VAULTS.DELETE(deleteTarget.id));
      setVaults((prev) => prev.filter((v) => v.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete vault:', err);
      setError('Failed to delete vault. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (data: Record<string, string>) => {
    try {
      setIsSubmitting(true);
      
      const payload: VaultCreate = {
        title: data.title,
        description: data.description || '',
        icon: data.icon || 'folder',
      };

      if (editingVault) {
        // Update existing vault
        const response = await axiosInstance.patch(
          API_ENDPOINTS.VAULTS.UPDATE(editingVault.id),
          payload
        );
        setVaults((prev) =>
          prev.map((v) => (v.id === editingVault.id ? response.data : v))
        );
      } else {
        // Create new vault
        const response = await axiosInstance.post(API_ENDPOINTS.VAULTS.CREATE, payload);
        setVaults((prev) => [response.data, ...prev]);
      }

      setIsModalOpen(false);
      setEditingVault(null);
    } catch (err) {
      console.error('Failed to save vault:', err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // TRANSFORM VAULTS FOR GRID
  // ============================================================================

  const gridItems = vaults.map((vault) => ({
    ...vault,
    count: vault.subject_count,
    countLabel: vault.subject_count === 1 ? 'subject' : 'subjects',
  }));

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <PageLayout title="My Vaults" currentLevel="dashboard">
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

      {/* Vault Grid */}
      <ResourceGrid
        items={gridItems}
        isLoading={isLoading}
        resourceType="vault"
        onItemClick={handleVaultClick}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        addLabel="Create New Vault"
      />

      {/* Create/Edit Modal */}
      <ResourceModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingVault(null);
        }}
        onSubmit={handleSubmit}
        title={editingVault ? 'Edit Vault' : 'Create New Vault'}
        fields={vaultFields}
        initialData={
          editingVault
            ? {
                title: editingVault.title,
                description: editingVault.description,
                icon: editingVault.icon,
              }
            : {}
        }
        submitLabel={editingVault ? 'Save Changes' : 'Create Vault'}
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
              Delete Vault?
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>"{deleteTarget.title}"</strong>? 
              This will permanently delete all subjects, chapters, and videos inside it.
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

export default VaultListPage;
