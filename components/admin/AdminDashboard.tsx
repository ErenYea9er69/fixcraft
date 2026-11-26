import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { StatusBadge } from '../common/StatusBadge';
import { StatsSkeleton, TableSkeleton } from '../common/LoadingSkeleton';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../common/Modal';
import {
  AdminMetrics,
  Dispute,
  RepairShop,
  EscrowRecord,
  User,
  AuditLog,
} from '../../types';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  DollarSign,
  Scale,
  Users,
  History,
  Building,
  TrendingUp,
  AlertTriangle,
  Check,
  X,
  Lock,
  ArrowRight,
  Eye,
} from 'lucide-react';

interface AdminDashboardProps {
  onOpenTicket: (requestId: string) => void;
  onOpenShopProfile: (shopId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onOpenTicket,
  onOpenShopProfile,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'metrics' | 'disputes' | 'verifications' | 'escrow' | 'users' | 'audit'>('metrics');

  // Metrics
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  // Disputes
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [isLoadingDisputes, setIsLoadingDisputes] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [arbitrationResolution, setArbitrationResolution] = useState<'refund_customer' | 'release_to_shop' | 'split_payout'>('split_payout');
  const [customerRefundInput, setCustomerRefundInput] = useState('');
  const [shopPayoutInput, setShopPayoutInput] = useState('');
  const [arbitrationAdminNotes, setArbitrationAdminNotes] = useState('');
  const [isResolvingDispute, setIsResolvingDispute] = useState(false);

  // Pending Workshops
  const [pendingShops, setPendingShops] = useState<RepairShop[]>([]);
  const [isLoadingPendingShops, setIsLoadingPendingShops] = useState(false);

  // Escrow Ledger
  const [escrowLedger, setEscrowLedger] = useState<EscrowRecord[]>([]);
  const [isLoadingEscrow, setIsLoadingEscrow] = useState(false);

  // Users
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const fetchMetrics = useCallback(async () => {
    setIsLoadingMetrics(true);
    setMetricsError(null);
    try {
      const data = await api.admin.getMetrics();
      setMetrics(data);
    } catch (err: any) {
      const msg = err.message || 'Failed to fetch admin metrics';
      setMetricsError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [showToast]);

  const fetchDisputes = useCallback(async () => {
    setIsLoadingDisputes(true);
    try {
      const data = await api.admin.getDisputes();
      setDisputes(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch disputes', 'error');
    } finally {
      setIsLoadingDisputes(false);
    }
  }, [showToast]);

  const fetchPendingShops = useCallback(async () => {
    setIsLoadingPendingShops(true);
    try {
      const data = await api.admin.getPendingShops();
      setPendingShops(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch pending shops', 'error');
    } finally {
      setIsLoadingPendingShops(false);
    }
  }, [showToast]);

  const fetchEscrowLedger = useCallback(async () => {
    setIsLoadingEscrow(true);
    try {
      const data = await api.admin.getEscrowLedger();
      setEscrowLedger(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch escrow ledger', 'error');
    } finally {
      setIsLoadingEscrow(false);
    }
  }, [showToast]);

  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const data = await api.admin.getUsers();
      setUsersList(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch user list', 'error');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [showToast]);

  const fetchAuditLogs = useCallback(async () => {
    setIsLoadingAudit(true);
    try {
      const data = await api.admin.getAuditLogs();
      setAuditLogs(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch audit logs', 'error');
    } finally {
      setIsLoadingAudit(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchMetrics();
    fetchDisputes();
  }, [fetchMetrics, fetchDisputes]);

  useEffect(() => {
    if (activeTab === 'verifications') fetchPendingShops();
    if (activeTab === 'escrow') fetchEscrowLedger();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab, fetchPendingShops, fetchEscrowLedger, fetchUsers, fetchAuditLogs]);

  // Handle Shop Verification
  const handleVerifyShop = async (shopId: string, verified: boolean) => {
    try {
      await api.admin.verifyShop(shopId, verified);
      showToast(verified ? 'Workshop approved and verified!' : 'Workshop verification rejected.', 'info');
      fetchPendingShops();
      fetchMetrics();
    } catch (err: any) {
      showToast(err.message || 'Verification update failed', 'error');
    }
  };

  // Handle User Status toggle
  const handleToggleUserStatus = async (userId: string, currentIsActive: boolean) => {
    const newStatus = !currentIsActive;
    try {
      await api.admin.setUserStatus(userId, newStatus);
      showToast(`User account ${newStatus ? 'activated' : 'suspended'}.`, 'info');
      fetchUsers();
    } catch (err: any) {
      showToast(err.message || 'Status update failed', 'error');
    }
  };

  // Open Arbitration
  const handleOpenArbitration = (d: Dispute) => {
    setSelectedDispute(d);
    setArbitrationResolution('split_payout');
    const total = parseFloat(d.total_amount as any) || 0;
    const totalCents = Math.round(total * 100);
    const custCents = Math.floor(totalCents / 2);
    const shopCents = totalCents - custCents;
    setCustomerRefundInput((custCents / 100).toFixed(2));
    setShopPayoutInput((shopCents / 100).toFixed(2));
    setArbitrationAdminNotes('');
  };

  // Submit Arbitration Ruling
  const handleResolveDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute) return;

    const total = parseFloat(selectedDispute.total_amount as any) || 0;
    const totalCents = Math.round(total * 100);
    let customerAmount: number | undefined;
    let shopAmount: number | undefined;

    if (arbitrationResolution === 'refund_customer') {
      customerAmount = total;
      shopAmount = 0;
    } else if (arbitrationResolution === 'release_to_shop') {
      customerAmount = 0;
      shopAmount = total;
    } else {
      const custCents = Math.round((parseFloat(customerRefundInput) || 0) * 100);
      const shopCents = Math.round((parseFloat(shopPayoutInput) || 0) * 100);
      if (custCents + shopCents !== totalCents) {
        showToast(
          `Split amounts ($${(custCents / 100).toFixed(2)} + $${(shopCents / 100).toFixed(2)}) must sum exactly to total escrow ($${(totalCents / 100).toFixed(2)})`,
          'warning'
        );
        return;
      }
      customerAmount = custCents / 100;
      shopAmount = shopCents / 100;
    }

    setIsResolvingDispute(true);
    try {
      await api.admin.resolveDispute(selectedDispute.id, {
        resolution: arbitrationResolution,
        customerRefundAmount: customerAmount,
        shopPayoutAmount: shopAmount,
        adminNotes: arbitrationAdminNotes || 'Arbitration settled by operations administrator.',
      });

      showToast(`Dispute arbitrated successfully: ${arbitrationResolution}`, 'success');
      setSelectedDispute(null);
      fetchDisputes();
      fetchMetrics();
    } catch (err: any) {
      showToast(err.message || 'Arbitration ruling failed', 'error');
    } finally {
      setIsResolvingDispute(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Admin Operations Banner */}
      <div className="bg-black dark:bg-[#0c0c0c] rounded-2xl border border-neutral-800 p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-neutral-800 text-white border border-neutral-700">
              Operations Desk
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
            Marketplace Operations & Escrow Arbitration
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1 max-w-2xl">
            Audit escrow holds, arbitrate disputed bench tickets atomically, verify local workshops, and monitor user integrity.
          </p>
        </div>

        {metrics && (
          <div className="flex items-center gap-3">
            <div className="bg-neutral-900 dark:bg-[#141414] p-3 rounded-xl border border-neutral-800 text-right">
              <span className="text-[10px] font-semibold text-neutral-400 uppercase">
                Active Escrow Hold
              </span>
              <div className="text-lg font-mono font-bold text-emerald-400">
                ${Number(metrics.escrowHeldTotal).toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Metric Cards Grid */}
      {isLoadingMetrics && !metrics ? (
        <StatsSkeleton />
      ) : metrics ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#111111] p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-semibold uppercase">Escrow Held</span>
              <Shield className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">
              ${Number(metrics.escrowHeldTotal).toFixed(2)}
            </div>
            <span className="text-[10px] text-neutral-500">Currently protected in local ledger</span>
          </div>

          <div className="bg-white dark:bg-[#111111] p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-semibold uppercase">Released to Shops</span>
              <DollarSign className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">
              ${Number(metrics.escrowReleasedTotal).toFixed(2)}
            </div>
            <span className="text-[10px] text-neutral-500">Approved customer payouts</span>
          </div>

          <div className="bg-white dark:bg-[#111111] p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-semibold uppercase">Open Disputes</span>
              <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
            </div>
            <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
              {metrics.openDisputesCount}
            </div>
            <span className="text-[10px] text-neutral-500">Require arbitration decision</span>
          </div>

          <div className="bg-white dark:bg-[#111111] p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-[11px] font-semibold uppercase">Pending Workshops</span>
              <Building className="w-4 h-4 text-sky-500 dark:text-sky-400" />
            </div>
            <div className="text-lg font-bold text-sky-600 dark:text-sky-400">
              {metrics.pendingShopsCount}
            </div>
            <span className="text-[10px] text-neutral-500">Awaiting badge verification</span>
          </div>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 gap-1 sm:gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('metrics')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'metrics'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Pulse & Analytics
        </button>
        <button
          onClick={() => setActiveTab('disputes')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'disputes'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <Scale className="w-4 h-4" />
          Dispute Arbitration Desk ({disputes.length})
        </button>
        <button
          onClick={() => setActiveTab('verifications')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'verifications'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Workshop Verifications ({pendingShops.length})
        </button>
        <button
          onClick={() => setActiveTab('escrow')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'escrow'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <Lock className="w-4 h-4" />
          Escrow Ledger & Treasury
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'users'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          User Management
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeTab === 'audit'
              ? 'border-black dark:border-white text-black dark:text-white'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          Audit Log
        </button>
      </div>

      {/* TAB 1: METRICS SUMMARY */}
      {activeTab === 'metrics' && (
        <div className="space-y-4">
          {metricsError && (
            <div className="p-4 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-neutral-800 dark:text-neutral-200">
                <AlertTriangle className="w-4 h-4 text-neutral-700 dark:text-neutral-300 shrink-0" />
                <span>Failed to load latest metrics: {metricsError}</span>
              </div>
              <button
                type="button"
                onClick={fetchMetrics}
                className="px-3.5 py-1.5 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black rounded-lg text-xs font-semibold min-h-[36px] transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {isLoadingMetrics ? (
            <TableSkeleton rows={4} />
          ) : metrics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                  Marketplace Capital & Escrow Integrity
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-[#161616] border border-neutral-200/80 dark:border-neutral-800 text-xs">
                    <span className="text-neutral-600 dark:text-neutral-400">Total Escrow Capital Held:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      ${Number(metrics.escrowHeldTotal).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-[#161616] border border-neutral-200/80 dark:border-neutral-800 text-xs">
                    <span className="text-neutral-600 dark:text-neutral-400">Total Capital Successfully Released to Labs:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      ${Number(metrics.escrowReleasedTotal).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-[#161616] border border-neutral-200/80 dark:border-neutral-800 text-xs">
                    <span className="text-neutral-600 dark:text-neutral-400">Total Customer Dispute Refunds Disbursed:</span>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                      ${Number(metrics.escrowRefundedTotal).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                  Workload & Workshop Capacity
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-[#161616] border border-neutral-200/80 dark:border-neutral-800 text-xs">
                    <span className="text-neutral-600 dark:text-neutral-400">Total Diagnostic Tickets Published:</span>
                    <span className="font-bold text-neutral-900 dark:text-white">{metrics.totalRequests}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-[#161616] border border-neutral-200/80 dark:border-neutral-800 text-xs">
                    <span className="text-neutral-600 dark:text-neutral-400">Active Hardware Restorations on Workbench:</span>
                    <span className="font-bold text-neutral-900 dark:text-white">{metrics.activeRepairs}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-[#161616] border border-neutral-200/80 dark:border-neutral-800 text-xs">
                    <span className="text-neutral-600 dark:text-neutral-400">Registered Diagnostic Workshops:</span>
                    <span className="font-bold text-neutral-900 dark:text-white">{metrics.totalShops}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-[#161616] border border-neutral-200/80 dark:border-neutral-800 text-xs">
                    <span className="text-neutral-600 dark:text-neutral-400">Registered Accounts (Customers + Workshops):</span>
                    <span className="font-bold text-neutral-900 dark:text-white">{metrics.totalUsers}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 2: DISPUTES ARBITRATION DESK */}
      {activeTab === 'disputes' && (
        <div className="space-y-4">
          {isLoadingDisputes ? (
            <TableSkeleton rows={3} />
          ) : disputes.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="No Disputes Pending Arbitration"
              description="No active customer complaints or frozen escrow funds require operations intervention."
            />
          ) : (
            <div className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-neutral-50 dark:bg-[#161616] text-neutral-500 dark:text-neutral-400 uppercase text-[10px] font-semibold border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="p-4">Dispute / Device</th>
                      <th className="p-4">Parties Involved</th>
                      <th className="p-4">Customer Statement</th>
                      <th className="p-4">Escrow Total</th>
                      <th className="p-4">Resolution</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300">
                    {disputes.map((d) => (
                      <tr key={d.id} className="hover:bg-neutral-50/50 dark:hover:bg-[#161616]/50">
                        <td className="p-4">
                          <div className="font-bold text-neutral-900 dark:text-white">
                            {d.device_brand} {d.device_model}
                          </div>
                          <span className="text-[11px] text-neutral-500 font-mono">{d.id}</span>
                        </td>
                        <td className="p-4">
                          <div className="text-neutral-900 dark:text-white font-semibold">{d.customer_name}</div>
                          <div className="text-neutral-500 text-[11px]">{d.shop_name}</div>
                        </td>
                        <td className="p-4 max-w-xs truncate" title={d.customer_statement}>
                          {d.customer_statement}
                        </td>
                        <td className="p-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          ${Number(d.total_amount).toFixed(2)}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${
                              d.resolution === 'pending'
                                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/60'
                                : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800'
                            }`}
                          >
                            {d.resolution}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {d.resolution === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => handleOpenArbitration(d)}
                              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors min-h-[36px]"
                            >
                              Arbitrate Escrow
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenTicket(d.request_id)}
                              className="px-3 py-1 bg-neutral-100 dark:bg-[#161616] hover:bg-neutral-200 dark:hover:bg-[#202020] text-neutral-800 dark:text-neutral-200 rounded font-semibold text-xs border border-neutral-200 dark:border-neutral-800 min-h-[36px]"
                            >
                              Inspect
                            </button>
                          )}
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

      {/* TAB 3: WORKSHOP VERIFICATIONS */}
      {activeTab === 'verifications' && (
        <div className="space-y-4">
          {isLoadingPendingShops ? (
            <TableSkeleton rows={2} />
          ) : pendingShops.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="All Registered Workshops Verified"
              description="No newly registered laboratories are currently queued for verification audit."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingShops.map((s) => (
                <div
                  key={s.id}
                  className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900 dark:text-white">{s.name}</h3>
                      <p className="text-xs text-neutral-500">{s.address}, {s.city}</p>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700">
                      Unverified
                    </span>
                  </div>

                  <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2">{s.description}</p>

                  <div className="flex flex-wrap gap-1">
                    {s.specialties.map((spec) => (
                      <span
                        key={spec}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#161616] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleVerifyShop(s.id, false)}
                      className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#161616] rounded-lg font-medium"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVerifyShop(s.id, true)}
                      className="px-4 py-1.5 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg shadow-xs flex items-center gap-1 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve Verification
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ESCROW LEDGER */}
      {activeTab === 'escrow' && (
        <div className="space-y-4">
          {isLoadingEscrow ? (
            <TableSkeleton rows={5} />
          ) : escrowLedger.length === 0 ? (
            <EmptyState
              icon={Lock}
              title="No Escrow Ledger Records"
              description="No active capital holds or transactions currently in escrow."
            />
          ) : (
            <div className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[750px]">
                  <thead className="bg-neutral-50 dark:bg-[#161616] text-neutral-500 dark:text-neutral-400 uppercase text-[10px] font-semibold border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="p-4">Ledger ID</th>
                      <th className="p-4">Customer & Workshop</th>
                      <th className="p-4">Device Details</th>
                      <th className="p-4">Subtotal / Fee</th>
                      <th className="p-4">Total Amount</th>
                      <th className="p-4">Escrow Status</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300">
                    {escrowLedger.map((e) => (
                      <tr key={e.id} className="hover:bg-neutral-50/50 dark:hover:bg-[#161616]/50">
                        <td className="p-4 font-mono text-[11px] text-neutral-500">{e.id}</td>
                        <td className="p-4">
                          <div className="font-bold text-neutral-900 dark:text-white">{e.customer_name}</div>
                          <div className="text-neutral-500 text-[11px]">{e.shop_name}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-neutral-900 dark:text-neutral-200">{e.device_brand} {e.device_model}</div>
                          <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{e.issue_title}</span>
                        </td>
                        <td className="p-4 font-mono text-[11px]">
                          ${Number(e.subtotal).toFixed(2)} + ${Number(e.platform_fee).toFixed(2)}
                        </td>
                        <td className="p-4 font-mono">
                          <div className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                            ${Number(e.total_amount).toFixed(2)}
                          </div>
                          {(Number(e.shop_payout_amount) > 0 || Number(e.customer_refund_amount) > 0) && (
                            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 pt-0.5">
                              Lab: ${Number(e.shop_payout_amount || 0).toFixed(2)} | Cust: ${Number(e.customer_refund_amount || 0).toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <StatusBadge escrowStatus={e.status} />
                        </td>
                        <td className="p-4 text-right">
                          <button
                            type="button"
                            onClick={() => onOpenTicket(e.request_id)}
                            className="text-neutral-900 dark:text-white font-semibold hover:underline min-h-[36px] flex items-center justify-end ml-auto"
                          >
                            View Docket
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

      {/* TAB 5: USER MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {isLoadingUsers ? (
            <TableSkeleton rows={5} />
          ) : (
            <div className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-neutral-50 dark:bg-[#161616] text-neutral-500 dark:text-neutral-400 uppercase text-[10px] font-semibold border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="p-4">User</th>
                      <th className="p-4">Email Address</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Phone</th>
                      <th className="p-4">Account Status</th>
                      <th className="p-4 text-right">Access Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300">
                    {usersList.map((u) => {
                      const isActive = u.is_active !== 0;
                      return (
                        <tr key={u.id} className="hover:bg-neutral-50/50 dark:hover:bg-[#161616]/50">
                          <td className="p-4 font-bold text-neutral-900 dark:text-white">{u.name}</td>
                          <td className="p-4 text-neutral-600 dark:text-neutral-300">{u.email}</td>
                          <td className="p-4">
                            <span className="font-mono uppercase text-[10px] px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#161616] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 font-semibold">
                              {u.role}
                            </span>
                          </td>
                          <td className="p-4 text-neutral-500">{u.phone || 'N/A'}</td>
                          <td className="p-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                isActive
                                  ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white border-neutral-300 dark:border-neutral-700'
                                  : 'bg-neutral-200 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-500 border-neutral-300 dark:border-neutral-800 line-through'
                              }`}
                            >
                              {isActive ? 'Active' : 'Suspended'}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            {u.id !== user?.id && (
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(u.id, isActive)}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors min-h-[36px] ${
                                  isActive
                                    ? 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#161616]'
                                    : 'text-neutral-900 dark:text-white font-bold hover:bg-neutral-100 dark:hover:bg-[#161616]'
                                }`}
                              >
                                {isActive ? 'Suspend' : 'Activate'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {isLoadingAudit ? (
            <TableSkeleton rows={4} />
          ) : auditLogs.length === 0 ? (
            <EmptyState
              icon={History}
              title="No Audit Records"
              description="System actions and ledger mutations will be timestamped here."
            />
          ) : (
            <div className="bg-white dark:bg-[#111111] rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[750px]">
                  <thead className="bg-neutral-50 dark:bg-[#161616] text-neutral-500 dark:text-neutral-400 uppercase text-[10px] font-semibold border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="p-4">Timestamp</th>
                      <th className="p-4">Action</th>
                      <th className="p-4">Actor</th>
                      <th className="p-4">Entity Type</th>
                      <th className="p-4">Entity ID</th>
                      <th className="p-4">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-neutral-50/50 dark:hover:bg-[#161616]/50">
                        <td className="p-4 text-neutral-400 dark:text-neutral-500 font-mono text-[11px]">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="p-4 font-bold text-neutral-900 dark:text-white">{log.action}</td>
                        <td className="p-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                          {log.user_id || 'System'}
                        </td>
                        <td className="p-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">{log.entity_type}</td>
                        <td className="p-4 font-mono text-[11px] text-neutral-500">{log.entity_id}</td>
                        <td className="p-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-300 max-w-xs truncate">
                          {log.metadata}
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

      {/* SUB-MODAL: DISPUTE ARBITRATION RESOLUTION */}
      {selectedDispute && (
        <Modal
          isOpen={Boolean(selectedDispute)}
          onClose={() => setSelectedDispute(null)}
          title={`Arbitrate Dispute: ${selectedDispute.device_brand} ${selectedDispute.device_model}`}
          subtitle="Reconcile frozen escrow ledger atomically between customer and laboratory."
          maxWidth="lg"
        >
          <form onSubmit={handleResolveDispute} className="space-y-4">
            <div className="bg-neutral-50 dark:bg-[#161616] p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs space-y-2">
              <div className="flex justify-between font-bold text-neutral-900 dark:text-white">
                <span>Total Escrow Held:</span>
                <span className="font-mono text-sm text-emerald-600 dark:text-emerald-400 font-bold">${Number(selectedDispute.total_amount).toFixed(2)}</span>
              </div>
              <p className="text-neutral-700 dark:text-neutral-300">
                <span className="font-semibold text-neutral-900 dark:text-white">Customer Statement: </span>
                {selectedDispute.customer_statement}
              </p>
              {selectedDispute.shop_statement && (
                <p className="text-neutral-700 dark:text-neutral-300 pt-1 border-t border-neutral-200 dark:border-neutral-800">
                  <span className="font-semibold text-neutral-900 dark:text-white">Workshop Defense: </span>
                  {selectedDispute.shop_statement}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Select Arbitration Ruling
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setArbitrationResolution('refund_customer')}
                  className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                    arbitrationResolution === 'refund_customer'
                      ? 'border-rose-500 bg-rose-600 text-white shadow-xs font-bold'
                      : 'border-neutral-200 dark:border-neutral-800 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:border-rose-400 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  100% Refund Customer
                </button>
                <button
                  type="button"
                  onClick={() => setArbitrationResolution('release_to_shop')}
                  className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                    arbitrationResolution === 'release_to_shop'
                      ? 'border-emerald-500 bg-emerald-600 text-white shadow-xs font-bold'
                      : 'border-neutral-200 dark:border-neutral-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-400 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  100% Release Lab
                </button>
                <button
                  type="button"
                  onClick={() => setArbitrationResolution('split_payout')}
                  className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                    arbitrationResolution === 'split_payout'
                      ? 'border-sky-500 bg-sky-600 text-white shadow-xs font-bold'
                      : 'border-neutral-200 dark:border-neutral-800 hover:bg-sky-50 dark:hover:bg-sky-950/30 hover:border-sky-400 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  Arbitrated Split
                </button>
              </div>
            </div>

            {arbitrationResolution === 'split_payout' && (
              <div className="grid grid-cols-2 gap-4 bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs">
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Customer Refund Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={customerRefundInput}
                    onChange={(e) => setCustomerRefundInput(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-[#111111] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs font-mono font-bold text-neutral-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Workshop Payout Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={shopPayoutInput}
                    onChange={(e) => setShopPayoutInput(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-[#111111] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs font-mono font-bold text-neutral-900 dark:text-white"
                  />
                </div>

                <div className="col-span-2 text-[11px] text-neutral-500 flex justify-between">
                  <span>Sum of Split:</span>
                  <span
                    className={`font-mono font-bold ${
                      Number(customerRefundInput) + Number(shopPayoutInput) ===
                      Number(selectedDispute.total_amount)
                        ? 'text-neutral-900 dark:text-white'
                        : 'text-neutral-400'
                    }`}
                  >
                    ${(Number(customerRefundInput) + Number(shopPayoutInput)).toFixed(2)} / $
                    {Number(selectedDispute.total_amount).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Admin Arbiter Notes & Findings
              </label>
              <textarea
                required
                rows={3}
                value={arbitrationAdminNotes}
                onChange={(e) => setArbitrationAdminNotes(e.target.value)}
                className="w-full p-2.5 bg-neutral-50 dark:bg-[#161616] border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-[#111111] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setSelectedDispute(null)}
                className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#161616] rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isResolvingDispute}
                className="px-5 py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                {isResolvingDispute ? 'Reconciling Ledger...' : 'Enforce Arbitration Ruling'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
