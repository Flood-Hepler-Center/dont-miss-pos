'use client';

import { BookingPageContent } from '@/components/bookings';

export default function AdminBookingsPage() {
  return <BookingPageContent isAdmin={true} />;
}
