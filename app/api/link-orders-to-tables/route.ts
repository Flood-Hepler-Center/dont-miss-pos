import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';

export async function POST() {
  try {
    // Get all orders
    const ordersSnapshot = await getDocs(collection(db, 'orders'));
    const orders = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    let linkedCount = 0;

    // Link each order to its table
    for (const order of orders as Array<{ id: string; tableId?: string; status?: string }>) {
      if (order.tableId && order.status !== 'COMPLETED' && order.status !== 'CANCELLED') {
        const tableRef = doc(db, 'tables', order.tableId);
        
        try {
          // Add order to table's activeOrders
          await updateDoc(tableRef, {
            activeOrders: arrayUnion(order.id),
            status: 'OCCUPIED',
            updatedAt: serverTimestamp(),
          });
          
          linkedCount++;
        } catch (error) {
          console.error(`Failed to link order ${order.id}:`, error);
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Linked ${linkedCount} orders to tables`,
      linkedCount 
    });
  } catch (error) {
    console.error('Error linking orders:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
