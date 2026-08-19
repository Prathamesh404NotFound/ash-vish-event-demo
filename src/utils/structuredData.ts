const APP_URL = import.meta.env.VITE_APP_URL || 'https://ashvishevents.com';

export function generateEventSchema(event: any) {
  if (!event) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: `${event.date}T${event.time || '18:00:00'}`,
    location: {
      "@type": "Place",
      name: event.venue || 'Live Venue',
      address: {
        "@type": "PostalAddress",
        streetAddress: event.address || event.venue || 'Kolhapur',
        addressLocality: event.city || 'Kolhapur',
        addressRegion: "Maharashtra",
        addressCountry: "IN"
      },
      geo: { "@type": "GeoCoordinates", latitude: 16.7050, longitude: 74.2433 }
    },
    image: event.posterUrl,
    description: event.description,
    organizer: { "@type": "Organization", name: "Ash-vish Events", url: APP_URL },
    offers: {
      "@type": "Offer",
      url: `${APP_URL}/events/${event.id}`,
      price: event.startingPrice || 0,
      priceCurrency: "INR",
      availability: event.status === "sold_out"
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock"
    },
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode"
  };
}

export function generateOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${APP_URL}/#organization`,
        "name": "Ash-vish Events",
        "url": APP_URL,
        "logo": `${APP_URL}/ash-vish-events-logo.png`,
        "description": "Best event organisers in Kolhapur, Maharashtra, and India. Premium event management and digital ticket booking platform.",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Kolhapur",
          "addressRegion": "Maharashtra",
          "addressCountry": "IN"
        },
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "+91-9657333033",
          "contactType": "customer service",
          "areaServed": ["IN", "Maharashtra", "Kolhapur"],
          "availableLanguage": ["English", "Hindi", "Marathi"]
        },
        "sameAs": [
          "https://www.instagram.com/ashvishevents",
          "https://www.facebook.com/ashvishevents",
          "https://www.linkedin.com/company/ashvishevents"
        ],
        "knowsAbout": [
          "Event Management", "Concert Organizing", "Wedding Planning",
          "Corporate Events", "Digital Ticketing", "QR Code Entry"
        ]
      },
      {
        "@type": "LocalBusiness",
        "@id": `${APP_URL}/#localbusiness`,
        "name": "Ash-vish Events — Best Event Organisers Kolhapur",
        "image": `${APP_URL}/og-image.jpg`,
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Kolhapur",
          "addressRegion": "Maharashtra",
          "postalCode": "416001",
          "addressCountry": "IN"
        },
        "telephone": "+91-9657333033",
        "priceRange": "₹₹",
        "areaServed": {
          "@type": "GeoCircle",
          "geoMidpoint": { "@type": "GeoCoordinates", "latitude": 16.7050, "longitude": 74.2433 },
          "geoRadius": "100 km"
        }
      },
      {
        "@type": "WebSite",
        "@id": `${APP_URL}/#website`,
        "url": APP_URL,
        "name": "Ash-vish Events",
        "publisher": { "@id": `${APP_URL}/#organization` },
        "inLanguage": ["en-IN", "hi-IN", "mr-IN"]
      }
    ]
  };
}

export function generateBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${APP_URL}${item.url}`
    }))
  };
}

export function generateFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(faq => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer
      }
    }))
  };
}

export function generateArticleSchema(post: { title: string; description: string; date: string; slug: string; author?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      "@type": "Organization",
      name: post.author || "Ash-vish Events Editorial Team"
    },
    publisher: {
      "@type": "Organization",
      name: "Ash-vish Events",
      logo: {
        "@type": "ImageObject",
        url: `${APP_URL}/favicon-512.png`
      }
    },
    mainEntityOfPage: `${APP_URL}/blog/${post.slug}`
  };
}
