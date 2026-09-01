import { EventCategory } from '../types';

/**
 * Centralized category configuration.
 * Used by the hero badge, category chips, and filter tabs
 * so that category labels are consistent everywhere.
 */
export const CATEGORY_CONFIG: Record<
  EventCategory,
  { label: string; pluralLabel: string; badgeText: string }
> = {
  concert: {
    label: 'Concert',
    pluralLabel: 'Concerts',
    badgeText: 'LIVE MUSICAL NIGHT',
  },
  comedy: {
    label: 'Comedy',
    pluralLabel: 'Comedy Shows',
    badgeText: 'COMEDY SHOW',
  },
  sports: {
    label: 'Sports',
    pluralLabel: 'Sports Events',
    badgeText: 'SPORTS EVENT',
  },
  theatre: {
    label: 'Theatre',
    pluralLabel: 'Theatre Shows',
    badgeText: 'THEATRE SHOW',
  },
  festival: {
    label: 'Festival',
    pluralLabel: 'Festivals',
    badgeText: 'FESTIVAL',
  },
};

/**
 * Returns the display label for a category.
 * Falls back to a title-cased version of the raw string.
 */
export function getCategoryLabel(category: string): string {
  if (category in CATEGORY_CONFIG) {
    return CATEGORY_CONFIG[category as EventCategory].label;
  }
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Returns the hero badge text for a category.
 * Falls back to uppercase category + " EVENT".
 */
export function getCategoryBadgeText(category: string): string {
  if (category in CATEGORY_CONFIG) {
    return CATEGORY_CONFIG[category as EventCategory].badgeText;
  }
  return `${category.toUpperCase()} EVENT`;
}
