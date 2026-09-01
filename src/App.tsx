import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, Outlet } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { BookingProvider, useBooking } from './contexts/BookingContext';
import { ToastProvider } from './contexts/ToastContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { RoleRoute } from './components/RoleRoute';
import { TermsAcceptanceModal } from './components/TermsAcceptanceModal';

// Components & Shared Tools
import { EventCard } from './components/EventCard';
import { EmptyState } from './components/EmptyState';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary';
import { QRScanner } from './components/QRScanner';

// Public / Customer Pages (lazy-loaded for code splitting)
const Home = React.lazy(() => import('./pages/Home').then(m => ({ default: m.Home })));
const SearchPage = React.lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const EventDetail = React.lazy(() => import('./pages/EventDetail').then(m => ({ default: m.EventDetail })));
const CheckoutWizard = React.lazy(() => import('./pages/CheckoutWizard').then(m => ({ default: m.CheckoutWizard })));
const ConfirmationPage = React.lazy(() => import('./pages/ConfirmationPage').then(m => ({ default: m.ConfirmationPage })));
const MyTicketsPage = React.lazy(() => import('./pages/MyTicketsPage').then(m => ({ default: m.MyTicketsPage })));
const AuthPage = React.lazy(() => import('./pages/AuthPage').then(m => ({ default: m.AuthPage })));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const DigitalPassPage = React.lazy(() => import('./pages/DigitalPassPage').then(m => ({ default: m.DigitalPassPage })));
const TicketPassPage = React.lazy(() => import('./pages/TicketPassPage').then(m => ({ default: m.TicketPassPage })));
const CityPage = React.lazy(() => import('./pages/CityPage').then(m => ({ default: m.CityPage })));
const BlogPage = React.lazy(() => import('./pages/BlogPage').then(m => ({ default: m.BlogPage })));
const BlogPostPage = React.lazy(() => import('./pages/BlogPostPage').then(m => ({ default: m.BlogPostPage })));
const TermsPage = React.lazy(() => import('./pages/TermsPage').then(m => ({ default: m.TermsPage })));
const PaymentCallbackPage = React.lazy(() => import('./pages/PaymentCallbackPage').then(m => ({ default: m.PaymentCallbackPage })));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

function HashPassRedirectHandler() {
  const navigate = useNavigate();
  React.useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#pass-')) {
      const ticketNumber = hash.replace('#pass-', '');
      if (ticketNumber) {
        fetch(`/api/passes/lookup?ticketNumber=${encodeURIComponent(ticketNumber)}`)
          .then(res => res.json())
          .then(data => {
            if (data.success && data.passSlug) {
              navigate(`/pass/${data.passSlug.id}?sig=${data.passSlug.sig}`, { replace: true });
            }
          })
          .catch(() => {});
      }
    }
  }, [navigate]);
  return null;
}

// Admin Dashboard Shell & Pages (lazy-loaded for code splitting)
const AdminLayoutPage = React.lazy(() => import('./components/AdminLayoutPage').then(m => ({ default: m.AdminLayoutPage })));
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const AdminEvents = React.lazy(() => import('./pages/admin/AdminEvents').then(m => ({ default: m.AdminEvents })));
const AdminBookings = React.lazy(() => import('./pages/admin/AdminBookings').then(m => ({ default: m.AdminBookings })));
const AdminSettings = React.lazy(() => import('./pages/admin/AdminSettings').then(m => ({ default: m.AdminSettings })));
const AdminSeatMapBuilder = React.lazy(() => import('./pages/admin/AdminSeatMapBuilder').then(m => ({ default: m.AdminSeatMapBuilder })));
const AdminCoupons = React.lazy(() => import('./pages/admin/AdminCoupons').then(m => ({ default: m.AdminCoupons })));
const AdminReports = React.lazy(() => import('./pages/admin/AdminReports').then(m => ({ default: m.AdminReports })));
const AdminReviews = React.lazy(() => import('./pages/admin/AdminReviews').then(m => ({ default: m.AdminReviews })));
const AdminOrganizers = React.lazy(() => import('./pages/admin/AdminOrganizers').then(m => ({ default: m.AdminOrganizers })));
const AdminCounters = React.lazy(() => import('./pages/admin/AdminCounters').then(m => ({ default: m.AdminCounters })));
const AdminShiftPage = React.lazy(() => import('./pages/admin/AdminShiftPage').then(m => ({ default: m.AdminShiftPage })));
const OrganizerDashboard = React.lazy(() => import('./pages/OrganizerDashboard').then(m => ({ default: m.OrganizerDashboard })));
const AdminUsers = React.lazy(() => import('./pages/admin/AdminUsers').then(m => ({ default: m.AdminUsers })));

// Ticket Counter Dashboard Shell & Pages (lazy-loaded for code splitting)
const CounterLayout = React.lazy(() => import('./components/CounterLayout').then(m => ({ default: m.CounterLayout })));
const CounterOverview = React.lazy(() => import('./pages/counter/CounterOverview').then(m => ({ default: m.CounterOverview })));
const WalkInPage = React.lazy(() => import('./pages/counter/WalkInPage').then(m => ({ default: m.WalkInPage })));
const ShiftPage = React.lazy(() => import('./pages/counter/ShiftPage').then(m => ({ default: m.ShiftPage })));
const CounterOrders = React.lazy(() => import('./pages/counter/CounterOrders').then(m => ({ default: m.CounterOrders })));
const MySalesPage = React.lazy(() => import('./pages/counter/MySalesPage').then(m => ({ default: m.MySalesPage })));
import { readPreferredStoredActiveShift } from './lib/counterSession';

function CounterEntryPage() {
  const [hasActiveShift] = React.useState(() => readPreferredStoredActiveShift()?.status === 'open');

  return hasActiveShift ? <CounterOverview /> : <Navigate to="shift" replace />;
}

// Main Public Customer Shell Layout
function MainLayout() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#090909] text-gray-100 font-sans flex flex-col justify-between selection:bg-[#D4AF37] selection:text-black">
      <Navbar onOpenSearch={() => navigate('/events')} />
      {/* The navbar is a fixed floating card; reserve clearance so no page
          content ever renders underneath it regardless of its own padding. */}
      <main className="flex-1 pt-[100px] sm:pt-[104px]">
        <Outlet />
      </main>
      <Footer setActiveTab={(path) => navigate(path === 'home' ? '/' : `/${path}`)} />
    </div>
  );
}

// Route wrappers mapping context logic to react-router-dom
function HomeRoute() {
  const navigate = useNavigate();
  const { selectTicketsForCheckout } = useBooking();

  return (
    <Home
      onSelectEvent={(evt) => navigate(`/events/${evt.id}`)}
      onBookNow={(evt) => {
        navigate(`/events/${evt.id}`);
      }}
      onNavigateToSearch={() => navigate('/events')}
    />
  );
}

function EventDetailRoute() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { getEventById, selectTicketsForCheckout } = useBooking();

  const event = getEventById(eventId || '');

  if (!event) {
    return (
      <div className="pt-28 pb-20 text-center">
        <EmptyState
          title="Event Not Found"
          description="The event you are looking for may have concluded or been updated."
          actionLabel="Explore All Events"
          onAction={() => navigate('/')}
        />
      </div>
    );
  }

  return (
    <EventDetail
      event={event}
      onBack={() => navigate('/')}
      onProceedToCheckout={(evt, tier, quantity, selectedSeats) => {
        selectTicketsForCheckout(evt, tier, quantity, selectedSeats);
        navigate('/checkout');
      }}
      onSelectEvent={(evt) => navigate(`/events/${evt.id}`)}
    />
  );
}

function SearchRoute() {
  const navigate = useNavigate();
  const { selectTicketsForCheckout } = useBooking();

  return (
    <SearchPage
      initialCategory="all"
      onSelectEvent={(evt) => navigate(`/events/${evt.id}`)}
      onBookNow={(evt) => {
        navigate(`/events/${evt.id}`);
      }}
    />
  );
}

function CheckoutRoute() {
  const navigate = useNavigate();

  return (
    <CheckoutWizard
      onBack={() => navigate(-1)}
      onSuccess={() => navigate('/confirmation')}
    />
  );
}

function ConfirmationRoute() {
  const navigate = useNavigate();

  return (
    <ConfirmationPage
      onGoToMyTickets={() => navigate('/account/tickets')}
      onExploreMore={() => navigate('/')}
    />
  );
}

function FavoritesRoute() {
  const navigate = useNavigate();
  const { events, favorites, selectTicketsForCheckout } = useBooking();
  const favoriteEvents = events.filter((e) => favorites.includes(e.id));

  return (
    <div className="pb-24 pt-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in">
      <div className="border-b border-white/10 pb-6">
        <h1 className="font-heading font-extrabold text-3xl text-white">
          Saved Favorite Shows ({favoriteEvents.length})
        </h1>
        <p className="text-xs text-gray-400 mt-1">Your bookmarked concerts, comedy nights, and festivals.</p>
      </div>

      {favoriteEvents.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {favoriteEvents.map((evt) => (
            <EventCard
              key={evt.id}
              event={evt}
              onSelectEvent={(e) => navigate(`/events/${e.id}`)}
              onBookNow={(e) => {
                navigate(`/events/${e.id}`);
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No Saved Shows Yet"
          description="Click the heart icon on any event card to save it to your wishlist."
          actionLabel="Explore Events"
          onAction={() => navigate('/')}
        />
      )}
    </div>
  );
}

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <React.Suspense fallback={
        <div className="min-h-screen bg-[#070707] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
        </div>
      }>
        {children}
      </React.Suspense>
    </ChunkErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <ToastProvider>
    <AuthProvider>
      <BookingProvider>
        <BrowserRouter>
          <HashPassRedirectHandler />
          <SuspenseWrapper>
          <Routes>
            {/* Secure Fullscreen Digital Pass Routes */}
            <Route path="/pass/:slug/:signature" element={<TicketPassPage />} />
            <Route path="/pass/:passId" element={<TicketPassPage />} />

            {/* Main Website Customer Routes */}
            <Route path="/" element={<MainLayout />}>
              <Route index element={<HomeRoute />} />
              <Route path="events" element={<SearchRoute />} />
              <Route path="events/:eventId" element={<EventDetailRoute />} />
              <Route path="checkout" element={<CheckoutRoute />} />
              <Route path="confirmation" element={<ConfirmationRoute />} />
              <Route path="organizer" element={<OrganizerDashboard />} />
              <Route path="login" element={<AuthPage />} />
              <Route path="kolhapur" element={<CityPage city="kolhapur" />} />
              <Route path="maharashtra" element={<CityPage city="maharashtra" />} />
              <Route path="india" element={<CityPage city="india" />} />
              <Route path="pune" element={<CityPage city="pune" />} />
              <Route path="mumbai" element={<CityPage city="mumbai" />} />
              <Route path="blog" element={<BlogPage />} />
              <Route path="blog/:slug" element={<BlogPostPage />} />
              <Route path="terms" element={<TermsPage />} />
              <Route path="payment/phonepe/return" element={<PaymentCallbackPage />} />
              <Route path="payment-callback" element={<PaymentCallbackPage />} />

              {/* Guarded Account Routes */}
              <Route
                path="account/*"
                element={
                  <RoleRoute allow={['customer', 'admin', 'ticket_counter']}>
                    <Routes>
                      <Route path="tickets" element={<MyTicketsPage onExploreEvents={() => {}} />} />
                      <Route path="favorites" element={<FavoritesRoute />} />
                      <Route path="profile" element={<ProfilePage />} />
                      <Route path="*" element={<Navigate to="/account/profile" replace />} />
                    </Routes>
                  </RoleRoute>
                }
              />
            </Route>

            {/* Admin Dashboard Routes (Role: admin only) */}
            <Route
              path="/admin"
              element={
                <RoleRoute allow={['admin']}>
                  <AdminLayoutPage />
                </RoleRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="events" element={<AdminEvents />} />
              <Route path="organizers" element={<AdminOrganizers />} />
              <Route path="seatmap" element={<AdminSeatMapBuilder />} />
              <Route path="bookings" element={<AdminBookings />} />
              <Route path="coupons" element={<AdminCoupons />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="reviews" element={<AdminReviews />} />
              <Route path="counters" element={<AdminCounters />} />
              <Route path="shifts" element={<AdminShiftPage />} />
              <Route path="scan" element={<QRScanner />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>

            {/* Ticket Counter Dashboard Routes (Role: admin or ticket_counter) */}
            <Route
              path="/counter"
              element={
                <RoleRoute allow={['admin', 'ticket_counter']}>
                  <CounterLayout />
                </RoleRoute>
              }
            >
              {/* New counter sessions must select an assigned user and verify a PIN first. */}
              <Route index element={<CounterEntryPage />} />
              <Route path="shift" element={<ShiftPage />} />
              <Route path="my-sales" element={<MySalesPage />} />
              <Route path="scan" element={<QRScanner />} />
              <Route path="walk-in" element={<WalkInPage />} />
              <Route path="orders" element={<CounterOrders />} />
              <Route path="*" element={<Navigate to="/counter" replace />} />
            </Route>

            {/* 404 - Not Found (inside MainLayout for consistent nav/footer) */}
            <Route path="*" element={<MainLayout />}>
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
          </SuspenseWrapper>
        </BrowserRouter>
      </BookingProvider>
    </AuthProvider>
    </ToastProvider>
    </ErrorBoundary>
  );
}
