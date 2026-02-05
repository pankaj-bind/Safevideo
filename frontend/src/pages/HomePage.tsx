/**
 * HomePage Component
 * Main page after login - Category and Organization management with full CRUD
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import axiosInstance from '../api/axiosInstance';
import { 
  Search, 
  Plus,
  ChevronDown,
  ChevronUp,
  Folder,
  Building2,
  Trash2,
  Edit2,
  ArrowRight,
  X,
  Image as ImageIcon
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================
interface Organization {
  id: number;
  name: string;
  slug?: string;
  logo: string | null;
  logo_url?: string | null;
  credential_count: number;
}

interface Category {
  id: number;
  name: string;
  slug?: string;
  organizations: Organization[];
  organization_count: number;
}

// =============================================================================
// CATEGORY MODAL
// =============================================================================
const CategoryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  initialValue?: string;
  title: string;
}> = ({ isOpen, onClose, onSave, initialValue = '', title }) => {
  const [name, setName] = useState(initialValue);

  useEffect(() => {
    setName(initialValue);
  }, [initialValue, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
      setName('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="modal-close">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="category-name">Category Name</label>
            <input
              id="category-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter category name"
              autoFocus
              required
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn modal-btn--secondary">
              Cancel
            </button>
            <button type="submit" className="modal-btn modal-btn--primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// ORGANIZATION MODAL
// =============================================================================
const OrganizationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, logo: File | null) => void;
  initialName?: string;
  initialLogo?: string | null;
  title: string;
}> = ({ isOpen, onClose, onSave, initialName = '', initialLogo, title }) => {
  const [name, setName] = useState(initialName);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(initialLogo || null);

  useEffect(() => {
    setName(initialName);
    setLogoPreview(initialLogo || null);
  }, [initialName, initialLogo, isOpen]);

  if (!isOpen) return null;

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogo(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogo(null);
    setLogoPreview(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim(), logo);
      setName('');
      setLogo(null);
      setLogoPreview(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="modal-close">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="org-name">Organization Name</label>
            <input
              id="org-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter organization name"
              autoFocus
              required
            />
          </div>
          
          <div className="form-group">
            <label>Logo (Optional)</label>
            <div className="logo-upload">
              {logoPreview ? (
                <div className="logo-preview">
                  <img src={logoPreview} alt="Logo preview" />
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="logo-remove"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label htmlFor="logo-upload" className="logo-upload-btn">
                  <ImageIcon size={24} />
                  <span>Upload Logo</span>
                  <input
                    id="logo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-btn modal-btn--secondary">
              Cancel
            </button>
            <button type="submit" className="modal-btn modal-btn--primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('sv-theme');
    return stored === 'dark' ? 'dark' : 'light';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal states
  const [categoryModal, setCategoryModal] = useState<{
    isOpen: boolean;
    editId?: number;
    initialName?: string;
  }>({ isOpen: false });
  
  const [orgModal, setOrgModal] = useState<{
    isOpen: boolean;
    categoryId?: number;
    editId?: number;
    initialName?: string;
    initialLogo?: string | null;
  }>({ isOpen: false });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sv-theme', theme);
  }, [theme]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setIsLoading(true);
      const response = await axiosInstance.get('/api/vault/categories/');
      setCategories(response.data);
      // Auto-expand all categories initially
      setExpandedCategories(new Set(response.data.map((cat: Category) => cat.id)));
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleThemeToggle = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const toggleCategory = (categoryId: number) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Category CRUD
  const handleCreateCategory = async (name: string) => {
    try {
      await axiosInstance.post('/api/vault/categories/', { name });
      await fetchCategories();
      setCategoryModal({ isOpen: false });
    } catch (error: any) {
      alert(error.response?.data?.name?.[0] || 'Failed to create category');
    }
  };

  const handleUpdateCategory = async (name: string) => {
    if (!categoryModal.editId) return;
    try {
      await axiosInstance.patch(`/api/vault/categories/${categoryModal.editId}/`, { name });
      await fetchCategories();
      setCategoryModal({ isOpen: false });
    } catch (error: any) {
      alert(error.response?.data?.name?.[0] || 'Failed to update category');
    }
  };

  const handleDeleteCategory = async (categoryId: number) => {
    if (window.confirm('Are you sure? This will delete all organizations in this category.')) {
      try {
        await axiosInstance.delete(`/api/vault/categories/${categoryId}/`);
        await fetchCategories();
      } catch (error) {
        alert('Failed to delete category');
      }
    }
  };

  // Organization CRUD
  const handleCreateOrganization = async (name: string, logo: File | null) => {
    if (!orgModal.categoryId) return;
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('category', orgModal.categoryId.toString());
      if (logo) {
        formData.append('logo', logo);
      }
      
      await axiosInstance.post('/api/vault/organizations/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await fetchCategories();
      setOrgModal({ isOpen: false });
    } catch (error: any) {
      alert(error.response?.data?.non_field_errors?.[0] || 'Failed to create organization');
    }
  };

  const handleUpdateOrganization = async (name: string, logo: File | null) => {
    if (!orgModal.editId) return;
    try {
      const formData = new FormData();
      formData.append('name', name);
      if (orgModal.categoryId) {
        formData.append('category', orgModal.categoryId.toString());
      }
      if (logo) {
        formData.append('logo', logo);
      }
      
      await axiosInstance.patch(`/api/vault/organizations/${orgModal.editId}/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await fetchCategories();
      setOrgModal({ isOpen: false });
    } catch (error: any) {
      alert(error.response?.data?.non_field_errors?.[0] || 'Failed to update organization');
    }
  };

  const handleDeleteOrganization = async (orgId: number) => {
    if (window.confirm('Are you sure you want to delete this organization?')) {
      try {
        await axiosInstance.delete(`/api/vault/organizations/${orgId}/`);
        await fetchCategories();
      } catch (error) {
        alert('Failed to delete organization');
      }
    }
  };

  // Filter categories based on search
  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.organizations.some(org => org.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="home-page">
      <Navbar theme={theme} onThemeToggle={handleThemeToggle} />

      <main className="home-main">
        <div className="home-container">
          {/* Search Bar & Actions */}
          <div className="home-toolbar">
            <div className="home-search">
              <Search size={20} className="home-search-icon" />
              <input
                type="text"
                placeholder="Search categories and organizations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="home-search-input"
              />
            </div>
            <button 
              onClick={() => setCategoryModal({ isOpen: true })}
              className="home-btn home-btn--primary"
            >
              <Plus size={20} />
              <span>New Category</span>
            </button>
          </div>

          {/* Categories List */}
          <div className="home-content">
            {isLoading ? (
              <div className="home-loading">
                <div className="loading-spinner" />
                <p>Loading categories...</p>
              </div>
            ) : filteredCategories.length === 0 ? (
              <div className="home-empty">
                <Folder size={48} />
                <h3>No categories found</h3>
                <p>Create your first category to get started</p>
              </div>
            ) : (
              <div className="home-categories">
                {filteredCategories.map(category => (
                  <div key={category.id} className="category-section">
                    <div className="category-header">
                      <button 
                        onClick={() => toggleCategory(category.id)}
                        className="category-toggle"
                      >
                        <Folder size={20} />
                        <span className="category-name">{category.name}</span>
                        <span className="category-count">
                          {category.organization_count} organization{category.organization_count !== 1 ? 's' : ''}
                        </span>
                        {expandedCategories.has(category.id) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </button>
                      <div className="category-actions">
                        <button 
                          onClick={() => setCategoryModal({ 
                            isOpen: true, 
                            editId: category.id, 
                            initialName: category.name 
                          })}
                          className="category-action-btn"
                          title="Edit Category"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => setOrgModal({ 
                            isOpen: true, 
                            categoryId: category.id 
                          })}
                          className="category-action-btn"
                          title="Add Organization"
                        >
                          <Plus size={18} />
                          <span>Add Organization</span>
                        </button>
                        <button 
                          onClick={() => handleDeleteCategory(category.id)}
                          className="category-action-btn category-action-btn--danger"
                          title="Delete Category"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    {expandedCategories.has(category.id) && (
                      <div className="organization-grid">
                        {category.organizations.length === 0 ? (
                          <div className="organization-empty">
                            <p>No organizations yet. Click "Add Organization" to create one.</p>
                          </div>
                        ) : (
                          category.organizations.map(org => (
                            <div key={org.id} className="organization-card">
                              <div 
                                className="organization-main"
                                onClick={() => {
                                  const catSlug = category.slug || category.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                                  const orgSlug = org.slug || org.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                                  navigate(`/${catSlug}/${orgSlug}`);
                                }}
                              >
                                <div className="organization-icon">
                                  {org.logo_url ? (
                                    <img src={org.logo_url} alt={org.name} />
                                  ) : (
                                    <Building2 size={24} />
                                  )}
                                </div>
                                <div className="organization-info">
                                  <h4 className="organization-name">{org.name}</h4>
                                  <p className="organization-credentials">
                                    {org.credential_count} credential{org.credential_count !== 1 ? 's' : ''}
                                  </p>
                                </div>
                                <div className="organization-arrow">
                                  <ArrowRight size={18} />
                                </div>
                              </div>
                              <div className="organization-actions">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOrgModal({
                                      isOpen: true,
                                      categoryId: category.id,
                                      editId: org.id,
                                      initialName: org.name,
                                      initialLogo: org.logo_url || null
                                    });
                                  }}
                                  className="org-action-btn"
                                  title="Edit"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteOrganization(org.id);
                                  }}
                                  className="org-action-btn org-action-btn--danger"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      <CategoryModal
        isOpen={categoryModal.isOpen}
        onClose={() => setCategoryModal({ isOpen: false })}
        onSave={categoryModal.editId ? handleUpdateCategory : handleCreateCategory}
        initialValue={categoryModal.initialName}
        title={categoryModal.editId ? 'Edit Category' : 'New Category'}
      />

      <OrganizationModal
        isOpen={orgModal.isOpen}
        onClose={() => setOrgModal({ isOpen: false })}
        onSave={orgModal.editId ? handleUpdateOrganization : handleCreateOrganization}
        initialName={orgModal.initialName}
        initialLogo={orgModal.initialLogo}
        title={orgModal.editId ? 'Edit Organization' : 'New Organization'}
      />
    </div>
  );
};

export default HomePage;
