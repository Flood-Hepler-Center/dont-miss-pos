'use client';

import { useState } from 'react';
import { Modal, Button, InputNumber, message, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined, GiftOutlined } from '@ant-design/icons';
import { orderService } from '@/lib/services/order.service';
import type { Order, OrderItem } from '@/types';

interface OrderItemManagerProps {
  order: Order;
  onUpdate: () => void;
}

export function OrderItemManager({ order, onUpdate }: OrderItemManagerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<{ item: OrderItem; index: number } | null>(null);
  const [newQuantity, setNewQuantity] = useState(1);

  const handleUpdateQuantity = async (itemIndex: number, newQty: number) => {
    if (newQty < 1) {
      message.error('Quantity must be at least 1');
      return;
    }

    try {
      console.log('Updating quantity:', { orderId: order.id, itemIndex, newQty });
      await orderService.updateQuantity(order.id, itemIndex, newQty);
      message.success('Item quantity updated');
      onUpdate();
    } catch (error) {
      console.error('Error updating quantity:', error);
      message.error(`Failed to update quantity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRemoveItem = async (itemIndex: number) => {
    try {
      console.log('Removing item:', { orderId: order.id, itemIndex });
      await orderService.removeItem(order.id, itemIndex);
      message.success('Item removed from order');
      onUpdate();
    } catch (error) {
      console.error('Error removing item:', error);
      message.error(`Failed to remove item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleVoidItem = async (itemIndex: number) => {
    try {
      const staffId = 'current-staff'; // TODO: Get from auth
      const reason = 'Staff comp';
      console.log('Voiding item:', { orderId: order.id, itemIndex, reason, staffId });
      await orderService.voidItem(order.id, itemIndex, reason, staffId);
      message.success('Item voided (no charge)');
      onUpdate();
    } catch (error) {
      console.error('Error voiding item:', error);
      message.error(`Failed to void item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const openEditModal = (item: OrderItem, index: number) => {
    setEditingItem({ item, index });
    setNewQuantity(item.quantity);
    setModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;

    await handleUpdateQuantity(editingItem.index, newQuantity);
    setModalVisible(false);
    setEditingItem(null);
  };

  return (
    <>
      <div className="space-y-3">
        {order.items?.map((item, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-lg border-2 transition-all ${
              item.isVoided
                ? 'bg-gray-100 border-gray-300 opacity-60'
                : 'bg-white border-orange-200 hover:border-orange-400'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-base sm:text-lg text-gray-900">
                    {item.quantity}x {item.name}
                  </span>
                  {item.isVoided && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded">
                      VOIDED
                    </span>
                  )}
                </div>
                
                {item.modifiers && item.modifiers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {item.modifiers.map((mod, modIdx) => (
                      <span
                        key={modIdx}
                        className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded"
                      >
                        {mod.optionName} (+฿{mod.priceAdjustment})
                      </span>
                    ))}
                  </div>
                )}
                
                <div className="text-sm text-gray-600">
                  ฿{item.price.toFixed(2)} × {item.quantity} = ฿{item.subtotal.toFixed(2)}
                </div>
              </div>

              {!item.isVoided && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEditModal(item, idx)}
                    className="min-w-[80px]"
                  >
                    Edit
                  </Button>
                  
                  <Popconfirm
                    title="Void this item?"
                    description="Item will be marked as voided (no charge to customer)"
                    onConfirm={() => handleVoidItem(idx)}
                    okText="Void"
                    cancelText="Cancel"
                  >
                    <Button
                      size="small"
                      icon={<GiftOutlined />}
                      className="min-w-[80px]"
                    >
                      Void
                    </Button>
                  </Popconfirm>
                  
                  <Popconfirm
                    title="Remove this item?"
                    description="This will completely remove the item from the order"
                    onConfirm={() => handleRemoveItem(idx)}
                    okText="Remove"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      className="min-w-[80px]"
                    >
                      Delete
                    </Button>
                  </Popconfirm>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal
        title={`Edit: ${editingItem?.item.name}`}
        open={modalVisible}
        onOk={handleSaveEdit}
        onCancel={() => {
          setModalVisible(false);
          setEditingItem(null);
        }}
        okText="Update"
      >
        <div className="py-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quantity
          </label>
          <InputNumber
            min={1}
            value={newQuantity}
            onChange={(val) => setNewQuantity(val || 1)}
            className="w-full"
            size="large"
          />
          
          {editingItem && (
            <div className="mt-4 p-3 bg-gray-50 rounded">
              <div className="text-sm text-gray-600">
                Price: ฿{editingItem.item.price.toFixed(2)} × {newQuantity}
              </div>
              <div className="text-lg font-semibold text-gray-900 mt-1">
                New Total: ฿{(editingItem.item.price * newQuantity).toFixed(2)}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
