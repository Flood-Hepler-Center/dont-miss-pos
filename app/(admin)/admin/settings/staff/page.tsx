'use client';

import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Switch, message, Tag } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { collection, onSnapshot, query, orderBy, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface StaffMember {
  id: string;
  name: string;
  role: 'ADMIN' | 'STAFF';
  pin: string;
  isActive: boolean;
}

export default function StaffSettingsPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    const q = query(collection(db, 'staff'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const staffData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as StaffMember[];
      setStaff(staffData);
    });

    return () => unsubscribe();
  }, []);

  const handleAdd = () => {
    setEditingStaff(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (member: StaffMember) => {
    setEditingStaff(member);
    form.setFieldsValue(member);
    setModalVisible(true);
  };

  const handleSubmit = async (values: Partial<StaffMember>) => {
    setLoading(true);
    try {
      if (editingStaff) {
        const staffRef = doc(db, 'staff', editingStaff.id);
        await updateDoc(staffRef, values);
        message.success('Staff updated successfully');
      } else {
        const staffRef = doc(collection(db, 'staff'));
        await setDoc(staffRef, {
          ...values,
          createdAt: new Date(),
        });
        message.success('Staff added successfully');
      }
      setModalVisible(false);
      form.resetFields();
    } catch (error) {
      console.error('Error saving staff:', error);
      message.error('Failed to save staff');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const staffRef = doc(db, 'staff', id);
      await updateDoc(staffRef, { isActive: !isActive });
      message.success(isActive ? 'Staff deactivated' : 'Staff activated');
    } catch (error) {
      console.error('Error toggling staff status:', error);
      message.error('Failed to update staff status');
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'ADMIN' ? 'blue' : 'green'}>{role}</Tag>
      ),
    },
    {
      title: 'PIN',
      dataIndex: 'pin',
      key: 'pin',
      render: () => '••••',
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'}>{isActive ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: StaffMember) => (
        <div className="flex gap-2">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Switch
            checked={record.isActive}
            onChange={() => handleToggleActive(record.id, record.isActive)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="p-8 bg-gradient-to-br from-slate-50 via-white to-cyan-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-cyan-900 to-blue-900 bg-clip-text text-transparent mb-2">
              Staff Management
            </h1>
            <p className="text-slate-600">Manage staff members and their access</p>
          </div>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
            size="large"
            className="!bg-gradient-to-r !from-cyan-600 !to-blue-600 hover:!from-cyan-700 hover:!to-blue-700 !border-0 shadow-lg shadow-cyan-500/30"
          >
            Add Staff
          </Button>
        </div>

      <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm rounded-2xl">
        <Table 
          dataSource={staff} 
          columns={columns} 
          rowKey="id" 
          pagination={false}
          className="[&_.ant-table-thead>tr>th]:!bg-slate-50 [&_.ant-table-thead>tr>th]:!font-semibold [&_.ant-table-thead>tr>th]:!text-slate-700"
        />
      </Card>

      <Modal
        title={editingStaff ? 'Edit Staff' : 'Add Staff'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="ADMIN">Admin</Select.Option>
              <Select.Option value="STAFF">Staff</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="pin" label="PIN (4-6 digits)" rules={[{ required: true, min: 4, max: 6 }]}>
            <Input.Password maxLength={6} />
          </Form.Item>

          <Form.Item name="isActive" label="Active" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>

          <Form.Item className="mb-0">
            <div className="flex gap-2 justify-end">
              <Button onClick={() => setModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                {editingStaff ? 'Update' : 'Create'}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
      </div>
    </div>
  );
}
