import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { StatusBadge } from '../common/StatusBadge';
import { CardSkeleton } from '../common/LoadingSkeleton';
import { EmptyState } from '../common/EmptyState';
import { ImageUpload } from '../common/ImageUpload';
import { Modal } from '../common/Modal';
import {
  RepairRequest,
  RepairShop,
  DeviceCategory,
  RequestUrgency,
  ServicePreference,
} from '../../types';
import {
  Wrench,
  PlusCircle,
  Building,
  ShieldCheck,
  Search,
  AlertTriangle,
  ArrowRight,
  Filter,
  Smartphone,
  Laptop,
  Tv,
  Gamepad2,
  Headphones,
  Cpu,
  Loader2,
  Star,
  MapPin,
  RefreshCw,
} from 'lucide-react';

// Props interface for customer dashboard view
interface CustomerDashboardProps {
  onOpenTicket: (requestId: string) => void;
  onOpenShopProfile: (shopId: string) => void;
}

// Primary customer dashboard managing intake requests, new repair bookings, workshop directory, and warranty claims
export const CustomerDashboard: React.FC<CustomerDashboardProps> = ({
  onOpenTicket,
  onOpenShopProfile,
}) => {
  const { user, settings } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'repairs' | 'new' | 'directory' | 'warranty'>('repairs');

  const [requests, setRequests] = useState<RepairRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'urgency'>('newest');

  const [ticketToCancel, setTicketToCancel] = useState<RepairRequest | null>(null);
  const [cancellingTicketId, setCancellingTicketId] = useState<string | null>(null);

  const [shops, setShops] = useState<RepairShop[]>([]);
  const [directorySpecialty, setDirectorySpecialty] = useState<string>('all');
  const [isLoadingShops, setIsLoadingShops] = useState(false);

  const [deviceCategory, setDeviceCategory] = useState<DeviceCategory>('phone');
  const [deviceBrand, setDeviceBrand] = useState('Apple');
  const [deviceModel, setDeviceModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [deviceYear, setDeviceYear] = useState('2023');
  const [issueCategory, setIssueCategory] = useState('Display & Glass Fracture');
  const [issueTitle, setIssueTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [urgency, setUrgency] = useState<RequestUrgency>('standard');
  const [preferredService, setPreferredService] = useState<ServicePreference>('dropoff');

  const defaultLocation =
    (user as any)?.settings?.default_city ||
    (user as any)?.settings?.default_address ||
    settings?.default_city ||
    settings?.default_address ||
    'San Francisco, CA';
  const [location, setLocation] = useState(defaultLocation);

  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  const [warrantyRequestId, setWarrantyRequestId] = useState('');
  const [warrantyIssue, setWarrantyIssue] = useState('');
  const [isSubmittingWarranty, setIsSubmittingWarranty] = useState(false);

  useEffect(() => {
    const loc =
      (user as any)?.settings?.default_city ||
      (user as any)?.settings?.default_address ||
      settings?.default_city ||
      settings?.default_address;
    if (loc) {
      setLocation(loc);
    }
  }, [user, settings]);

  // Fetches all repair request tickets belonging to the authenticated customer
  const fetchRequests = useCallback(async () => {
    setIsLoadingRequests(true);
    setFetchError(null);
    try {
      const data = await api.client.getMyRequests();
      setRequests(data);
    } catch (err: any) {
      const msg = err.message || 'Failed to fetch your repair requests';
      setFetchError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoadingRequests(false);
    }
  }, [showToast]);

  // Fetches certified workshops directory filtered by selected device specialty
  const fetchShops = useCallback(async () => {
    setIsLoadingShops(true);
    try {
      const data = await api.shared.getShopsDirectory(directorySpecialty);
      setShops(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch workshops directory', 'error');
    } finally {
      setIsLoadingShops(false);
    }
  }, [directorySpecialty, showToast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (activeTab === 'directory') {
      fetchShops();
    }
  }, [activeTab, fetchShops]);

  // Opens cancellation confirmation modal for a designated open ticket
  const handleOpenCancelModal = (req: RepairRequest, e: React.MouseEvent) => {
    e.stopPropagation();
    setTicketToCancel(req);
  };

  // Confirms and processes ticket cancellation via API
  const handleConfirmCancel = async () => {
    if (!ticketToCancel) return;
    setCancellingTicketId(ticketToCancel.id);
    try {
      await api.client.cancelRequest(ticketToCancel.id);
      showToast('Repair ticket cancelled.', 'info');
      setTicketToCancel(null);
      await fetchRequests();
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel ticket', 'error');
    } finally {
      setCancellingTicketId(null);
    }
  };

  // Validates form input and submits new hardware repair request ticket to marketplace
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceBrand || !deviceModel || !issueTitle || !description) {
      showToast('Please fill out all required device and issue fields', 'warning');
      return;
    }

    setIsSubmittingNew(true);
    try {
      const created = await api.client.createRequest({
        deviceCategory,
        deviceBrand,
        deviceModel,
        serialNumber: serialNumber || undefined,
        deviceYear: deviceYear || undefined,
        issueCategory,
        issueTitle,
        description,
        photos,
        urgency,
        preferredService,
        location,
      });

      showToast(
        `Repair ticket published for ${created.device_brand} ${created.device_model}!`,
        'success'
      );
      setDeviceModel('');
      setIssueTitle('');
      setDescription('');
      setPhotos([]);
      setSerialNumber('');
      setActiveTab('repairs');
      fetchRequests();
    } catch (err: any) {
      showToast(err.message || 'Failed to create repair request', 'error');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Submits a formal warranty service claim for a previously completed repair
  const handleWarrantySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warrantyRequestId || !warrantyIssue.trim()) {
      showToast('Please select a completed repair and describe the issue', 'warning');
      return;
    }

    setIsSubmittingWarranty(true);
    try {
      const res = await api.client.submitWarrantyClaim({
        requestId: warrantyRequestId,
        claimIssue: warrantyIssue.trim(),
      });
      showToast(res.message || 'Warranty claim submitted!', 'success');
      setWarrantyIssue('');
      setWarrantyRequestId('');
      fetchRequests();
    } catch (err: any) {
      showToast(err.message || 'Failed to file warranty claim', 'error');
    } finally {
      setIsSubmittingWarranty(false);
    }
  };

  const filteredRequests = requests
    .filter((r) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'bidding' && r.status !== 'open') return false;
        if (statusFilter === 'quote_accepted' && r.status !== 'quote_accepted') return false;
        if (
          statusFilter === 'bench' &&
          !['in_shop', 'diagnosing', 'in_repair', 'quality_check'].includes(r.status)
        )
          return false;
        if (statusFilter === 'ready' && r.status !== 'ready_for_pickup') return false;
        if (statusFilter === 'completed' && r.status !== 'completed') return false;
        if (statusFilter === 'disputed' && r.status !== 'disputed') return false;
        if (statusFilter === 'cancelled' && r.status !== 'cancelled') return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = r.id.toLowerCase().includes(q);
        const matchDevice = `${r.device_brand} ${r.device_model}`.toLowerCase().includes(q);
        const matchTitle = r.issue_title.toLowerCase().includes(q);
        const matchDesc = r.description.toLowerCase().includes(q);
        return matchId || matchDevice || matchTitle || matchDesc;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'urgency') {
        const weight: Record<string, number> = { urgent: 3, standard: 2, flexible: 1 };
        const diff = (weight[b.urgency] || 0) - (weight[a.urgency] || 0);
        if (diff !== 0) return diff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const categoryIcons: Record<DeviceCategory, React.ReactNode> = {
    phone: <Smartphone className="w-5 h-5" />,
    laptop: <Laptop className="w-5 h-5" />,
    appliance: <Tv className="w-5 h-5" />,
    audio: <Headphones className="w-5 h-5" />,
    gaming: <Gamepad2 className="w-5 h-5" />,
    other: <Cpu className="w-5 h-5" />,
  };

  const completedEligibleForWarranty = requests.filter((r) => r.status === 'completed');

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white tracking-tight">
            Customer Hardware Portal
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Publish repair requests, compare competitive workshop quotes, and lock funds in escrow protection.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('new')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs sm:text-sm font-bold rounded-xl transition-all shadow-xs active:scale-[0.98] flex-shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          Request New Repair
        </button>
      </div>

      <div className="flex border-b border-neutral-200 dark:border-neutral-800 gap-1 sm:gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('repairs')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'repairs'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <Wrench className="w-4 h-4" />
          My Repair Tickets ({requests.length})
        </button>
        <button
          onClick={() => setActiveTab('new')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'new'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          Publish New Ticket
        </button>
        <button
          onClick={() => setActiveTab('directory')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'directory'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <Building className="w-4 h-4" />
          Certified Workshop Directory
        </button>
        <button
          onClick={() => setActiveTab('warranty')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'warranty'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Warranty & Protection
        </button>
      </div>

      {activeTab === 'repairs' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              {[
                { key: 'all', label: 'All Tickets' },
                { key: 'bidding', label: 'Open Bids' },
                { key: 'quote_accepted', label: 'Booked / In Transit' },
                { key: 'bench', label: 'On Workbench' },
                { key: 'ready', label: 'Ready for Pickup' },
                { key: 'completed', label: 'Completed' },
                { key: 'disputed', label: 'Disputed' },
                { key: 'cancelled', label: 'Cancelled' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                    statusFilter === f.key
                      ? 'bg-black dark:bg-white text-white dark:text-black font-semibold'
                      : 'bg-white dark:bg-[#141414] border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search ID, device, issue..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-[#141414] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-black dark:focus:border-white"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'urgency')}
                className="px-3 py-1.5 bg-white dark:bg-[#141414] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs font-medium text-neutral-900 dark:text-white focus:outline-none focus:border-black dark:focus:border-white"
                aria-label="Sort tickets"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="urgency">Urgency</option>
              </select>
            </div>
          </div>

          {fetchError && (
            <div
              role="alert"
              className="p-4 rounded-xl border border-rose-300 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                <div>
                  <span className="font-bold">Failed to load repair requests: </span>
                  <span>{fetchError}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => fetchRequests()}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg transition-colors shrink-0 text-xs flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}

          {isLoadingRequests ? (
            <CardSkeleton count={3} />
          ) : filteredRequests.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No Repair Tickets Found"
              description={
                requests.length === 0
                  ? 'You have not submitted any hardware repair requests yet. Create your first ticket to broadcast to certified workshops.'
                  : 'No tickets matched your selected status filter or search query.'
              }
              actionLabel={requests.length === 0 ? 'Publish First Repair Request' : undefined}
              onAction={requests.length === 0 ? () => setActiveTab('new') : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredRequests.map((req) => {
                const quoteCount = req.quotes?.length || 0;
                const photo = req.photos && req.photos.length > 0 ? req.photos[0] : null;

                return (
                  <div
                    key={req.id}
                    onClick={() => onOpenTicket(req.id)}
                    className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200/90 dark:border-neutral-800 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none hover:border-black dark:hover:border-neutral-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
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
                            <Wrench className="w-6 h-6 stroke-[1.5]" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <h3 className="text-base font-bold text-neutral-900 dark:text-white group-hover:text-black dark:group-hover:text-white transition-colors truncate">
                              {req.device_model}
                            </h3>
                            <StatusBadge status={req.status} />
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                            <span className="font-semibold text-neutral-700 dark:text-neutral-300">{req.device_brand}</span>
                            <span>•</span>
                            <span className="capitalize">{req.device_category}</span>
                            <span>•</span>
                            <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">{req.id}</span>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 line-clamp-1 mb-1">
                        {req.issue_title}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed mb-4">
                        {req.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {req.status === 'open' ? (
                          <span className="font-semibold text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-800/60">
                            {quoteCount} {quoteCount === 1 ? 'Quote' : 'Quotes'} Received
                          </span>
                        ) : req.status === 'quote_accepted' ? (
                          <span className="font-semibold text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/60">
                            Quote Accepted • In Transit
                          </span>
                        ) : req.escrow ? (
                          <span className="font-mono font-bold text-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60">
                            ${Number(req.escrow.total_amount).toFixed(2)}{' '}
                            <span className="text-neutral-500 dark:text-neutral-400 font-sans font-normal text-[10px]">
                              Escrow Locked
                            </span>
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {req.status === 'open' && (
                          <button
                            type="button"
                            disabled={cancellingTicketId === req.id}
                            onClick={(e) => handleOpenCancelModal(req, e)}
                            className="text-[11px] text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {cancellingTicketId === req.id && <Loader2 className="w-3 h-3 animate-spin" />}
                            Cancel
                          </button>
                        )}
                        <span className="text-black dark:text-white group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 font-bold text-[11px]">
                          View <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'new' && (
        <div className="max-w-3xl mx-auto bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200/90 dark:border-neutral-800 p-6 sm:p-8 shadow-2xs">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white tracking-tight">
              Publish Hardware Diagnostics & Repair Request
            </h2>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Broadcast your device breakdown to certified SF Bay workshops for competitive binding quotes.
            </p>
          </div>

          <form onSubmit={handleCreateRequest} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-2">
                1. Select Device Category
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                {(['phone', 'laptop', 'appliance', 'audio', 'gaming', 'other'] as DeviceCategory[]).map(
                  (cat) => {
                    const isSelected = deviceCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setDeviceCategory(cat)}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center ${
                          isSelected
                            ? 'border-black dark:border-white bg-neutral-100 dark:bg-neutral-800 text-black dark:text-white ring-2 ring-neutral-300 dark:ring-neutral-700 font-bold'
                            : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 font-medium'
                        }`}
                      >
                        <span className={isSelected ? 'text-black dark:text-white' : 'text-neutral-400 dark:text-neutral-500'}>
                          {categoryIcons[cat]}
                        </span>
                        <span className="text-xs capitalize">{cat}</span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Device Brand *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apple, Samsung, Dell, Sony"
                  value={deviceBrand}
                  onChange={(e) => setDeviceBrand(e.target.value)}
                  className="w-full px-3.5 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs sm:text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:border-black dark:focus:border-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Exact Model Name / Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. iPhone 15 Pro, MacBook Pro 16 M1"
                  value={deviceModel}
                  onChange={(e) => setDeviceModel(e.target.value)}
                  className="w-full px-3.5 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs sm:text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:border-black dark:focus:border-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Serial Number / Service Tag (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. C02G90PLMD6T"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="w-full px-3.5 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs sm:text-sm text-neutral-900 dark:text-white font-mono focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:border-black dark:focus:border-white"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Issue Category
                  </label>
                  <select
                    value={issueCategory}
                    onChange={(e) => setIssueCategory(e.target.value)}
                    className="w-full px-3.5 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs sm:text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none"
                  >
                    <option value="Display & Glass Fracture">Display & Glass Fracture</option>
                    <option value="Logic Board & Power Delivery">Logic Board & Power Delivery</option>
                    <option value="Liquid Spill De-corrosion">Liquid Spill De-corrosion</option>
                    <option value="Battery Health & Charging Port">Battery Health & Charging Port</option>
                    <option value="BGA Chipset / Audio IC">BGA Chipset / Audio IC</option>
                    <option value="Motor / Compressor / Sensor">Motor / Compressor / Sensor</option>
                    <option value="General Diagnostics">General Diagnostics</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Intake Headline / Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shattered OLED & Vertical Neon Line"
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    className="w-full px-3.5 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs sm:text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:border-black dark:focus:border-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Full Breakdown & Symptoms *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describe what occurred (fall, water splash, thermal shutdown), whether LED lights turn on, sound indicators..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3.5 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs sm:text-sm text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:border-black dark:focus:border-white"
                />
              </div>

              <ImageUpload
                images={photos}
                onChange={setPhotos}
                maxFiles={4}
                label="Diagnostic Photos & Serial Evidence"
                helperText="Upload photos showing screen cracks, water indicator, or board damage (PNG, JPG up to 10MB)"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Urgency Level
                </label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as RequestUrgency)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                >
                  <option value="urgent">Urgent (24h Bench Priority)</option>
                  <option value="standard">Standard (2-3 Days)</option>
                  <option value="flexible">Flexible (Whenever ready)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Delivery Preference
                </label>
                <select
                  value={preferredService}
                  onChange={(e) => setPreferredService(e.target.value as ServicePreference)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                >
                  <option value="dropoff">Workshop Drop-off</option>
                  <option value="mailin">Secure Mail-in Kit</option>
                  <option value="onsite">On-site Field Technician</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Your City / Neighborhood
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                100% Escrow Protection: Funds only released upon your final inspection.
              </span>
              <button
                type="submit"
                disabled={isSubmittingNew}
                className="px-6 py-2.5 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs sm:text-sm font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmittingNew && <Loader2 className="w-4 h-4 animate-spin" />}
                Publish Repair Request
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'directory' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Filter by Specialty:
            </span>
            {['all', 'phone', 'laptop', 'appliance'].map((spec) => (
              <button
                key={spec}
                onClick={() => setDirectorySpecialty(spec)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  directorySpecialty === spec
                    ? 'bg-black dark:bg-white text-white dark:text-black font-semibold'
                    : 'bg-white dark:bg-[#141414] border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {spec}
              </button>
            ))}
          </div>

          {isLoadingShops ? (
            <CardSkeleton count={3} />
          ) : shops.length === 0 ? (
            <EmptyState
              icon={Building}
              title="No Workshops Listed"
              description="No certified repair laboratories match this specialty yet."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {shops.map((s) => (
                <div
                  key={s.id}
                  onClick={() => onOpenShopProfile(s.id)}
                  className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200/90 dark:border-neutral-800 p-5 shadow-2xs hover:border-black dark:hover:border-neutral-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 flex-shrink-0">
                        <img src={s.logo || ''} alt={s.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-bold text-neutral-900 dark:text-white truncate group-hover:text-black dark:group-hover:text-neutral-200 transition-colors">
                            {s.name}
                          </h3>
                          {s.verified && (
                            <ShieldCheck className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{s.tagline}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex items-center text-amber-500 text-xs font-bold gap-1">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span className="text-neutral-900 dark:text-white">{Number(s.rating).toFixed(2)}</span>
                      </div>
                      <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                        ({s.review_count} verified reviews)
                      </span>
                      <span className="text-[11px] text-neutral-300 dark:text-neutral-700">•</span>
                      <span className="text-[11px] text-neutral-600 dark:text-neutral-400 font-medium">
                        {s.completed_repairs_count}+ repairs
                      </span>
                    </div>

                    <div className="bg-neutral-50 dark:bg-[#161616] p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-600 dark:text-neutral-300 space-y-1 mb-3">
                      <div className="flex justify-between">
                        <span>Turnaround:</span>
                        <span className="font-semibold text-neutral-900 dark:text-white">{s.turnaround_avg}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Warranty:</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">{s.warranty_standard}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {s.specialties.map((spec) => (
                        <span
                          key={spec}
                          className="text-[10px] font-medium capitalize px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 mt-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-neutral-400" />
                      {s.city}
                    </span>
                    <span className="text-black dark:text-white font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 text-[11px]">
                      View Profile <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'warranty' && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-neutral-100 dark:bg-[#141414] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                FixCraft 90-Day Minimum Warranty Protection
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed mt-1">
                Every repair completed and funded via FixCraft escrow includes mandatory warranty coverage on parts and labor. If the issue returns within the warranty window, workshops must inspect and restore hardware at zero additional cost.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-2xs space-y-5">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
              File a Warranty Service Claim
            </h3>

            {completedEligibleForWarranty.length === 0 ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                You have no completed repairs on record yet. Warranty claims can only be filed once a repair is marked completed.
              </p>
            ) : (
              <form onSubmit={handleWarrantySubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Select Completed Repair *
                  </label>
                  <select
                    required
                    value={warrantyRequestId}
                    onChange={(e) => setWarrantyRequestId(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none"
                  >
                    <option value="">-- Choose repair ticket --</option>
                    {completedEligibleForWarranty.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.device_brand} {r.device_model} â€” {r.issue_title} ({r.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Detailed Failure Issue *
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Describe the recurring defect, battery depletion, or display issue..."
                    value={warrantyIssue}
                    onChange={(e) => setWarrantyIssue(e.target.value)}
                    className="w-full p-3 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingWarranty}
                  className="px-5 py-2.5 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-xl transition-colors shadow-xs disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmittingWarranty && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Submit Warranty Claim
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {ticketToCancel && (
        <Modal
          isOpen={Boolean(ticketToCancel)}
          onClose={() => !cancellingTicketId && setTicketToCancel(null)}
          title="Cancel Repair Request"
          subtitle={`Ticket #${ticketToCancel.id}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Are you sure you want to cancel the repair request for{' '}
              <span className="font-bold text-neutral-900 dark:text-white">
                {ticketToCancel.device_brand} {ticketToCancel.device_model}
              </span>
              ? Any pending workshop quotes will be dismissed. This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                disabled={Boolean(cancellingTicketId)}
                onClick={() => setTicketToCancel(null)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
              >
                Keep Ticket
              </button>
              <button
                type="button"
                disabled={Boolean(cancellingTicketId)}
                onClick={handleConfirmCancel}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {cancellingTicketId && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
