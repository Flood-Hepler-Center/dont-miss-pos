export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';
export type BookingSource = 'PHONE' | 'WALK_IN' | 'WEBSITE' | 'SOCIAL' | 'OTHER';

export interface Booking {
  id: string;
  name: string;
  phone: string;
  amount: number; // Number of people
  time: Date;
  status: BookingStatus;
  source?: BookingSource;
  tableId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBookingInput {
  name: string;
  phone: string;
  amount: number;
  time: Date;
  source?: BookingSource;
  tableId?: string;
  notes?: string;
}

export interface UpdateBookingInput {
  name?: string;
  phone?: string;
  amount?: number;
  time?: Date;
  source?: BookingSource;
  tableId?: string;
  notes?: string;
}

export const BOOKING_STATUS_CONFIG: Record<BookingStatus, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'yellow' },
  CONFIRMED: { label: 'Confirmed', color: 'blue' },
  SEATED: { label: 'Seated', color: 'green' },
  CANCELLED: { label: 'Cancelled', color: 'red' },
  NO_SHOW: { label: 'No Show', color: 'gray' },
};

export const BOOKING_SOURCE_CONFIG: Record<BookingSource, { label: string }> = {
  PHONE: { label: 'Phone' },
  WALK_IN: { label: 'Walk-in' },
  WEBSITE: { label: 'Website' },
  SOCIAL: { label: 'Social Media' },
  OTHER: { label: 'Other' },
};
