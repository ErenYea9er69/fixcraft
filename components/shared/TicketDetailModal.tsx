import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import { ImageUpload } from '../common/ImageUpload';
import {
  RepairRequest,
  ChatMessage,
  Quote,
  Dispute,
  PartsQuality,
  RepairStatus,
} from '../../types';
import {
  Wrench,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Send,
  Loader2,
  AlertTriangle,
  Star,
  CheckCircle2,
  FileText,
  MessageSquare,
  Paperclip,
  Check,
  X,
  User,
  History,
  XCircle,
  Plus,
  ArrowRight,
  Scale,
} from 'lucide-react';

// Props interface for ticket details docket modal
interface TicketDetailModalProps {
  requestId: string | null;
  onClose: () => void;
  onUpdate?: () => void;
  onOpenShopProfile?: (shopId: string) => void;
}

const BENCH_STAGE_ORDER: RepairStatus[] = [
  'quote_accepted',
  'in_shop',
  'diagnosing',
  'in_repair',
  'quality_check',
  'ready_for_pickup',
];

const BENCH_STAGE_LABELS: Record<string, string> = {
  quote_accepted: 'Quote Accepted',
  in_shop: 'In Workshop',
  diagnosing: 'Diagnostics',
  in_repair: 'Bench Repair',
  quality_check: 'QA Check',
  ready_for_pickup: 'Ready for Pickup',
};

const VALID_PARTS_QUALITIES: PartsQuality[] = [
  'OEM Genuine',
  'Refurbished Original',
  'Tier-1 Certified Aftermarket',
  'OEM Equivalent',
  'Aftermarket High-Quality',
];

const AVAILABLE_REVIEW_TAGS = [
  'OEM Genuine Parts',
  'Fast Turnaround',
  'Clean Micro-Soldering',
  'Clear Communication',
  'Fair Pricing',
  'Exceeded Expectations',
];

// Comprehensive modal docket managing repair ticket lifecycle, quotes, escrow, disputes, and live messaging
export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({
  requestId,
  onClose,
  onUpdate,
  onOpenShopProfile,
}) => {
  const { user, shop } = useAuth();
  const { showToast } = useToast();

  const [ticket, setTicket] = useState<RepairRequest | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'overview' | 'quotes' | 'timeline' | 'chat'>('overview');

  // Messaging state
  const [newMessage, setNewMessage] = useState('');
  const [chatAttachments, setChatAttachments] = useState<string[]>([]);
  const [recipientId, setRecipientId] = useState<string>('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Dispute submission state (customer)
  const [isDisputeOpen, setIsDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('Defective or Incomplete Repair');
  const [customerStatement, setCustomerStatement] = useState('');
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);

  // Workshop Dispute Defense state (shop)
  const [shopDefenseStatement, setShopDefenseStatement] = useState('');
  const [isSubmittingDefense, setIsSubmittingDefense] = useState(false);

  // Workshop Quote Formulation modal state (shop on open tickets)
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [quoteLaborCost, setQuoteLaborCost] = useState('');
  const [quotePartsCost, setQuotePartsCost] = useState('');
  const [quoteDiagFee, setQuoteDiagFee] = useState('0');
  const [quoteDiagWaived, setQuoteDiagWaived] = useState(true);
  const [quotePartsQuality, setQuotePartsQuality] = useState<PartsQuality>('OEM Genuine');
  const [quoteTurnaround, setQuoteTurnaround] = useState('24 hours');
  const [quoteTurnaroundDays, setQuoteTurnaroundDays] = useState<number>(1);
  const [quoteWarrantyMonths, setQuoteWarrantyMonths] = useState('3');
  const [quoteTechNotes, setQuoteTechNotes] = useState('');
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  // Review state
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [speedRating, setSpeedRating] = useState(5);
  const [commRating, setCommRating] = useState(5);
  const [qualityRating, setQualityRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewTags, setReviewTags] = useState<string[]>(['OEM Genuine Parts', 'Fast Turnaround']);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Warranty state
  const [isWarrantyOpen, setIsWarrantyOpen] = useState(false);
  const [warrantyIssue, setWarrantyIssue] = useState('');
  const [isSubmittingWarranty, setIsSubmittingWarranty] = useState(false);

  // Monotonic Bench Stage Advancer state
  const [isAdvanceStageOpen, setIsAdvanceStageOpen] = useState(false);
  const [techNotes, setTechNotes] = useState('');
  const [proofPhotos, setProofPhotos] = useState<string[]>([]);
  const [isAdvancingStage, setIsAdvancingStage] = useState(false);

  // Quote acceptance & Handover & Cancellation modals
  const [isAcceptingQuoteId, setIsAcceptingQuoteId] = useState<string | null>(null);
  const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false);
  const [isConfirmingHandover, setIsConfirmingHandover] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCancellingTicket, setIsCancellingTicket] = useState(false);

  // Loads complete ticket details, quotes, escrow records, and message thread from API
  const fetchTicketData = useCallback(
    async (silent = false) => {
      if (!requestId) return;
      try {
        const data = await api.shared.getRequestDetail(requestId);
        setTicket(data);
        const msgs = await api.shared.getTicketMessages(requestId);
        setMessages(msgs);
      } catch (err: any) {
        if (!silent) {
          showToast(err.message || 'Failed to fetch ticket details', 'error');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [requestId, showToast]
  );

  useEffect(() => {
    if (requestId) {
      setIsLoading(true);
      fetchTicketData(false);
      const interval = setInterval(() => fetchTicketData(true), 6000);
      return () => clearInterval(interval);
    }
  }, [requestId, fetchTicketData]);

  if (!requestId) return null;

  // Next sequential bench stage calculation
  // Computes the next valid monotonic repair stage according to workshop bench progression
  const getNextStageForTicket = (): RepairStatus | null => {
    if (!ticket) return null;
    const currentIndex = BENCH_STAGE_ORDER.indexOf(ticket.status);
    if (currentIndex === -1 || currentIndex >= BENCH_STAGE_ORDER.length - 1) {
      return null;
    }
    return BENCH_STAGE_ORDER[currentIndex + 1];
  };

  const nextSequentialStage = getNextStageForTicket();
  const canShopAdvanceStage =
    user?.role === 'shop' &&
    nextSequentialStage !== null &&
    !['ready_for_pickup', 'completed', 'disputed', 'cancelled', 'open'].includes(ticket?.status || '');

  // Accepts a workshop repair quote and initiates platform escrow lock
  const handleAcceptQuote = async (quoteId: string) => {
    setIsAcceptingQuoteId(quoteId);
    try {
      const res = await api.client.acceptQuote(quoteId);
      showToast(res.message || 'Quote accepted and funds locked in escrow!', 'success');
      await fetchTicketData();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      if (
        err.status === 409 ||
        err.message?.toLowerCase().includes('conflict') ||
        err.message?.toLowerCase().includes('no longer available') ||
        err.message?.toLowerCase().includes('already accepted')
      ) {
        await fetchTicketData();
        if (onUpdate) onUpdate();
        showToast('This quote is no longer available. Ticket data has been refreshed.', 'warning');
      } else {
        showToast(err.message || 'Failed to accept quote', 'error');
      }
    } finally {
      setIsAcceptingQuoteId(null);
    }
  };

  // Customer confirms device inspection and releases escrow payment to workshop
  const handleConfirmHandover = async () => {
    if (!ticket || isConfirmingHandover) return;
    setIsConfirmingHandover(true);
    try {
      const res = await api.client.confirmHandover(ticket.id);
      showToast(res.message || 'Handover confirmed and escrow funds released!', 'success');
      setIsHandoverModalOpen(false);
      await fetchTicketData();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      showToast(err.message || 'Failed to confirm handover', 'error');
    } finally {
      setIsConfirmingHandover(false);
    }
  };

  // Opens a formal dispute case, freezing escrow funds pending admin arbitration
  const handleOpenDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || isSubmittingDispute) return;
    const trimmedStatement = customerStatement.trim();
    if (trimmedStatement.length < 10) {
      showToast('Please provide a detailed dispute statement (minimum 10 characters)', 'warning');
      return;
    }

    setIsSubmittingDispute(true);
    try {
      const res = await api.client.openDispute(ticket.id, {
        reason: disputeReason,
        customerStatement: trimmedStatement,
      });
      showToast(res.message || 'Dispute filed. Escrow frozen.', 'warning');
      setIsDisputeOpen(false);
      setCustomerStatement('');
      await fetchTicketData();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      showToast(err.message || 'Failed to open dispute', 'error');
    } finally {
      setIsSubmittingDispute(false);
    }
  };

  // Workshop Dispute Defense submission
  // Workshop submits rebuttal defense statement to active dispute case
  const handleSubmitWorkshopDefense = async (e: React.FormEvent, disputeId: string) => {
    e.preventDefault();
    const trimmed = shopDefenseStatement.trim();
    if (trimmed.length < 10) {
      showToast('Please provide a detailed defense statement (minimum 10 characters)', 'warning');
      return;
    }

    setIsSubmittingDefense(true);
    try {
      await api.shop.respondToDispute(disputeId, { shopStatement: trimmed });
      showToast('Defense statement submitted to dispute arbitration desk.', 'success');
      setShopDefenseStatement('');
      await fetchTicketData();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit dispute defense statement', 'error');
    } finally {
      setIsSubmittingDefense(false);
    }
  };

  // Workshop Quote formulation submission
  const parsedLabor = parseFloat(quoteLaborCost) || 0;
  const parsedParts = parseFloat(quotePartsCost) || 0;
  const parsedDiag = quoteDiagWaived ? 0 : parseFloat(quoteDiagFee) || 0;
  const calculatedQuoteTotal = parsedLabor + parsedParts + parsedDiag;

  // Workshop submits a binding cost, turnaround, and warranty quote for intake ticket
  const handleSubmitWorkshopQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket) return;
    if (calculatedQuoteTotal <= 0) {
      showToast('Please provide valid labor and parts costs', 'warning');
      return;
    }

    setIsSubmittingQuote(true);
    try {
      await api.shop.submitQuote({
        requestId: ticket.id,
        partsCost: parsedParts,
        laborCost: parsedLabor,
        diagnosticFee: parseFloat(quoteDiagFee) || 0,
        diagnosticFeeWaived: quoteDiagWaived,
        totalCost: calculatedQuoteTotal,
        partsQuality: quotePartsQuality,
        estimatedTurnaround: quoteTurnaround,
        turnaroundDays: Number(quoteTurnaroundDays) || 1,
        warrantyMonths: parseInt(quoteWarrantyMonths, 10) || 3,
        technicianNotes: quoteTechNotes.trim() || undefined,
      });

      showToast(`Binding quote of $${calculatedQuoteTotal.toFixed(2)} submitted!`, 'success');
      setIsQuoteModalOpen(false);
      setQuoteLaborCost('');
      setQuotePartsCost('');
      setQuoteDiagFee('0');
      setQuoteDiagWaived(true);
      setQuoteTechNotes('');
      await fetchTicketData();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit quote', 'error');
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  // Monotonic Bench Stage advancement submission
  // Workshop technician advances repair ticket to the next sequential bench stage
  const handleAdvanceStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !nextSequentialStage) return;

    setIsAdvancingStage(true);
    try {
      await api.shop.advanceRepairStage(ticket.id, {
        status: nextSequentialStage,
        technicianNotes: techNotes.trim() || undefined,
        photoProof: proofPhotos[0] || undefined,
      });

      showToast(`Bench stage advanced to ${BENCH_STAGE_LABELS[nextSequentialStage] || nextSequentialStage.replace(/_/g, ' ')}`, 'success');
      setIsAdvanceStageOpen(false);
      setTechNotes('');
      setProofPhotos([]);
      await fetchTicketData();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      showToast(err.message || 'Failed to advance stage', 'error');
    } finally {
      setIsAdvancingStage(false);
    }
  };

  const toggleReviewTag = (tag: string) => {
    setReviewTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Submits customer ratings, feedback comment, and tags for completed repair
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || isSubmittingReview) return;
    setIsSubmittingReview(true);
    try {
      await api.client.submitReview(ticket.id, {
        rating,
        repairSpeedRating: speedRating,
        communicationRating: commRating,
        qualityRating,
        comment: comment.trim(),
        tags: reviewTags,
      });
      showToast('Thank you! Your verified technician review has been published.', 'success');
      setIsReviewOpen(false);
      await fetchTicketData();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      if (
        err.status === 409 ||
        err.message?.toLowerCase().includes('already') ||
        err.message?.toLowerCase().includes('unique')
      ) {
        setIsReviewOpen(false);
        await fetchTicketData();
        if (onUpdate) onUpdate();
        showToast('Review already recorded for this repair.', 'warning');
      } else {
        showToast(err.message || 'Failed to submit review', 'error');
      }
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Computes warranty expiration and validity window based on accepted quote duration
  const getWarrantyInfo = (req: RepairRequest | null) => {
    if (!req || req.status !== 'completed') return null;
    const acceptedQuote = req.quotes?.find((q) => q.id === req.accepted_quote_id);
    const warrantyMonths = acceptedQuote?.warranty_months || req.warranty_months || 3;
    const completedDate = req.completed_at
      ? new Date(req.completed_at)
      : new Date(req.updated_at || req.created_at);
    const expiryDate = new Date(completedDate);
    expiryDate.setMonth(expiryDate.getMonth() + warrantyMonths);
    const isExpired = Date.now() > expiryDate.getTime();
    const formattedExpiry = expiryDate.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    return { warrantyMonths, expiryDate, isExpired, formattedExpiry };
  };

  // Submits a warranty claim if the repair ticket is within its active warranty period
  const handleSubmitWarranty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || isSubmittingWarranty) return;
    const wInfo = getWarrantyInfo(ticket);
    if (wInfo?.isExpired) {
      showToast(`Warranty expired on ${wInfo.formattedExpiry}. Claims cannot be filed.`, 'warning');
      return;
    }

    setIsSubmittingWarranty(true);
    try {
      const res = await api.client.submitWarrantyClaim({
        requestId: ticket.id,
        claimIssue: warrantyIssue.trim(),
      });
      showToast(res.message || 'Warranty claim submitted!', 'success');
      setIsWarrantyOpen(false);
      setWarrantyIssue('');
      await fetchTicketData();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit warranty claim', 'error');
    } finally {
      setIsSubmittingWarranty(false);
    }
  };

  // Sends a new text message or attachment to the ticket discussion thread
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !newMessage.trim() || isSendingMessage) return;
    setIsSendingMessage(true);
    try {
      await api.shared.sendTicketMessage(ticket.id, {
        content: newMessage.trim(),
        attachments: chatAttachments,
        recipientId: recipientId || undefined,
      });
      setNewMessage('');
      setChatAttachments([]);
      const msgs = await api.shared.getTicketMessages(ticket.id);
      setMessages(msgs);
    } catch (err: any) {
      showToast(err.message || 'Failed to send message', 'error');
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Workshop withdraws a previously submitted pending quote from the ticket
  const handleWithdrawQuote = async (quoteId: string) => {
    try {
      const res = await api.shop.withdrawQuote(quoteId);
      showToast(res.message || 'Quote withdrawn', 'info');
      await fetchTicketData();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      showToast(err.message || 'Failed to withdraw quote', 'error');
    }
  };

  // Customer cancels an open intake ticket before any quote is accepted
  const handleCancelTicketFromModal = async () => {
    if (!ticket || isCancellingTicket) return;
    setIsCancellingTicket(true);
    try {
      await api.client.cancelRequest(ticket.id);
      showToast('Repair ticket cancelled.', 'info');
      setIsCancelModalOpen(false);
      await fetchTicketData();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel ticket', 'error');
    } finally {
      setIsCancellingTicket(false);
    }
  };

  const isCustomerOwner = Boolean(user && ticket && user.id === ticket.customer_id);
  const isShopParticipant = Boolean(user && user.role === 'shop');
  const myExistingQuote = ticket?.quotes?.find((q) => shop && q.shop_id === shop.id);
  const activeDispute = (ticket?.dispute || (ticket as any)?.dispute) as Dispute | undefined | null;

  const stagesList = [
    { key: 'open', label: 'Intake Bidding' },
    { key: 'quote_accepted', label: 'Quote Accepted' },
    { key: 'in_shop', label: 'In Workshop' },
    { key: 'diagnosing', label: 'Diagnostics' },
    { key: 'in_repair', label: 'Bench Repair' },
    { key: 'quality_check', label: 'QA Check' },
    { key: 'ready_for_pickup', label: 'Ready for Pickup' },
    { key: 'completed', label: 'Completed' },
  ];

  const currentStageIndex = ticket ? stagesList.findIndex((s) => s.key === ticket.status) : 0;
  const warrantyInfo = getWarrantyInfo(ticket);

  return (
    <Modal
      isOpen={Boolean(requestId)}
      onClose={onClose}
      title={
        ticket ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {ticket.device_brand} {ticket.device_model}
            </span>
            <span className="text-xs font-mono font-normal text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
              {ticket.id}
            </span>
            <StatusBadge status={ticket.status} />
          </div>
        ) : (
          'Loading Repair Ticket...'
        )
      }
      subtitle={ticket ? ticket.issue_title : undefined}
      maxWidth="4xl"
    >
      {isLoading && !ticket ? (
        <div className="py-16 text-center text-neutral-500 flex flex-col items-center">
          <Loader2 className="w-8 h-8 animate-spin text-black dark:text-white mb-2" />
          <p className="text-xs">Fetching repair docket & escrow ledger...</p>
        </div>
      ) : ticket ? (
        <div className="space-y-6">
          {ticket.status !== 'cancelled' && ticket.status !== 'disputed' && (
            <div className="bg-neutral-50 dark:bg-[#141414] p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between text-[11px] font-medium text-neutral-500 dark:text-neutral-400 overflow-x-auto pb-1 gap-2">
                {stagesList.map((stg, idx) => {
                  const isDone = currentStageIndex > idx || ticket.status === 'completed';
                  const isCurrent = currentStageIndex === idx && ticket.status !== 'completed';
                  return (
                    <div key={stg.key} className="flex items-center gap-1.5 flex-shrink-0">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isDone
                            ? 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-black'
                            : isCurrent
                            ? 'bg-black dark:bg-white text-white dark:text-black ring-4 ring-neutral-200 dark:ring-neutral-800'
                            : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                        }`}
                      >
                        {isDone ? <Check className="w-3 h-3" /> : idx + 1}
                      </div>
                      <span className={isCurrent ? 'font-bold text-black dark:text-white' : isDone ? 'text-neutral-800 dark:text-neutral-200' : 'text-neutral-400 dark:text-neutral-500'}>
                        {stg.label}
                      </span>
                      {idx < stagesList.length - 1 && (
                        <div
                          className={`w-3 sm:w-6 h-0.5 ${
                            isDone ? 'bg-neutral-700 dark:bg-neutral-300' : 'bg-neutral-200 dark:border-neutral-800'
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Customer cancellation action */}
          {isCustomerOwner && ticket.status === 'open' && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 bg-neutral-100 dark:bg-[#141414] rounded-xl border border-neutral-200 dark:border-neutral-800 gap-3 text-xs">
              <div>
                <span className="font-bold text-neutral-900 dark:text-white">Intake Bidding Open</span>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Workshops are assessing your hardware diagnostics. You may cancel this ticket at any time before accepting a quote.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(true)}
                className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800/70 text-xs font-semibold rounded-lg transition-colors shrink-0 flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" />
                Cancel Repair Request
              </button>
            </div>
          )}

          {/* Workshop Quote submission callout on open tickets */}
          {isShopParticipant && ticket.status === 'open' && !myExistingQuote && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 bg-neutral-100 dark:bg-[#141414] rounded-xl border border-neutral-200 dark:border-neutral-800 gap-3 text-xs">
              <div>
                <span className="font-bold text-neutral-900 dark:text-white">Inbound Lead Available for Quote</span>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Your workshop has not formulated a binding escrow quote for this device yet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsQuoteModalOpen(true)}
                className="px-4 py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg transition-colors shrink-0 flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Submit Binding Quote
              </button>
            </div>
          )}

          {ticket.escrow && (
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-[#141414] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white flex items-center justify-center">
                  {ticket.escrow.status === 'disputed_frozen' ? (
                    <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  ) : (
                    <ShieldCheck className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      Escrow Ledger:{' '}
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                        ${Number(ticket.escrow.total_amount).toFixed(2)}
                      </span>
                    </span>
                    <StatusBadge escrowStatus={ticket.escrow.status} />
                  </div>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                    5% Platform Assurance Fee: ${Number(ticket.escrow.platform_fee).toFixed(2)} • Subtotal:{' '}
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                      ${Number(ticket.escrow.subtotal).toFixed(2)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {isCustomerOwner && ticket.status === 'ready_for_pickup' && (
                  <button
                    type="button"
                    disabled={isConfirmingHandover}
                    onClick={() => setIsHandoverModalOpen(true)}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-2xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm Handover & Release Escrow
                  </button>
                )}

                {isCustomerOwner && ticket.escrow.status === 'held_in_escrow' && (
                  <button
                    type="button"
                    onClick={() => setIsDisputeOpen(true)}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800/70 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Raise Dispute
                  </button>
                )}

                {isCustomerOwner && ticket.status === 'completed' && !ticket.review && (
                  <button
                    type="button"
                    onClick={() => setIsReviewOpen(true)}
                    className="px-3.5 py-1.5 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                  >
                    <Star className="w-3.5 h-3.5 fill-current" />
                    Write Workshop Review
                  </button>
                )}

                {isCustomerOwner && ticket.status === 'completed' && warrantyInfo && (
                  <div className="flex flex-wrap items-center gap-2">
                    {warrantyInfo.isExpired ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-700">
                        <Clock className="w-3.5 h-3.5" />
                        Expired Warranty ({warrantyInfo.formattedExpiry})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Active Warranty (Valid through {warrantyInfo.formattedExpiry})
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={warrantyInfo.isExpired}
                      onClick={() => setIsWarrantyOpen(true)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                        warrantyInfo.isExpired
                          ? 'bg-neutral-100 dark:bg-neutral-800/50 text-neutral-400 dark:text-neutral-600 border-neutral-200 dark:border-neutral-800 cursor-not-allowed'
                          : 'bg-white hover:bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700'
                      }`}
                    >
                      File Warranty Claim
                    </button>
                  </div>
                )}

                {/* Monotonic Bench Stage Advancement Action for Workshop */}
                {canShopAdvanceStage && nextSequentialStage && (
                  <button
                    type="button"
                    onClick={() => setIsAdvanceStageOpen(true)}
                    className="w-full sm:w-auto px-4 py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg transition-colors shadow-2xs flex items-center justify-center gap-1.5"
                  >
                    <Wrench className="w-4 h-4" />
                    <span>Advance to: {BENCH_STAGE_LABELS[nextSequentialStage]}</span>
                  </button>
                )}

                {isShopParticipant && ticket.status === 'ready_for_pickup' && (
                  <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 bg-neutral-200 dark:bg-neutral-800 px-3 py-1.5 rounded-lg">
                    Awaiting Customer Collection
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex border-b border-neutral-200 dark:border-neutral-800">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-2.5 px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'overview'
                  ? 'border-black text-black dark:text-white dark:border-white'
                  : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Ticket Overview
            </button>
            <button
              onClick={() => setActiveTab('quotes')}
              className={`pb-2.5 px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'quotes'
                  ? 'border-black text-black dark:text-white dark:border-white'
                  : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              Workshop Quotes ({ticket.quotes?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`pb-2.5 px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'timeline'
                  ? 'border-black text-black dark:text-white dark:border-white'
                  : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Bench Log ({ticket.timeline?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`pb-2.5 px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'chat'
                  ? 'border-black text-black dark:text-white dark:border-white'
                  : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Diagnostics Chat ({messages.length})
            </button>
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Workshop Dispute Defense Card (FE-304) */}
              {isShopParticipant && (activeDispute || ticket.status === 'disputed') && (
                <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-900/80 bg-rose-50/60 dark:bg-rose-950/20 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Scale className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200 uppercase tracking-wider">
                        Workshop Dispute Defense Docket
                      </h4>
                    </div>
                    {activeDispute?.resolution && (
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-neutral-900 text-white dark:bg-neutral-100 dark:text-black">
                        Resolution: {activeDispute.resolution.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>

                  {activeDispute ? (
                    <div className="space-y-3 text-xs">
                      <div className="bg-white/80 dark:bg-[#111111]/80 p-3 rounded-lg border border-rose-200 dark:border-rose-900/50 space-y-1">
                        <div className="flex justify-between font-semibold text-neutral-800 dark:text-neutral-200">
                          <span>Customer Dispute Reason:</span>
                          <span className="text-rose-700 dark:text-rose-400">{activeDispute.reason}</span>
                        </div>
                        <p className="text-neutral-700 dark:text-neutral-300 italic pt-1">
                          "{activeDispute.customer_statement}"
                        </p>
                      </div>

                      {activeDispute.shop_statement ? (
                        <div className="bg-white/80 dark:bg-[#111111]/80 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-1">
                          <span className="font-semibold text-neutral-900 dark:text-white block">
                            Submitted Workshop Defense:
                          </span>
                          <p className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                            {activeDispute.shop_statement}
                          </p>
                        </div>
                      ) : activeDispute.resolution === 'pending' ? (
                        <form
                          onSubmit={(e) => handleSubmitWorkshopDefense(e, activeDispute.id)}
                          className="space-y-2.5 pt-1"
                        >
                          <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                            Submit Workshop Counter-Evidence & Defense Statement *
                          </label>
                          <textarea
                            rows={3}
                            required
                            placeholder="Explain bench diagnostics, voltage test results, parts used, or customer handling conditions..."
                            value={shopDefenseStatement}
                            onChange={(e) => setShopDefenseStatement(e.target.value)}
                            className="w-full p-2.5 bg-white dark:bg-[#111111] border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-white focus:outline-none"
                          />
                          <div className="flex justify-end">
                            <button
                              type="submit"
                              disabled={isSubmittingDefense}
                              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
                            >
                              {isSubmittingDefense && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              Submit Defense Statement
                            </button>
                          </div>
                        </form>
                      ) : null}

                      {activeDispute.resolution !== 'pending' && (
                        <div className="bg-neutral-100 dark:bg-[#161616] p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-[11px] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Customer Refund:</span>
                            <span className="font-mono font-bold text-neutral-900 dark:text-white">
                              ${Number(activeDispute.resolution_customer_amount || 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Workshop Settlement Payout:</span>
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              ${Number(activeDispute.resolution_shop_amount || 0).toFixed(2)}
                            </span>
                          </div>
                          {activeDispute.admin_notes && (
                            <p className="text-neutral-600 dark:text-neutral-400 pt-1 border-t border-neutral-200 dark:border-neutral-700">
                              Arbiter Note: {activeDispute.admin_notes}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      Dispute registered on escrow ledger. Awaiting formal operations review.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800">
                  <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Category
                  </span>
                  <p className="text-xs font-bold text-neutral-900 dark:text-white capitalize mt-0.5">
                    {ticket.device_category}
                  </p>
                </div>
                <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800">
                  <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Urgency
                  </span>
                  <div className="mt-0.5">
                    <StatusBadge urgency={ticket.urgency} />
                  </div>
                </div>
                <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800">
                  <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Service Delivery
                  </span>
                  <p className="text-xs font-bold text-neutral-900 dark:text-white capitalize mt-0.5">
                    {ticket.preferred_service}
                  </p>
                </div>
                <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800">
                  <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Serial / Tag
                  </span>
                  <p className="text-xs font-mono font-medium text-neutral-800 dark:text-neutral-200 mt-0.5 truncate">
                    {ticket.serial_number || 'N/A'}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider mb-2">
                  Customer Issue Description
                </h4>
                <div className="bg-neutral-50 dark:bg-[#161616] p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs sm:text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed whitespace-pre-wrap">
                  {ticket.description}
                </div>
              </div>

              {ticket.photos && ticket.photos.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider mb-2">
                    Intake Evidence Photos
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {ticket.photos.map((photo, i) => (
                      <a
                        key={i}
                        href={photo}
                        target="_blank"
                        rel="noreferrer"
                        className="group aspect-video rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-[#161616] block"
                      >
                        <img
                          src={photo}
                          alt={`Intake proof ${i + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {ticket.review && (
                <div className="bg-neutral-50 dark:bg-[#161616] p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex text-amber-500">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <Star
                            key={idx}
                            className={`w-4 h-4 ${
                              idx < ticket.review!.rating ? 'fill-current' : 'text-neutral-300 dark:text-neutral-700'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-neutral-900 dark:text-white">
                        {ticket.review.rating}.0 / 5.0 Verified Review
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-500">
                      {new Date(ticket.review.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed italic">
                    "{ticket.review.comment}"
                  </p>
                  {ticket.review.tags && ticket.review.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {ticket.review.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white dark:bg-[#1e1e1e] border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: WORKSHOP QUOTES */}
          {activeTab === 'quotes' && (
            <div className="space-y-4">
              {!ticket.quotes || ticket.quotes.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 bg-neutral-50 dark:bg-[#161616] rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800">
                  <Wrench className="w-8 h-8 mx-auto mb-2 text-neutral-400 stroke-1" />
                  <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                    No binding quotes submitted yet
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Verified workshops in your area are evaluating diagnostics schematics.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ticket.quotes.map((q) => {
                    const isAccepted = q.id === ticket.accepted_quote_id;
                    const isMyQuote = shop && q.shop_id === shop.id;

                    const partsCost = Number(q.parts_cost) || 0;
                    const laborCost = Number(q.labor_cost) || 0;
                    const diagFee = Number(q.diagnostic_fee) || 0;
                    const isDiagWaived = Boolean(q.diagnostic_fee_waived) || diagFee === 0;
                    const subtotal = Number(q.total_cost) || 0;
                    const platformFee = Math.round(subtotal * 5) / 100;
                    const totalEscrow = subtotal + platformFee;

                    return (
                      <div
                        key={q.id}
                        className={`p-5 rounded-2xl border transition-all ${
                          isAccepted
                            ? 'bg-neutral-100 dark:bg-[#161616] border-black dark:border-white ring-2 ring-neutral-300 dark:ring-neutral-700'
                            : 'bg-white dark:bg-[#111111] border-neutral-200 dark:border-neutral-800 hover:border-black dark:hover:border-neutral-600'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-neutral-900 dark:text-white">
                                {q.shop_name || 'Verified Workshop'}
                              </span>
                              {onOpenShopProfile && (
                                <button
                                  type="button"
                                  onClick={() => onOpenShopProfile(q.shop_id)}
                                  className="text-[11px] text-neutral-900 dark:text-white hover:underline font-semibold"
                                >
                                  View profile
                                </button>
                              )}
                            </div>
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              Turnaround: {q.estimated_turnaround || q.estimatedTurnaround || '24-48 hours'}
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                              ${subtotal.toFixed(2)}
                            </span>
                            <div className="text-[10px] text-neutral-400 dark:text-neutral-500">Fixed Escrow Quote</div>
                          </div>
                        </div>

                        <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs space-y-1.5 mb-3">
                          <div className="flex justify-between text-neutral-600 dark:text-neutral-300">
                            <span>Replacement Parts:</span>
                            <span className="font-mono font-medium text-neutral-900 dark:text-white">
                              ${partsCost.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between text-neutral-600 dark:text-neutral-300">
                            <span>Bench Labor & Assembly:</span>
                            <span className="font-mono font-medium text-neutral-900 dark:text-white">
                              ${laborCost.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between text-neutral-600 dark:text-neutral-300">
                            <span>Diagnostic Inspection:</span>
                            <span className="font-mono font-medium text-neutral-900 dark:text-white">
                              {isDiagWaived ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-sans font-medium">Waived</span>
                              ) : (
                                `$${diagFee.toFixed(2)}`
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between text-neutral-700 dark:text-neutral-200 pt-1 border-t border-neutral-200/60 dark:border-neutral-800 font-semibold">
                            <span>Subtotal:</span>
                            <span className="font-mono font-bold text-neutral-900 dark:text-white">
                              ${subtotal.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between text-neutral-600 dark:text-neutral-300">
                            <span>Platform Escrow Protection Fee (5%):</span>
                            <span className="font-mono font-medium text-neutral-900 dark:text-white">
                              ${platformFee.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between text-neutral-900 dark:text-white font-bold pt-1 border-t border-neutral-200/60 dark:border-neutral-800">
                            <span>Total Escrow Amount:</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">
                              ${totalEscrow.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between text-neutral-600 dark:text-neutral-300 pt-1">
                            <span>Parts Quality Grade:</span>
                            <StatusBadge partsQuality={q.parts_quality} />
                          </div>
                          <div className="flex justify-between text-neutral-600 dark:text-neutral-300">
                            <span>Warranty Duration:</span>
                            <span className="font-semibold text-neutral-900 dark:text-white">
                              {q.warranty_months} Months Hassle-Free
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 pt-1 leading-normal border-t border-neutral-200/40 dark:border-neutral-800/80">
                            5% platform protection fee covers dispute mediation, guaranteed warranty escrow, and fraud defense.
                          </p>
                        </div>

                        {q.technician_notes && (
                          <p className="text-xs text-neutral-700 dark:text-neutral-300 italic bg-white dark:bg-[#141414] p-2 rounded-lg border border-neutral-200 dark:border-neutral-800 mb-3">
                            "{q.technician_notes}"
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800">
                          {isAccepted ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-900 dark:text-white">
                              <CheckCircle2 className="w-4 h-4 text-neutral-900 dark:text-white" />
                              Accepted & Escrow Locked
                            </span>
                          ) : isCustomerOwner && ticket.status === 'open' ? (
                            <button
                              type="button"
                              disabled={Boolean(isAcceptingQuoteId)}
                              onClick={() => handleAcceptQuote(q.id)}
                              className="w-full py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg transition-colors shadow-2xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                              {isAcceptingQuoteId === q.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              Accept Quote & Lock Escrow
                            </button>
                          ) : isMyQuote && q.status === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => handleWithdrawQuote(q.id)}
                              className="text-xs text-neutral-500 hover:text-black dark:hover:text-white hover:underline"
                            >
                              Withdraw Quote
                            </button>
                          ) : (
                            <span className="text-xs text-neutral-400 dark:text-neutral-500 capitalize">
                              Status: {q.status}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BENCH LOG / TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              {!ticket.timeline || ticket.timeline.length === 0 ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 py-6 text-center">No log events recorded yet.</p>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-200 dark:before:bg-neutral-800">
                  {ticket.timeline.map((event, idx) => (
                    <div key={event.id || idx} className="relative">
                      <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-black dark:bg-white ring-4 ring-neutral-200 dark:ring-neutral-800" />
                      <div className="bg-neutral-50 dark:bg-[#141414] p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                            {event.title}
                          </h4>
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                            {new Date(event.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                          {event.description}
                        </p>

                        {event.technician_notes && (
                          <div className="mt-2.5 p-2.5 rounded-lg bg-white dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-700 dark:text-neutral-300">
                            <span className="font-semibold text-neutral-900 dark:text-white">Bench Notes: </span>
                            {event.technician_notes}
                          </div>
                        )}

                        {event.photo_proof && (
                          <div className="mt-3">
                            <a
                              href={event.photo_proof}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block max-w-xs rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800"
                            >
                              <img
                                src={event.photo_proof}
                                alt="Bench proof"
                                className="w-full h-32 object-cover"
                              />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CHAT */}
          {activeTab === 'chat' && (
            <div className="flex flex-col h-[460px] bg-neutral-50 dark:bg-[#0c0c0c] rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              {ticket.status === 'open' && ticket.quotes && ticket.quotes.length > 0 && isCustomerOwner && (
                <div className="p-3 bg-neutral-100 dark:bg-[#141414] border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                    Workshop Recipient:
                  </span>
                  <select
                    value={recipientId}
                    onChange={(e) => setRecipientId(e.target.value)}
                    className="px-3 py-1.5 bg-white dark:bg-[#1a1a1a] border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none"
                  >
                    <option value="">Broadcast to All Bidding Workshops</option>
                    {ticket.quotes.map((q) => (
                      <option key={q.shop_id} value={q.shop_id}>
                        {q.shop_name || 'Workshop'} (${Number(q.total_cost).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500">
                    <MessageSquare className="w-8 h-8 mb-2 stroke-1 opacity-50" />
                    <p className="text-xs">No direct messages yet.</p>
                    <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                      Use this thread to communicate diagnostics, parts queries, or handover timing.
                    </p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = Boolean(user && m.sender_id === user.id);
                    return (
                      <div
                        key={m.id}
                        className={`flex gap-2.5 max-w-[85%] ${
                          isMe ? 'ml-auto flex-row-reverse' : 'mr-auto'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0 overflow-hidden">
                          {m.sender_avatar ? (
                            <img src={m.sender_avatar} alt={m.sender_name} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 m-1.5" />
                          )}
                        </div>

                        <div>
                          <div className={`flex items-center gap-1.5 mb-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200">
                              {m.sender_name || 'Participant'}
                            </span>
                            <span className="text-[9px] uppercase font-mono px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                              {m.sender_role}
                            </span>
                            {m.recipient_id && (
                              <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
                                Direct Message
                              </span>
                            )}
                            <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div
                            className={`p-3 rounded-2xl text-xs leading-relaxed ${
                              isMe
                                ? 'bg-black dark:bg-white text-white dark:text-black rounded-tr-none font-medium'
                                : 'bg-neutral-100 dark:bg-[#161616] text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-800 rounded-tl-none shadow-2xs'
                            }`}
                          >
                            {m.content}

                            {m.attachments && m.attachments.length > 0 && (
                              <div className="mt-2 grid grid-cols-2 gap-1.5">
                                {m.attachments.map((att, i) => (
                                  <a
                                    key={i}
                                    href={att}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg overflow-hidden block border border-white/20"
                                  >
                                    <img src={att} alt="Attachment" className="w-full h-20 object-cover" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form
                onSubmit={handleSendMessage}
                className="p-3 bg-white dark:bg-[#0f0f0f] border-t border-neutral-200 dark:border-neutral-800 flex flex-col gap-2"
              >
                {chatAttachments.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {chatAttachments.map((url, i) => (
                      <div key={i} className="relative w-12 h-12 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700">
                        <img src={url} alt="Attachment preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setChatAttachments(chatAttachments.filter((_, idx) => idx !== i))}
                          className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Type a message to technician or customer..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1 px-3.5 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:bg-white dark:focus:bg-[#111111] focus:outline-none"
                  />

                  <label className="p-2 text-neutral-400 hover:text-black dark:hover:text-white rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer transition-colors">
                    <Paperclip className="w-4 h-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const res = await api.upload.uploadImage(file);
                            setChatAttachments((prev) => [...prev, res.url]);
                          } catch (err: any) {
                            showToast(err.message || 'Upload failed', 'error');
                          }
                        }
                      }}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isSendingMessage || !newMessage.trim()}
                    className="p-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black rounded-xl transition-colors disabled:opacity-50"
                  >
                    {isSendingMessage ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      ) : null}

      {/* MODAL: WORKSHOP SUBMIT BINDING QUOTE (FE-306, FE-307, FE-308) */}
      {isQuoteModalOpen && ticket && (
        <Modal
          isOpen={isQuoteModalOpen}
          onClose={() => setIsQuoteModalOpen(false)}
          title={`Submit Binding Quote: ${ticket.device_brand} ${ticket.device_model}`}
          subtitle="Quote will be presented to customer in competitive escrow evaluation."
          maxWidth="md"
        >
          <form onSubmit={handleSubmitWorkshopQuote} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Labor / Soldering ($) *
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={quoteLaborCost}
                  onChange={(e) => setQuoteLaborCost(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Parts Cost ($) *
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={quotePartsCost}
                  onChange={(e) => setQuotePartsCost(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Diagnostic Fee ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={quoteDiagFee}
                  onChange={(e) => setQuoteDiagFee(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                id="modalWaiveDiag"
                checked={quoteDiagWaived}
                onChange={(e) => setQuoteDiagWaived(e.target.checked)}
                className="w-4 h-4 rounded text-black dark:bg-[#161616] dark:border-neutral-700"
              />
              <label htmlFor="modalWaiveDiag">Waive diagnostic fee if customer accepts repair</label>
            </div>

            <div className="p-3 bg-neutral-100 dark:bg-[#161616] rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-900 dark:text-white">Total Fixed Quote:</span>
              <span className="text-base font-extrabold text-neutral-900 dark:text-white font-mono">
                ${calculatedQuoteTotal.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Parts Quality Grade
                </label>
                <select
                  value={quotePartsQuality}
                  onChange={(e) => setQuotePartsQuality(e.target.value as PartsQuality)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                >
                  {VALID_PARTS_QUALITIES.map((pq) => (
                    <option key={pq} value={pq}>{pq}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Turnaround Days
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  required
                  value={quoteTurnaroundDays}
                  onChange={(e) => {
                    const days = parseInt(e.target.value, 10) || 1;
                    setQuoteTurnaroundDays(days);
                    setQuoteTurnaround(days === 1 ? '24 hours' : `${days} days`);
                  }}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Warranty (Months)
                </label>
                <select
                  value={quoteWarrantyMonths}
                  onChange={(e) => setQuoteWarrantyMonths(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs font-semibold text-neutral-900 dark:text-white"
                >
                  <option value="3">3 Months (Standard)</option>
                  <option value="6">6 Months</option>
                  <option value="12">12 Months (Recommended)</option>
                  <option value="24">24 Months</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Technician Diagnostics Note (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Detail procedures, specialized tools, or micro-soldering..."
                value={quoteTechNotes}
                onChange={(e) => setQuoteTechNotes(e.target.value)}
                className="w-full p-2.5 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setIsQuoteModalOpen(false)}
                className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingQuote}
                className="px-5 py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg shadow-2xs"
              >
                {isSubmittingQuote ? 'Submitting...' : 'Submit Binding Quote'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: ADVANCE BENCH REPAIR STAGE (MONOTONIC ONLY) */}
      {isAdvanceStageOpen && nextSequentialStage && (
        <Modal
          isOpen={isAdvanceStageOpen}
          onClose={() => setIsAdvanceStageOpen(false)}
          title="Advance Bench Repair Stage"
          subtitle="Sequential state machine advancement records transition in immutable timeline."
          maxWidth="md"
        >
          <form onSubmit={handleAdvanceStage} className="space-y-4">
            <div className="p-3.5 bg-neutral-50 dark:bg-[#161616] rounded-xl border border-neutral-200 dark:border-neutral-800">
              <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider block mb-2">
                Monotonic Stage Progression
              </span>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 p-2 bg-white dark:bg-[#111111] rounded-lg border border-neutral-200 dark:border-neutral-700 text-center">
                  <span className="text-[10px] text-neutral-400 block">Current Stage</span>
                  <span className="text-xs font-bold text-neutral-900 dark:text-white">
                    {ticket ? (BENCH_STAGE_LABELS[ticket.status] || ticket.status.replace(/_/g, ' ')) : ''}
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-neutral-400 shrink-0" />
                <div className="flex-1 p-2 bg-black text-white dark:bg-white dark:text-black rounded-lg text-center font-bold text-xs shadow-2xs">
                  <span className="text-[10px] text-neutral-300 dark:text-neutral-700 block">Target Next Stage</span>
                  <span>{nextSequentialStage ? (BENCH_STAGE_LABELS[nextSequentialStage] || nextSequentialStage.replace(/_/g, ' ')) : ''}</span>
                </div>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-2 text-center">
                Advance bench repair to next stage: <strong className="text-neutral-900 dark:text-white">{nextSequentialStage ? (BENCH_STAGE_LABELS[nextSequentialStage] || nextSequentialStage.replace(/_/g, ' ')) : ''}</strong>?
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Technician Bench Notes (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Detail observations, components replaced, or testing voltages..."
                value={techNotes}
                onChange={(e) => setTechNotes(e.target.value)}
                className="w-full p-3 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              />
            </div>

            <ImageUpload
              images={proofPhotos}
              onChange={setProofPhotos}
              maxFiles={2}
              label="Bench Proof Photo (Optional)"
              helperText="Upload microscope or thermal photo proof of repaired board."
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setIsAdvanceStageOpen(false)}
                className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#161616] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAdvancingStage}
                className="px-5 py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                {isAdvancingStage && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm & Advance to {BENCH_STAGE_LABELS[nextSequentialStage]}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: OPEN ESCROW DISPUTE (CUSTOMER) */}
      {isDisputeOpen && (
        <Modal
          isOpen={isDisputeOpen}
          onClose={() => setIsDisputeOpen(false)}
          title="Open Escrow Dispute"
          subtitle="Submit formal dispute to Freeze Escrow Funds pending operations review."
          maxWidth="md"
        >
          <form onSubmit={handleOpenDispute} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Dispute Reason
              </label>
              <select
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
              >
                <option value="Defective or Incomplete Repair">Defective or Incomplete Repair</option>
                <option value="Device Hardware Damage During Bench Handling">Device Hardware Damage During Bench Handling</option>
                <option value="Unreasonable Turnaround Delay / Non-responsive">Unreasonable Turnaround Delay / Non-responsive</option>
                <option value="Unapproved Secondary Charges or Non-OEM Parts">Unapproved Secondary Charges or Non-OEM Parts</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Detailed Statement for Operations Arbiter (min 10 characters)
              </label>
              <textarea
                required
                rows={4}
                placeholder="Explain in detail the failure mode, diagnostic discrepancy, or damaged state..."
                value={customerStatement}
                onChange={(e) => setCustomerStatement(e.target.value)}
                className="w-full p-3 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setIsDisputeOpen(false)}
                className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#161616] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingDispute}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                {isSubmittingDispute ? 'Freezing Escrow...' : 'Submit Formal Dispute'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: WRITE REVIEW (CUSTOMER) */}
      {isReviewOpen && (
        <Modal
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
          title="Write Verified Workshop Review"
          subtitle="Your verified review updates the workshop's public rating and badge."
          maxWidth="md"
        >
          <form onSubmit={handleSubmitReview} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Overall Restoration Rating
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((starVal) => (
                  <button
                    key={starVal}
                    type="button"
                    onClick={() => setRating(starVal)}
                    className="p-1 text-amber-500 hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        starVal <= rating ? 'fill-current' : 'text-neutral-300 dark:text-neutral-700'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs">
              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase mb-1">
                  Speed
                </label>
                <select
                  value={speedRating}
                  onChange={(e) => setSpeedRating(Number(e.target.value))}
                  className="w-full p-1 bg-white dark:bg-[#111111] border border-neutral-200 dark:border-neutral-800 rounded text-xs text-neutral-900 dark:text-white"
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>{n} Stars</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase mb-1">
                  Quality
                </label>
                <select
                  value={qualityRating}
                  onChange={(e) => setQualityRating(Number(e.target.value))}
                  className="w-full p-1 bg-white dark:bg-[#111111] border border-neutral-200 dark:border-neutral-800 rounded text-xs text-neutral-900 dark:text-white"
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>{n} Stars</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase mb-1">
                  Communication
                </label>
                <select
                  value={commRating}
                  onChange={(e) => setCommRating(Number(e.target.value))}
                  className="w-full p-1 bg-white dark:bg-[#111111] border border-neutral-200 dark:border-neutral-800 rounded text-xs text-neutral-900 dark:text-white"
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>{n} Stars</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Service Tags (Click to toggle)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_REVIEW_TAGS.map((tag) => {
                  const isSelected = reviewTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleReviewTag(tag)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                        isSelected
                          ? 'bg-black dark:bg-white text-white dark:text-black font-semibold'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Written Feedback
              </label>
              <textarea
                required
                rows={3}
                placeholder="How did the technician handle your repair? Diagnostics, speed, communication..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full p-3 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#161616] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingReview}
                className="px-5 py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                {isSubmittingReview ? 'Publishing...' : 'Publish Review'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: FILE WARRANTY CLAIM (CUSTOMER) */}
      {isWarrantyOpen && (
        <Modal
          isOpen={isWarrantyOpen}
          onClose={() => setIsWarrantyOpen(false)}
          title="File Warranty Claim"
          subtitle="Submit claim to assigned laboratory for re-inspection and repair under warranty."
          maxWidth="md"
        >
          <form onSubmit={handleSubmitWarranty} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Describe Recurring Issue or Failure Mode
              </label>
              <textarea
                required
                rows={4}
                placeholder="Describe how the hardware failed post-handover..."
                value={warrantyIssue}
                onChange={(e) => setWarrantyIssue(e.target.value)}
                className="w-full p-3 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setIsWarrantyOpen(false)}
                className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#161616] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingWarranty}
                className="px-5 py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                {isSubmittingWarranty ? 'Filing...' : 'Submit Warranty Claim'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: CONFIRM HANDOVER & RELEASE ESCROW (CUSTOMER) */}
      {isHandoverModalOpen && ticket && (
        <Modal
          isOpen={isHandoverModalOpen}
          onClose={() => !isConfirmingHandover && setIsHandoverModalOpen(false)}
          title="Confirm Handover & Release Escrow"
          subtitle={`Release payment for ${ticket.device_brand} ${ticket.device_model}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-amber-800 dark:text-amber-200 text-xs leading-relaxed flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <span className="font-bold">Irreversible Action: </span>
                Confirm Handover & Release Escrow? This action transfers funds to the workshop and cannot be undone. Only proceed if you have inspected the device and confirmed all repairs are satisfactory.
              </div>
            </div>

            {ticket.escrow && (
              <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Workshop:</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {ticket.escrow.shop_name || 'Assigned Workshop'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Total Escrow Released:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    ${Number(ticket.escrow.total_amount).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                disabled={isConfirmingHandover}
                onClick={() => setIsHandoverModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isConfirmingHandover}
                onClick={handleConfirmHandover}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {isConfirmingHandover && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm & Release Funds
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: CANCEL REPAIR REQUEST (CUSTOMER) */}
      {isCancelModalOpen && ticket && (
        <Modal
          isOpen={isCancelModalOpen}
          onClose={() => !isCancellingTicket && setIsCancelModalOpen(false)}
          title="Cancel Repair Request"
          subtitle={`Ticket #${ticket.id}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Are you sure you want to cancel the repair request for{' '}
              <span className="font-bold text-neutral-900 dark:text-white">
                {ticket.device_brand} {ticket.device_model}
              </span>
              ? Any pending workshop quotes will be dismissed. This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                disabled={isCancellingTicket}
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
              >
                Keep Ticket
              </button>
              <button
                type="button"
                disabled={isCancellingTicket}
                onClick={handleCancelTicketFromModal}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {isCancellingTicket && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
};
