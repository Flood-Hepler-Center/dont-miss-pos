'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { format } from 'date-fns';
import type { Payment, Order, SelectedModifier } from '@/types';

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [linkedOrders, setLinkedOrders] = useState<Order[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'payments'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const paymentsData = (snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: (doc.data().createdAt as Timestamp)?.toDate() || new Date(),
      })) as Payment[]).filter((p) => !p.isDeleted);
      setPayments(paymentsData);
    });

    return () => unsubscribe();
  }, []);

  const handleFetchDetails = async (payment: Payment) => {
    setSelectedPayment(payment);
    setModalVisible(true);
    setLoadingOrders(true);
    setLinkedOrders([]);

    try {
      const orders: Order[] = [];
      for (const orderId of payment.orderIds) {
        const orderSnap = await getDoc(doc(db, 'orders', orderId));
        if (orderSnap.exists()) {
          orders.push({ id: orderSnap.id, ...orderSnap.data() } as Order);
        }
      }
      setLinkedOrders(orders);
    } catch (error) {
      console.error('Error fetching linked orders:', error);
    } finally {
      setLoadingOrders(false);
    }
  };

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6 pb-24">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <h1 className="text-xl md:text-2xl font-bold my-2 text-black">PAYMENT TRANSACTIONS</h1>
          <p className="text-xs md:text-sm">Financial Record & Audit Trail</p>
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
        </div>

        {/* Payments List */}
        <div className="border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="hidden md:block">
            <div className="border-b-2 border-black p-3 bg-black text-white">
              <div className="grid grid-cols-7 gap-4 text-xs font-bold uppercase tracking-wider">
                <div>Receipt #</div>
                <div>Table</div>
                <div>Date/Time</div>
                <div>Method</div>
                <div className="text-right">Subtotal</div>
                <div className="text-right">Total</div>
                <div className="text-center">Actions</div>
              </div>
            </div>
            <div className="divide-y-2 divide-black">
              {payments.map((payment) => (
                <div key={payment.id} className="p-3 hover:bg-gray-50 transition-colors group">
                  <div className="grid grid-cols-7 gap-4 text-sm items-center">
                    <div className="font-bold">#{payment.receiptNumber}</div>
                    <div>TABLE {payment.tableId}</div>
                    <div className="text-xs">
                      {format(payment.createdAt, 'dd MMM yyyy')}
                      <br />
                      {format(payment.createdAt, 'HH:mm')}
                    </div>
                    <div>
                      <span className={`px-2 py-0.5 border border-black text-[10px] font-bold ${
                        payment.paymentMethod === 'PROMPTPAY' ? 'bg-blue-50' : 'bg-green-50'
                      }`}>
                        {payment.paymentMethod}
                      </span>
                    </div>
                    <div className="text-right text-gray-500">฿{payment.subtotal.toFixed(2)}</div>
                    <div className="text-right font-bold">฿{payment.total.toFixed(2)}</div>
                    <div className="text-center">
                      <button
                        onClick={() => handleFetchDetails(payment)}
                        className="px-3 py-1 border-2 border-black text-xs font-bold hover:bg-black hover:text-white transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                      >
                        [VIEW]
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile List */}
          <div className="md:hidden divide-y-2 divide-black">
            {payments.map((payment) => (
              <div key={payment.id} className="p-4 bg-white active:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-bold">#{payment.receiptNumber}</p>
                    <p className="text-xs text-gray-600">TABLE {payment.tableId} • {format(payment.createdAt, 'HH:mm')}</p>
                  </div>
                  <span className="text-sm font-bold">฿{payment.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mt-3">
                   <span className="text-[10px] font-bold px-1.5 py-0.5 border border-black uppercase">
                    {payment.paymentMethod}
                  </span>
                  <button
                    onClick={() => handleFetchDetails(payment)}
                    className="px-4 py-1.5 border-2 border-black text-xs font-bold bg-white active:bg-black active:text-white"
                  >
                    [DETAILS]
                  </button>
                </div>
              </div>
            ))}
          </div>

          {payments.length === 0 && (
            <div className="p-12 text-center text-gray-400 font-bold italic">
              NO TRANSACTIONS RECORDED
            </div>
          )}
        </div>

        {/* Receipt Modal */}
        {modalVisible && selectedPayment && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white border-4 border-black max-w-lg w-full font-mono my-8 transition-all animate-in fade-in zoom-in duration-200">
              <div className="p-6">
                {/* Receipt Header */}
                <div className="text-center border-b-2 border-black border-dashed pb-4 mb-4">
                  <h2 className="text-xl font-bold tracking-widest">RECEIPT</h2>
                  <p className="text-xs font-bold mt-1">#{selectedPayment.receiptNumber}</p>
                  <p className="text-xs mt-1 uppercase">{format(selectedPayment.createdAt, 'EEEE, dd MMMM yyyy')}</p>
                  <p className="text-xs uppercase">{format(selectedPayment.createdAt, 'hh:mm:ss a')}</p>
                </div>

                {/* Receipt Details */}
                <div className="space-y-1 text-sm mb-4">
                  <div className="flex justify-between">
                    <span>TABLE:</span>
                    <span className="font-bold">{selectedPayment.tableId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>METHOD:</span>
                    <span className="font-bold">{selectedPayment.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>STATUS:</span>
                    <span className={`font-bold ${selectedPayment.status === 'VOIDED' ? 'text-red-600' : 'text-green-600'}`}>
                      {selectedPayment.status}
                    </span>
                  </div>
                </div>

                {/* Items */}
                <div className="border-t-2 border-black border-dashed pt-4 mb-4 min-h-[100px]">
                  <p className="text-xs font-bold mb-3 underline decoration-double underline-offset-4">[PURCHASED ITEMS]</p>
                  {loadingOrders ? (
                    <div className="py-8 text-center animate-pulse italic text-xs">Loading items...</div>
                  ) : (
                    <div className="space-y-3">
                      {linkedOrders.flatMap(o => o.items).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <div className="flex-1 pr-4">
                            <p className="font-bold flex items-start gap-1">
                              <span>{item.name}</span>
                              <span className="text-[10px] bg-black text-white px-1 mt-0.5">x{item.quantity}</span>
                            </p>
                            {item.modifiers?.map((m: SelectedModifier, i: number) => (
                              <p key={i} className="text-[10px] text-gray-500 ml-2">+ {m.optionName}</p>
                            ))}
                          </div>
                          <div className="text-right font-bold whitespace-nowrap">
                            ฿{(item.quantity * item.price).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Totals */}
                <div className="border-t-2 border-black border-dashed pt-4 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>SUBTOTAL:</span>
                    <span>฿{selectedPayment.subtotal.toFixed(2)}</span>
                  </div>
                  {selectedPayment.discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>DISCOUNT {selectedPayment.discountPercent ? `(${selectedPayment.discountPercent}%)` : ''}:</span>
                      <span>-฿{selectedPayment.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold pt-2 border-t-2 border-black">
                    <span>TOTAL AMOUNT:</span>
                    <span>฿{selectedPayment.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-8 pt-4 border-t-2 border-black border-dashed text-center">
                  <p className="text-[10px] font-bold tracking-[0.2em] mb-4 italic">*** THANK YOU FOR YOUR BUSINESS ***</p>
                  <button
                    onClick={() => setModalVisible(false)}
                    className="w-full py-3 border-4 border-black bg-black text-white font-bold hover:bg-white hover:text-black transition-all uppercase text-sm active:scale-95"
                  >
                    CLOSE RECORD
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
