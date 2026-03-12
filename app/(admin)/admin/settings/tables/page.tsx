'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import QRCode from 'qrcode';

interface TableItem {
  id: string;
  tableNumber: number;
  capacity: number;
  isActive: boolean;
  status: 'VACANT' | 'OCCUPIED' | 'RESERVED' | 'READY_TO_PAY';
}

export default function TablesSettingsPage() {
  const [tables, setTables] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [editingTable, setEditingTable] = useState<TableItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState({ tableNumber: 1, capacity: 4, isActive: true });
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'tables'), orderBy('tableNumber', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tablesData = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          tableNumber: data.tableNumber,
          capacity: data.capacity,
          isActive: data.isActive,
          status: data.status || 'VACANT',
        } as TableItem;
      });
      setTables(tablesData);
    });

    return () => unsubscribe();
  }, []);

  const handleAdd = () => {
    setEditingTable(null);
    setFormData({ tableNumber: tables.length + 1, capacity: 4, isActive: true });
    setModalVisible(true);
  };

  const handleEdit = (table: TableItem) => {
    setEditingTable(table);
    setFormData({ tableNumber: table.tableNumber, capacity: table.capacity, isActive: table.isActive });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tables', id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting table:', error);
      alert('Failed to delete table');
    }
  };

  const handleShowQR = async (table: TableItem) => {
    setSelectedTable(table);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const menuUrl = `${baseUrl}/menu/${table.tableNumber}`;
    
    try {
      const qrDataUrl = await QRCode.toDataURL(menuUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      setQrCodeUrl(qrDataUrl);
      setQrModalVisible(true);
    } catch (error) {
      console.error('Error generating QR code:', error);
      alert('Failed to generate QR code');
    }
  };

  const handlePrintQR = () => {
    const printWindow = window.open('', '', 'width=600,height=600');
    if (printWindow && selectedTable) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Table ${selectedTable.tableNumber} QR Code</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px;
              }
              h1 {
                margin-bottom: 10px;
                color: #333;
              }
              p {
                color: #666;
                margin-bottom: 30px;
              }
              img {
                border: 2px solid #ddd;
                padding: 20px;
                border-radius: 12px;
              }
              @media print {
                body {
                  padding: 20px;
                }
              }
            </style>
          </head>
          <body>
            <h1>Table ${selectedTable.tableNumber}</h1>
            <p>Scan to view menu and place your order</p>
            <img src="${qrCodeUrl}" alt="QR Code" />
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingTable) {
        const tableRef = doc(db, 'tables', editingTable.id);
        await updateDoc(tableRef, formData);
      } else {
        const tableRef = doc(collection(db, 'tables'));
        await setDoc(tableRef, {
          ...formData,
          status: 'VACANT',
          activeOrders: [],
          currentSessionId: null,
          totalAmount: 0,
          createdAt: new Date(),
        });
      }
      setModalVisible(false);
      setFormData({ tableNumber: 1, capacity: 4, isActive: true });
    } catch (error) {
      console.error('Error saving table:', error);
      alert('Failed to save table');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
          <h1 className="text-xl md:text-2xl font-bold my-2">TABLE MANAGEMENT</h1>
          <p className="text-xs md:text-sm">{tables.length} Tables • {tables.reduce((s, t) => s + t.capacity, 0)} Total Seats</p>
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="border-2 border-black p-3 text-center">
            <p className="text-xs mb-1">TOTAL</p>
            <p className="text-2xl font-bold">{tables.length}</p>
          </div>
          <div className="border-2 border-black p-3 text-center">
            <p className="text-xs mb-1">ACTIVE</p>
            <p className="text-2xl font-bold">{tables.filter(t => t.isActive).length}</p>
          </div>
          <div className="border-2 border-black p-3 text-center">
            <p className="text-xs mb-1">CAPACITY</p>
            <p className="text-2xl font-bold">{tables.reduce((s, t) => s + t.capacity, 0)}</p>
          </div>
        </div>

        {/* Add Button */}
        <div className="mb-6">
          <button
            onClick={handleAdd}
            className="w-full md:w-auto px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800"
          >
            [+ ADD TABLE]
          </button>
        </div>

        {/* Tables List */}
        <div className="border-2 border-black">
          <div className="border-b-2 border-black p-3 bg-white hidden md:block">
            <div className="grid grid-cols-5 gap-4 text-xs font-bold">
              <div>TABLE #</div>
              <div>CAPACITY</div>
              <div>STATUS</div>
              <div>ACTIVE</div>
              <div>ACTIONS</div>
            </div>
          </div>
          <div className="divide-y-2 divide-black">
            {tables.map((table) => (
              <div key={table.id} className="p-3 hover:bg-gray-50">
                {/* Desktop */}
                <div className="hidden md:grid grid-cols-5 gap-4 text-sm items-center">
                  <div className="font-bold">TABLE {table.tableNumber}</div>
                  <div>{table.capacity} SEATS</div>
                  <div>
                    <span className={`px-2 py-1 border-2 border-black text-xs ${
                      table.status === 'VACANT' ? '' : 
                      table.status === 'OCCUPIED' ? 'bg-blue-50' : 
                      table.status === 'RESERVED' ? 'bg-yellow-50' : 'bg-purple-50'
                    }`}>
                      {table.status}
                    </span>
                  </div>
                  <div>
                    <span className={`px-2 py-1 border-2 border-black text-xs ${table.isActive ? '' : 'bg-red-50'}`}>
                      {table.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleShowQR(table)}
                      className="px-2 py-1 border border-black text-xs hover:bg-gray-100"
                      title="QR Code"
                    >
                      [QR]
                    </button>
                    <button
                      onClick={() => handleEdit(table)}
                      className="px-2 py-1 border border-black text-xs hover:bg-gray-100"
                    >
                      [EDIT]
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(table.id)}
                      className="px-2 py-1 border border-black text-xs hover:bg-red-50"
                    >
                      [DEL]
                    </button>
                  </div>
                </div>

                {/* Mobile */}
                <div className="md:hidden">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-sm">TABLE {table.tableNumber}</p>
                      <p className="text-xs text-gray-600">{table.capacity} SEATS</p>
                    </div>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 border border-black text-xs ${table.status === 'VACANT' ? '' : 'bg-blue-50'}`}>
                        {table.status}
                      </span>
                      <span className={`px-2 py-1 border border-black text-xs ${table.isActive ? '' : 'bg-red-50'}`}>
                        {table.isActive ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <button
                      onClick={() => handleShowQR(table)}
                      className="px-3 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100"
                    >
                      [QR]
                    </button>
                    <button
                      onClick={() => handleEdit(table)}
                      className="px-3 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100"
                    >
                      [EDIT]
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(table.id)}
                      className="px-3 py-2 border-2 border-black text-xs font-bold hover:bg-red-50"
                    >
                      [DEL]
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {tables.length === 0 && (
              <div className="p-12 text-center text-gray-600">
                <p className="text-sm">NO TABLES</p>
              </div>
            )}
          </div>
        </div>

        {/* Add/Edit Modal */}
        {modalVisible && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black max-w-md w-full font-mono">
              <div className="border-b-2 border-black p-4">
                <h2 className="text-lg font-bold text-center">
                  {editingTable ? '[EDIT TABLE]' : '[ADD TABLE]'}
                </h2>
              </div>
              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-2">TABLE NUMBER *</label>
                  <input
                    type="number"
                    value={formData.tableNumber}
                    onChange={(e) => setFormData({ ...formData, tableNumber: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                    min={1}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-2">CAPACITY (SEATS) *</label>
                  <input
                    type="number"
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                    min={1}
                    max={20}
                    required
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 border-2 border-black"
                  />
                  <label className="text-xs font-bold">ACTIVE</label>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-4 border-t-2 border-black">
                  <button
                    type="button"
                    onClick={() => setModalVisible(false)}
                    className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
                  >
                    [CANCEL]
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    {loading ? '[SAVING...]' : editingTable ? '[UPDATE]' : '[CREATE]'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* QR Modal */}
        {qrModalVisible && selectedTable && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black max-w-md w-full font-mono">
              <div className="border-b-2 border-black p-4">
                <h2 className="text-lg font-bold text-center">[QR CODE - TABLE {selectedTable.tableNumber}]</h2>
              </div>
              <div className="p-6 text-center">
                <p className="text-xs mb-4">SCAN TO VIEW MENU AND ORDER</p>
                {qrCodeUrl && (
                  <div ref={qrRef} className="border-2 border-black p-4 inline-block">
                    <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64" />
                  </div>
                )}
                <p className="text-xs text-gray-600 mt-4 break-all">
                  {process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/menu/{selectedTable.tableNumber}
                </p>
              </div>
              <div className="border-t-2 border-black p-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setQrModalVisible(false)}
                  className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
                >
                  [CLOSE]
                </button>
                <button
                  onClick={handlePrintQR}
                  className="px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800"
                >
                  [PRINT]
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black max-w-md w-full font-mono">
              <div className="border-b-2 border-black p-4">
                <h2 className="text-lg font-bold text-center">[DELETE TABLE?]</h2>
              </div>
              <div className="p-4">
                <p className="text-sm text-center mb-6">This will permanently delete the table.</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
                  >
                    [NO]
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirm)}
                    className="px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800"
                  >
                    [YES]
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
