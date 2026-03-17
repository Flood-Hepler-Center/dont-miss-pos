import type { OrderType } from '@/types';

interface OrderTypeBadgeProps {
  orderType: OrderType;
}

export function OrderTypeBadge({ orderType }: OrderTypeBadgeProps) {
  const styles = {
    DINE_IN: 'bg-gray-600 text-white',
    TAKE_AWAY: 'bg-blue-600 text-white',
  };

  const labels = {
    DINE_IN: 'DINE-IN',
    TAKE_AWAY: 'TAKE-AWAY',
  };

  return (
    <span className={`inline-block px-2 py-1 text-xs font-bold uppercase rounded ${styles[orderType]}`}>
      {labels[orderType]}
    </span>
  );
}
