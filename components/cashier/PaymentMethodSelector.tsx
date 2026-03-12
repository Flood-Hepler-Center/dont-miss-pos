'use client';

interface PaymentMethodSelectorProps {
  onSelect: (method: 'CASH' | 'PROMPTPAY') => void;
}

export function PaymentMethodSelector({ onSelect }: PaymentMethodSelectorProps) {
  return (
    <div className="font-mono">
      <div className="border-2 border-black p-3 mb-6">
        <p className="text-sm text-center font-bold">[ SELECT PAYMENT METHOD ]</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => onSelect('CASH')}
          className="border-2 border-black p-8 hover:bg-gray-100 cursor-pointer transition-colors"
        >
          <div className="text-center">
            <div className="text-6xl mb-4">💵</div>
            <h3 className="text-xl font-bold mb-2">CASH</h3>
            <p className="text-xs">PHYSICAL CURRENCY</p>
          </div>
        </button>

        <button
          onClick={() => onSelect('PROMPTPAY')}
          className="border-2 border-black p-8 hover:bg-gray-100 cursor-pointer transition-colors"
        >
          <div className="text-center">
            <div className="text-6xl mb-4">📱</div>
            <h3 className="text-xl font-bold mb-2">PROMPTPAY</h3>
            <p className="text-xs">QR CODE PAYMENT</p>
          </div>
        </button>
      </div>
    </div>
  );
}
