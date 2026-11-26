import React, { useState, useEffect } from 'react';
import { api } from '../../services/client';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../common/Modal';
import { RepairShop, Review } from '../../types';
import {
  ShieldCheck,
  Star,
  MapPin,
  Clock,
  Shield,
  Award,
  Users,
  CheckCircle2,
  Loader2,
  Store,
  User,
} from 'lucide-react';

// Props interface for public workshop profile modal
interface ShopPublicModalProps {
  shopId: string | null;
  onClose: () => void;
}

// Modal dialog rendering detailed workshop profile, verified reviews, certifications, and bench metrics
export const ShopPublicModal: React.FC<ShopPublicModalProps> = ({ shopId, onClose }) => {
  const { showToast } = useToast();
  const [shop, setShop] = useState<(RepairShop & { reviews: Review[] }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!shopId) return;
    setIsLoading(true);
    api.shared
      .getShopPublicProfile(shopId)
      .then((data) => setShop(data))
      .catch((err) => showToast(err.message || 'Failed to fetch workshop profile', 'error'))
      .finally(() => setIsLoading(false));
  }, [shopId, showToast]);

  if (!shopId) return null;

  return (
    <Modal
      isOpen={Boolean(shopId)}
      onClose={onClose}
      title={shop ? shop.name : 'Loading Workshop...'}
      subtitle={shop ? shop.tagline || 'Certified Hardware Restoration Facility' : undefined}
      maxWidth="3xl"
    >
      {isLoading || !shop ? (
        <div className="py-16 text-center text-neutral-500 dark:text-neutral-400 flex flex-col items-center">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-900 dark:text-white mb-2" />
          <p className="text-xs">Loading workshop credentials & customer reviews...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Banner & Logo */}
          <div className="relative rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
            <div className="h-40 bg-neutral-950 w-full overflow-hidden relative">
              {shop.banner_image ? (
                <img
                  src={shop.banner_image}
                  alt={shop.name}
                  className="w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-r from-neutral-900 via-neutral-800 to-black flex items-center justify-center">
                  <span className="text-[11px] font-mono tracking-widest text-neutral-400 uppercase">
                    Hardware Restoration Facility
                  </span>
                </div>
              )}
            </div>

            <div className="p-4 bg-white dark:bg-[#111111] flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-10 relative">
              <div className="flex items-end gap-3.5">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white dark:border-[#1e1e1e] shadow-md bg-white dark:bg-[#161616] shrink-0 flex items-center justify-center">
                  {shop.logo ? (
                    <img
                      src={shop.logo}
                      alt={shop.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold font-mono text-base">
                      {shop.name ? shop.name.substring(0, 2).toUpperCase() : 'FX'}
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-neutral-900 dark:text-white">{shop.name}</h3>
                    {Boolean(shop.verified) && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full border border-neutral-200 dark:border-neutral-700">
                        <ShieldCheck className="w-3.5 h-3.5 text-neutral-900 dark:text-white" />
                        Platform Verified
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                    {shop.address}, {shop.city}
                  </p>
                </div>
              </div>

              {/* Rating summary */}
              <div className="flex items-center gap-2 bg-neutral-50 dark:bg-[#161616] p-2 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
                <div className="flex text-amber-500">
                  <Star className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <div className="text-xs font-bold text-neutral-900 dark:text-white leading-none">
                    {Number(shop.rating || 5.0).toFixed(2)} / 5.0
                  </div>
                  <span className="text-[10px] text-neutral-500">
                    {shop.review_count || 0} verified reviews
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800">
              <span className="text-[10px] font-semibold text-neutral-500 uppercase">
                Completed Repairs
              </span>
              <p className="text-sm font-bold text-neutral-900 dark:text-white mt-0.5">
                {shop.completed_repairs_count || 0}+ jobs
              </p>
            </div>
            <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800">
              <span className="text-[10px] font-semibold text-neutral-500 uppercase">
                Avg. Turnaround
              </span>
              <p className="text-sm font-bold text-neutral-900 dark:text-white mt-0.5">
                {shop.turnaround_avg || '24-48 Hours'}
              </p>
            </div>
            <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800">
              <span className="text-[10px] font-semibold text-neutral-500 uppercase">
                Standard Warranty
              </span>
              <p className="text-sm font-bold text-neutral-900 dark:text-white mt-0.5">
                {shop.warranty_standard || '90 Days Guarantee'}
              </p>
            </div>
            <div className="bg-neutral-50 dark:bg-[#161616] p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800">
              <span className="text-[10px] font-semibold text-neutral-500 uppercase">
                Bench Staff
              </span>
              <p className="text-sm font-bold text-neutral-900 dark:text-white mt-0.5 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                {shop.active_tech_count || 1} Certified Techs
              </p>
            </div>
          </div>

          {/* About & Specialties */}
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider mb-1.5">
                About the Workshop
              </h4>
              <p className="text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
                {shop.description || 'Specialized diagnostic facility with calibrated soldering and schematic probing gear.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider mb-2">
                  Specialties
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {shop.specialties && shop.specialties.length > 0 ? (
                    shop.specialties.map((spec) => (
                      <span
                        key={spec}
                        className="text-xs font-semibold capitalize px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-[#161616] text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-800"
                      >
                        {spec}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-neutral-400">General Hardware Diagnostics</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider mb-2">
                  Certifications & Standards
                </h4>
                <div className="space-y-1.5">
                  {shop.certifications && shop.certifications.length > 0 ? (
                    shop.certifications.map((cert, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 font-medium"
                      >
                        <Award className="w-3.5 h-3.5 text-neutral-900 dark:text-white shrink-0" />
                        <span>{cert}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-neutral-400">Standard Bench ESD Protocol</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Verified Customer Reviews */}
          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider mb-3">
              Verified Client Reviews ({shop.reviews ? shop.reviews.length : 0})
            </h4>

            {!shop.reviews || shop.reviews.length === 0 ? (
              <p className="text-xs text-neutral-400 dark:text-neutral-500 py-4 text-center">
                No customer reviews submitted yet.
              </p>
            ) : (
              <div className="space-y-3">
                {shop.reviews.map((rev) => {
                  const isVerifiedPurchase = Boolean(rev.verified_purchase || rev.verifiedPurchase);
                  return (
                    <div
                      key={rev.id}
                      className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-[#141414] space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-neutral-900 dark:text-white">
                              {rev.customer_name || 'Verified Customer'}
                            </span>
                            {isVerifiedPurchase && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700">
                                <CheckCircle2 className="w-3 h-3 text-neutral-900 dark:text-white" />
                                Verified Handover
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-neutral-500">
                            Restored: {rev.device_repaired || 'Device'} • Escrow Cost: ${Number(rev.repair_cost || 0).toFixed(2)}
                          </span>
                        </div>

                        <div className="flex text-amber-500">
                          {Array.from({ length: 5 }).map((_, idx) => (
                            <Star
                              key={idx}
                              className={`w-3.5 h-3.5 ${
                                idx < rev.rating ? 'fill-current' : 'text-neutral-300 dark:text-neutral-700'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <p className="text-xs text-neutral-700 dark:text-neutral-300 italic leading-relaxed">
                        "{rev.comment}"
                      </p>

                      {rev.tags && rev.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {rev.tags.map((t, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white dark:bg-[#1e1e1e] border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
