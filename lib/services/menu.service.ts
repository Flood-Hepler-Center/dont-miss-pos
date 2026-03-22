import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { MenuCategory, MenuItem } from '@/types';

export const menuService = {
  async getCategories(): Promise<MenuCategory[]> {
    try {
      const q = query(
        collection(db, 'menuCategories'),
        where('isActive', '==', true),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MenuCategory[];
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  },

  async getAllItems(): Promise<MenuItem[]> {
    try {
      const q = query(collection(db, 'menuItems'));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MenuItem[];
      
      // Sort client-side
      return items.sort((a, b) => {
        const orderA = a.displayOrder || 999;
        const orderB = b.displayOrder || 999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '');
      });
    } catch (error) {
      console.error('Error fetching all items:', error);
      return [];
    }
  },

  async getActiveItems(): Promise<MenuItem[]> {
    try {
      const q = query(
        collection(db, 'menuItems'),
        where('isActive', '==', true),
        where('isAvailable', '==', true)
      );
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MenuItem[];
      
      // Sort client-side to avoid composite index requirement
      return items.sort((a, b) => {
        const orderA = a.displayOrder || 999;
        const orderB = b.displayOrder || 999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '');
      });
    } catch (error) {
      console.error('Error fetching active items:', error);
      return [];
    }
  },

  async getItemsByCategory(categoryId: string): Promise<MenuItem[]> {
    try {
      const q = query(
        collection(db, 'menuItems'),
        where('categoryId', '==', categoryId),
        where('isActive', '==', true),
        orderBy('sortOrder', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MenuItem[];
    } catch (error) {
      console.error('Error fetching items by category:', error);
      throw new Error('Failed to fetch category items');
    }
  },

  async getItemById(id: string): Promise<MenuItem | null> {
    try {
      const docRef = doc(db, 'menuItems', id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        return null;
      }
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as MenuItem;
    } catch (error) {
      console.error('Error fetching item by ID:', error);
      throw new Error('Failed to fetch menu item');
    }
  },

  async toggleAvailability(itemId: string, isAvailable: boolean): Promise<void> {
    try {
      const docRef = doc(db, 'menuItems', itemId);
      await updateDoc(docRef, {
        isAvailable,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error toggling item availability:', error);
      throw new Error('Failed to update item availability');
    }
  },

  async createCategory(data: Partial<MenuCategory>): Promise<string> {
    try {
      const docRef = doc(collection(db, 'menuCategories'));
      await setDoc(docRef, {
        ...data,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating category:', error);
      throw new Error('Failed to create category');
    }
  },

  async updateCategory(id: string, data: Partial<MenuCategory>): Promise<void> {
    try {
      const docRef = doc(db, 'menuCategories', id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating category:', error);
      throw new Error('Failed to update category');
    }
  },

  async deleteCategory(id: string): Promise<void> {
    try {
      const docRef = doc(db, 'menuCategories', id);
      await updateDoc(docRef, {
        isActive: false,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error deleting category:', error);
      throw new Error('Failed to delete category');
    }
  },

  async createItem(data: Partial<MenuItem>): Promise<string> {
    try {
      const docRef = doc(collection(db, 'menuItems'));
      await setDoc(docRef, {
        ...data,
        displayOrder: data.displayOrder || 999,
        modifiers: data.modifiers || [],
        isActive: true,
        isAvailable: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating menu item:', error);
      throw new Error('Failed to create menu item');
    }
  },

  async updateItem(id: string, data: Partial<MenuItem>): Promise<void> {
    try {
      const docRef = doc(db, 'menuItems', id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating menu item:', error);
      throw new Error('Failed to update menu item');
    }
  },

  async deleteItem(id: string): Promise<void> {
    try {
      const docRef = doc(db, 'menuItems', id);
      await updateDoc(docRef, {
        isActive: false,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error deleting menu item:', error);
      throw new Error('Failed to delete menu item');
    }
  },
};
