/**
 * Slugify utility — single source of truth for slug generation
 * Used for routing: /:categorySlug/:organizationSlug/:videoSlug
 */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
