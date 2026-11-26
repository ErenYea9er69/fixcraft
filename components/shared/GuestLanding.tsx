import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Award,
  Cpu,
  Wrench,
  AlertTriangle,
  Star,
  MapPin,
  Clock,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { api } from '../../services/client';
import { RepairShop } from '../../types';
import { useAuth } from '../../context/AuthContext';

// Props interface for unauthenticated guest landing view
interface GuestLandingProps {
  onOpenShopProfile: (shopId: string) => void;
}

const SPECIALTY_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Phone', value: 'phone' },
  { label: 'Laptop', value: 'laptop' },
  { label: 'Appliance', value: 'appliance' },
  { label: 'Audio', value: 'audio' },
  { label: 'Gaming', value: 'gaming' },
];

// Public landing view showcasing value proposition, platform assurances, and searchable workshop directory
export const GuestLanding: React.FC<GuestLandingProps> = ({ onOpenShopProfile }) => {
  const { openAuthModal } = useAuth();

  const [healthStatus, setHealthStatus] = useState<'ok' | 'degraded' | 'loading'>('loading');
  const [shops, setShops] = useState<RepairShop[]>([]);
  const [loadingShops, setLoadingShops] = useState<boolean>(true);
  const [shopError, setShopError] = useState<string | null>(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('all');

  useEffect(() => {
    let isMounted = true;
    api.health
      .getHealth()
      .then((res) => {
        if (isMounted) setHealthStatus(res.status);
      })
      .catch(() => {
        if (isMounted) setHealthStatus('degraded');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Loads verified workshops matching the selected device specialty filter
  const loadShops = useCallback(async (specialty: string) => {
    setLoadingShops(true);
    setShopError(null);
    try {
      const data = await api.shared.getShopsDirectory(
        specialty === 'all' ? undefined : specialty
      );
      setShops(data);
    } catch (err: any) {
      setShopError(err?.message || 'Failed to load workshops. Please retry.');
    } finally {
      setLoadingShops(false);
    }
  }, []);

  useEffect(() => {
    loadShops(selectedSpecialty);
  }, [selectedSpecialty, loadShops]);

  return (
    <div className="space-y-12 pb-8">
      {/* System Health Degraded Warning Banner */}
      {healthStatus === 'degraded' && (
        <div className="flex items-center gap-3 p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            System Degraded: Database synchronization is currently impaired. Live requests may experience delays.
          </span>
        </div>
      )}

      {/* Hero & Banner Section */}
      <section className="bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 sm:p-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 text-[11px] font-mono uppercase tracking-wider mb-4 border border-neutral-200 dark:border-neutral-800">
            <Wrench className="w-3.5 h-3.5" />
            Hardware Diagnostics & Escrow Marketplace
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-white leading-tight mb-4">
            Fix Your Hardware with Guaranteed Escrow & Local Masters
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mb-8 leading-relaxed max-w-2xl">
            Find certified independent technicians for micro-soldering, appliance rehabilitation, audio restoration, and precision repair.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openAuthModal('register')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 cursor-pointer"
            >
              Sign In / Register
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 cursor-pointer"
            >
              Sign In to Account
            </button>
          </div>
        </div>
      </section>

      {/* Platform Assurances Grid (3 cards) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5">
          <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-900 dark:text-white mb-3">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-1.5">
            Escrow Protection
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            Funds held securely in platform escrow until customer inspects, tests, and signs off on completed repair.
          </p>
        </div>

        <div className="bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5">
          <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-900 dark:text-white mb-3">
            <Award className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-1.5">
            90-Day Minimum Warranty
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            Mandatory workshop warranty backed by platform mediation and guaranteed dispute resolution.
          </p>
        </div>

        <div className="bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5">
          <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-900 dark:text-white mb-3">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-1.5">
            Verified Technicians
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            Rigorous proof of bench qualifications, precision tools, and direct customer messaging.
          </p>
        </div>
      </section>

      {/* Public Workshop Directory */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Public Workshop Directory
            </h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
              Browse verified repair benches, warranty terms, and real completed repair records.
            </p>
          </div>

          {/* Specialty Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {SPECIALTY_FILTERS.map((filter) => {
              const active = selectedSpecialty === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setSelectedSpecialty(filter.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                    active
                      ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
                      : 'bg-white dark:bg-[#0a0a0a] text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white border border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Directory State Handling */}
        {loadingShops ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 space-y-4 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-3/4" />
                    <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-full" />
                <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-2/3" />
                <div className="h-8 bg-neutral-200 dark:bg-neutral-800 rounded w-full" />
              </div>
            ))}
          </div>
        ) : shopError ? (
          <div className="bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-800 rounded-xl p-8 text-center space-y-3">
            <p className="text-xs text-neutral-600 dark:text-neutral-400">{shopError}</p>
            <button
              type="button"
              onClick={() => loadShops(selectedSpecialty)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Fetch
            </button>
          </div>
        ) : shops.length === 0 ? (
          <div className="bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-800 rounded-xl p-10 text-center space-y-3">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">
              No certified workshops found
            </p>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              No verified repair shops match the specialty &ldquo;{selectedSpecialty}&rdquo; yet.
            </p>
            <button
              type="button"
              onClick={() => setSelectedSpecialty('all')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              View All Workshops
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shops.map((shop) => (
              <div
                key={shop.id}
                className="bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 flex flex-col justify-between hover:border-neutral-400 dark:hover:border-neutral-700 transition-colors"
              >
                <div>
                  {/* Shop Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      {shop.logo ? (
                        <img
                          src={shop.logo}
                          alt={shop.name}
                          className="w-10 h-10 rounded-lg object-cover border border-neutral-200 dark:border-neutral-800"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center font-bold text-neutral-900 dark:text-white text-xs">
                          {shop.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-bold text-neutral-900 dark:text-white line-clamp-1">
                            {shop.name}
                          </h3>
                        </div>
                        {shop.tagline && (
                          <p className="text-[11px] text-neutral-500 line-clamp-1">
                            {shop.tagline}
                          </p>
                        )}
                      </div>
                    </div>

                    {Boolean(shop.verified) && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-900 px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 shrink-0">
                        <CheckCircle2 className="w-3 h-3 text-neutral-900 dark:text-white" />
                        Verified
                      </span>
                    )}
                  </div>

                  {/* Rating & Completed Repairs */}
                  <div className="flex items-center gap-3 text-xs mb-3 pb-3 border-b border-neutral-100 dark:border-neutral-900">
                    <div className="flex items-center gap-1 font-semibold text-neutral-900 dark:text-white">
                      <Star className="w-3.5 h-3.5 fill-black text-black dark:fill-white dark:text-white" />
                      <span>{shop.rating ? shop.rating.toFixed(1) : '5.0'}</span>
                      <span className="text-neutral-500 font-normal">
                        ({shop.review_count || 0})
                      </span>
                    </div>
                    <span className="text-neutral-300 dark:text-neutral-700">•</span>
                    <span className="text-neutral-600 dark:text-neutral-400 font-medium">
                      {shop.completed_repairs_count || 0} repairs completed
                    </span>
                  </div>

                  {/* Details Meta */}
                  <div className="space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400 mb-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span className="line-clamp-1">{shop.city ? `${shop.city}, ${shop.address}` : shop.address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span>{shop.turnaround_avg || '2-3 days'} avg turnaround</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span>{shop.warranty_standard || '90-Day Standard Warranty'}</span>
                    </div>
                  </div>

                  {/* Specialties Pills */}
                  {Array.isArray(shop.specialties) && shop.specialties.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-5">
                      {shop.specialties.slice(0, 4).map((spec) => (
                        <span
                          key={spec}
                          className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* View Workshop Profile Action */}
                <button
                  type="button"
                  onClick={() => onOpenShopProfile(shop.id)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 text-xs font-semibold transition-colors mt-auto cursor-pointer"
                >
                  View Workshop Profile & Reviews
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default GuestLanding;
