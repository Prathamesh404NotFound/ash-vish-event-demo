import { useEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'event';
  keywords?: string;
  structuredData?: Record<string, any> | Record<string, any>[];
  noIndex?: boolean;
}

export const useSEO = ({
  title,
  description,
  image,
  url,
  type = 'website',
  keywords,
  structuredData,
  noIndex = false,
}: SEOProps) => {
  useEffect(() => {
    const APP_URL = import.meta.env.VITE_APP_URL || 'https://ashvishevents.com';
    const canonicalUrl = url || `${APP_URL}${window.location.pathname}`;

    const fullTitle = title
      ? `${title} | Ash-vish Events`
      : 'Ash-vish Events — Best Event Organisers in Kolhapur, Maharashtra & India';

    document.title = fullTitle;

    const upsert = (selector: string, attr: string, value: string, content: string) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, value);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // Core
    if (description) {
      upsert('meta[name="description"]', 'name', 'description', description);
    }
    if (keywords) {
      upsert('meta[name="keywords"]', 'name', 'keywords', keywords);
    }
    upsert('meta[name="robots"]', 'name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow, max-snippet:-1, max-image-preview:large');
    
    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', canonicalUrl);

    // OG
    upsert('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    if (description) {
      upsert('meta[property="og:description"]', 'property', 'og:description', description);
    }
    upsert('meta[property="og:type"]', 'property', 'og:type', type);
    upsert('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    if (image) {
      upsert('meta[property="og:image"]', 'property', 'og:image', image);
      upsert('meta[property="og:image:width"]', 'property', 'og:image:width', '1200');
      upsert('meta[property="og:image:height"]', 'property', 'og:image:height', '630');
    }

    // Twitter
    upsert('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    if (description) {
      upsert('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    }
    if (image) {
      upsert('meta[name="twitter:image"]', 'name', 'twitter:image', image);
    }
    upsert('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');

    // Structured data
    if (structuredData) {
      const schemas = Array.isArray(structuredData) ? structuredData : [structuredData];
      schemas.forEach((schema, i) => {
        const existing = document.querySelector(`script[data-schema-id="seo-${i}"]`);
        if (existing) existing.remove();
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-schema-id', `seo-${i}`);
        script.textContent = JSON.stringify(schema);
        document.head.appendChild(script);
      });
    }

    return () => {
      document.querySelectorAll('script[data-schema-id^="seo-"]').forEach(el => el.remove());
    };
  }, [title, description, image, url, type, keywords, structuredData, noIndex]);
};
