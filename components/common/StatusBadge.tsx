import React from 'react';
import {
  RepairStatus,
  RequestUrgency,
  EscrowStatus,
  WarrantyClaimStatus,
  DisputeResolution,
} from '../../types';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Wrench,
  Search,
  PackageCheck,
  Check,
  XCircle,
  Sparkles,
} from 'lucide-react';

// Props interface for unified multi-domain status badge component
interface StatusBadgeProps {
  status?: RepairStatus | string;
  urgency?: RequestUrgency;
  escrowStatus?: EscrowStatus;
  warrantyStatus?: WarrantyClaimStatus;
  disputeResolution?: DisputeResolution;
  partsQuality?: string;
  className?: string;
}

// Visual indicator badge rendering formatted status pills across tickets, escrow, and warranty
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  urgency,
  escrowStatus,
  warrantyStatus,
  disputeResolution,
  partsQuality,
  className = '',
}) => {
  // 1. Repair Request Status
  if (status) {
    switch (status) {
      case 'open':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60 ${className}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-sky-600 dark:bg-sky-400 animate-pulse" />
            Intake Open (Bidding)
          </span>
        );
      case 'quote_accepted':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 shadow-2xs ${className}`}>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
            Quote Accepted (Escrow Locked)
          </span>
        );
      case 'in_shop':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-neutral-100 text-neutral-800 border border-neutral-300 dark:bg-[#1a1a1a] dark:text-neutral-200 dark:border-neutral-700 ${className}`}>
            <PackageCheck className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
            Checked In at Workshop
          </span>
        );
      case 'diagnosing':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60 ${className}`}>
            <Search className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" />
            Bench Diagnostics
          </span>
        );
      case 'in_repair':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60 ${className}`}>
            <Wrench className="w-3.5 h-3.5 text-sky-700 dark:text-sky-300" />
            Active Component Repair
          </span>
        );
      case 'quality_check':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60 ${className}`}>
            <Sparkles className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
            QA & Calibration
          </span>
        );
      case 'ready_for_pickup':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 shadow-2xs ${className}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-800 dark:text-emerald-300" />
            Ready for Pickup / Delivery
          </span>
        );
      case 'completed':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 ${className}`}>
            <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
            Completed & Funds Released
          </span>
        );
      case 'disputed':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/70 ${className}`}>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
            Dispute Pending Arbitration
          </span>
        );
      case 'cancelled':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-neutral-100 text-neutral-600 border border-neutral-300 dark:bg-[#161616] dark:text-neutral-400 dark:border-neutral-800 ${className}`}>
            <XCircle className="w-3.5 h-3.5 text-neutral-500" />
            Ticket Cancelled
          </span>
        );
      default:
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 ${className}`}>
            {status}
          </span>
        );
    }
  }

  // 2. Request Urgency
  if (urgency) {
    switch (urgency) {
      case 'urgent':
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/70 shadow-2xs ${className}`}>
            <Flame className="w-3 h-3 text-amber-700 dark:text-amber-400" />
            Urgent (24h)
          </span>
        );
      case 'standard':
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-800 ${className}`}>
            <Clock className="w-3 h-3 text-neutral-500" />
            Standard (2-3 Days)
          </span>
        );
      case 'flexible':
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-800 ${className}`}>
            Flexible
          </span>
        );
    }
  }

  // 3. Escrow Status
  if (escrowStatus) {
    switch (escrowStatus) {
      case 'held_in_escrow':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 ${className}`}>
            <Shield className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
            Funds Held in Escrow
          </span>
        );
      case 'released_to_shop':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/70 ${className}`}>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-800 dark:text-emerald-300" />
            Escrow Released to Workshop
          </span>
        );
      case 'refunded_to_customer':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60 ${className}`}>
            <ShieldCheck className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
            100% Refunded to Customer
          </span>
        );
      case 'split_payout':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60 ${className}`}>
            <ShieldCheck className="w-3.5 h-3.5 text-sky-700 dark:text-sky-300" />
            Split Escrow Settlement
          </span>
        );
      case 'disputed_frozen':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/80 shadow-2xs ${className}`}>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-700 dark:text-rose-300" />
            Escrow Frozen (Dispute)
          </span>
        );
    }
  }

  // 4. Parts Quality
  if (partsQuality) {
    switch (partsQuality) {
      case 'OEM Genuine':
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 ${className}`}>
            OEM Genuine
          </span>
        );
      case 'Refurbished Original':
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60 ${className}`}>
            Refurbished Original
          </span>
        );
      default:
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 ${className}`}>
            {partsQuality}
          </span>
        );
    }
  }

  // 5. Warranty Claim Status
  if (warrantyStatus) {
    switch (warrantyStatus) {
      case 'submitted':
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60 ${className}`}>
            Submitted (Pending Review)
          </span>
        );
      case 'under_review':
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60 ${className}`}>
            Under Lab Review
          </span>
        );
      case 'repair_scheduled':
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60 ${className}`}>
            Repair Scheduled
          </span>
        );
      case 'resolved':
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 ${className}`}>
            Resolved & Covered
          </span>
        );
      case 'rejected':
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/70 ${className}`}>
            Claim Rejected
          </span>
        );
    }
  }

  return null;
};
