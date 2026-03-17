/**
 * Staff Call Types
 * For customer-to-staff communication (e.g., call for payment)
 */

/** Status of a staff call request */
export type StaffCallStatus = 'PENDING' | 'ACKNOWLEDGED' | 'COMPLETED';

/** Type of staff call */
export type StaffCallType = 'PAYMENT' | 'SERVICE';

/** Staff call document from Firestore */
export type StaffCall = {
  id: string;
  tableId: string;
  orderId?: string;
  type: StaffCallType;
  status: StaffCallStatus;
  createdAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  completedAt?: Date;
  notes?: string;
};

/** Input for creating a staff call */
export type CreateStaffCallInput = {
  tableId: string;
  orderId?: string;
  type: StaffCallType;
  notes?: string;
};

/** Input for acknowledging a staff call */
export type AcknowledgeStaffCallInput = {
  callId: string;
  staffId: string;
};
