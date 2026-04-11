'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { message } from 'antd';
import { bookingService } from '@/lib/services/booking.service';
import type { Booking, BookingStatus, BookingSource } from '@/types';
import { BookingStats, BookingForm, BookingList, BookingKanban } from './BookingComponents';
import { Plus, Calendar, ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';

type BookingPageContentProps = {
  // Optional: if true, show additional admin features
  isAdmin?: boolean;
};

export function BookingPageContent({ isAdmin = false }: BookingPageContentProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Subscribe to bookings for selected date
  useEffect(() => {
    setLoading(true);
    const unsubscribe = bookingService.subscribeByDate(selectedDate, (data) => {
      setBookings(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedDate]);

  // Calculate stats
  const stats = bookingService.getStats(bookings);

  // Navigate dates
  const goToToday = () => setSelectedDate(new Date());
  const goToPrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };
  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  // Create booking
  const handleCreate = async (data: {
    name: string;
    phone: string;
    amount: number;
    time: Date;
    source?: BookingSource;
    tableId?: string;
    notes?: string;
  }) => {
    try {
      setFormLoading(true);
      await bookingService.create(data);
      message.success('Booking created');
      setShowForm(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to create booking');
    } finally {
      setFormLoading(false);
    }
  };

  // Update booking
  const handleUpdate = async (data: {
    name: string;
    phone: string;
    amount: number;
    time: Date;
    source?: BookingSource;
    tableId?: string;
    notes?: string;
  }) => {
    if (!editingBooking) return;

    try {
      setFormLoading(true);
      await bookingService.update(editingBooking.id, data);
      message.success('Booking updated');
      setEditingBooking(null);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to update booking');
    } finally {
      setFormLoading(false);
    }
  };

  // Update status
  const handleStatusChange = async (id: string, status: BookingStatus) => {
    try {
      await bookingService.updateStatus(id, status);
      message.success(`Status updated to ${status}`);
    } catch {
      message.error('Failed to update status');
    }
  };

  // Delete booking
  const handleDelete = async (id: string) => {
    try {
      await bookingService.delete(id);
      message.success('Booking deleted');
      setDeleteConfirm(null);
    } catch {
      message.error('Failed to delete booking');
    }
  };

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="min-h-screen bg-white font-mono p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm"> </div>
          <h1 className="text-xl md:text-2xl font-bold my-2">
            BOOKING MANAGEMENT
            {isAdmin && <span className="text-xs ml-2">(ADMIN)</span>}
          </h1>
          <p className="text-xs">Manage reservations and walk-ins</p>
          <div className="text-sm"> </div>
        </div>

        {/* Date Navigator */}
        <div className="border-2 border-black p-3 mb-4">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={goToPrevDay}
              className="p-2 border-2 border-black hover:bg-gray-100"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex items-center gap-2 flex-1 justify-center">
              <Calendar size={16} />
              <span className="font-bold text-sm">
                {format(selectedDate, 'EEEE, dd MMMM yyyy').toUpperCase()}
              </span>
              {!isToday && (
                <button
                  onClick={goToToday}
                  className="px-2 py-1 border-2 border-black text-[10px] font-bold hover:bg-gray-100"
                >
                  [TODAY]
                </button>
              )}
            </div>

            <button
              onClick={goToNextDay}
              className="p-2 border-2 border-black hover:bg-gray-100"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <BookingStats stats={stats} />

        {/* Actions */}
        <div className="flex justify-between items-center mb-4">
          {/* View Toggle */}
          <div className="flex border-2 border-black">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-2 text-xs font-bold flex items-center gap-1 ${
                viewMode === 'kanban' ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'
              }`}
            >
              <LayoutGrid size={14} /> KANBAN
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-xs font-bold flex items-center gap-1 border-l-2 border-black ${
                viewMode === 'list' ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'
              }`}
            >
              <List size={14} /> LIST
            </button>
          </div>

          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 flex items-center gap-2"
          >
            <Plus size={16} /> [NEW BOOKING]
          </button>
        </div>

        {/* Booking View */}
        {loading ? (
          <div className="border-2 border-black p-12 text-center">
            <p className="text-sm">LOADING...</p>
          </div>
        ) : viewMode === 'kanban' ? (
          <BookingKanban
            bookings={bookings}
            onStatusChange={handleStatusChange}
            onEdit={(booking) => setEditingBooking(booking)}
            onDelete={(id) => setDeleteConfirm(id)}
          />
        ) : (
          <BookingList
            bookings={bookings}
            onStatusChange={handleStatusChange}
            onEdit={(booking) => setEditingBooking(booking)}
            onDelete={(id) => setDeleteConfirm(id)}
          />
        )}
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <BookingForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
          loading={formLoading}
        />
      )}

      {/* Edit Form Modal */}
      {editingBooking && (
        <BookingForm
          booking={editingBooking}
          onSubmit={handleUpdate}
          onClose={() => setEditingBooking(null)}
          loading={formLoading}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black max-w-sm w-full font-mono">
            <div className="border-b-2 border-black p-3">
              <h2 className="text-lg font-bold text-center text-red-600">[DELETE BOOKING?]</h2>
            </div>
            <div className="p-4">
              <p className="text-sm text-center mb-4">
                Are you sure you want to delete this booking?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 border-2 border-black bg-white font-bold text-sm hover:bg-gray-100"
                >
                  [CANCEL]
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="px-4 py-2 border-2 border-black bg-red-600 text-white font-bold text-sm hover:bg-red-700"
                >
                  [DELETE]
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
