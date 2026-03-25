'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { format } from 'date-fns';
import type { Payment, Order, OrderItem, SelectedModifier } from '@/types';
import { paymentService } from '@/lib/services/payment.service';

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [linkedOrders, setLinkedOrders] = useState<Order[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editDate, setEditDate] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

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

  const handleDeletePayment = async (paymentId: string) => {
    try {
      await paymentService.softDelete(paymentId, 'admin');
      setModalVisible(false);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert('Failed to delete payment transaction.');
    }
  };

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

  const handleUpdateDate = async () => {
    if (!selectedPayment || !editDate) return;
    setIsUpdating(true);
    try {
      const newDate = new Date(editDate);
      await paymentService.updateDate(selectedPayment.id, newDate);
      
      // Update local state
      setSelectedPayment({
        ...selectedPayment,
        createdAt: newDate
      });
      setIsEditingDate(false);
    } catch (error) {
      console.error('Error updating date:', error);
      alert('Failed to update date.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Group items helper
  const groupedItems = linkedOrders.flatMap(o => o.items).reduce((acc, item) => {
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
                    <div className="text-center flex justify-center gap-2">
                      <button
                        onClick={() => handleFetchDetails(payment)}
                        className="px-3 py-1 border-2 border-black text-xs font-bold hover:bg-black hover:text-white transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                      >
                        [VIEW]
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(payment.id)}
                        className="px-3 py-1 border-2 border-black text-xs font-bold text-red-600 hover:bg-red-50 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                      >
                        [DEL]
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleFetchDetails(payment)}
                      className="px-4 py-1.5 border-2 border-black text-xs font-bold bg-white active:bg-black active:text-white"
                    >
                      [DETAILS]
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(payment.id)}
                      className="px-4 py-1.5 border-2 border-black text-xs font-bold text-red-600 bg-white active:bg-red-600 active:text-white"
                    >
                      [DEL]
                    </button>
                  </div>
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
                  <div className="mt-2 flex flex-col items-center">
                    {isEditingDate ? (
                      <div className="flex flex-col gap-2 items-center">
                        <input
                          type="datetime-local"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="border-2 border-black p-1 text-xs font-mono w-full max-w-[200px]"
                        />
                        <div className="flex gap-2">
                          <button 
                            onClick={handleUpdateDate}
                            disabled={isUpdating}
                            className="text-[10px] font-bold underline px-2 py-1 border border-black hover:bg-black hover:text-white transition-colors"
                          >
                            {isUpdating ? 'SAVING...' : '[SAVE]'}
                          </button>
                          <button 
                            onClick={() => setIsEditingDate(false)}
                            className="text-[10px] font-bold underline px-2 py-1 border border-black hover:bg-gray-100 transition-colors"
                          >
                            [CANCEL]
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <p className="text-xs mt-1 uppercase font-bold">{format(selectedPayment.createdAt, 'EEEE, dd MMMM yyyy')}</p>
                        <p className="text-xs uppercase">{format(selectedPayment.createdAt, 'hh:mm:ss a')}</p>
                        <button 
                          onClick={() => {
                            setEditDate(format(selectedPayment.createdAt, "yyyy-MM-dd'T'HH:mm"));
                            setIsEditingDate(true);
                          }}
                          className="text-[10px] font-bold underline mt-2 hover:text-blue-600 transition-colors"
                        >
                          [EDIT DATE/TIME]
                        </button>
                      </div>
                    )}
                  </div>
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
                      {Object.values(groupedItems).map((item, idx) => (
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
                            ฿{(item.subtotal).toFixed(2)}
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

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black max-w-md w-full font-mono">
              <div className="border-b-2 border-black p-4">
                <h2 className="text-lg font-bold text-center text-red-600">[DELETE PAYMENT?]</h2>
              </div>
              <div className="p-4">
                <p className="text-sm text-center mb-6">Are you sure you want to delete this payment record? This action will mark it as deleted.</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
                  >
                    [NO, CANCEL]
                  </button>
                  <button
                    onClick={() => handleDeletePayment(deleteConfirm)}
                    className="px-6 py-3 border-2 border-black bg-red-600 text-white font-bold text-sm hover:bg-red-700"
                  >
                    [YES, DELETE]
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
