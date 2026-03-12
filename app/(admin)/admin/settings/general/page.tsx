'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export default function GeneralSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    businessName: '',
    address: '',
    taxId: '',
    phone: '',
    openTime: '',
    closeTime: '',
    receiptHeader: '',
    receiptFooter: '',
    promptpayId: '',
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const settingsRef = doc(db, 'settings', 'general');
        const settingsSnap = await getDoc(settingsRef);

        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          setFormData({
            businessName: data.businessName || '',
            address: data.address || '',
            taxId: data.taxId || '',
            phone: data.phone || '',
            openTime: data.openTime || '',
            closeTime: data.closeTime || '',
            receiptHeader: data.receiptHeader || '',
            receiptFooter: data.receiptFooter || '',
            promptpayId: data.promptpayId || '',
          });
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }

    loadSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const settingsRef = doc(db, 'settings', 'general');
      await setDoc(
        settingsRef,
        {
          ...formData,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFormData({
      businessName: '',
      address: '',
      taxId: '',
      phone: '',
      openTime: '',
      closeTime: '',
      receiptHeader: '',
      receiptFooter: '',
      promptpayId: '',
    });
  };

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
          <h1 className="text-xl md:text-2xl font-bold my-2">GENERAL SETTINGS</h1>
          <p className="text-xs md:text-sm">Business Information & Preferences</p>
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* General Info */}
          <div className="border-2 border-black">
            <div className="border-b-2 border-black p-3 bg-white">
              <h2 className="text-sm font-bold">[GENERAL INFORMATION]</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold mb-2">BUSINESS NAME *</label>
                <input
                  type="text"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-2">ADDRESS</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-2">TAX ID</label>
                  <input
                    type="text"
                    value={formData.taxId}
                    onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-2">PHONE</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Operating Hours */}
          <div className="border-2 border-black">
            <div className="border-b-2 border-black p-3 bg-white">
              <h2 className="text-sm font-bold">[OPERATING HOURS]</h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-2">OPENING TIME</label>
                  <input
                    type="time"
                    value={formData.openTime}
                    onChange={(e) => setFormData({ ...formData, openTime: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-2">CLOSING TIME</label>
                  <input
                    type="time"
                    value={formData.closeTime}
                    onChange={(e) => setFormData({ ...formData, closeTime: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Receipt Settings */}
          <div className="border-2 border-black">
            <div className="border-b-2 border-black p-3 bg-white">
              <h2 className="text-sm font-bold">[RECEIPT SETTINGS]</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold mb-2">RECEIPT HEADER</label>
                <textarea
                  value={formData.receiptHeader}
                  onChange={(e) => setFormData({ ...formData, receiptHeader: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                  rows={2}
                  placeholder="Text displayed at top of receipt"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-2">RECEIPT FOOTER</label>
                <textarea
                  value={formData.receiptFooter}
                  onChange={(e) => setFormData({ ...formData, receiptFooter: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                  rows={2}
                  placeholder="Text displayed at bottom of receipt"
                />
              </div>
            </div>
          </div>

          {/* PromptPay */}
          <div className="border-2 border-black">
            <div className="border-b-2 border-black p-3 bg-white">
              <h2 className="text-sm font-bold">[PROMPTPAY]</h2>
            </div>
            <div className="p-4">
              <div>
                <label className="block text-xs font-bold mb-2">PROMPTPAY ID</label>
                <input
                  type="text"
                  value={formData.promptpayId}
                  onChange={(e) => setFormData({ ...formData, promptpayId: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                  placeholder="Phone number or Tax ID for PromptPay"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
            >
              [RESET]
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? '[SAVING...]' : '[SAVE SETTINGS]'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
