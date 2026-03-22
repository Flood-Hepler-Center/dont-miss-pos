import { 
  collection, 
  query, 
  where, 
  getDocs, 
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Order } from '@/types';
import type { Payment } from '@/types/payment';

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

export interface DetailedOrder {
  id: string;
  tableId: string;
  createdAt: string;
  status: string;
  paymentMethod: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  itemsCount: number;
  itemsNames: string;
}

export interface DetailedOrderReport {
  orders: DetailedOrder[];
}

export interface ItemSummaryDetail {
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  avgPrice: number;
}

export interface ItemsSummaryDetailReport {
  items: ItemSummaryDetail[];
}

export interface ItemDetail {
  orderId: string;
  tableId: string;
  createdAt: string;
  menuItemId: string;
  itemName: string;
  quantity: number;
  price: number;
  subtotal: number;
  modifiers: string;
  status: string;
}

export interface ItemsDetailReport {
  items: ItemDetail[];
}

export interface DetailedPayment {
  id: string;
  receiptNumber: string;
  tableId: string;
  processedAt: string;
  subtotal: number;
  discountAmount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  status: string;
  orderIds: string;
}

export interface PaymentDetailReport {
  payments: DetailedPayment[];
}

export interface UltimatePaymentDetail extends DetailedPayment {
  orders: (Order & { id: string })[];
}

export interface UltimateReport {
  payments: UltimatePaymentDetail[];
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

export interface CategoryBreakdownGroup {
  categoryId: string;
  categoryName: string;
  totalOrderedQty: number;
  totalOrderedGross: number;
  totalPaidQty: number;
  totalPaidGross: number;
  items: Array<{
    menuItemId: string;
    itemName: string;
    orderedQty: number;
    orderedGross: number;
    paidQty: number;
    paidGross: number;
  }>;
}

export interface CategoryItemBreakdownReport {
  groups: CategoryBreakdownGroup[];
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

      // 1. Get financial data from payments collection
      const paymentsQuery = query(
        collection(db, 'payments'),
        where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
        where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const payments = paymentsSnapshot.docs.map(doc => doc.data());

      let totalRevenue = 0;
      let totalDiscounts = 0;
      let cashPayments = 0;
      let promptpayPayments = 0;
      let cardPayments = 0;
      let taxCollected = 0;

      payments.forEach(pay => {
        if (pay.status !== 'VOIDED') {
          totalRevenue += pay.total || 0;
          totalDiscounts += pay.discountAmount || 0;
          taxCollected += pay.tax || 0;

          const method = pay.paymentMethod?.toUpperCase();
          if (method === 'CASH') {
            cashPayments += pay.total || 0;
          } else if (method === 'PROMPTPAY') {
            promptpayPayments += pay.total || 0;
          } else if (method === 'CARD') {
            cardPayments += pay.total || 0;
          }
        }
      });

      // 2. Get operational data from orders collection
      const ordersQuery = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
        where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      );
      const ordersSnapshot = await getDocs(ordersQuery);
      const orders = ordersSnapshot.docs.map(doc => doc.data() as Order);
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
      // 1. Financial data from payments
      const paymentsQuery = query(
        collection(db, 'payments'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const payments = paymentsSnapshot.docs
        .map(doc => doc.data())
        .filter(p => p.status !== 'VOIDED');

      let totalRevenue = 0;
      const dailyRevenueMap = new Map<string, number>();

      payments.forEach(pay => {
        totalRevenue += pay.total || 0;
        const date = pay.createdAt instanceof Timestamp ? pay.createdAt.toDate() : new Date(pay.createdAt);
        const dateKey = date.toISOString().split('T')[0];
        dailyRevenueMap.set(dateKey, (dailyRevenueMap.get(dateKey) || 0) + (pay.total || 0));
      });

      // 2. Operational data from orders
      const ordersQuery = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );
      const ordersSnapshot = await getDocs(ordersQuery);
      const orders = ordersSnapshot.docs.map(doc => doc.data() as Order);

      const completedOrdersCount = orders.filter(o => ['COMPLETED', 'SERVED'].includes(o.status)).length;
      const cancelledOrdersCount = orders.filter(o => o.status === 'CANCELLED').length;
      
      const dailyOrdersMap = new Map<string, number>();
      orders.filter(o => ['COMPLETED', 'SERVED'].includes(o.status)).forEach(order => {
        const date = order.createdAt instanceof Timestamp ? order.createdAt.toDate() : new Date(order.createdAt);
        const dateKey = date.toISOString().split('T')[0];
        dailyOrdersMap.set(dateKey, (dailyOrdersMap.get(dateKey) || 0) + 1);
      });

      // 3. Merged breakdown
      const allDates = Array.from(new Set([...dailyRevenueMap.keys(), ...dailyOrdersMap.keys()])).sort();
      const dailyBreakdown = allDates.map(dateKey => ({
        date: dateKey,
        revenue: dailyRevenueMap.get(dateKey) || 0,
        orders: dailyOrdersMap.get(dateKey) || 0
      }));

      const avgOrderValue = completedOrdersCount > 0 ? totalRevenue / completedOrdersCount : 0;

      return {
        totalRevenue,
        totalOrders: orders.length,
        avgOrderValue,
        completedOrders: completedOrdersCount,
        cancelledOrders: cancelledOrdersCount,
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
      // Fetch by date only to avoid composite index requirement
      const q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );

      const snapshot = await getDocs(q);
      const orders = snapshot.docs
        .map(doc => doc.data() as Order)
        .filter(o => ['COMPLETED', 'SERVED'].includes(o.status));

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
      // Fetch orders by date only
      const ordersQuery = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );

      const ordersSnapshot = await getDocs(ordersQuery);
      const orders = ordersSnapshot.docs
        .map(doc => doc.data() as Order)
        .filter(o => ['COMPLETED', 'SERVED'].includes(o.status));

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
        collection(db, 'payments'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );

      const snapshot = await getDocs(q);
      const payments = snapshot.docs
        .map(doc => doc.data())
        .filter(p => p.status !== 'VOIDED');

      const result: PaymentMethodsReport = {
        cash: { count: 0, total: 0 },
        promptpay: { count: 0, total: 0 },
        card: { count: 0, total: 0 },
      };

      payments.forEach(pay => {
        const total = pay.total || 0;
        const method = pay.paymentMethod?.toLowerCase();

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

  /**
   * Generate Detailed Order report
   */
  async generateDetailedOrderReport(startDate: Date, endDate: Date): Promise<DetailedOrderReport> {
    try {
      const q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );

      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(doc => {
        const data = doc.data() as Order;
        const createdAt = data.createdAt instanceof Timestamp 
          ? data.createdAt.toDate().toISOString() 
          : new Date(data.createdAt).toISOString();

        return {
          id: doc.id,
          tableId: data.tableId || 'N/A',
          createdAt,
          status: data.status,
          paymentMethod: data.paymentMethod || 'N/A',
          subtotal: data.subtotal || 0,
          tax: data.tax || 0,
          discount: data.discount || 0,
          total: data.total || 0,
          itemsCount: data.items?.reduce((acc, item) => acc + (item.isVoided ? 0 : item.quantity), 0) || 0,
          itemsNames: data.items?.filter(i => !i.isVoided).map(i => `${i.name} (x${i.quantity})`).join('; ') || '',
        };
      });

      return { orders: orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
    } catch (error) {
      console.error('Error generating detailed order report:', error);
      throw error;
    }
  },

  /**
   * Generate Items Summary Detail report (Full version)
   */
  async generateItemsSummaryReport(startDate: Date, endDate: Date): Promise<ItemsSummaryDetailReport> {
    try {
      // Fetch by date only to avoid composite index requirement for status
      const ordersQuery = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );

      const ordersSnapshot = await getDocs(ordersQuery);
      // Filter by status in-memory
      const orders = ordersSnapshot.docs
        .map(doc => doc.data() as Order)
        .filter(o => ['COMPLETED', 'SERVED'].includes(o.status));

      // Fetch menu items to get categories
      const menuItemsSnapshot = await getDocs(collection(db, 'menuItems'));
      const menuItemsMap = new Map();
      menuItemsSnapshot.docs.forEach(doc => {
        menuItemsMap.set(doc.id, { ...doc.data(), id: doc.id });
      });

      const categoriesSnapshot = await getDocs(collection(db, 'menuCategories'));
      const categoriesMap = new Map();
      categoriesSnapshot.docs.forEach(doc => {
        categoriesMap.set(doc.id, doc.data().name);
      });

      const itemMap = new Map<string, { quantity: number; revenue: number; category: string }>();

      orders.forEach(order => {
        order.items?.forEach(item => {
          if (!item.isVoided) {
            const menuItem = menuItemsMap.get(item.menuItemId);
            const categoryName = menuItem?.categoryId ? categoriesMap.get(menuItem.categoryId) || 'Uncategorized' : 'Uncategorized';
            
            const existing = itemMap.get(item.name) || { quantity: 0, revenue: 0, category: categoryName };
            existing.quantity += item.quantity;
            existing.revenue += item.subtotal || (item.price * item.quantity);
            itemMap.set(item.name, existing);
          }
        });
      });

      const items = Array.from(itemMap.entries())
        .map(([name, data]) => ({
          name,
          category: data.category,
          quantity: data.quantity,
          revenue: data.revenue,
          avgPrice: data.quantity > 0 ? data.revenue / data.quantity : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      return { items };
    } catch (error) {
      console.error('Error generating items summary report:', error);
      throw error;
    }
  },

  /**
   * Generate Items Detail report
   */
  async generateItemsDetailReport(startDate: Date, endDate: Date): Promise<ItemsDetailReport> {
    try {
      const q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );

      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

      const items: ItemDetail[] = [];

      orders.forEach(order => {
        const orderCreatedAt = order.createdAt instanceof Timestamp 
          ? order.createdAt.toDate().toISOString() 
          : new Date(order.createdAt).toISOString();

        order.items?.forEach(item => {
          items.push({
            orderId: order.id,
            tableId: order.tableId || 'N/A',
            createdAt: orderCreatedAt,
            menuItemId: item.menuItemId,
            itemName: item.name,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.subtotal,
            modifiers: item.modifiers?.map(m => `${m.modifierGroupName}: ${m.optionName}`).join('; ') || '',
            status: item.isVoided ? 'VOIDED' : order.status,
          });
        });
      });

      return { items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
    } catch (error) {
      console.error('Error generating items detail report:', error);
      throw error;
    }
  },

  /**
   * Generate Payment Detail report (Full version for owner)
   */
  async generatePaymentDetailReport(startDate: Date, endDate: Date): Promise<PaymentDetailReport> {
    try {
      const q = query(
        collection(db, 'payments'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );

      const snapshot = await getDocs(q);
      const payments = snapshot.docs.map(doc => {
        const data = doc.data();
        const processedAt = data.processedAt instanceof Timestamp 
          ? data.processedAt.toDate().toISOString() 
          : data.processedAt ? new Date(data.processedAt).toISOString() : 'N/A';

        return {
          id: doc.id,
          receiptNumber: data.receiptNumber || 'N/A',
          tableId: data.tableId || 'N/A',
          processedAt,
          subtotal: data.subtotal || 0,
          discountAmount: data.discountAmount || 0,
          tax: data.tax || 0,
          total: data.total || 0,
          paymentMethod: data.paymentMethod || 'N/A',
          status: data.status || 'N/A',
          orderIds: data.orderIds?.join('; ') || '',
        };
      });

      return { payments: payments.sort((a, b) => b.processedAt.localeCompare(a.processedAt)) };
    } catch (error) {
      console.error('Error generating payment detail report:', error);
      throw error;
    }
  },

  /**
   * Ultimate Report: Joins Payments -> Orders -> Items
   */
  async generateUltimateReport(startDate: Date, endDate: Date): Promise<UltimateReport> {
    try {
      // 1. Fetch payments for range
      const paymentsQuery = query(
        collection(db, 'payments'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const paymentsData = paymentsSnapshot.docs.map(doc => {
        const data = doc.data() as Payment;
        return { ...data, id: doc.id };
      });

      // 2. Fetch orders for range (to avoid many individual fetches)
      const ordersQuery = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );
      const ordersSnapshot = await getDocs(ordersQuery);
      const ordersMap = new Map<string, Order & { id: string }>();
      ordersSnapshot.docs.forEach(doc => {
        const data = doc.data() as Order;
        ordersMap.set(doc.id, { ...data, id: doc.id });
      });

      // 3. Merge
      const result: UltimatePaymentDetail[] = paymentsData.map(pay => {
        const processedAt = pay.processedAt instanceof Timestamp 
          ? pay.processedAt.toDate().toISOString() 
          : pay.processedAt ? new Date(pay.processedAt).toISOString() : 'N/A';

        const linkedOrders = (pay.orderIds || [])
          .map((id: string) => ordersMap.get(id))
          .filter(Boolean) as (Order & { id: string })[];

        return {
          id: pay.id,
          receiptNumber: pay.receiptNumber || 'N/A',
          tableId: pay.tableId || 'N/A',
          processedAt,
          subtotal: pay.subtotal || 0,
          discountAmount: pay.discountAmount || 0,
          tax: pay.tax || 0,
          total: pay.total || 0,
          paymentMethod: pay.paymentMethod || 'N/A',
          status: pay.status || 'N/A',
          orderIds: pay.orderIds?.join('; ') || '',
          orders: linkedOrders,
        };
      });

      return { payments: result.sort((a, b) => b.processedAt.localeCompare(a.processedAt)) };
    } catch (error) {
      console.error('Error generating ultimate report:', error);
      throw error;
    }
  },

  /**
   * Generate Category Item Breakdown report
   */
  async generateCategoryItemBreakdownReport(startDate: Date, endDate: Date, filterCategoryId?: string): Promise<CategoryItemBreakdownReport> {
    try {
      // 1. Fetch Orders in date range
      const ordersQuery = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );
      const ordersSnapshot = await getDocs(ordersQuery);
      const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

      // 2. Fetch Payments to identify paid orders
      const paymentsQuery = query(
        collection(db, 'payments'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const payments = paymentsSnapshot.docs
        .map(doc => doc.data())
        .filter(p => p.status === 'COMPLETED');
      const paidOrderIds = new Set(payments.flatMap(p => p.orderIds || []));

      // 3. Fetch Menu Items & Categories for lookup
      const menuItemsMap = new Map();
      const menuItemsSnapshot = await getDocs(collection(db, 'menuItems'));
      menuItemsSnapshot.docs.forEach(doc => { menuItemsMap.set(doc.id, doc.data()); });

      const categoriesMap = new Map();
      const categoriesSnapshot = await getDocs(collection(db, 'menuCategories'));
      categoriesSnapshot.docs.forEach(doc => { categoriesMap.set(doc.id, doc.data().name); });

      // 4. Aggregate Data
      const catMap = new Map<string, CategoryBreakdownGroup>();

      orders.forEach(order => {
        order.items?.forEach(item => {
          if (item.isVoided) return;

          const menuItem = menuItemsMap.get(item.menuItemId);
          const catId = menuItem?.categoryId || 'UNCATEGORISED';
          
          if (filterCategoryId && filterCategoryId !== 'ALL' && catId !== filterCategoryId) {
            return;
          }

          const catName = catId === 'UNCATEGORISED' ? 'Uncategorized' : (categoriesMap.get(catId) || 'Uncategorized');

          let group = catMap.get(catId);
          if (!group) {
            group = {
              categoryId: catId,
              categoryName: catName,
              totalOrderedQty: 0,
              totalOrderedGross: 0,
              totalPaidQty: 0,
              totalPaidGross: 0,
              items: [],
            };
            catMap.set(catId, group);
          }

          let itemStats = group.items.find(i => i.menuItemId === item.menuItemId);
          if (!itemStats) {
            itemStats = {
              menuItemId: item.menuItemId,
              itemName: item.name,
              orderedQty: 0,
              orderedGross: 0,
              paidQty: 0,
              paidGross: 0,
            };
            group.items.push(itemStats);
          }

          const itemGross = item.subtotal || (item.price * item.quantity);
          const isPaid = paidOrderIds.has(order.id);

          itemStats.orderedQty += item.quantity;
          itemStats.orderedGross += itemGross;
          group.totalOrderedQty += item.quantity;
          group.totalOrderedGross += itemGross;

          if (isPaid) {
            itemStats.paidQty += item.quantity;
            itemStats.paidGross += itemGross;
            group.totalPaidQty += item.quantity;
            group.totalPaidGross += itemGross;
          }
        });
      });

      return {
        groups: Array.from(catMap.values()).sort((a, b) => b.totalOrderedGross - a.totalOrderedGross),
      };
    } catch (error) {
      console.error('Error generating category item breakdown report:', error);
      throw error;
    }
  },
};
