import { useEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

export const useSEO = ({
  title,
  description,
  image,
  url,
  type = 'website',
}: SEOProps) => {
  useEffect(() => {
    // 1. Document Title
    const fullTitle = title
      ? `${title} | Ash-vish Events`
      : 'Ash-vish Events — Premium Ticket Booking';
    document.title = fullTitle;

    // Helper function to update or create meta tags
    const updateMeta = (selector: string, attrName: string, attrValue: string, content: string) => {
      let element = document.querySelector(selector);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attrName, attrValue);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    // 2. Meta Description
    if (description) {
      updateMeta('meta[name="description"]', 'name', 'description', description);
      updateMeta('meta[property="og:description"]', 'property', 'og:description', description);
      updateMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    }

    // 3. Open Graph Title
    if (title) {
      updateMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
      updateMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    }

    // 4. Open Graph Image
    if (image) {
      updateMeta('meta[property="og:image"]', 'property', 'og:image', image);
      updateMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
    }

    // 5. Open Graph Type & URL
    updateMeta('meta[property="og:type"]', 'property', 'og:type', type);
    if (url) {
      updateMeta('meta[property="og:url"]', 'property', 'og:url', url);
    }

  }, [title, description, image, url, type]);
};
