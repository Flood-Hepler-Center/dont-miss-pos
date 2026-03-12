import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export async function POST() {
  try {
    console.log('🌱 Seeding tables...');

    const tables = [];
    
    // Create 20 tables
    for (let i = 1; i <= 20; i++) {
      const tableData = {
        tableNumber: i,
        tableId: i.toString(),
        capacity: i <= 10 ? 4 : 6,
        status: 'VACANT',
        activeOrders: [],
        currentSessionId: null,
        totalAmount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const tableRef = doc(db, 'tables', i.toString());
      await setDoc(tableRef, tableData);
      tables.push({ tableNumber: i });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Created ${tables.length} tables`,
      tables 
    });
  } catch (error) {
    console.error('Error seeding tables:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
