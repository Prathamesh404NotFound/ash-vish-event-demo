import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, Outlet } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { BookingProvider, useBooking } from './contexts/BookingContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { RoleRoute } from './components/RoleRoute';

// Components & Shared Tools
import { EventCard } from './components/EventCard';
import { EmptyState } from './components/EmptyState';
import { ErrorBoundary } from './components/ErrorBoundary';
import { QRScanner } from './components/QRScanner';

// Public / Customer Pages
import { Home } from './pages/Home';
import { SearchPage } from './pages/SearchPage';
import { EventDetail } from './pages/EventDetail';
import { CheckoutWizard } from './pages/CheckoutWizard';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { MyTicketsPage } from './pages/MyTicketsPage';
import { AuthPage } from './pages/AuthPage';
import { ProfilePage } from './pages/ProfilePage';
import { DigitalPassPage } from './pages/DigitalPassPage';
import { TicketPassPage } from './pages/TicketPassPage';
import { CityPage } from './pages/CityPage';
import { BlogPage } from './pages/BlogPage';
import { BlogPostPage } from './pages/BlogPostPage';

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

// Admin Dashboard Shell & Pages
import { AdminLayoutPage } from './components/AdminLayoutPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminEvents } from './pages/admin/AdminEvents';
import { AdminBookings } from './pages/admin/AdminBookings';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminSeatMapBuilder } from './pages/admin/AdminSeatMapBuilder';
import { AdminCoupons } from './pages/admin/AdminCoupons';
import { AdminReports } from './pages/admin/AdminReports';
import { AdminReviews } from './pages/admin/AdminReviews';
import { AdminOrganizers } from './pages/admin/AdminOrganizers';
import { AdminCounters } from './pages/admin/AdminCounters';
import { OrganizerDashboard } from './pages/OrganizerDashboard';

import { AdminUsers } from './pages/admin/AdminUsers';

// Ticket Counter Dashboard Shell & Pages
import { CounterLayout } from './components/CounterLayout';
import { CounterOverview } from './pages/counter/CounterOverview';
import { WalkInPage } from './pages/counter/WalkInPage';
import { ShiftPage } from './pages/counter/ShiftPage';
import { CounterOrders } from './pages/counter/CounterOrders';

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

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BookingProvider>
        <BrowserRouter>
          <HashPassRedirectHandler />
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
              <Route index element={<CounterOverview />} />
              <Route path="shift" element={<ShiftPage />} />
              <Route path="scan" element={<QRScanner />} />
              <Route path="walk-in" element={<WalkInPage />} />
              <Route path="orders" element={<CounterOrders />} />
              <Route path="*" element={<Navigate to="/counter" replace />} />
            </Route>

            {/* Fallback redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </BookingProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
