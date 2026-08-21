/**
 * Sanitization utility to prevent XSS and NoSQL/SQL injection style attacks.
 */

export const sanitizeString = (str: string, maxLength: number = 255): string => {
  if (!str) return '';
  
  // Trim and limit length
  let sanitized = str.trim().slice(0, maxLength);
  
  // Strip HTML tags
  sanitized = sanitized.replace(/<[^>]*>?/gm, '');
  
  // Escape special characters to prevent XSS/Injection
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    "/": '&#x2F;',
  };
  const reg = /[&<>"'/]/ig;
  sanitized = sanitized.replace(reg, (match) => map[match]);
  
  return sanitized;
};

export const validateEmail = (email: string): boolean => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim()) && email.length <= 254;
};

export const validatePhone = (phone: string): boolean => {
  // Basic numeric check for phone, allowing + prefix
  const re = /^\+?[0-9]{10,15}$/;
  return re.test(phone.trim());
};
