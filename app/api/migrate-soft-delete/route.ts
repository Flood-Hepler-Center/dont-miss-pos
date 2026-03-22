import { NextResponse } from 'next/server';
import { collection, getDocs, writeBatch, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const BATCH_LIMIT = 500;
    let totalOrdersUpdated = 0;
    let totalPaymentsUpdated = 0;

    // Use absolute exact ISO cut-off designated by user: before March 20, 2026 at 23:59:59 (+07:00)
    // 2026-03-20T23:59:59+07:00 => 1774025999000 ms
    const CUTOFF_TIMESTAMP = Timestamp.fromMillis(Date.parse('2026-03-20T23:59:59+07:00'));

    // --- Process Orders ---
    const ordersQuery = query(
      collection(db, 'orders'),
      where('createdAt', '<=', CUTOFF_TIMESTAMP)
    );
    const ordersSnap = await getDocs(ordersQuery);

    let batch = writeBatch(db);
    let count = 0;

    for (const docSnap of ordersSnap.docs) {
      if (docSnap.data().isDeleted) continue; // Skip if already soft-deleted

      batch.update(docSnap.ref, { 
        isDeleted: true,
        deletedAt: new Date().toISOString()
      });
      count++;
      totalOrdersUpdated++;

      if (count === BATCH_LIMIT) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }

    // --- Process Payments ---
    const paymentsQuery = query(
      collection(db, 'payments'),
      where('createdAt', '<=', CUTOFF_TIMESTAMP)
    );
    const paymentsSnap = await getDocs(paymentsQuery);

    batch = writeBatch(db);
    count = 0;

    for (const docSnap of paymentsSnap.docs) {
      if (docSnap.data().isDeleted) continue; // Skip if already soft-deleted

      batch.update(docSnap.ref, { 
        isDeleted: true,
        deletedAt: new Date().toISOString()
      });
      count++;
      totalPaymentsUpdated++;

      if (count === BATCH_LIMIT) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      message: 'Soft delete migration completed successfully',
      stats: {
        ordersUpdated: totalOrdersUpdated,
        paymentsUpdated: totalPaymentsUpdated,
      }
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
