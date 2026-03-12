'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { format } from 'date-fns';
import type { StockMovement } from '@/types';

export default function InventoryHistoryPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'stockMovements'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const movementsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: (data.timestamp as Timestamp)?.toDate() || new Date()
        } as StockMovement;
      });
      setMovements(movementsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6 pb-24">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <h1 className="text-xl md:text-2xl font-bold my-2 uppercase tracking-tighter">Inventory Audit Trail</h1>
          <p className="text-xs md:text-sm">Auto-Stocking & Manual Adjustments History</p>
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
        </div>

        {/* History List */}
        <div className="border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="hidden md:block">
            <div className="border-b-2 border-black p-3 bg-black text-white">
              <div className="grid grid-cols-8 gap-4 text-[10px] font-bold uppercase tracking-widest text-center">
                <div className="text-left">Date / Time</div>
                <div className="text-left">Item Name</div>
                <div>Type</div>
                <div>Change</div>
                <div>Previous</div>
                <div>New</div>
                <div className="col-span-2 text-left">Reason / Order ID</div>
              </div>
            </div>
            <div className="divide-y-2 divide-black max-h-[70vh] overflow-y-auto">
              {movements.map((movement) => (
                <div key={movement.id} className="p-3 hover:bg-gray-50 transition-all group border-b border-black last:border-b-0">
                  <div className="grid grid-cols-8 gap-4 text-[13px] items-center text-center">
                    <div className="text-left font-bold text-[11px] leading-tight">
                      {format(movement.timestamp, 'dd/MM/yyyy')}
                      <br />
                      <span className="text-gray-400">{format(movement.timestamp, 'HH:mm:ss')}</span>
                    </div>
                    <div className="text-left font-bold truncate pr-2 uppercase">{movement.inventoryItemName}</div>
                    <div>
                      <span className={`px-2 py-0.5 border border-black text-[9px] font-black ${
                        movement.type === 'DEDUCTION' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                      }`}>
                        {movement.type}
                      </span>
                    </div>
                    <div className={`font-black ${
                      movement.type === 'DEDUCTION' ? 'text-red-500' : 'text-green-500'
                    }`}>
                      {movement.type === 'DEDUCTION' ? '-' : '+'}{movement.quantity}
                    </div>
                    <div className="text-gray-400">{movement.previousStock}</div>
                    <div className="font-bold underline decoration-1 underline-offset-4">{movement.newStock}</div>
                    <div className="col-span-2 text-left">
                      <p className="text-[11px] leading-tight text-gray-600 font-medium">
                        {movement.reason}
                      </p>
                      {movement.relatedOrderId && (
                        <p className="text-[9px] font-bold mt-1 text-black bg-yellow-100 inline-block px-1 border border-black italic">
                          ID: {movement.relatedOrderId.slice(-8).toUpperCase()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile View */}
          <div className="md:hidden divide-y-2 divide-black">
            {movements.map((m) => (
              <div key={m.id} className="p-4 bg-white active:bg-gray-50">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold">{format(m.timestamp, 'dd MMM HH:mm')}</span>
                  <span className={`text-[10px] font-bold px-1.5 border border-black ${
                    m.type === 'DEDUCTION' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                  }`}>{m.type}</span>
                </div>
                <h3 className="font-bold uppercase mb-1">{m.inventoryItemName}</h3>
                <div className="flex justify-between text-xs mb-2">
                  <span>Change: <b className={m.type === 'DEDUCTION' ? 'text-red-600' : 'text-green-600'}>
                    {m.type === 'DEDUCTION' ? '-' : '+'}{m.quantity}
                  </b></span>
                  <span>Stock: <b>{m.newStock}</b></span>
                </div>
                <p className="text-[11px] italic text-gray-600 border-t border-black border-dashed pt-2 mt-2">{m.reason}</p>
              </div>
            ))}
          </div>

          {movements.length === 0 && !loading && (
            <div className="p-20 text-center font-bold italic tracking-tighter text-gray-300">
              AUDIT LOG EMPTY - NO MOVEMENTS RECORDED
            </div>
          )}
          {loading && (
            <div className="p-20 text-center">
               <div className="inline-block animate-spin text-2xl">⏳</div>
               <p className="text-xs font-bold mt-2">PROCESSING RECORDS...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
