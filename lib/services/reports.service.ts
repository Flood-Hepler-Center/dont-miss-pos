import { 
  collection, 
  query, 
  where, 
  getDocs, 
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Order } from '@/types';

export interface EODReport {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  totalDiscounts: number;
  netRevenue: number;
  cashPayments: number;
  promptpayPayments: number;
  cardPayments: number;
  taxCollected: number;
}

export interface SalesSummaryReport {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  completedOrders: number;
  cancelledOrders: number;
  dailyBreakdown: Array<{
    date: string;
    revenue: number;
    orders: number;
  }>;
}

export interface TopItemsReport {
  items: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

export interface CategoryPerformanceReport {
  categories: Array<{
    category: string;
    revenue: number;
    itemsSold: number;
    avgPrice: number;
  }>;
}

export interface PaymentMethodsReport {
  cash: { count: number; total: number };
  promptpay: { count: number; total: number };
  card: { count: number; total: number };
}

export const reportsService = {
  /**
   * Generate End of Day report
   */
  async generateEODReport(date: Date): Promise<EODReport> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
        where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      );

      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

      let totalRevenue = 0;
      let totalDiscounts = 0;
      let cashPayments = 0;
      let promptpayPayments = 0;
      let cardPayments = 0;
      let taxCollected = 0;

      orders.forEach(order => {
        if (order.status !== 'CANCELLED') {
          totalRevenue += order.total || 0;
          totalDiscounts += order.discount || 0;
          taxCollected += order.tax || 0;

          // Aggregate by payment method if available
          if (order.paymentMethod === 'CASH') {
            cashPayments += order.total || 0;
          } else if (order.paymentMethod === 'PROMPTPAY') {
            promptpayPayments += order.total || 0;
          } else if (order.paymentMethod === 'CARD') {
            cardPayments += order.total || 0;
          }
        }
      });

      const completedOrders = orders.filter(o => o.status !== 'CANCELLED');
      const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

      return {
        totalRevenue,
        totalOrders: completedOrders.length,
        avgOrderValue,
        totalDiscounts,
        netRevenue: totalRevenue - totalDiscounts,
        cashPayments,
        promptpayPayments,
        cardPayments,
        taxCollected,
      };
    } catch (error) {
      console.error('Error generating EOD report:', error);
      throw error;
    }
  },

  /**
   * Generate Sales Summary report for date range
   */
  async generateSalesSummaryReport(startDate: Date, endDate: Date): Promise<SalesSummaryReport> {
    try {
      const q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );

      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

      let totalRevenue = 0;
      const completedOrders = orders.filter(o => o.status === 'COMPLETED' || o.status === 'SERVED');
      const cancelledOrders = orders.filter(o => o.status === 'CANCELLED');

      completedOrders.forEach(order => {
        totalRevenue += order.total || 0;
      });

      const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

      // Daily breakdown
      const dailyMap = new Map<string, { revenue: number; orders: number }>();
      completedOrders.forEach(order => {
        const date = order.createdAt instanceof Timestamp 
          ? order.createdAt.toDate() 
          : new Date(order.createdAt);
        const dateKey = date.toISOString().split('T')[0];
        
        const existing = dailyMap.get(dateKey) || { revenue: 0, orders: 0 };
        existing.revenue += order.total || 0;
        existing.orders += 1;
        dailyMap.set(dateKey, existing);
      });

      const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, data]) => ({
        date,
        revenue: data.revenue,
        orders: data.orders,
      })).sort((a, b) => a.date.localeCompare(b.date));

      return {
        totalRevenue,
        totalOrders: orders.length,
        avgOrderValue,
        completedOrders: completedOrders.length,
        cancelledOrders: cancelledOrders.length,
        dailyBreakdown,
      };
    } catch (error) {
      console.error('Error generating sales summary report:', error);
      throw error;
    }
  },

  /**
   * Generate Top Selling Items report
   */
  async generateTopItemsReport(startDate: Date, endDate: Date, topN: number = 10): Promise<TopItemsReport> {
    try {
      const q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate)),
        where('status', 'in', ['COMPLETED', 'SERVED'])
      );

      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

      // Aggregate items
      const itemMap = new Map<string, { quantity: number; revenue: number }>();
      
      orders.forEach(order => {
        order.items?.forEach(item => {
          if (!item.isVoided) {
            const existing = itemMap.get(item.name) || { quantity: 0, revenue: 0 };
            existing.quantity += item.quantity;
            existing.revenue += item.subtotal || (item.price * item.quantity);
            itemMap.set(item.name, existing);
          }
        });
      });

      const items = Array.from(itemMap.entries())
        .map(([name, data]) => ({
          name,
          quantity: data.quantity,
          revenue: data.revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, topN);

      return { items };
    } catch (error) {
      console.error('Error generating top items report:', error);
      throw error;
    }
  },

  /**
   * Generate Category Performance report
   */
  async generateCategoryPerformanceReport(startDate: Date, endDate: Date): Promise<CategoryPerformanceReport> {
    try {
      // Fetch orders
      const ordersQuery = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate)),
        where('status', 'in', ['COMPLETED', 'SERVED'])
      );

      const ordersSnapshot = await getDocs(ordersQuery);
      const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

      // Fetch menu items to get categories
      const menuItemsSnapshot = await getDocs(collection(db, 'menuItems'));
      const menuItemsMap = new Map();
      menuItemsSnapshot.docs.forEach(doc => {
        menuItemsMap.set(doc.id, { ...doc.data(), id: doc.id });
      });

      // Fetch categories
      const categoriesSnapshot = await getDocs(collection(db, 'menuCategories'));
      const categoriesMap = new Map();
      categoriesSnapshot.docs.forEach(doc => {
        categoriesMap.set(doc.id, doc.data().name);
      });

      // Aggregate by category
      const categoryMap = new Map<string, { revenue: number; itemsSold: number; totalPrice: number }>();

      orders.forEach(order => {
        order.items?.forEach(item => {
          if (!item.isVoided) {
            const menuItem = menuItemsMap.get(item.menuItemId);
            const categoryId = menuItem?.categoryId;
            const categoryName = categoryId ? categoriesMap.get(categoryId) || 'Uncategorized' : 'Uncategorized';

            const existing = categoryMap.get(categoryName) || { revenue: 0, itemsSold: 0, totalPrice: 0 };
            existing.revenue += item.subtotal || (item.price * item.quantity);
            existing.itemsSold += item.quantity;
            existing.totalPrice += item.price;
            categoryMap.set(categoryName, existing);
          }
        });
      });

      const categories = Array.from(categoryMap.entries())
        .map(([category, data]) => ({
          category,
          revenue: data.revenue,
          itemsSold: data.itemsSold,
          avgPrice: data.itemsSold > 0 ? data.revenue / data.itemsSold : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      return { categories };
    } catch (error) {
      console.error('Error generating category performance report:', error);
      throw error;
    }
  },

  /**
   * Generate Payment Methods report
   */
  async generatePaymentMethodsReport(startDate: Date, endDate: Date): Promise<PaymentMethodsReport> {
    try {
      const q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate)),
        where('status', 'in', ['COMPLETED', 'SERVED'])
      );

      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

      const result: PaymentMethodsReport = {
        cash: { count: 0, total: 0 },
        promptpay: { count: 0, total: 0 },
        card: { count: 0, total: 0 },
      };

      orders.forEach(order => {
        const total = order.total || 0;
        const method = order.paymentMethod?.toLowerCase();

        if (method === 'cash') {
          result.cash.count++;
          result.cash.total += total;
        } else if (method === 'promptpay') {
          result.promptpay.count++;
          result.promptpay.total += total;
        } else if (method === 'card') {
          result.card.count++;
          result.card.total += total;
        }
      });

      return result;
    } catch (error) {
      console.error('Error generating payment methods report:', error);
      throw error;
    }
  },
};
