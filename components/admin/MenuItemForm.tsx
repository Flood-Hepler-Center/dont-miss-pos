'use client';

import { Form, Input, InputNumber, Select, Upload, Button, Switch } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import Image from 'next/image';
import type { MenuCategory, MenuItem } from '@/types';

interface MenuItemFormProps {
  item: MenuItem | null;
  categories: MenuCategory[];
  onSave: (values: Partial<MenuItem>) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

export function MenuItemForm({ item, categories, onSave, onCancel, loading }: MenuItemFormProps) {
  const [form] = Form.useForm();
  const [imageUrl, setImageUrl] = useState(item?.imageUrl || '');

  const handleSubmit = async (values: Partial<MenuItem>) => {
    const margin =
      values.price && values.costPrice
        ? ((values.price - values.costPrice) / values.price) * 100
        : 0;

    await onSave({
      ...values,
      imageUrl: imageUrl || values.imageUrl,
      margin,
    });
  };

  const handleUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setImageUrl(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
    return false;
  };

  const price = Form.useWatch('price', form);
  const costPrice = Form.useWatch('costPrice', form);
  const hasStockTracking = Form.useWatch('hasStockTracking', form);
  const margin =
    price && costPrice ? (((price - costPrice) / price) * 100).toFixed(1) : '0';

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={item || { isActive: true, isAvailable: true, hasStockTracking: false }}
      onFinish={handleSubmit}
    >
      <Form.Item
        name="name"
        label="Name"
        rules={[{ required: true, message: 'Please enter item name' }]}
      >
        <Input />
      </Form.Item>

      <Form.Item name="description" label="Description">
        <Input.TextArea rows={3} />
      </Form.Item>

      <div className="grid grid-cols-2 gap-4">
        <Form.Item
          name="categoryId"
          label="Category"
          rules={[{ required: true, message: 'Please select category' }]}
        >
          <Select>
            {categories.map((cat) => (
              <Select.Option key={cat.id} value={cat.id}>
                {cat.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="sortOrder" label="Sort Order">
          <InputNumber className="w-full" />
        </Form.Item>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Form.Item
          name="price"
          label="Price"
          rules={[{ required: true, message: 'Please enter price' }]}
        >
          <InputNumber className="w-full" min={0} prefix="฿" />
        </Form.Item>

        <Form.Item name="costPrice" label="Cost Price">
          <InputNumber className="w-full" min={0} prefix="฿" />
        </Form.Item>

        <Form.Item label="Margin %">
          <Input value={`${margin}%`} disabled />
        </Form.Item>
      </div>

      <Form.Item label="Image">
        <Upload
          listType="picture"
          beforeUpload={handleUpload}
          onRemove={() => setImageUrl('')}
          maxCount={1}
        >
          <Button icon={<UploadOutlined />}>Upload Image</Button>
        </Upload>
        {imageUrl && (
          <div className="relative mt-2 w-32 h-32">
            <Image 
              src={imageUrl} 
              alt="preview" 
              fill 
              className="object-cover rounded" 
              unoptimized
            />
          </div>
        )}
      </Form.Item>

      <div className="grid grid-cols-2 gap-4">
        <Form.Item name="hasStockTracking" label="Track Stock" valuePropName="checked">
          <Switch />
        </Form.Item>

        {hasStockTracking && (
          <Form.Item
            name="stock"
            label="Current Stock"
            rules={[{ required: true, message: 'Please enter stock amount' }]}
          >
            <InputNumber className="w-full" min={0} />
          </Form.Item>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Form.Item name="isActive" label="Active" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item name="isAvailable" label="Available" valuePropName="checked">
          <Switch />
        </Form.Item>
      </div>

      <Form.Item className="mb-0">
        <div className="flex gap-2 justify-end">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            {item ? 'Update' : 'Create'}
          </Button>
        </div>
      </Form.Item>
    </Form>
  );
}
