import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const merge = extendTailwindMerge({
  extend: {
    // Keep custom scale names aligned with styles/theme.css.
    theme: {
      font: ['display'],
      text: [
        'caption',
        'ui',
        'body',
        'message',
        'brand',
        'title',
        'title-mobile',
        'title-small',
      ],
      spacing: [
        'sidebar',
        'sidebar-compact',
        'sidebar-header',
        'composer',
        'reading',
        'dialog',
        'control',
        'control-sm',
        'control-xs',
        'navigation',
        'title-gap',
      ],
      radius: ['control', 'navigation', 'dialog', 'composer'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
