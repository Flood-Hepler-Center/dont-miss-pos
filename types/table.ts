/**
 * Table & Session Types
 * Source: BA Data Model - dm-orders-tables.md
 */

/** Table status: VACANT → OCCUPIED → WAITING → READY_TO_PAY */
export type TableStatus =
  | 'VACANT'
  | 'OCCUPIED'
  | 'WAITING'
  | 'READY_TO_PAY';

/** Restaurant table */
export type Table = {
  id: string;
  tableNumber: number;
  capacity: number;
  status: TableStatus;
  isActive: boolean;
  activeOrders?: string[];
  currentSession?: {
    sessionId: string;
    startedAt: Date;
    guestCount?: number;
  };
  qrCode?: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Customer session created on QR scan, expires in 4 hours */
export type CustomerSession = {
  sessionId: string;
  tableId: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  orderIds: string[];
  isActive: boolean;
};

/** Staff session created on PIN login, expires in 8 hours */
export type StaffSession = {
  sessionId: string;
  role: 'STAFF' | 'ADMIN';
  authenticatedAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  deviceInfo?: string;
};
