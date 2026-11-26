import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { StatusBadge } from '../common/StatusBadge';
import { CardSkeleton, TableSkeleton } from '../common/LoadingSkeleton';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../common/Modal';
import { ImageUpload } from '../common/ImageUpload';
import {
  RepairRequest,
  RepairShop,
  Quote,
  WarrantyClaim,
  DeviceCategory,
  PartsQuality,
  WarrantyClaimStatus,
  RepairStatus,
} from '../../types';
import {
  Wrench,
  Inbox,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Settings,
  Plus,
  Loader2,
  DollarSign,
  AlertTriangle,
  ArrowRight,
  User,
  MapPin,
  Check,
  CheckCircle2,
  Award,
  X,
  RefreshCw,
  Star,
  Layers,
} from 'lucide-react';

// Props interface for repair workshop dashboard view
interface RepairShopDashboardProps {
  onOpenTicket: (requestId: string) => void;
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
  diagnosing: 'Diagnosing',
  in_repair: 'Bench Repair',
  quality_check: 'Quality Check (QA)',
  ready_for_pickup: 'Ready for Pickup',
};

const VALID_PARTS_QUALITIES: PartsQuality[] = [
  'OEM Genuine',
  'Refurbished Original',
  'Tier-1 Certified Aftermarket',
  'OEM Equivalent',
  'Aftermarket High-Quality',
];

// Primary repair workshop operations dashboard managing active bench jobs, inbound quotes, warranty claims, and shop profile
export const RepairShopDashboard: React.FC<RepairShopDashboardProps> = ({ onOpenTicket }) => {
  const { user, shop, refreshUser } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'bench' | 'inbound' | 'claims' | 'profile'>('bench');

  // Workshop fresh profile
  const [shopProfile, setShopProfile] = useState<RepairShop | null>(shop || null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Bench repairs
  const [benchRepairs, setBenchRepairs] = useState<RepairRequest[]>([]);
  const [isLoadingBench, setIsLoadingBench] = useState(true);
  const [benchError, setBenchError] = useState<string | null>(null);

  // Inbound requests
  const [inboundRequests, setInboundRequests] = useState<RepairRequest[]>([]);
  const [isLoadingInbound, setIsLoadingInbound] = useState(true);
  const [inboundError, setInboundError] = useState<string | null>(null);

  // Warranty claims
  const [warrantyClaims, setWarrantyClaims] = useState<WarrantyClaim[]>([]);
  const [isLoadingClaims, setIsLoadingClaims] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);

  // Quote Submission Modal state (Clean defaults without hardcoded mock numbers)
  const [selectedInboundRequest, setSelectedInboundRequest] = useState<RepairRequest | null>(null);
  const [laborCost, setLaborCost] = useState('');
  const [partsCost, setPartsCost] = useState('');
  const [diagnosticFee, setDiagnosticFee] = useState('0');
  const [diagnosticFeeWaived, setDiagnosticFeeWaived] = useState(true);
  const [partsQuality, setPartsQuality] = useState<PartsQuality>('OEM Genuine');
  const [estimatedTurnaround, setEstimatedTurnaround] = useState('24 hours');
  const [turnaroundDays, setTurnaroundDays] = useState<number>(1);
  const [warrantyMonths, setWarrantyMonths] = useState('3');
  const [technicianNotes, setTechnicianNotes] = useState('');
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  // Advance Bench Stage Modal state
  const [selectedBenchTicket, setSelectedBenchTicket] = useState<RepairRequest | null>(null);
  const [benchNotes, setBenchNotes] = useState('');
  const [benchProofPhotos, setBenchProofPhotos] = useState<string[]>([]);
  const [isAdvancingBench, setIsAdvancingBench] = useState(false);

  // Warranty claim resolution modal state
  const [selectedClaimForUpdate, setSelectedClaimForUpdate] = useState<WarrantyClaim | null>(null);
  const [claimStatus, setClaimStatus] = useState<WarrantyClaimStatus>('under_review');
  const [claimResponse, setClaimResponse] = useState('');
  const [isUpdatingClaim, setIsUpdatingClaim] = useState(false);

  // Shop Profile edit state
  const [shopName, setShopName] = useState('');
  const [shopTagline, setShopTagline] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopCity, setShopCity] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopOperatingHours, setShopOperatingHours] = useState('');
  const [shopWarranty, setShopWarranty] = useState('');
  const [shopTurnaroundAvg, setShopTurnaroundAvg] = useState('');
  const [shopDescription, setShopDescription] = useState('');
  const [shopTechCount, setShopTechCount] = useState<number>(1);
  const [shopSpecialties, setShopSpecialties] = useState<DeviceCategory[]>([]);
  const [shopCertifications, setShopCertifications] = useState<string[]>([]);
  const [newCertInput, setNewCertInput] = useState('');
  const [shopLogo, setShopLogo] = useState<string>('');
  const [shopBannerImage, setShopBannerImage] = useState<string>('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Fetches the workshop facility public profile and technical configuration
  const fetchShopProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    try {
      const data = await api.shop.getProfile();
      setShopProfile(data);
      setShopName(data.name || '');
      setShopTagline(data.tagline || '');
      setShopAddress(data.address || '');
      setShopCity(data.city || '');
      setShopPhone(data.phone || '');
      setShopOperatingHours(data.operating_hours || 'Mon-Fri 8am-6pm PST');
      setShopWarranty(data.warranty_standard || '90 Days Guarantee');
      setShopTurnaroundAvg(data.turnaround_avg || '24-48 Hours');
      setShopDescription(data.description || '');
      setShopTechCount(data.active_tech_count || 1);
      setShopSpecialties(data.specialties || ['phone', 'laptop']);
      setShopCertifications(data.certifications || []);
      setShopLogo(data.logo || '');
      setShopBannerImage(data.banner_image || '');
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch fresh workshop profile', 'error');
    } finally {
      setIsLoadingProfile(false);
    }
  }, [showToast]);

  // Fetches active in-progress bench repair tickets assigned to this workshop
  const fetchBenchRepairs = useCallback(async () => {
    setIsLoadingBench(true);
    setBenchError(null);
    try {
      const data = await api.shop.getBenchRepairs();
      setBenchRepairs(data);
    } catch (err: any) {
      setBenchError(err.message || 'Failed to fetch bench repairs');
      showToast(err.message || 'Failed to fetch bench repairs', 'error');
    } finally {
      setIsLoadingBench(false);
    }
  }, [showToast]);

  // Fetches open customer repair tickets available for workshop quote bidding
  const fetchInboundRequests = useCallback(async () => {
    setIsLoadingInbound(true);
    setInboundError(null);
    try {
      const data = await api.shop.getInboundRequests();
      setInboundRequests(data);
    } catch (err: any) {
      setInboundError(err.message || 'Failed to fetch inbound request queue');
      showToast(err.message || 'Failed to fetch inbound request queue', 'error');
    } finally {
      setIsLoadingInbound(false);
    }
  }, [showToast]);

  // Fetches customer warranty claims filed against previously completed repairs
  const fetchWarrantyClaims = useCallback(async () => {
    setIsLoadingClaims(true);
    setClaimsError(null);
    try {
      const data = await api.shop.getWarrantyClaims();
      setWarrantyClaims(data);
    } catch (err: any) {
      setClaimsError(err.message || 'Failed to fetch warranty claims');
      showToast(err.message || 'Failed to fetch warranty claims', 'error');
    } finally {
      setIsLoadingClaims(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchShopProfile();
    fetchBenchRepairs();
    fetchInboundRequests();
  }, [fetchShopProfile, fetchBenchRepairs, fetchInboundRequests]);

  useEffect(() => {
    if (activeTab === 'claims') fetchWarrantyClaims();
  }, [activeTab, fetchWarrantyClaims]);

  // Quote Calculation
  const parsedLabor = parseFloat(laborCost) || 0;
  const parsedParts = parseFloat(partsCost) || 0;
  const parsedDiag = diagnosticFeeWaived ? 0 : parseFloat(diagnosticFee) || 0;
  const calculatedTotal = parsedLabor + parsedParts + parsedDiag;

  const resetQuoteForm = () => {
    setLaborCost('');
    setPartsCost('');
    setDiagnosticFee('0');
    setDiagnosticFeeWaived(true);
    setPartsQuality('OEM Genuine');
    setEstimatedTurnaround('24 hours');
    setTurnaroundDays(1);
    setWarrantyMonths('3');
    setTechnicianNotes('');
  };

  // Opens the quote formulation modal with fresh form defaults for an inbound request
  const handleOpenQuoteModal = (req: RepairRequest) => {
    resetQuoteForm();
    setSelectedInboundRequest(req);
  };

  // Submits a binding repair quote with parts, labor, turnaround, and warranty terms
  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInboundRequest) return;
    if (calculatedTotal <= 0) {
      showToast('Please specify valid parts and labor costs', 'warning');
      return;
    }

    setIsSubmittingQuote(true);
    try {
      await api.shop.submitQuote({
        requestId: selectedInboundRequest.id,
        partsCost: parsedParts,
        laborCost: parsedLabor,
        diagnosticFee: parseFloat(diagnosticFee) || 0,
        diagnosticFeeWaived,
        totalCost: calculatedTotal,
        partsQuality,
        estimatedTurnaround,
        turnaroundDays: Number(turnaroundDays) || 1,
        warrantyMonths: parseInt(warrantyMonths, 10) || 3,
        technicianNotes: technicianNotes.trim() || undefined,
      });

      showToast(`Binding quote of $${calculatedTotal.toFixed(2)} submitted!`, 'success');
      setSelectedInboundRequest(null);
      resetQuoteForm();
      fetchInboundRequests();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit quote', 'error');
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  // Monotonic Bench Stage Advancement
  const getNextBenchStage = (currentStatus: string): RepairStatus | null => {
    const currentIndex = BENCH_STAGE_ORDER.indexOf(currentStatus as any);
    if (currentIndex === -1 || currentIndex >= BENCH_STAGE_ORDER.length - 1) {
      return null;
    }
    return BENCH_STAGE_ORDER[currentIndex + 1];
  };

  const canAdvanceStage = (status: string): boolean => {
    if (['ready_for_pickup', 'completed', 'disputed', 'cancelled'].includes(status)) {
      return false;
    }
    return getNextBenchStage(status) !== null;
  };

  const handleOpenAdvanceModal = (ticket: RepairRequest) => {
    if (!canAdvanceStage(ticket.status)) return;
    setSelectedBenchTicket(ticket);
    setBenchNotes('');
    setBenchProofPhotos([]);
  };

  const handleAdvanceStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBenchTicket) return;
    const targetStage = getNextBenchStage(selectedBenchTicket.status);
    if (!targetStage) return;

    setIsAdvancingBench(true);
    try {
      await api.shop.advanceRepairStage(selectedBenchTicket.id, {
        status: targetStage,
        technicianNotes: benchNotes.trim() || undefined,
        photoProof: benchProofPhotos[0] || undefined,
      });

      showToast(`Bench repair moved to stage: ${BENCH_STAGE_LABELS[targetStage] || targetStage.replace(/_/g, ' ')}`, 'success');
      setSelectedBenchTicket(null);
      setBenchNotes('');
      setBenchProofPhotos([]);
      fetchBenchRepairs();
    } catch (err: any) {
      showToast(err.message || 'Failed to advance stage', 'error');
    } finally {
      setIsAdvancingBench(false);
    }
  };

  // Workshop Profile update with camelCase payload keys
  const handleSaveShopProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const payload = {
        name: shopName.trim(),
        tagline: shopTagline.trim(),
        address: shopAddress.trim(),
        city: shopCity.trim(),
        phone: shopPhone.trim(),
        operatingHours: shopOperatingHours.trim(),
        warrantyStandard: shopWarranty.trim(),
        activeTechCount: Number(shopTechCount) || 1,
        turnaroundAvg: shopTurnaroundAvg.trim(),
        description: shopDescription.trim(),
        specialties: shopSpecialties,
        certifications: shopCertifications,
        logo: shopLogo || undefined,
        bannerImage: shopBannerImage || undefined,
      };

      await api.shop.updateProfile(payload);
      showToast('Workshop facility profile updated and synced.', 'success');
      await fetchShopProfile();
      await refreshUser();
    } catch (err: any) {
      showToast(err.message || 'Failed to save shop profile', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Warranty Claim Resolution
  const handleOpenUpdateClaimModal = (claim: WarrantyClaim) => {
    setSelectedClaimForUpdate(claim);
    setClaimStatus(claim.status === 'submitted' ? 'under_review' : claim.status);
    setClaimResponse(claim.shop_response || '');
  };

  const handleUpdateWarrantyClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaimForUpdate) return;
    setIsUpdatingClaim(true);
    try {
      await api.shop.updateWarrantyClaim(selectedClaimForUpdate.id, {
        status: claimStatus,
        shopResponse: claimResponse.trim() || undefined,
      });

      showToast(`Warranty claim status updated to: ${claimStatus.replace(/_/g, ' ')}`, 'success');
      setSelectedClaimForUpdate(null);
      setClaimResponse('');
      fetchWarrantyClaims();
    } catch (err: any) {
      showToast(err.message || 'Failed to update warranty claim', 'error');
    } finally {
      setIsUpdatingClaim(false);
    }
  };

  const handleAddCertification = () => {
    const trimmed = newCertInput.trim();
    if (trimmed && !shopCertifications.includes(trimmed)) {
      setShopCertifications([...shopCertifications, trimmed]);
      setNewCertInput('');
    }
  };

  const handleRemoveCertification = (cert: string) => {
    setShopCertifications(shopCertifications.filter((c) => c !== cert));
  };

  const effectiveShop = shopProfile || shop;

  return (
    <div className="space-y-6 pb-12">
      {/* Workshop Header Banner with True Database Metrics */}
      <div className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200/90 dark:border-neutral-800 p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 flex-shrink-0 flex items-center justify-center">
            {effectiveShop?.logo ? (
              <img
                src={effectiveShop.logo}
                alt={effectiveShop.name || 'Workshop'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-white font-mono font-bold text-lg">
                {effectiveShop?.name ? effectiveShop.name.substring(0, 2).toUpperCase() : 'FX'}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white tracking-tight">
                {effectiveShop?.name || 'Workshop Diagnostics Lab'}
              </h1>
              {effectiveShop?.verified && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full border border-neutral-200 dark:border-neutral-700">
                  <ShieldCheck className="w-3.5 h-3.5 text-neutral-900 dark:text-white" /> Verified Lab
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              {effectiveShop?.tagline || 'Bench diagnostics, board-level micro-soldering, and certified warranty restorations.'}
            </p>
          </div>
        </div>

        {/* Database Metrics Grid */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="bg-neutral-100/70 dark:bg-[#161616] p-2.5 px-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-right shadow-2xs">
            <span className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
              Completed Repairs
            </span>
            <div className="text-base font-mono font-bold text-neutral-900 dark:text-white leading-tight">
              {effectiveShop?.completed_repairs_count ?? 0}
            </div>
          </div>
          <div className="bg-neutral-100/70 dark:bg-[#161616] p-2.5 px-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-right shadow-2xs">
            <span className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
              Rating
            </span>
            <div className="text-base font-mono font-bold text-amber-500 leading-tight flex items-center justify-end gap-1">
              <Star className="w-3.5 h-3.5 fill-current" />
              {Number(effectiveShop?.rating || 5.0).toFixed(2)}
            </div>
          </div>
          <div className="bg-neutral-100/70 dark:bg-[#161616] p-2.5 px-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-right shadow-2xs">
            <span className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
              Active Bench
            </span>
            <div className="text-base font-mono font-bold text-neutral-900 dark:text-white leading-tight">
              {benchRepairs.length}
            </div>
          </div>
          <div className="bg-neutral-100/70 dark:bg-[#161616] p-2.5 px-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-right shadow-2xs">
            <span className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
              Inbound Leads
            </span>
            <div className="text-base font-mono font-bold text-sky-700 dark:text-sky-400 leading-tight">
              {inboundRequests.length}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 gap-1 sm:gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('bench')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'bench'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <Wrench className="w-4 h-4" />
          Active Bench Repairs ({benchRepairs.length})
        </button>
        <button
          onClick={() => setActiveTab('inbound')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'inbound'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <Inbox className="w-4 h-4" />
          Inbound Requests Board ({inboundRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('claims')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'claims'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Warranty Claims ({warrantyClaims.length})
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'profile'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <Settings className="w-4 h-4" />
          Workshop Settings
        </button>
      </div>

      {/* TAB 1: ACTIVE BENCH REPAIRS */}
      {activeTab === 'bench' && (
        <div className="space-y-4">
          {benchError && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <span>{benchError}</span>
              <button
                type="button"
                onClick={fetchBenchRepairs}
                className="font-bold underline flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          )}

          {isLoadingBench ? (
            <CardSkeleton count={2} />
          ) : benchRepairs.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No Repairs Currently on Bench"
              description="When customers accept your binding quotes, active hardware tickets appear here with stage advancing controls."
              actionLabel="Browse Inbound Request Board"
              onAction={() => setActiveTab('inbound')}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {benchRepairs.map((repair) => {
                const nextStage = getNextBenchStage(repair.status);
                const canAdvance = canAdvanceStage(repair.status);
                const photo = repair.photos && repair.photos.length > 0 ? repair.photos[0] : null;

                return (
                  <div
                    key={repair.id}
                    className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200/90 dark:border-neutral-800 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none flex flex-col justify-between hover:border-neutral-900 dark:hover:border-neutral-600 transition-all group"
                  >
                    <div>
                      {/* Diagnostic Photo Thumbnail & Device Title */}
                      <div className="flex items-start gap-3.5 mb-3.5">
                        {photo ? (
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 flex-shrink-0 shadow-2xs">
                            <img
                              src={photo}
                              alt={repair.device_model}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 flex-shrink-0 flex items-center justify-center text-neutral-400 dark:text-neutral-600">
                            <Wrench className="w-6 h-6 stroke-[1.5]" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="text-base font-bold text-neutral-900 dark:text-white truncate">
                              {repair.device_model}
                            </h3>
                            <StatusBadge status={repair.status} />
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                            <span className="font-semibold text-neutral-700 dark:text-neutral-300">{repair.device_brand}</span>
                            <span>•</span>
                            <span className="capitalize">{repair.device_category}</span>
                            <span>•</span>
                            <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">{repair.id}</span>
                          </div>

                          <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-1 font-medium">
                            {repair.issue_title}
                          </p>
                        </div>
                      </div>

                      {/* Escrow Badge */}
                      <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs mb-4">
                        <div>
                          <span className="text-neutral-500 dark:text-neutral-400 font-medium">Contract Total:</span>
                          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 ml-1.5">
                            ${Number(repair.total_cost || repair.escrow_amount || 0).toFixed(2)}
                          </span>
                        </div>
                        <StatusBadge escrowStatus={repair.escrow_status} />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenTicket(repair.id)}
                        className="text-xs font-semibold text-neutral-900 dark:text-white hover:underline flex items-center gap-1"
                      >
                        Open Ticket & Chat <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      {canAdvance && nextStage && (
                        <button
                          type="button"
                          onClick={() => handleOpenAdvanceModal(repair)}
                          className="px-3.5 py-1.5 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg transition-colors shadow-2xs flex items-center gap-1.5"
                        >
                          <span>Advance to: {BENCH_STAGE_LABELS[nextStage]}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}

                      {repair.status === 'ready_for_pickup' && (
                        <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 rounded-lg">
                          Awaiting Customer Handover
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

      {/* TAB 2: INBOUND REQUESTS BOARD */}
      {activeTab === 'inbound' && (
        <div className="space-y-4">
          {inboundError && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <span>{inboundError}</span>
              <button
                type="button"
                onClick={fetchInboundRequests}
                className="font-bold underline flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          )}

          {isLoadingInbound ? (
            <CardSkeleton count={3} />
          ) : inboundRequests.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No Inbound Repair Requests"
              description="No open customer tickets currently match your workshop's specialties. Check back shortly for new broadcasted requests."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {inboundRequests.map((req) => {
                const hasQuoted = Boolean(
                  req.quotes?.some((q) => effectiveShop && q.shop_id === effectiveShop.id)
                );
                const photo = req.photos && req.photos.length > 0 ? req.photos[0] : null;

                return (
                  <div
                    key={req.id}
                    className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200/90 dark:border-neutral-800 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none flex flex-col justify-between hover:border-neutral-900 dark:hover:border-neutral-600 transition-all group"
                  >
                    <div>
                      {/* Photo Thumbnail + Device Title */}
                      <div className="flex items-start gap-3.5 mb-3.5">
                        {photo ? (
                          <div className="w-16 h-16 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 flex-shrink-0 shadow-2xs">
                            <img
                              src={photo}
                              alt={req.device_model}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 flex-shrink-0 flex items-center justify-center text-neutral-400 dark:text-neutral-600">
                            <Inbox className="w-6 h-6 stroke-[1.5]" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <h3 className="text-base font-bold text-neutral-900 dark:text-white truncate">
                              {req.device_model}
                            </h3>
                            <StatusBadge urgency={req.urgency} />
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                            <span className="font-semibold text-neutral-700 dark:text-neutral-300">{req.device_brand}</span>
                            <span>•</span>
                            <span className="capitalize">{req.device_category}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">{req.issue_title}</p>
                        {hasQuoted && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 flex-shrink-0">
                            <Check className="w-2.5 h-2.5" /> Quoted
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed mb-4">
                        {req.description}
                      </p>

                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 mb-3 bg-neutral-50 dark:bg-[#161616] p-2 rounded-lg border border-neutral-200/60 dark:border-neutral-800">
                        <MapPin className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                        <span className="truncate">{req.location} • {req.preferred_service}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenTicket(req.id)}
                        className="text-xs text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white font-medium"
                      >
                        Inspect Details
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenQuoteModal(req)}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors shadow-2xs ${
                          hasQuoted
                            ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white hover:bg-neutral-200'
                            : 'bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black'
                        }`}
                      >
                        {hasQuoted ? 'Update Quote' : 'Submit Quote'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: WARRANTY CLAIMS */}
      {activeTab === 'claims' && (
        <div className="space-y-4">
          {claimsError && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <span>{claimsError}</span>
              <button
                type="button"
                onClick={fetchWarrantyClaims}
                className="font-bold underline flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          )}

          {isLoadingClaims ? (
            <TableSkeleton rows={3} />
          ) : warrantyClaims.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No Warranty Claims on Record"
              description="Your workshop has zero active warranty claims or customer callbacks. Excellent craftsmanship!"
            />
          ) : (
            <div className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200/90 dark:border-neutral-800 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-100 dark:bg-neutral-900/90 text-neutral-600 dark:text-neutral-400 uppercase text-[10px] font-semibold border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="p-4">Customer & Device</th>
                      <th className="p-4">Reported Failure Issue</th>
                      <th className="p-4">Warranty Expiry</th>
                      <th className="p-4">Claim Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300">
                    {warrantyClaims.map((claim) => (
                      <tr key={claim.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50">
                        <td className="p-4">
                          <div className="font-bold text-neutral-900 dark:text-white">{claim.customer_name || 'Customer'}</div>
                          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {claim.device_brand} {claim.device_model}
                          </span>
                        </td>
                        <td className="p-4 max-w-sm">
                          <p className="line-clamp-2">{claim.claim_issue}</p>
                          {claim.shop_response && (
                            <p className="text-[11px] text-neutral-500 italic mt-1">
                              Response: "{claim.shop_response}"
                            </p>
                          )}
                        </td>
                        <td className="p-4 font-mono text-[11px]">
                          {new Date(claim.warranty_expiry_date).toLocaleDateString()}
                        </td>
                        <td className="p-4">
                          <StatusBadge warrantyStatus={claim.status} />
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => handleOpenUpdateClaimModal(claim)}
                            className="px-3 py-1 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black rounded font-semibold text-xs transition-colors"
                          >
                            Update Status
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenTicket(claim.request_id)}
                            className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded font-semibold text-xs"
                          >
                            Open Docket
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: WORKSHOP PROFILE & SETTINGS */}
      {activeTab === 'profile' && (
        <div className="max-w-3xl mx-auto bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200/90 dark:border-neutral-800 p-6 sm:p-8 shadow-2xs">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white tracking-tight mb-4">
            Workshop Facility Profile & Bench Settings
          </h2>

          <form onSubmit={handleSaveShopProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Workshop Public Name *
                </label>
                <input
                  type="text"
                  required
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs sm:text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Tagline / Specialization Summary
                </label>
                <input
                  type="text"
                  value={shopTagline}
                  onChange={(e) => setShopTagline(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs sm:text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Workshop Address *
                </label>
                <input
                  type="text"
                  required
                  value={shopAddress}
                  onChange={(e) => setShopAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  City & State *
                </label>
                <input
                  type="text"
                  required
                  value={shopCity}
                  onChange={(e) => setShopCity(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Direct Lab Phone *
                </label>
                <input
                  type="text"
                  required
                  value={shopPhone}
                  onChange={(e) => setShopPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Operating Hours
                </label>
                <input
                  type="text"
                  value={shopOperatingHours}
                  onChange={(e) => setShopOperatingHours(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Warranty Standard
                </label>
                <input
                  type="text"
                  value={shopWarranty}
                  onChange={(e) => setShopWarranty(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Avg. Turnaround Time
                </label>
                <input
                  type="text"
                  value={shopTurnaroundAvg}
                  onChange={(e) => setShopTurnaroundAvg(e.target.value)}
                  placeholder="e.g. 24-48 Hours"
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Active Technicians Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={shopTechCount}
                  onChange={(e) => setShopTechCount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-900"
                />
              </div>
            </div>

            {/* Logo and Banner Image Uploaders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ImageUpload
                images={shopLogo ? [shopLogo] : []}
                onChange={(imgs) => setShopLogo(imgs[0] || '')}
                maxFiles={1}
                label="Workshop Logo"
                helperText="Square image recommended (PNG, JPG, WebP)."
              />
              <ImageUpload
                images={shopBannerImage ? [shopBannerImage] : []}
                onChange={(imgs) => setShopBannerImage(imgs[0] || '')}
                maxFiles={1}
                label="Facility Banner Image"
                helperText="Wide banner image for public directory."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Facility & Bench Capability Description
              </label>
              <textarea
                rows={3}
                value={shopDescription}
                onChange={(e) => setShopDescription(e.target.value)}
                className="w-full p-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-900"
              />
            </div>

            {/* Certifications Tag Editor */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Certifications & Quality Standards
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {shopCertifications.map((cert) => (
                  <span
                    key={cert}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700"
                  >
                    <Award className="w-3.5 h-3.5 text-neutral-900 dark:text-white" />
                    {cert}
                    <button
                      type="button"
                      onClick={() => handleRemoveCertification(cert)}
                      className="text-neutral-400 hover:text-rose-500 ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. IPC-7711/7721, Apple Certified, ESD Station S20.20"
                  value={newCertInput}
                  onChange={(e) => setNewCertInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCertification();
                    }
                  }}
                  className="flex-1 px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddCertification}
                  className="px-3.5 py-1.5 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-900 dark:text-white text-xs font-bold rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Specialties Selector */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Specialties Checklist (Determines inbound leads routed to your bench)
              </label>
              <div className="flex flex-wrap gap-2">
                {(['phone', 'laptop', 'appliance', 'audio', 'gaming', 'other'] as DeviceCategory[]).map(
                  (cat) => {
                    const isSelected = shopSpecialties.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setShopSpecialties(
                            isSelected
                              ? shopSpecialties.filter((c) => c !== cat)
                              : [...shopSpecialties, cat]
                          );
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all ${
                          isSelected
                            ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                            : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="px-6 py-2.5 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs sm:text-sm font-bold rounded-xl transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-2"
              >
                {isSavingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Workshop Profile
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUB-MODAL: SUBMIT BINDING QUOTE */}
      {selectedInboundRequest && (
        <Modal
          isOpen={Boolean(selectedInboundRequest)}
          onClose={() => setSelectedInboundRequest(null)}
          title={`Submit Binding Quote: ${selectedInboundRequest.device_brand} ${selectedInboundRequest.device_model}`}
          subtitle="Quote breakdown will be presented to customer in escrow comparison matrix."
          maxWidth="lg"
        >
          <form onSubmit={handleSubmitQuote} className="space-y-4">
            <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs">
              <div className="font-semibold text-neutral-900 dark:text-white mb-0.5">
                {selectedInboundRequest.issue_title}
              </div>
              <p className="text-neutral-500 dark:text-neutral-400 line-clamp-2">{selectedInboundRequest.description}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Labor / Soldering ($) *
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={laborCost}
                  onChange={(e) => setLaborCost(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Parts / Materials ($) *
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={partsCost}
                  onChange={(e) => setPartsCost(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Diagnostic Fee ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={diagnosticFee}
                  onChange={(e) => setDiagnosticFee(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                id="waiveDiag"
                checked={diagnosticFeeWaived}
                onChange={(e) => setDiagnosticFeeWaived(e.target.checked)}
                className="w-4 h-4 rounded text-black dark:bg-[#161616] dark:border-neutral-700"
              />
              <label htmlFor="waiveDiag">Waive diagnostic fee if customer accepts repair</label>
            </div>

            <div className="p-3 bg-neutral-100 dark:bg-[#161616] rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-900 dark:text-white">Total Fixed Price for Escrow:</span>
              <span className="text-base font-extrabold text-neutral-900 dark:text-white font-mono">
                ${calculatedTotal.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Parts Quality Grade
                </label>
                <select
                  value={partsQuality}
                  onChange={(e) => setPartsQuality(e.target.value as PartsQuality)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                >
                  {VALID_PARTS_QUALITIES.map((pq) => (
                    <option key={pq} value={pq}>{pq}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Turnaround Days
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  required
                  value={turnaroundDays}
                  onChange={(e) => {
                    const days = parseInt(e.target.value, 10) || 1;
                    setTurnaroundDays(days);
                    setEstimatedTurnaround(days === 1 ? '24 hours' : `${days} days`);
                  }}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Warranty Coverage (Months)
                </label>
                <select
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(e.target.value)}
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
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Technician Diagnostics Note (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Explain the required board procedure, micro-soldering, or parts calibration..."
                value={technicianNotes}
                onChange={(e) => setTechnicianNotes(e.target.value)}
                className="w-full p-2.5 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setSelectedInboundRequest(null)}
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

      {/* SUB-MODAL: ADVANCE BENCH REPAIR STAGE (MONOTONIC ONLY) */}
      {selectedBenchTicket && (
        <Modal
          isOpen={Boolean(selectedBenchTicket)}
          onClose={() => setSelectedBenchTicket(null)}
          title={`Advance Bench Repair: ${selectedBenchTicket.device_brand} ${selectedBenchTicket.device_model}`}
          subtitle="Sequential advancement records stage transition in immutable ledger."
          maxWidth="md"
        >
          {(() => {
            const nextStage = getNextBenchStage(selectedBenchTicket.status);
            if (!nextStage) {
              return (
                <div className="p-4 text-xs text-neutral-500 text-center">
                  This ticket has completed all workshop bench stages.
                </div>
              );
            }

            return (
              <form onSubmit={handleAdvanceStage} className="space-y-4">
                {/* Visual Stage Transition Indicator */}
                <div className="p-3.5 bg-neutral-50 dark:bg-[#161616] rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider block mb-2">
                    Sequential Stage Progression
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 p-2 bg-white dark:bg-[#111111] rounded-lg border border-neutral-200 dark:border-neutral-700 text-center">
                      <span className="text-[10px] text-neutral-400 block">Current Stage</span>
                      <span className="text-xs font-bold text-neutral-900 dark:text-white">
                        {BENCH_STAGE_LABELS[selectedBenchTicket.status] || selectedBenchTicket.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-neutral-400 shrink-0" />
                    <div className="flex-1 p-2 bg-black text-white dark:bg-white dark:text-black rounded-lg text-center font-bold text-xs shadow-2xs">
                      <span className="text-[10px] text-neutral-300 dark:text-neutral-700 block">Target Next Stage</span>
                      <span>{BENCH_STAGE_LABELS[nextStage]}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-2 text-center">
                    Advance bench repair to next stage: <strong className="text-neutral-900 dark:text-white">{BENCH_STAGE_LABELS[nextStage]}</strong>?
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Technician Log Notes (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Log voltage rail readings, capacitor model numbers, or QA benchmarks..."
                    value={benchNotes}
                    onChange={(e) => setBenchNotes(e.target.value)}
                    className="w-full p-2.5 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                  />
                </div>

                <ImageUpload
                  images={benchProofPhotos}
                  onChange={setBenchProofPhotos}
                  maxFiles={2}
                  label="Bench Proof Photo (Optional)"
                  helperText="Attach microscope or thermal image proof of repaired trace/chip."
                />

                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setSelectedBenchTicket(null)}
                    className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAdvancingBench}
                    className="px-5 py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg shadow-2xs flex items-center gap-1.5"
                  >
                    {isAdvancingBench && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Confirm & Advance to {BENCH_STAGE_LABELS[nextStage]}</span>
                  </button>
                </div>
              </form>
            );
          })()}
        </Modal>
      )}

      {/* SUB-MODAL: UPDATE WARRANTY CLAIM STATUS */}
      {selectedClaimForUpdate && (
        <Modal
          isOpen={Boolean(selectedClaimForUpdate)}
          onClose={() => setSelectedClaimForUpdate(null)}
          title="Update Warranty Claim Resolution"
          subtitle={`Claim for ${selectedClaimForUpdate.device_brand} ${selectedClaimForUpdate.device_model}`}
          maxWidth="md"
        >
          <form onSubmit={handleUpdateWarrantyClaim} className="space-y-4">
            <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs">
              <span className="font-semibold text-neutral-500 uppercase text-[10px] block mb-1">
                Reported Failure Issue
              </span>
              <p className="text-neutral-800 dark:text-neutral-200">{selectedClaimForUpdate.claim_issue}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Select Resolution Status *
              </label>
              <select
                value={claimStatus}
                onChange={(e) => setClaimStatus(e.target.value as WarrantyClaimStatus)}
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs font-semibold text-neutral-900 dark:text-white"
              >
                <option value="under_review">Under Review (Evaluating diagnostics & logs)</option>
                <option value="repair_scheduled">Repair Scheduled (Bench slot reserved)</option>
                <option value="resolved">Resolved (Hardware restored under warranty)</option>
                <option value="rejected">Rejected (Out of warranty scope / physical damage)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Workshop Response & Resolution Notes
              </label>
              <textarea
                rows={3}
                required
                placeholder="Explain findings, parts replaced under warranty, or scheduled intake date..."
                value={claimResponse}
                onChange={(e) => setClaimResponse(e.target.value)}
                className="w-full p-2.5 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setSelectedClaimForUpdate(null)}
                className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdatingClaim}
                className="px-5 py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg shadow-2xs flex items-center gap-1.5"
              >
                {isUpdatingClaim && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Claim Resolution
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
