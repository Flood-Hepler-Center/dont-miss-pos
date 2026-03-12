import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';

export async function GET() {
  try {
    // Get all orders
    const allOrders = await getDocs(collection(db, 'orders'));
    const orders = allOrders.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Get PLACED orders specifically
    const placedQuery = query(collection(db, 'orders'), where('status', '==', 'PLACED'));
    const placedOrders = await getDocs(placedQuery);
    const placed = placedOrders.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ 
      success: true,
      totalOrders: orders.length,
      placedOrders: placed.length,
      allOrders: orders,
      placedOrdersData: placed
    });
  } catch (error) {
    console.error('Error debugging orders:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
