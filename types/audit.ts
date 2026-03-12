/**
 * Audit Log Types
 * Source: BA Data Model - dm-orders-tables.md
 */

export type AuditAction =
  | 'CREATED'
  | 'EDITED'
  | 'STATUS_CHANGED'
  | 'ITEM_ADDED'
  | 'ITEM_REMOVED'
  | 'VOIDED'
  | 'COMPED'
  | 'MOVED';

/** Field change record for audit */
export type FieldChange = {
  field: string;
  oldValue: string | number | boolean;
  newValue: string | number | boolean;
};

/** Order audit log entry */
export type OrderAuditLog = {
  id: string;
  orderId: string;
  action: AuditAction;
  changes?: FieldChange[];
  performedBy: string;
  timestamp: Date;
  reason?: string;
  notes?: string;
};
