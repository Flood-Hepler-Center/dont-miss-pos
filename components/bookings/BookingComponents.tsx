'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import type { Booking, BookingStatus, BookingSource } from '@/types';
import { BOOKING_STATUS_CONFIG, BOOKING_SOURCE_CONFIG } from '@/types';
import { X, Phone, Users, Clock, Check, XCircle, UserCheck } from 'lucide-react';

// ============================================
// Booking Status Badge
// ============================================
type BookingStatusBadgeProps = {
  status: BookingStatus;
  size?: 'sm' | 'md';
};

export function BookingStatusBadge({ status, size = 'md' }: BookingStatusBadgeProps) {
  const config = BOOKING_STATUS_CONFIG[status];
  const colorClasses: Record<string, string> = {
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-400',
    blue: 'bg-blue-100 text-blue-800 border-blue-400',
    green: 'bg-green-100 text-green-800 border-green-400',
    red: 'bg-red-100 text-red-800 border-red-400',
    gray: 'bg-gray-100 text-gray-800 border-gray-400',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 border-2 font-bold ${
        colorClasses[config.color]
      } ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}
    >
      {config.label.toUpperCase()}
    </span>
  );
}

// ============================================
// Booking Stats
// ============================================
type BookingStatsProps = {
  stats: {
    total: number;
    pending: number;
    confirmed: number;
    seated: number;
    cancelled: number;
    totalPeople: number;
  };
};

export function BookingStats({ stats }: BookingStatsProps) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
      <div className="border-2 border-black p-2 text-center">
        <p className="text-[10px] font-bold">TOTAL</p>
        <p className="text-lg font-bold">{stats.total}</p>
      </div>
      <div className="border-2 border-yellow-400 bg-yellow-50 p-2 text-center">
        <p className="text-[10px] font-bold text-yellow-800">PENDING</p>
        <p className="text-lg font-bold text-yellow-800">{stats.pending}</p>
      </div>
      <div className="border-2 border-blue-400 bg-blue-50 p-2 text-center">
        <p className="text-[10px] font-bold text-blue-800">CONFIRMED</p>
        <p className="text-lg font-bold text-blue-800">{stats.confirmed}</p>
      </div>
      <div className="border-2 border-green-400 bg-green-50 p-2 text-center">
        <p className="text-[10px] font-bold text-green-800">SEATED</p>
        <p className="text-lg font-bold text-green-800">{stats.seated}</p>
      </div>
      <div className="border-2 border-red-400 bg-red-50 p-2 text-center">
        <p className="text-[10px] font-bold text-red-800">CANCELLED</p>
        <p className="text-lg font-bold text-red-800">{stats.cancelled}</p>
      </div>
      <div className="border-2 border-black p-2 text-center">
        <p className="text-[10px] font-bold">PEOPLE</p>
        <p className="text-lg font-bold">{stats.totalPeople}</p>
      </div>
    </div>
  );
}

// ============================================
// Booking Form
// ============================================
type BookingFormProps = {
  booking?: Booking | null;
  onSubmit: (data: { name: string; phone: string; amount: number; time: Date; source?: BookingSource; tableId?: string; notes?: string }) => void;
  onClose: () => void;
  loading?: boolean;
};

export function BookingForm({ booking, onSubmit, onClose, loading }: BookingFormProps) {
  const [name, setName] = useState(booking?.name || '');
  const [phone, setPhone] = useState(booking?.phone || '');
  const [amount, setAmount] = useState(booking?.amount || 2);
  const [dateStr, setDateStr] = useState(
    booking ? format(booking.time, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  );
  const [timeStr, setTimeStr] = useState(
    booking ? format(booking.time, 'HH:mm') : '18:00'
  );
  const [source, setSource] = useState<BookingSource>(booking?.source || 'PHONE');
  const [tableId, setTableId] = useState<string>(booking?.tableId || '');
  const [notes, setNotes] = useState(booking?.notes || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!phone.trim()) {
      newErrors.phone = 'Phone is required';
    } else if (!/^0\d{9}$/.test(phone)) {
      newErrors.phone = 'Phone must be 10 digits starting with 0';
    }

    if (amount < 1) {
      newErrors.amount = 'At least 1 person required';
    }

    if (!dateStr || !timeStr) {
      newErrors.time = 'Date and time are required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const time = new Date(`${dateStr}T${timeStr}`);
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      amount,
      time,
      source,
      tableId: tableId || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white border-2 border-black max-w-md w-full font-mono">
        <div className="border-b-2 border-black p-3 flex justify-between items-center">
          <h2 className="text-lg font-bold">
            {booking ? '[ EDIT BOOKING ]' : '[ NEW BOOKING ]'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-bold mb-1">NAME *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
              placeholder="Customer name"
            />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold mb-1">PHONE *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
              placeholder="0XXXXXXXXX"
              maxLength={10}
            />
            {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold mb-1">NUMBER OF PEOPLE *</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAmount(Math.max(1, amount - 1))}
                className="w-10 h-10 border-2 border-black font-bold hover:bg-gray-100"
              >
                -
              </button>
              <span className="w-16 text-center text-lg font-bold">{amount}</span>
              <button
                type="button"
                onClick={() => setAmount(amount + 1)}
                className="w-10 h-10 border-2 border-black font-bold hover:bg-gray-100"
              >
                +
              </button>
            </div>
            {errors.amount && <p className="text-xs text-red-600 mt-1">{errors.amount}</p>}
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1">DATE *</label>
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">TIME *</label>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
              />
            </div>
          </div>
          {errors.time && <p className="text-xs text-red-600">{errors.time}</p>}

          {/* Source */}
          <div>
            <label className="block text-xs font-bold mb-1">SOURCE</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
            >
              {Object.entries(BOOKING_SOURCE_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div>
            <label className="block text-xs font-bold mb-1">TABLE (OPTIONAL)</label>
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
            >
              <option value="">No table assigned</option>
              {Array.from({ length: 20 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>Table {i + 1}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold mb-1">NOTES (OPTIONAL)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none resize-none"
              rows={2}
              placeholder="Special requests..."
            />
          </div>
        </div>

        <div className="border-t-2 border-black p-3 grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border-2 border-black bg-white font-bold text-sm hover:bg-gray-100"
          >
            [CANCEL]
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? '[SAVING...]' : booking ? '[UPDATE]' : '[CREATE]'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Booking Card
// ============================================
type BookingCardProps = {
  booking: Booking;
  onStatusChange: (status: BookingStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function BookingCard({ booking, onStatusChange, onEdit, onDelete }: BookingCardProps) {
  const timeStr = format(booking.time, 'HH:mm');
  const dateStr = format(booking.time, 'dd MMM');

  return (
    <div className="border-2 border-black p-3 hover:bg-gray-50">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-sm">{booking.name.toUpperCase()}</span>
            <BookingStatusBadge status={booking.status} size="sm" />
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <Phone size={12} /> {booking.phone}
            </span>
            <span className="flex items-center gap-1">
              <Users size={12} /> {booking.amount}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} /> {timeStr}
            </span>
            {booking.source && (
              <span className="px-1 border border-gray-300 text-[10px]">
                {BOOKING_SOURCE_CONFIG[booking.source]?.label || booking.source}
              </span>
            )}
            {booking.tableId && (
              <span className="px-1 border border-gray-300 text-[10px]">
                T{booking.tableId}
              </span>
            )}
          </div>
          {booking.notes && (
            <p className="text-xs text-gray-500 mt-1 italic">&quot;{booking.notes}&quot;</p>
          )}
        </div>
        <div className="text-right text-xs text-gray-500">
          {dateStr}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-1 mt-2">
        {booking.status === 'PENDING' && (
          <>
            <button
              onClick={() => onStatusChange('CONFIRMED')}
              className="px-2 py-1 border-2 border-blue-400 bg-blue-50 text-blue-800 text-[10px] font-bold hover:bg-blue-100 flex items-center gap-1"
            >
              <Check size={10} /> CONFIRM
            </button>
            <button
              onClick={() => onStatusChange('CANCELLED')}
              className="px-2 py-1 border-2 border-red-400 bg-red-50 text-red-800 text-[10px] font-bold hover:bg-red-100 flex items-center gap-1"
            >
              <XCircle size={10} /> CANCEL
            </button>
          </>
        )}
        {booking.status === 'CONFIRMED' && (
          <>
            <button
              onClick={() => onStatusChange('SEATED')}
              className="px-2 py-1 border-2 border-green-400 bg-green-50 text-green-800 text-[10px] font-bold hover:bg-green-100 flex items-center gap-1"
            >
              <UserCheck size={10} /> SEATED
            </button>
            <button
              onClick={() => onStatusChange('NO_SHOW')}
              className="px-2 py-1 border-2 border-gray-400 bg-gray-50 text-gray-800 text-[10px] font-bold hover:bg-gray-100"
            >
              NO SHOW
            </button>
          </>
        )}
        <button
          onClick={onEdit}
          className="px-2 py-1 border-2 border-black text-[10px] font-bold hover:bg-gray-100"
        >
          EDIT
        </button>
        <button
          onClick={onDelete}
          className="px-2 py-1 border-2 border-red-400 text-red-600 text-[10px] font-bold hover:bg-red-50"
        >
          DEL
        </button>
      </div>
    </div>
  );
}

// ============================================
// Booking List
// ============================================
type BookingListProps = {
  bookings: Booking[];
  onStatusChange: (id: string, status: BookingStatus) => void;
  onEdit: (booking: Booking) => void;
  onDelete: (id: string) => void;
};

export function BookingList({ bookings, onStatusChange, onEdit, onDelete }: BookingListProps) {
  if (bookings.length === 0) {
    return (
      <div className="border-2 border-black p-12 text-center">
        <p className="text-sm text-gray-600">NO BOOKINGS FOUND</p>
      </div>
    );
  }

  return (
    <div className="border-2 border-black divide-y-2 divide-black">
      {bookings.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          onStatusChange={(status) => onStatusChange(booking.id, status)}
          onEdit={() => onEdit(booking)}
          onDelete={() => onDelete(booking.id)}
        />
      ))}
    </div>
  );
}
