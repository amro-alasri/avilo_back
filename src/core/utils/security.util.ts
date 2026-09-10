/**
 * Security utilities for HTML sanitization and injection prevention.
 */

/**
 * Escapes characters that have special meaning in HTML contexts
 * to prevent Cross-Site Scripting (XSS) and HTML injection in emails and rendered views.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitizes URLs to ensure they only use http or https protocols,
 * preventing javascript:, data:, or vbscript: injection.
 */
export function sanitizeUrl(url: unknown, defaultUrl: string = '#'): string {
  if (!url || typeof url !== 'string') return defaultUrl;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) {
    return escapeHtml(trimmed);
  }
  return defaultUrl;
}
