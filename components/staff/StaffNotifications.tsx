'use client';

import { useState, useEffect } from 'react';
import { staffCallService } from '@/lib/services/staffCall.service';
import type { StaffCall } from '@/types';
import { Bell, CheckCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface StaffNotificationsProps {
  staffId: string;
  staffName?: string;
}

export function StaffNotifications({ staffId, staffName }: StaffNotificationsProps) {
  const [pendingCalls, setPendingCalls] = useState<StaffCall[]>([]);
  const [acknowledgedCalls, setAcknowledgedCalls] = useState<StaffCall[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Subscribe to pending calls
  useEffect(() => {
    const unsubscribe = staffCallService.subscribeToPending((calls) => {
      // Play sound if new call arrives and sound is enabled
      if (calls.length > pendingCalls.length && soundEnabled) {
        playNotificationSound();
      }
      setPendingCalls(calls);
    });

    return () => unsubscribe();
  }, [pendingCalls.length, soundEnabled]);

  // Play notification sound
  const playNotificationSound = () => {
    try {
      const audio = new Audio('/sounds/notification.mp3');
      audio.play().catch(() => {
        // Audio play failed (browser policy), ignore
      });
    } catch {
      // Audio not supported
    }
  };

  const handleAcknowledge = async (callId: string) => {
    try {
      await staffCallService.acknowledge(callId, staffId);
      // Move to acknowledged list
      const call = pendingCalls.find(c => c.id === callId);
      if (call) {
        setAcknowledgedCalls(prev => [{
          ...call,
          status: 'ACKNOWLEDGED' as const,
          acknowledgedBy: staffId,
          acknowledgedAt: new Date()
        }, ...prev].slice(0, 5));
      }
    } catch (error) {
      console.error('Error acknowledging call:', error);
    }
  };

  const handleComplete = async (callId: string) => {
    try {
      await staffCallService.complete(callId);
      // Remove from acknowledged list
      setAcknowledgedCalls(prev => prev.filter(c => c.id !== callId));
    } catch (error) {
      console.error('Error completing call:', error);
    }
  };

  const getCallTypeText = (type: string) => {
    return type === 'PAYMENT' ? 'เรียกเก็บเงิน' : 'เรียกพนักงาน';
  };

  const getTimeAgo = (date: Date) => {
    try {
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'just now';
    }
  };

  return (
    <div className="border-2 border-black bg-white">
      {/* Header */}
      <div className="border-b-2 border-black p-3 bg-black text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={18} />
            <span className="font-bold text-sm">STAFF CALLS</span>
            {pendingCalls.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {pendingCalls.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`text-xs px-2 py-1 border ${soundEnabled ? 'bg-green-500 border-green-500' : 'bg-gray-700 border-gray-500'}`}
              title={soundEnabled ? 'Sound ON' : 'Sound OFF'}
            >
              {soundEnabled ? '🔔' : '🔕'}
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm font-bold hover:opacity-70"
            >
              {isExpanded ? '[-]' : '[+]'}
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="max-h-[400px] overflow-y-auto">
          {/* Pending Calls */}
          <div className="p-3">
            <h3 className="text-xs font-bold text-gray-600 mb-2">
              PENDING ({pendingCalls.length})
            </h3>
            {pendingCalls.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No pending calls
              </p>
            ) : (
              <div className="space-y-2">
                {pendingCalls.map((call) => (
                  <div
                    key={call.id}
                    className="border-2 border-amber-400 bg-amber-50 p-3 animate-pulse"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Bell size={16} className="text-amber-600" />
                          <span className="font-bold text-amber-900">
                            TABLE #{call.tableId}
                          </span>
                        </div>
                        <p className="text-xs text-amber-700 mt-1">
                          {getCallTypeText(call.type)}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                          <Clock size={12} />
                          <span>{getTimeAgo(call.createdAt)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAcknowledge(call.id)}
                        className="px-3 py-1 bg-black text-white text-xs font-bold border-2 border-black hover:bg-gray-800"
                      >
                        ACKNOWLEDGE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Acknowledged Calls */}
          {acknowledgedCalls.length > 0 && (
            <div className="border-t-2 border-gray-200 p-3">
              <h3 className="text-xs font-bold text-gray-600 mb-2">
                IN PROGRESS ({acknowledgedCalls.length})
              </h3>
              <div className="space-y-2">
                {acknowledgedCalls.map((call) => (
                  <div
                    key={call.id}
                    className="border-2 border-green-400 bg-green-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <CheckCircle size={16} className="text-green-600" />
                          <span className="font-bold text-green-900">
                            TABLE #{call.tableId}
                          </span>
                        </div>
                        <p className="text-xs text-green-700 mt-1">
                          {getCallTypeText(call.type)}
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          By: {staffName || call.acknowledgedBy?.slice(-6)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleComplete(call.id)}
                        className="px-3 py-1 bg-green-600 text-white text-xs font-bold border-2 border-green-600 hover:bg-green-700"
                      >
                        COMPLETE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
