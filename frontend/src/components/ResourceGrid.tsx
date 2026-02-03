/**
 * ResourceGrid - Generic card grid component for displaying hierarchical items
 * Used for Vaults, Subjects, and Chapters with consistent UI/UX
 */
import React, { useState } from 'react';
import { 
  Plus, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  Folder, 
  BookOpen, 
  FileText,
  Video
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface ResourceItem {
  id: number;
  title: string;
  description?: string;
  icon?: string;
  count?: number;
  countLabel?: string;
}

export interface ResourceGridProps<T extends ResourceItem> {
  items: T[];
  isLoading: boolean;
  resourceType: 'vault' | 'subject' | 'chapter' | 'video';
  onItemClick: (item: T) => void;
  onAdd: () => void;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  emptyMessage?: string;
  addLabel?: string;
}

// ============================================================================
// ICON MAPPING
// ============================================================================

const getIcon = (resourceType: string, iconName?: string) => {
  const iconMap: Record<string, React.ElementType> = {
    vault: Folder,
    subject: BookOpen,
    chapter: FileText,
    video: Video,
    folder: Folder,
    book: BookOpen,
    code: FileText,
  };
  return iconMap[iconName || resourceType] || Folder;
};

const getIconColor = (resourceType: string) => {
  const colorMap: Record<string, string> = {
    vault: 'text-blue-400 bg-blue-600/10 border border-blue-600/20',
    subject: 'text-purple-400 bg-purple-600/10 border border-purple-600/20',
    chapter: 'text-green-400 bg-green-600/10 border border-green-600/20',
    video: 'text-red-400 bg-red-600/10 border border-red-600/20',
  };
  return colorMap[resourceType] || 'text-gray-400 bg-gray-600/10';
};

// ============================================================================
// CONTEXT MENU COMPONENT
// ============================================================================

interface ContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ isOpen, onClose, onEdit, onDelete }) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-10" 
        onClick={onClose}
      />
      {/* Menu */}
      <div className="absolute right-2 top-10 z-20 bg-[#1f1f1f] rounded-lg shadow-2xl border border-[#2d2d2d] py-1 min-w-[120px]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-[#262626] hover:text-white flex items-center gap-2"
        >
          <Pencil className="w-4 h-4" />
          Edit
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-600/10 flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
    </>
  );
};

// ============================================================================
// RESOURCE CARD COMPONENT
// ============================================================================

interface ResourceCardProps<T extends ResourceItem> {
  item: T;
  resourceType: 'vault' | 'subject' | 'chapter' | 'video';
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ResourceCard<T extends ResourceItem>({ 
  item, 
  resourceType, 
  onClick, 
  onEdit, 
  onDelete 
}: ResourceCardProps<T>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = getIcon(resourceType, item.icon);
  const iconColor = getIconColor(resourceType);

  return (
    <div
      onClick={onClick}
      className="relative bg-[#1f1f1f] rounded-2xl border border-[#2d2d2d] p-6 hover:border-[#3d3d3d] hover:bg-[#262626] transition-all cursor-pointer group"
    >
      {/* Context Menu Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen(!menuOpen);
        }}
        className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[#2d2d2d] transition-opacity"
      >
        <MoreVertical className="w-5 h-5 text-gray-400" />
      </button>

      {/* Context Menu */}
      <ContextMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      {/* Icon */}
      <div className={`w-14 h-14 rounded-xl ${iconColor} flex items-center justify-center mb-4`}>
        <Icon className="w-7 h-7" />
      </div>

      {/* Title */}
      <h3 className="font-semibold text-white text-lg mb-1 truncate pr-8">
        {item.title}
      </h3>

      {/* Description */}
      {item.description && (
        <p className="text-sm text-gray-400 line-clamp-2 mb-3">
          {item.description}
        </p>
      )}

      {/* Count Badge */}
      {item.count !== undefined && (
        <div className="flex items-center gap-1 text-sm">
          <span className="font-medium text-gray-300">{item.count}</span>
          <span className="text-gray-500">{item.countLabel || 'items'}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ADD NEW CARD COMPONENT
// ============================================================================

interface AddCardProps {
  resourceType: 'vault' | 'subject' | 'chapter' | 'video';
  onClick: () => void;
  label?: string;
}

const AddCard: React.FC<AddCardProps> = ({ resourceType, onClick, label }) => {
  const labels: Record<string, string> = {
    vault: 'Create New Vault',
    subject: 'Add Subject',
    chapter: 'Add Chapter',
    video: 'Add Video',
  };

  return (
    <button
      onClick={onClick}
      className="bg-[#1a1a1a] rounded-2xl border-2 border-dashed border-[#2d2d2d] p-6 hover:border-blue-600/50 hover:bg-[#1f1f1f] transition-all group flex flex-col items-center justify-center min-h-[200px]"
    >
      <div className="w-14 h-14 rounded-xl bg-[#262626] group-hover:bg-blue-600/10 border border-[#2d2d2d] group-hover:border-blue-600/20 flex items-center justify-center mb-4 transition-all">
        <Plus className="w-7 h-7 text-gray-500 group-hover:text-blue-400 transition-colors" />
      </div>
      <span className="font-medium text-gray-400 group-hover:text-blue-400 transition-colors">
        {label || labels[resourceType]}
      </span>
    </button>
  );
};

// ============================================================================
// LOADING SKELETON
// ============================================================================

const LoadingSkeleton: React.FC = () => (
  <div className="bg-[#1f1f1f] rounded-2xl border border-[#2d2d2d] p-6 animate-pulse">
    <div className="w-14 h-14 rounded-xl bg-[#2a2a2a] mb-4" />
    <div className="h-6 bg-[#2a2a2a] rounded w-3/4 mb-2" />
    <div className="h-4 bg-[#2a2a2a] rounded w-full mb-3" />
    <div className="h-4 bg-[#2a2a2a] rounded w-1/4" />
  </div>
);

// ============================================================================
// EMPTY STATE
// ============================================================================

interface EmptyStateProps {
  resourceType: 'vault' | 'subject' | 'chapter' | 'video';
  message?: string;
  onAdd: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ resourceType, message, onAdd }) => {
  const Icon = getIcon(resourceType);
  const messages: Record<string, string> = {
    vault: "You haven't created any vaults yet. Vaults help you organize your content into categories.",
    subject: "No subjects in this vault yet. Add subjects to organize your chapters.",
    chapter: "No chapters in this subject yet. Add chapters to organize your videos.",
    video: "No videos in this chapter yet. Add videos to start learning.",
  };

  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="w-24 h-24 rounded-2xl bg-[#1f1f1f] border border-[#2d2d2d] flex items-center justify-center mb-6">
        <Icon className="w-12 h-12 text-gray-600" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">
        No {resourceType}s yet
      </h3>
      <p className="text-gray-400 max-w-md mb-8">
        {message || messages[resourceType]}
      </p>
      <button
        onClick={onAdd}
        className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium"
      >
        <Plus className="w-5 h-5" />
        Create your first {resourceType}
      </button>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function ResourceGrid<T extends ResourceItem>({
  items,
  isLoading,
  resourceType,
  onItemClick,
  onAdd,
  onEdit,
  onDelete,
  emptyMessage,
  addLabel,
}: ResourceGridProps<T>) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <LoadingSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="grid grid-cols-1">
        <EmptyState 
          resourceType={resourceType} 
          message={emptyMessage}
          onAdd={onAdd}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((item) => (
        <ResourceCard
          key={item.id}
          item={item}
          resourceType={resourceType}
          onClick={() => onItemClick(item)}
          onEdit={() => onEdit(item)}
          onDelete={() => onDelete(item)}
        />
      ))}
      <AddCard 
        resourceType={resourceType} 
        onClick={onAdd}
        label={addLabel}
      />
    </div>
  );
}

export default ResourceGrid;
