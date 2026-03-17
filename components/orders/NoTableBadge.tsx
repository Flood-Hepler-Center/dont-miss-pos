import type { Order } from '@/types';

interface NoTableBadgeProps {
  tableId?: string | null;
  className?: string;
}

export function NoTableBadge({ tableId, className = '' }: NoTableBadgeProps) {
  // Only show if tableId is null, undefined, or empty string
  if (tableId) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-1 bg-amber-100 border-2 border-amber-500 text-amber-800 text-xs font-bold ${className}`}
      aria-label="No table assigned"
    >
      <span className="mr-1">⚠️</span>
      ยังไม่มีโต๊ะ
    </span>
  );
}

interface OrderTableInfoProps {
  order: Order;
  showBadge?: boolean;
}

export function OrderTableInfo({ order, showBadge = true }: OrderTableInfoProps) {
  if (order.tableId) {
    return (
      <span className="inline-flex items-center px-2 py-1 bg-black text-white text-xs font-bold">
        TABLE #{order.tableId}
      </span>
    );
  }

  if (showBadge) {
    return <NoTableBadge tableId={order.tableId} />;
  }

  return (
    <span className="inline-flex items-center px-2 py-1 bg-gray-100 border-2 border-gray-400 text-gray-600 text-xs font-bold">
      NO TABLE
    </span>
  );
}
