'use client';

import { User, Phone, Mail } from 'lucide-react';

interface CustomerInfoFormProps {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  onChange: (field: 'customerName' | 'customerPhone' | 'customerEmail', value: string) => void;
  errors?: {
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
  };
}

export function CustomerInfoForm({ 
  customerName, 
  customerPhone, 
  customerEmail = '', 
  onChange,
  errors = {}
}: CustomerInfoFormProps) {
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    return digits;
  };

  return (
    <div className="space-y-4 border-2 border-blue-200 p-4 bg-blue-50">
      <h3 className="font-bold text-sm uppercase text-blue-800">
        Customer Information (Required for Take-Away)
      </h3>
      
      {/* Customer Name */}
      <div>
        <label className="block text-xs font-bold uppercase mb-1">
          Customer Name *
        </label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={customerName}
            onChange={(e) => onChange('customerName', e.target.value)}
            placeholder="Enter customer name"
            className={`w-full pl-10 pr-4 py-3 border-2 text-sm ${
              errors.customerName ? 'border-red-500' : 'border-black'
            }`}
            maxLength={50}
          />
        </div>
        {errors.customerName && (
          <p className="text-red-600 text-xs mt-1">{errors.customerName}</p>
        )}
      </div>
      
      {/* Phone Number */}
      <div>
        <label className="block text-xs font-bold uppercase mb-1">
          Phone Number *
        </label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="tel"
            value={customerPhone}
            onChange={(e) => onChange('customerPhone', formatPhone(e.target.value))}
            placeholder="0XX-XXX-XXXX"
            className={`w-full pl-10 pr-4 py-3 border-2 text-sm ${
              errors.customerPhone ? 'border-red-500' : 'border-black'
            }`}
            maxLength={10}
          />
        </div>
        {errors.customerPhone && (
          <p className="text-red-600 text-xs mt-1">{errors.customerPhone}</p>
        )}
        <p className="text-gray-500 text-xs mt-1">10 digits starting with 0</p>
      </div>
      
      {/* Email (Optional) */}
      <div>
        <label className="block text-xs font-bold uppercase mb-1">
          Email (Optional)
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => onChange('customerEmail', e.target.value)}
            placeholder="customer@email.com"
            className={`w-full pl-10 pr-4 py-3 border-2 text-sm ${
              errors.customerEmail ? 'border-red-500' : 'border-black'
            }`}
          />
        </div>
        {errors.customerEmail && (
          <p className="text-red-600 text-xs mt-1">{errors.customerEmail}</p>
        )}
      </div>
    </div>
  );
}
