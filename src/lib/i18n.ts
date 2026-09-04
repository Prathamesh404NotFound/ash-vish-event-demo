/**
 * Lightweight i18n system for English/Marathi toggle.
 * Translations are organized by page and key. The Marathi translations
 * use Devanagari script. Fallback chain: Marathi → English (key).
 */

export type Locale = 'en' | 'mr';

const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.browse': 'Browse',
    'nav.explore': 'Explore',
    'nav.saved': 'Saved',
    'nav.myTickets': 'My Tickets',
    'nav.profile': 'Profile',
    'nav.admin': 'Admin',
    'nav.counter': 'Counter',
    'nav.search': 'Search events',
    'nav.verify': 'Verify Ticket',

    // Homepage
    'home.hero.title': 'Experience Live Events Like Never Before',
    'home.hero.subtitle': 'Premium concert & event tickets with instant digital passes and live QR gate entry.',
    'home.hero.cta': 'Explore Events',
    'home.hero.ctaSecondary': 'Verify Ticket',
    'home.trending': 'Trending right now',
    'home.popular': 'Popular this week',
    'home.howItWorks': 'How It Works',
    'home.howItWorks.step1.title': 'Choose Your Event',
    'home.howItWorks.step1.desc': 'Browse curated concerts, comedy shows, and festivals in your city.',
    'home.howItWorks.step2.title': 'Select Your Seats',
    'home.howItWorks.step2.desc': 'Pick exact seats from an interactive seat map or go general admission.',
    'home.howItWorks.step3.title': 'Get Your Digital Pass',
    'home.howItWorks.step3.desc': 'Instant QR pass delivered to your phone — scan at the gate for entry.',
    'home.browseByCategory': 'Browse by experience',
    'home.viewAll': 'View all',

    // Event Detail
    'event.bookNow': 'Book Now',
    'event.selectSeats': 'Select Tickets & Seating',
    'event.about': 'About This Event',
    'event.lineup': 'Artist Lineup',
    'event.gallery': 'Gallery',
    'event.schedule': 'Schedule',
    'event.faq': 'Frequently Asked Questions',
    'event.venue': 'Venue',
    'event.date': 'Date & Time',
    'event.price': 'Starting at',
    'event.addToCalendar': 'Add to Calendar',
    'event.share': 'Share Event',
    'event.verifyTicket': 'Verify Ticket',

    // Booking
    'booking.title': 'Complete Your Booking',
    'booking.selectSeats': 'Select your seats',
    'booking.review': 'Review your order',
    'booking.payment': 'Payment',
    'booking.confirm': 'Confirm Booking',
    'booking.total': 'Total',
    'booking.discount': 'Discount',
    'booking.subtotal': 'Subtotal',

    // Verify
    'verify.title': 'Verify Your Ticket',
    'verify.subtitle': 'Scan the QR code or enter your ticket number to verify authenticity.',
    'verify.scanQR': 'Scan QR Code',
    'verify.enterNumber': 'Enter Ticket Number',
    'verify.placeholder': 'e.g. ASH-1234-SRV',
    'verify.button': 'Verify Ticket',
    'verify.valid': 'Valid Ticket ✓',
    'verify.invalid': 'Invalid Ticket ✗',
    'verify.used': 'Already Used ✗',
    'verify.event': 'Event',
    'verify.venue': 'Venue',
    'verify.date': 'Date',
    'verify.tier': 'Tier',
    'verify.attendee': 'Attendee',

    // Common
    'common.loading': 'Loading...',
    'common.error': 'Something went wrong',
    'common.retry': 'Try Again',
    'common.back': 'Go Back',
    'common.close': 'Close',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.search': 'Search',
    'common.noResults': 'No results found',
    'common.events': 'events',
    'common.tickets': 'tickets',
    'common.available': 'available',
    'common.soldOut': 'Sold Out',
    'common.free': 'Free',
    'common.included': 'Included',

    // Footer
    'footer.tagline': 'Premium event ticketing for Kolhapur and beyond.',
    'footer.explore': 'Explore',
    'footer.support': 'Support',
    'footer.legal': 'Legal',
    'footer.rights': 'All rights reserved.',
    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms of Service',
    'footer.contact': 'Contact Us',

    // Categories
    'category.concert': 'Concerts',
    'category.comedy': 'Comedy',
    'category.sports': 'Sports',
    'category.theatre': 'Theatre',
    'category.festival': 'Festivals',

    // Festival Hubs
    'festival.ganeshotsav': 'Ganeshotsav Events',
    'festival.ganeshotsav.desc': 'Celebrate Ganesh Chaturthi with the best events in Kolhapur.',
    'festival.navratri': 'Navratri Events',
    'festival.navratri.desc': 'Dandiya, Garba, and cultural nights for Navratri.',
    'festival.viewAll': 'View All Events',

    // Check-in Dashboard
    'checkin.title': 'Live Check-in Dashboard',
    'checkin.totalTickets': 'Total Tickets',
    'checkin.checkedIn': 'Checked In',
    'checkin.remaining': 'Remaining',
    'checkin.checkInRate': 'Check-in Rate',
    'checkin.live': 'Live',
    'checkin.refresh': 'Refresh',
  },

  mr: {
    // Navigation
    'nav.home': 'मुख्यपृष्ठ',
    'nav.browse': 'ब्राउझ करा',
    'nav.explore': 'एक्सप्लोर',
    'nav.saved': 'जतन केलेले',
    'nav.myTickets': 'माझे तिकीटे',
    'nav.profile': 'प्रोफाइल',
    'nav.admin': 'प्रशासन',
    'nav.counter': 'काउंटर',
    'nav.search': 'कार्यक्रम शोधा',
    'nav.verify': 'तिकीट तपासा',

    // Homepage
    'home.hero.title': 'लाइव्ह कार्यक्रमांचा अनुभव घ्या',
    'home.hero.subtitle': 'त्वरित डिजिटल पास आणि लाइव्ह QR गेट एन्ट्रीसह प्रीमियम कॉन्सर्ट आणि इव्हेंट तिकीटे.',
    'home.hero.cta': 'कार्यक्रम एक्सप्लोर करा',
    'home.hero.ctaSecondary': 'तिकीट तपासा',
    'home.trending': 'आत्ता ट्रेंडिंग',
    'home.popular': 'या आठवड्यात लोकप्रिय',
    'home.howItWorks': 'हे कसे काम करते',
    'home.howItWorks.step1.title': 'तुमचा कार्यक्रम निवडा',
    'home.howItWorks.step1.desc': 'तुमच्या शहरातील कर्लेटेड कॉन्सर्ट, कॉमेडी शो आणि उत्सव ब्राउझ करा.',
    'home.howItWorks.step2.title': 'तुमची खुर्ची निवडा',
    'home.howItWorks.step2.desc': 'इंटरॅक्टिव्ह सीट मॅपवरून अचूक खुर्ची निवडा किंवा जनरल अॅडमिशन घ्या.',
    'home.howItWorks.step3.title': 'तुमचा डिजिटल पास मिळवा',
    'home.howItWorks.step3.desc': 'तुमच्या फोनवर त्वरित QR पास — गेटवर स्कॅन करून प्रवेश मिळवा.',
    'home.browseByCategory': 'अनुभवानुसार ब्राउझ करा',
    'home.viewAll': 'सर्व पहा',

    // Event Detail
    'event.bookNow': 'आत्ता बुक करा',
    'event.selectSeats': 'तिकीटे आणि खुर्ची निवडा',
    'event.about': 'या कार्यक्रमाबद्दल',
    'event.lineup': 'कलाकार लाइनअप',
    'event.gallery': 'गॅलरी',
    'event.schedule': 'वेळापत्रक',
    'event.faq': 'वारंवार विचारले जाणारे प्रश्न',
    'event.venue': 'व्हेन्यू',
    'event.date': 'तारीख आणि वेळ',
    'event.price': 'सुरुवातीची किंमत',
    'event.addToCalendar': 'कॅलेंडरमध्ये जोडा',
    'event.share': 'कार्यक्रम शेअर करा',
    'event.verifyTicket': 'तिकीट तपासा',

    // Booking
    'booking.title': 'तुमची बुकिंग पूर्ण करा',
    'booking.selectSeats': 'तुमची खुर्ची निवडा',
    'booking.review': 'तुमचा ऑर्डर पहा',
    'booking.payment': 'पेमेंट',
    'booking.confirm': 'बुकिंग पुष्टी करा',
    'booking.total': 'एकूण',
    'booking.discount': 'सवलत',
    'booking.subtotal': 'उपबेरीज',

    // Verify
    'verify.title': 'तुमचे तिकीट तपासा',
    'verify.subtitle': 'QR कोड स्कॅन करा किंवा प्रामाणिकता तपासण्यासाठी तिकीट क्रमांक प्रविष्ट करा.',
    'verify.scanQR': 'QR कोड स्कॅन करा',
    'verify.enterNumber': 'तिकीट क्रमांक प्रविष्ट करा',
    'verify.placeholder': 'उदा. ASH-1234-SRV',
    'verify.button': 'तिकीट तपासा',
    'verify.valid': 'वैध तिकीट ✓',
    'verify.invalid': 'अवैध तिकीट ✗',
    'verify.used': 'आधीच वापरलेले ✗',
    'verify.event': 'कार्यक्रम',
    'verify.venue': 'व्हेन्यू',
    'verify.date': 'तारीख',
    'verify.tier': 'टायर',
    'verify.attendee': 'उपस्थित',

    // Common
    'common.loading': 'लोड होत आहे...',
    'common.error': 'काहीतरी चूक झाली',
    'common.retry': 'पुन्हा प्रयत्न करा',
    'common.back': 'मागे जा',
    'common.close': 'बंद करा',
    'common.save': 'जतन करा',
    'common.cancel': 'रद्द करा',
    'common.search': 'शोधा',
    'common.noResults': 'कोणतेही परिणाम सापडले नाहीत',
    'common.events': 'कार्यक्रम',
    'common.tickets': 'तिकीटे',
    'common.available': 'उपलब्ध',
    'common.soldOut': 'विक्री संपलेले',
    'common.free': 'मोफत',
    'common.included': 'समाविष्ट',

    // Footer
    'footer.tagline': 'कोल्हापूर आणि त्यापलीकडील प्रीमियम इव्हेंट तिकीटिंग.',
    'footer.explore': 'एक्सप्लोर',
    'footer.support': 'सहाय्य',
    'footer.legal': 'कायदेशीर',
    'footer.rights': 'सर्व हक्क राखीव.',
    'footer.privacy': 'गोपनीयता धोरण',
    'footer.terms': 'सेवा अटी',
    'footer.contact': 'संपर्क करा',

    // Categories
    'category.concert': 'कॉन्सर्ट',
    'category.comedy': 'कॉमेडी',
    'category.sports': 'खेळ',
    'category.theatre': 'नाटक',
    'category.festival': 'उत्सव',

    // Festival Hubs
    'festival.ganeshotsav': 'गणेशोत्सव कार्यक्रम',
    'festival.ganeshotsav.desc': 'कोल्हापूरातील सर्वोत्तम कार्यक्रमांसह गणेश चतुर्थी साजरी करा.',
    'festival.navratri': 'नवरात्री कार्यक्रम',
    'festival.navratri.desc': 'नवरात्रीसाठी डांडिया, गरबा आणि सांस्कृतिक रात्री.',
    'festival.viewAll': 'सर्व कार्यक्रम पहा',

    // Check-in Dashboard
    'checkin.title': 'लाइव्ह चेक-इन डॅशबोर्ड',
    'checkin.totalTickets': 'एकूण तिकीटे',
    'checkin.checkedIn': 'चेक-इन झालेले',
    'checkin.remaining': 'उरलेले',
    'checkin.checkInRate': 'चेक-इन दर',
    'checkin.live': 'लाइव्ह',
    'checkin.refresh': 'रिफ्रेश',
  },
};

/** Get a translated string. Falls back to English if key is missing in the current locale. */
export function t(key: string, locale: Locale = 'en'): string {
  return translations[locale]?.[key] ?? translations.en[key] ?? key;
}

/** All supported locales */
export const LOCALES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
];
