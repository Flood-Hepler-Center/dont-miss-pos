# 🎨 Admin Pages Receipt Aesthetic Redesign Guide

## ✅ **COMPLETED**

### 1. Admin Layout ✅
**File:** `@/app/(admin)/layout.tsx`
- Removed Ant Design Layout, Sider, Menu components
- Added Receipt-style top navigation with horizontal tabs
- Implemented dropdown menus for MENU and SETTINGS
- Clean monospace font throughout

### 2. All 7 Cashier Components ✅
- TableSelector, BillReview, PaymentMethodSelector
- DiscountForm, CashPayment, PromptPayPayment, Receipt

### 3. Customer Loading States ✅
- Added LoadingOverlay to cart submission
- Fixed page jumping during Firestore operations

---

## 📋 **TODO: Admin Pages (9 pages)**

Follow this exact pattern for each admin page:

### **Standard Admin Page Template**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
// Import only necessary types, NO Ant Design

export default function AdminPage() {
  const [data, setData] = useState<DataType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'collection_name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DataType[];
      setData(items);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 font-mono">
        <div className="border-2 border-black p-8">
          <div className="text-sm mb-2">═</div>
          <p className="text-sm font-bold">LOADING...</p>
          <div className="text-sm mt-2">═</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 font-mono">
      {/* Header */}
      <div className="border-2 border-black p-4 mb-6 text-center">
        <div className="text-sm"></div>
        <h1 className="text-xl font-bold my-1">PAGE TITLE</h1>
        <div className="text-sm"></div>
      </div>

      {/* Action Buttons */}
      <div className="mb-6 flex gap-3">
        <button
          onClick={() => setShowModal(true)}
          className="px-6 py-3 border-2 border-black bg-black text-white hover:bg-gray-800 font-bold text-sm"
        >
          [ADD NEW]
        </button>
      </div>

      {/* Data Grid/Table */}
      <div className="border-2 border-black">
        <div className="border-b-2 border-black bg-gray-50 p-3">
          <div className="grid grid-cols-4 gap-4 text-xs font-bold">
            <div>COLUMN 1</div>
            <div>COLUMN 2</div>
            <div>COLUMN 3</div>
            <div>ACTIONS</div>
          </div>
        </div>
        
        <div className="divide-y-2 divide-black">
          {data.map((item) => (
            <div key={item.id} className="p-3 hover:bg-gray-50">
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>{item.field1}</div>
                <div>{item.field2}</div>
                <div>{item.field3}</div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 border border-black text-xs hover:bg-gray-100">
                    [EDIT]
                  </button>
                  <button className="px-3 py-1 border border-black text-xs hover:bg-gray-100">
                    [DELETE]
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Example */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="border-2 border-black bg-white max-w-2xl w-full p-6">
            <div className="border-b-2 border-black pb-3 mb-4">
              <h2 className="text-lg font-bold text-center">[ MODAL TITLE ]</h2>
            </div>
            
            {/* Modal Content */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-2">LABEL</label>
                <input 
                  type="text"
                  className="w-full px-4 py-2 border-2 border-black focus:outline-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-6 py-3 border-2 border-black bg-white hover:bg-gray-100 font-bold text-sm"
              >
                [CANCEL]
              </button>
              <button
                className="flex-1 px-6 py-3 border-2 border-black bg-black text-white hover:bg-gray-800 font-bold text-sm"
              >
                [SAVE]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 🎯 **Component Replacements**

### Replace Ant Design with Receipt Style:

#### 1. **Card** → `<div className="border-2 border-black p-4">`
```tsx
// Before
<Card title="Title">Content</Card>

// After
<div className="border-2 border-black">
  <div className="border-b-2 border-black p-3 bg-gray-50">
    <h3 className="text-sm font-bold">TITLE</h3>
  </div>
  <div className="p-4">Content</div>
</div>
```

#### 2. **Table** → Custom Grid
```tsx
// Before
<Table dataSource={data} columns={columns} />

// After
<div className="border-2 border-black">
  <div className="border-b-2 border-black bg-gray-50 p-3">
    <div className="grid grid-cols-X gap-4 text-xs font-bold">
      <div>COL 1</div>
      <div>COL 2</div>
    </div>
  </div>
  <div className="divide-y-2 divide-black">
    {data.map(item => (
      <div key={item.id} className="p-3 hover:bg-gray-50">
        <div className="grid grid-cols-X gap-4 text-sm">
          <div>{item.col1}</div>
          <div>{item.col2}</div>
        </div>
      </div>
    ))}
  </div>
</div>
```

#### 3. **Statistic** → Clean Number Display
```tsx
// Before
<Statistic title="Revenue" value={1000} prefix="฿" />

// After
<div className="border-2 border-black p-4">
  <p className="text-xs mb-2">REVENUE</p>
  <p className="text-3xl font-bold">฿1,000</p>
</div>
```

#### 4. **Modal** → Fixed Overlay
```tsx
// Before
<Modal visible={show} onCancel={() => setShow(false)}>...</Modal>

// After
{show && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div className="border-2 border-black bg-white max-w-2xl w-full p-6">
      {/* Content */}
    </div>
  </div>
)}
```

#### 5. **Button** → Border Button
```tsx
// Before
<Button type="primary">Click</Button>

// After - Primary
<button className="px-6 py-3 border-2 border-black bg-black text-white hover:bg-gray-800 font-bold text-sm">
  [CLICK]
</button>

// After - Secondary
<button className="px-6 py-3 border-2 border-black bg-white hover:bg-gray-100 font-bold text-sm">
  [CLICK]
</button>
```

#### 6. **Input** → Border Input
```tsx
// Before
<Input placeholder="Enter..." />

// After
<input 
  type="text"
  placeholder="ENTER..."
  className="w-full px-4 py-2 border-2 border-black focus:outline-none"
/>
```

#### 7. **Select** → Border Select
```tsx
// Before
<Select options={options} />

// After
<select className="w-full px-4 py-2 border-2 border-black focus:outline-none">
  <option value="">SELECT OPTION</option>
  {options.map(opt => (
    <option key={opt.value} value={opt.value}>{opt.label.toUpperCase()}</option>
  ))}
</select>
```

#### 8. **Tag** → Text Badge
```tsx
// Before
<Tag color="green">Active</Tag>

// After
<span className="text-xs font-bold">[ACTIVE]</span>
```

#### 9. **Spin** → Loading Box
```tsx
// Before
<Spin size="large" />

// After
<div className="border-2 border-black p-6">
  <p className="text-sm text-center">LOADING...</p>
</div>
```

#### 10. **Charts (Recharts)** → Keep or Remove
- **Option A:** Remove charts entirely, show data in tables
- **Option B:** Keep charts but wrap in Receipt-style container:
```tsx
<div className="border-2 border-black p-4">
  <div className="border-b-2 border-black pb-3 mb-4">
    <h3 className="text-sm font-bold text-center">[ CHART TITLE ]</h3>
  </div>
  {/* Chart component */}
</div>
```

---

## 📄 **Admin Pages to Redesign**

### 1. Dashboard (`/admin/dashboard/page.tsx`)
**Current:** Cards with Statistic, Line charts, Table  
**Redesign:**
- Replace 4 stat Cards with bordered boxes
- Replace line chart with simple data table OR keep chart in Receipt border
- Replace recent orders Table with custom grid

### 2. Menu Categories (`/admin/menu/categories/page.tsx`)
**Current:** Table with CRUD modal  
**Redesign:**
- Custom grid for categories
- Modal with Receipt borders for add/edit
- Action buttons with Receipt style

### 3. Menu Items (`/admin/menu/items/page.tsx`)
**Current:** Table with filters, CRUD modal  
**Redesign:**
- Custom grid with search
- Modal for add/edit item
- Image upload in Receipt style

### 4. Inventory (`/admin/inventory/page.tsx`)
**Current:** Table with stock levels  
**Redesign:**
- Custom grid showing stock
- Low stock indicators with text badges
- Adjust stock modal

### 5. Reports (`/admin/reports/page.tsx`)
**Current:** Various report cards  
**Redesign:**
- Bordered sections for each report type
- Data tables instead of complex visualizations

### 6-8. Settings Pages (`/admin/settings/general|tables|staff/page.tsx`)
**Current:** Form cards  
**Redesign:**
- Bordered form sections
- Receipt-style inputs
- Save buttons with Receipt style

---

## ✅ **Checklist for Each Page**

- [ ] Remove all Ant Design imports
- [ ] Add `font-mono` to root element
- [ ] Add text border header `════════`
- [ ] Replace Cards with `border-2 border-black`
- [ ] Replace Table with custom grid
- [ ] Replace Buttons with Receipt buttons
- [ ] Replace Inputs with bordered inputs
- [ ] Replace Modals with fixed overlays
- [ ] Loading state with Receipt box
- [ ] Uppercase labels and buttons
- [ ] Use `[BRACKETS]` for actions
- [ ] Test all functionality still works

---

## 🚀 **Quick Start**

1. Pick a page (start with simplest: settings/general)
2. Copy the template above
3. Replace Ant Design components one by one
4. Test functionality
5. Move to next page

**Estimated time per page:** 30-45 minutes  
**Total for 9 pages:** ~4-7 hours
