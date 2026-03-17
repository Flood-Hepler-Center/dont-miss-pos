'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, Button, Divider } from 'antd';
import { format } from 'date-fns';
import type { Payment, Order, OrderItem } from '@/types';
import { Share2, Image as ImageIcon } from 'lucide-react';
import { toPng } from 'html-to-image';
import QRCode from 'antd/es/qr-code';

interface ReceiptProps {
  payment: Payment;
  orders?: Order[];
}

export function Receipt({ payment, orders }: ReceiptProps) {
  const [receiptUrl, setReceiptUrl] = useState<string>('');
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setReceiptUrl(`${window.location.origin}/receipt/${payment.id}`);
  }, [payment.id]);

  const handleShare = async () => {
    if (!receiptUrl) return;

    const receiptDate = payment.processedAt instanceof Date
      ? payment.processedAt
      : new Date((payment.processedAt as { seconds: number }).seconds * 1000);

    const formattedDate = format(receiptDate, 'dd MMM yyyy, HH:mm');
    const shareText = `Receipt #${payment.receiptNumber}\nDate: ${formattedDate}\nTotal: ฿${payment.total.toFixed(2)}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Don't Miss This Saturday - Receipt",
          text: shareText,
          url: receiptUrl,
        });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Error sharing', error);
        }
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(`${shareText}\n${receiptUrl}`);
        alert('Receipt info copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
  };

  const handleDownloadImage = async () => {
    if (!receiptRef.current) return;

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
        },
      });

      const link = document.createElement('a');
      link.download = `receipt-${payment.receiptNumber}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error generating image', err);
    }
  };

  const receiptDate = payment.processedAt instanceof Date
    ? payment.processedAt
    : new Date((payment.processedAt as { seconds: number }).seconds * 1000);

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="border-gray-200 shadow-soft-sm receipt-card">
        <div ref={receiptRef} className="receipt-content font-mono text-sm bg-white p-4">
          <div className="text-center mb-4">
            <div className="text-xl font-bold"></div>
            <h2 className="text-2xl font-bold my-2">DON&apos;T MISS THIS SATURDAY</h2>
            <div className="text-xl font-bold"></div>
          </div>

          <div className="mb-4 space-y-1">
            <div className="flex justify-between">
              <span>Receipt #:</span>
              <span className="font-bold">{payment.receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{format(receiptDate, 'dd MMM yyyy, HH:mm')}</span>
            </div>
            <div className="flex justify-between">
              <span>Table:</span>
              <span>{payment.tableId}</span>
            </div>
            <div className="flex justify-between">
              <span>Cashier:</span>
              <span>{payment.processedBy}</span>
            </div>
          </div>

          <Divider className="my-3" style={{ borderColor: '#666' }} />

          <div className="mb-4">
            <p className="text-xs text-gray-600 mb-2">Order Items (from system records)</p>
            {orders && orders.length > 0 ? (
              <div className="space-y-2 text-sm">
                {orders.flatMap(o => o.items || []).map((item: OrderItem, idx: number) => (
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
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No detailed items available.</p>
            )}
          </div>

          <Divider className="my-3" style={{ borderColor: '#666' }} />

          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>฿{payment.subtotal.toFixed(2)}</span>
            </div>
            {payment.discountAmount > 0 && (
              <div className="flex justify-between text-orange-600">
                <span>
                  Discount ({payment.discountType === 'PERCENTAGE' ? `${payment.discountPercent}%` : 'Fixed'}):
                </span>
                <span>-฿{payment.discountAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <Divider className="my-3" style={{ borderColor: '#666' }} />

          <div className="flex justify-between text-lg font-bold mb-4">
            <span>TOTAL:</span>
            <span>฿{payment.total.toFixed(2)}</span>
          </div>

          <div className="text-xl font-bold mb-4"></div>

          <div className="space-y-1 mb-4">
            <div className="flex justify-between">
              <span>Payment:</span>
              <span className="font-bold">{payment.paymentMethod}</span>
            </div>
            {payment.paymentMethod === 'CASH' && (
              <>
                <div className="flex justify-between">
                  <span>Received:</span>
                  <span>฿{payment.amountReceived?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Change:</span>
                  <span>฿{payment.change?.toFixed(2)}</span>
                </div>
              </>
            )}
            {payment.paymentMethod === 'PROMPTPAY' && (
              <div className="flex justify-between">
                <span>Reference:</span>
                <span>{payment.promptpayReference}</span>
              </div>
            )}
          </div>

          <div className="text-xl font-bold mb-4"></div>

          <div className="text-center my-4">
            <p className="text-lg font-bold">Thank you! Come again!</p>
          </div>

          {receiptUrl && (
            <>
              <Divider className="my-3" style={{ borderColor: '#666' }} />
              <div className="text-center my-4">
                <p className="text-xs mb-2">SCAN FOR E-RECEIPT</p>
                <div className="inline-flex border border-gray-300 p-2">
                  <QRCode value={receiptUrl} size={140} />
                </div>
                <p className="text-[11px] mt-2 break-all">{receiptUrl}</p>
              </div>
            </>
          )}

          <div className="text-xl font-bold"></div>
        </div>

        <Divider />

        <div className="grid grid-cols-2 gap-3 no-print">
          <Button
            icon={<Share2 size={16} />}
            size="large"
            block
            onClick={handleShare}
          >
            Share
          </Button>
          <Button
            icon={<ImageIcon size={16} />}
            size="large"
            block
            onClick={handleDownloadImage}
          >
            Save Image
          </Button>
        </div>
      </Card>

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
