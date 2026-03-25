'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { Button, Card, Divider, Spin } from 'antd';
import { Share2, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { toPng } from 'html-to-image';
import { db } from '@/lib/firebase/config';
import { orderService } from '@/lib/services/order.service';
import type { Payment, Order, OrderItem, SelectedModifier } from '@/types';

type ReceiptState = {
  payment: Payment | null;
  orders: Order[];
  merchantInfo: { businessName: string; address: string; taxId: string } | null;
  loading: boolean;
  error: string | null;
};

const toDate = (value: unknown): Date => {
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === 'object' && 'seconds' in (value as Timestamp)) {
    return new Date((value as Timestamp).seconds * 1000);
  }
  return new Date();
};

export default function PublicReceiptPage() {
  const params = useParams<{ paymentId: string }>();
  const router = useRouter();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ReceiptState>({
    payment: null,
    orders: [],
    merchantInfo: null,
    loading: true,
    error: null,
  });

  const paymentId = useMemo(() => {
    if (!params?.paymentId) {
      return '';
    }
    return Array.isArray(params.paymentId) ? params.paymentId[0] : params.paymentId;
  }, [params?.paymentId]);

  useEffect(() => {
    const loadPaymentAndOrders = async () => {
      if (!paymentId) {
        setState({ payment: null, orders: [], merchantInfo: null, loading: false, error: 'Receipt not found' });
        return;
      }

      try {
        // AC-1: Load payment
        const paymentRef = doc(db, 'payments', paymentId);
        const snapshot = await getDoc(paymentRef);

        if (!snapshot.exists()) {
          setState({ payment: null, orders: [], merchantInfo: null, loading: false, error: 'Receipt not found' });
          return;
        }

        const paymentData = { id: snapshot.id, ...snapshot.data() } as Payment;

        // AC-2: Load linked orders
        let ordersData: Order[] = [];
        if (paymentData.orderIds && paymentData.orderIds.length > 0) {
          const orderPromises = paymentData.orderIds.map((orderId: string) =>
            orderService.getById(orderId)
          );
          const orderResults = await Promise.all(orderPromises);
          ordersData = orderResults.filter((order): order is Order => order !== null);
        }

        // AC-3: Define merchant info (could be loaded from settings in future)
        const merchantInfo = {
          businessName: "DON'T MISS THIS SATURDAY",
          address: "123 Bangkok Street",
          taxId: "1234567890123"
        };

        setState({
          payment: paymentData,
          orders: ordersData,
          merchantInfo,
          loading: false,
          error: null,
        });
      } catch (error) {
        console.error('Error loading receipt:', error);
        setState({ payment: null, orders: [], merchantInfo: null, loading: false, error: 'Failed to load receipt' });
      }
    };

    void loadPaymentAndOrders();
  }, [paymentId]);

  const handleShare = async () => {
    if (!state.payment) return;

    const receiptUrl = typeof window !== 'undefined' ? window.location.href : '';
    const payment = state.payment;
    const processedDate = toDate(payment.processedAt);
    const formattedDate = format(processedDate, 'dd MMM yyyy, HH:mm');
    const shareText = `Receipt #${payment.receiptNumber}\nDate: ${formattedDate}\nTotal: ฿${payment.total.toFixed(2)}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Don't Miss This Saturday - Receipt",
          text: shareText,
          url: receiptUrl,
        });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') console.error('Error sharing', error);
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${receiptUrl}`);
        alert('Receipt info copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
  };

  const handleDownloadImage = async () => {
    if (!receiptRef.current || !state.payment) return;
    try {
      const node = receiptRef.current;
      const dataUrl = await toPng(node, { 
        cacheBust: true, 
        pixelRatio: 2,
        width: node.offsetWidth,
        height: node.offsetHeight,
        style: { 
          margin: '0',
          transform: 'scale(1)',
          transformOrigin: 'top left',
        } 
      });
      const link = document.createElement('a');
      link.download = `receipt-${state.payment.receiptNumber}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error generating image', err);
    }
  };

  if (state.loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center font-mono">
        <div className="text-center border-2 border-black p-8">
          <Spin />
          <p className="text-sm mt-3">LOADING RECEIPT...</p>
        </div>
      </div>
    );
  }

  if (state.error || !state.payment) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4 font-mono">
        <Card className="w-full max-w-md border-2 border-black">
          <p className="text-center text-sm font-bold">{state.error || 'Receipt not found'}</p>
          <Button className="mt-4" block onClick={() => router.push('/')}>
            Back to Home
          </Button>
        </Card>
      </div>
    );
  }

  const payment = state.payment;
  const orders = state.orders;
  const merchantInfo = state.merchantInfo;
  const processedDate = toDate(payment.processedAt);

  // AC-3: Flatten and group items from all orders
  const groupedItems = orders.flatMap((order) => order.items || []).reduce((acc, item) => {
    const modifierKey = (item.modifiers || [])
      .map(m => m.optionId)
      .sort()
      .join(',');
    const key = `${item.menuItemId}-${modifierKey}`;
    
    // Calculate display subtotal (Base + Modifiers) * Quantity
    const modifierAdjustment = (item.modifiers || []).reduce(
      (sum: number, mod: SelectedModifier) => sum + (mod.priceAdjustment || 0),
      0
    );
    const itemFullPrice = item.price + modifierAdjustment;
    const calculatedSubtotal = itemFullPrice * item.quantity;

    if (acc[key]) {
      acc[key].quantity += item.quantity;
      acc[key].subtotal += (item.subtotal || calculatedSubtotal);
    } else {
      acc[key] = { 
        ...item, 
        subtotal: item.subtotal || calculatedSubtotal 
      };
    }
    return acc;
  }, {} as Record<string, OrderItem>);

  const allItems = Object.values(groupedItems);

  return (
    <div className="min-h-screen bg-gray-100 p-4 font-mono">
      <div className="max-w-xl mx-auto">
        <Card className="border-2 border-black receipt-card">
          <div ref={receiptRef} className="bg-white receipt-content">
            <div className="text-center mb-3">
              <h1 className="text-2xl font-bold">{merchantInfo?.businessName || "DON'T MISS THIS SATURDAY"}</h1>
              <p className="text-xs mt-2">E-RECEIPT</p>
            </div>

            <Divider />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Receipt #</span>
                <span className="font-bold">{payment.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Date</span>
                <span>{format(processedDate, 'dd MMM yyyy, HH:mm')}</span>
              </div>
              <div className="flex justify-between">
                <span>Table/Source</span>
                <span>{payment.tableId}</span>
              </div>
              <div className="flex justify-between">
                <span>Method</span>
                <span>{payment.paymentMethod}</span>
              </div>
            </div>

            <Divider />

            {/* AC-3: Display order items */}
            <div className="space-y-2 text-sm">
              <p className="text-xs text-gray-600 mb-2">ITEMS</p>
              {allItems.length === 0 ? (
                <p className="text-xs text-gray-500">No items available</p>
              ) : (
                allItems.map((item: OrderItem, idx: number) => (
                  <div key={idx} className="flex justify-between">
                    <div className="flex-1">
                      <span className={item.isVoided ? 'line-through text-gray-400' : ''}>
                        {item.name}
                      </span>
                      <span className="text-xs text-gray-600 ml-2">x{item.quantity}</span>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="text-xs text-gray-500 ml-2">
                          {item.modifiers.map((mod, mIdx) => (
                            <span key={mIdx}>+ {mod.optionName}</span>
                          ))}
                        </div>
                      )}
                      {item.isVoided && (
                        <span className="text-xs text-red-500 ml-2">(VOIDED)</span>
                      )}
                    </div>
                    <span className={item.isVoided ? 'line-through text-gray-400' : ''}>
                      ฿{(item.subtotal || 0).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <Divider />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>฿{payment.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount</span>
                <span>-฿{payment.discountAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>฿{payment.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <Divider />

          <div className="grid grid-cols-2 gap-3 no-print">
            <Button size="large" block icon={<Share2 size={16} />} onClick={handleShare}>
              Share
            </Button>
            <Button size="large" block icon={<ImageIcon size={16} />} onClick={handleDownloadImage}>
              Save Image
            </Button>
          </div>
        </Card>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .receipt-card,
          .receipt-card * {
            visibility: visible;
          }
          .receipt-card {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
