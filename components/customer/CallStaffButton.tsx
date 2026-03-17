'use client';

import { useState, useEffect } from 'react';
import { staffCallService } from '@/lib/services/staffCall.service';
import { Bell, Loader2, CheckCircle, HandPlatter, Wallet } from 'lucide-react';
import type { StaffCallType } from '@/types';

interface CallStaffButtonProps {
  tableId: string;
  orderId?: string;
  callType?: StaffCallType;
  className?: string;
}

type CallStatus = 'idle' | 'calling' | 'pending' | 'acknowledged' | 'error';

const getCallTypeLabel = (callType: StaffCallType): string => {
  return callType === 'PAYMENT' ? 'REQUEST BILL' : 'CALL STAFF';
};

const getPendingLabel = (callType: StaffCallType): string => {
  return callType === 'PAYMENT' ? 'BILL REQUESTED' : 'STAFF CALLED';
};

const getArrivedLabel = (callType: StaffCallType): string => {
  return callType === 'PAYMENT' ? 'CASHIER COMING' : 'STAFF ARRIVED';
};

const getCallTypeIcon = (callType: StaffCallType) => {
  return callType === 'PAYMENT' ? <Wallet size={18} /> : <HandPlatter size={18} />;
};

export function CallStaffButton({
  tableId,
  orderId,
  callType = 'SERVICE',
  className = '',
}: CallStaffButtonProps) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callId, setCallId] = useState<string | null>(null);

  // Check for existing pending call on mount
  useEffect(() => {
    const checkExistingCall = async () => {
      const existingCall = await staffCallService.getPendingCallForTable(tableId, callType);
      if (existingCall) {
        setCallId(existingCall.id);
        setCallStatus(existingCall.status === 'ACKNOWLEDGED' ? 'acknowledged' : 'pending');
      }
    };
    checkExistingCall();
  }, [tableId, callType]);

  // Subscribe to call status changes
  useEffect(() => {
    if (!callId) return;

    const unsubscribe = staffCallService.subscribeToCall(callId, (call) => {
      if (!call) {
        setCallStatus('idle');
        setCallId(null);
        return;
      }

      if (call.status === 'ACKNOWLEDGED') {
        setCallStatus('acknowledged');
      } else if (call.status === 'COMPLETED') {
        setCallStatus('idle');
        setCallId(null);
      } else {
        setCallStatus('pending');
      }
    });

    return () => unsubscribe();
  }, [callId]);

  const handleCallStaff = async () => {
    if (callStatus === 'calling' || callStatus === 'pending' || callStatus === 'acknowledged') {
      return; // Prevent multiple calls
    }

    setCallStatus('calling');
    try {
      const newCallId = await staffCallService.create({
        tableId,
        orderId,
        type: callType,
      });
      setCallId(newCallId);
      setCallStatus('pending');
    } catch (error) {
      console.error('Error calling staff:', error);
      setCallStatus('error');
      setTimeout(() => setCallStatus('idle'), 3000);
    }
  };

  const getButtonContent = () => {
    switch (callStatus) {
      case 'calling':
        return (
          <>
            <Loader2 size={18} className="animate-spin" />
            <span>CALLING...</span>
          </>
        );
      case 'pending':
        return (
          <>
            <Bell size={18} className="animate-pulse" />
            <span>{getPendingLabel(callType)}</span>
          </>
        );
      case 'acknowledged':
        return (
          <>
            <CheckCircle size={18} />
            <span>{getArrivedLabel(callType)}</span>
          </>
        );
      case 'error':
        return (
          <>
            <Bell size={18} />
            <span>TRY AGAIN</span>
          </>
        );
      default:
        return (
          <>
            {getCallTypeIcon(callType)}
            <span>{getCallTypeLabel(callType)}</span>
          </>
        );
    }
  };

  const getButtonStyle = () => {
    switch (callStatus) {
      case 'calling':
        return 'bg-stone-100 text-stone-500 border-stone-300 cursor-wait';
      case 'pending':
        return callType === 'PAYMENT'
          ? 'bg-amber-50 text-amber-700 border-amber-300 cursor-default'
          : 'bg-stone-100 text-stone-700 border-stone-300 cursor-default';
      case 'acknowledged':
        return 'bg-green-50 text-green-700 border-green-300 cursor-default';
      case 'error':
        return 'bg-red-50 text-red-600 border-red-300 hover:bg-red-100';
      default:
        return callType === 'PAYMENT'
          ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100';
    }
  };

  return (
    <button
      onClick={handleCallStaff}
      disabled={callStatus === 'calling' || callStatus === 'pending' || callStatus === 'acknowledged'}
      title={getCallTypeLabel(callType)}
      className={`
        flex items-center justify-center gap-1.5 px-3 py-2
        border border-opacity-50 text-xs font-medium
        transition-all duration-200
        rounded-sm
        ${getButtonStyle()}
        ${className}
      `}
    >
      {getButtonContent()}
    </button>
  );
}
