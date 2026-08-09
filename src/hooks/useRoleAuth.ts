import { useAuth } from '../contexts/AuthContext';

export function useRoleAuth() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const role = user?.role || 'customer';

  const isAdmin = role === 'admin';
  const isTicketCounter = role === 'ticket_counter';
  const isStaff = isAdmin || isTicketCounter;
  const isAuthorized = isAuthenticated;

  return {
    user,
    role,
    isAuthenticated,
    isLoading,
    isAdmin,
    isTicketCounter,
    isStaff,
    isAuthorized,
    // Named granular permissions
    canManageEvents: isAdmin,
    canScanTickets: isStaff,
    canManualBook: isStaff,
    canViewAllBookings: isStaff,
    canManageStaffView: isAdmin,
  };
}
