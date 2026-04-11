'use client';

import { useState, useEffect } from 'react';
import { bookingService } from '@/lib/services/booking.service';
import type { Booking } from '@/types';

/**
 * Hook to get count of late bookings in real-time
 * Late = PENDING or CONFIRMED status + booking time has passed
 */
export function useLateBookingsCount(): number {
  const [lateCount, setLateCount] = useState(0);

  useEffect(() => {
    // Subscribe to today's bookings
    const unsubscribe = bookingService.subscribeByDate(new Date(), (bookings) => {
      const now = new Date();
      const late = bookings.filter((booking) => {
        // Late if PENDING or CONFIRMED and time has passed
        const isPendingOrConfirmed = booking.status === 'PENDING' || booking.status === 'CONFIRMED';
        const timePassed = booking.time < now;
        return isPendingOrConfirmed && timePassed;
      });
      setLateCount(late.length);
    });

    return () => unsubscribe();
  }, []);

  return lateCount;
}

/**
 * Helper to check if a booking is late
 */
export function isBookingLate(booking: Booking): boolean {
  const now = new Date();
  const isPendingOrConfirmed = booking.status === 'PENDING' || booking.status === 'CONFIRMED';
  const timePassed = booking.time < now;
  return isPendingOrConfirmed && timePassed;
}
