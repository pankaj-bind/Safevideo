/**
 * Breadcrumb - Navigation component for hierarchical content
 * Shows path: Dashboard > Vault > Subject > Chapter
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import type { BreadcrumbItem } from '../types/api.types';

// ============================================================================
// TYPES
// ============================================================================

export interface BreadcrumbData {
  vault?: BreadcrumbItem;
  subject?: BreadcrumbItem;
  chapter?: BreadcrumbItem;
}

export interface BreadcrumbProps {
  data?: BreadcrumbData;
  currentLevel: 'dashboard' | 'vault' | 'subject' | 'chapter';
  currentTitle?: string;
}

// ============================================================================
// BREADCRUMB ITEM COMPONENT
// ============================================================================

interface BreadcrumbLinkProps {
  to: string;
  label: string;
  isLast?: boolean;
}

const BreadcrumbLink: React.FC<BreadcrumbLinkProps> = ({ to, label, isLast }) => {
  if (isLast) {
    return (
      <span className="text-white font-medium truncate max-w-[200px]">
        {label}
      </span>
    );
  }

  return (
    <>
      <Link 
        to={to} 
        className="text-gray-400 hover:text-blue-400 transition-colors truncate max-w-[150px]"
      >
        {label}
      </Link>
      <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
    </>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const Breadcrumb: React.FC<BreadcrumbProps> = ({ 
  data, 
  currentTitle 
}) => {
  const items: { to: string; label: string }[] = [];

  // Always start with Dashboard
  items.push({ to: '/dashboard', label: 'Dashboard' });

  // Add vault if available
  if (data?.vault) {
    items.push({ 
      to: `/vault/${data.vault.id}`, 
      label: data.vault.title 
    });
  }

  // Add subject if available
  if (data?.subject) {
    items.push({ 
      to: `/subject/${data.subject.id}`, 
      label: data.subject.title 
    });
  }

  // Add chapter if available
  if (data?.chapter) {
    items.push({ 
      to: `/chapter/${data.chapter.id}`, 
      label: data.chapter.title 
    });
  }

  // If currentTitle is provided and doesn't match the last item, add it
  if (currentTitle && items.length > 0 && items[items.length - 1].label !== currentTitle) {
    // Replace the last item's label with currentTitle if they're at the same level
    items[items.length - 1].label = currentTitle;
  }

  return (
    <nav className="flex items-center gap-2 text-sm overflow-x-auto pb-1">
      <Link 
        to="/dashboard" 
        className="text-gray-400 hover:text-blue-400 transition-colors flex-shrink-0"
      >
        <Home className="w-4 h-4" />
      </Link>
      <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
      
      {items.map((item, index) => (
        <BreadcrumbLink
          key={item.to}
          to={item.to}
          label={item.label}
          isLast={index === items.length - 1}
        />
      ))}
    </nav>
  );
};

export default Breadcrumb;
