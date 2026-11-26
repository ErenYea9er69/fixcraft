// Categorization for devices supported across the repair marketplace
export type DeviceCategory = 'phone' | 'laptop' | 'appliance' | 'audio' | 'gaming' | 'other';

// Urgency levels for customer repair intake requests
export type RequestUrgency = 'urgent' | 'standard' | 'flexible';

// Service fulfillment methods for handling customer hardware
export type ServicePreference = 'dropoff' | 'mailin' | 'onsite';

// Sequential workflow lifecycle stages for hardware repair tickets
export type RepairStatus =
  | 'open'
  | 'quote_accepted'
  | 'in_shop'
  | 'diagnosing'
  | 'in_repair'
  | 'quality_check'
  | 'ready_for_pickup'
  | 'completed'
  | 'disputed'
  | 'cancelled';

// Financial holding and settlement statuses for platform escrow ledger
export type EscrowStatus =
  | 'held_in_escrow'
  | 'released_to_shop'
  | 'refunded_to_customer'
  | 'split_payout'
  | 'disputed_frozen';

// Final arbitration settlement decisions for ticket disputes
export type DisputeResolution =
  | 'pending'
  | 'refund_customer'
  | 'release_to_shop'
  | 'split_payout';

// Resolution lifecycle states for customer post-repair warranty claims
export type WarrantyClaimStatus =
  | 'submitted'
  | 'under_review'
  | 'repair_scheduled'
  | 'resolved'
  | 'rejected';

// Role-based access control roles across marketplace actors
export type UserRole = 'customer' | 'shop' | 'admin';

// Quality classification standards for replacement hardware components
export type PartsQuality =
  | 'OEM Genuine'
  | 'Refurbished Original'
  | 'Tier-1 Certified Aftermarket'
  | 'OEM Equivalent'
  | 'Aftermarket High-Quality';

// Core user account profile data shape
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string | null;
  phone?: string | null;
  is_active?: number;
  token_version?: number;
  created_at?: string;
  updated_at?: string;
}

// Notification preferences and interface settings for an authenticated user
export interface UserSettings {
  user_id: string;
  notify_email: number;
  notify_sms: number;
  theme_preference: 'light' | 'dark' | 'system';
  default_address?: string | null;
  default_city?: string | null;
  updated_at?: string;
}

// Registered repair workshop profile, metrics, specialties, and bench standards
export interface RepairShop {
  id: string;
  user_id?: string;
  name: string;
  tagline?: string | null;
  logo?: string | null;
  banner_image?: string | null;
  address: string;
  city: string;
  phone: string;
  email: string;
  verified: boolean | number;
  specialties: DeviceCategory[];
  rating: number;
  review_count: number;
  completed_repairs_count: number;
  turnaround_avg: string;
  warranty_standard: string;
  description?: string | null;
  certifications: string[];
  active_tech_count: number;
  operating_hours?: string;
  created_at?: string;
  updated_at?: string;
  reviews?: Review[];
}

// Sequential milestone log event recorded along the ticket repair process
export interface TimelineEvent {
  id: string;
  request_id: string;
  status: string;
  title: string;
  description: string;
  technician_notes?: string | null;
  photo_proof?: string | null;
  completed: number | boolean;
  created_at: string;
}

// Binding repair quote submitted by a workshop for an open intake request
export interface Quote {
  id: string;
  request_id: string;
  shop_id: string;
  parts_cost: number;
  labor_cost: number;
  diagnostic_fee: number;
  diagnostic_fee_waived: number | boolean;
  total_cost: number;
  parts_quality: PartsQuality;
  estimated_turnaround?: string;
  estimatedTurnaround?: string;
  turnaround_days: number;
  warranty_months: number;
  warranty_details?: string | null;
  technician_notes?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  created_at: string;
  shop_name?: string;
  shop_logo?: string;
  shop_rating?: number;
}

// Escrow transaction record tracking locked funds, payouts, and customer refunds
export interface EscrowRecord {
  id: string;
  request_id: string;
  customer_id: string;
  shop_id: string;
  subtotal: number;
  platform_fee: number;
  total_amount: number;
  customer_refund_amount: number;
  shop_payout_amount: number;
  status: EscrowStatus;
  created_at: string;
  released_at?: string | null;
  device_brand?: string;
  device_model?: string;
  issue_title?: string;
  shop_name?: string;
  customer_name?: string;
}

// Customer rating, feedback comment, and tags for a completed repair ticket
export interface Review {
  id: string;
  request_id: string;
  shop_id: string;
  customer_id: string;
  rating: number;
  repair_speed_rating?: number;
  communication_rating?: number;
  quality_rating?: number;
  comment: string;
  device_repaired: string;
  repair_cost: number;
  tags: string[];
  verified_purchase?: number | boolean;
  verifiedPurchase?: boolean;
  created_at: string;
  customer_name?: string;
  customer_avatar?: string;
  shop_name?: string;
}

// Comprehensive hardware diagnostic and repair request ticket data shape
export interface RepairRequest {
  id: string;
  customer_id: string;
  device_category: DeviceCategory;
  device_brand: string;
  device_model: string;
  serial_number?: string | null;
  device_year?: string | null;
  issue_category: string;
  issue_title: string;
  description: string;
  photos: string[];
  urgency: RequestUrgency;
  preferred_service: ServicePreference;
  location: string;
  status: RepairStatus;
  accepted_quote_id?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string;
  timeline?: TimelineEvent[];
  quotes?: Quote[];
  review?: Review | null;
  escrow?: EscrowRecord | null;
  dispute?: Dispute | null;
  customer_name?: string;
  total_cost?: number;
  estimated_turnaround?: string;
  warranty_months?: number;
  escrow_status?: EscrowStatus;
  escrow_amount?: number;
}

// Direct messaging communication entry between customer, workshop, or admin
export interface ChatMessage {
  id: string;
  request_id: string;
  sender_id: string;
  recipient_id?: string | null;
  content: string;
  attachments: string[];
  created_at: string;
  sender_name?: string;
  sender_role?: UserRole;
  sender_avatar?: string;
}

// Formal dispute case filed against escrow funds with arbitration details
export interface Dispute {
  id: string;
  request_id: string;
  escrow_id: string;
  opened_by_user_id: string;
  reason: string;
  customer_statement: string;
  shop_statement?: string | null;
  admin_notes?: string | null;
  resolution_customer_amount: number;
  resolution_shop_amount: number;
  resolution: DisputeResolution;
  created_at: string;
  resolved_at?: string | null;
  device_brand?: string;
  device_model?: string;
  issue_title?: string;
  total_amount?: number;
  shop_name?: string;
  customer_name?: string;
}

// Post-repair warranty claim submitted during the active warranty coverage window
export interface WarrantyClaim {
  id: string;
  request_id: string;
  shop_id: string;
  customer_id: string;
  claim_issue: string;
  status: WarrantyClaimStatus;
  shop_response?: string | null;
  warranty_expiry_date: string;
  created_at: string;
  resolved_at?: string | null;
  device_brand?: string;
  device_model?: string;
  customer_name?: string;
}

// System notification alert sent to an authenticated user
export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  link_url?: string | null;
  is_read: number;
  isRead?: boolean;
  created_at: string;
}

// Platform-wide operational, financial, and volume metrics for administrators
export interface AdminMetrics {
  totalUsers: number;
  totalShops: number;
  totalRequests: number;
  activeRepairs: number;
  escrowHeldTotal: number;
  escrowReleasedTotal: number;
  escrowRefundedTotal: number;
  openDisputesCount: number;
  pendingShopsCount: number;
}

// Immutable security and operational audit trail entry
export interface AuditLog {
  id: string;
  user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: string;
  created_at: string;
}

// Pre-seeded development test account descriptor
export interface DemoAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  shop_id?: string;
  shop_name?: string;
}

// Payload shape for modifying workshop profile details and bench capacity
export interface ShopProfileUpdateRequest {
  name?: string;
  tagline?: string;
  logo?: string;
  bannerImage?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  specialties?: DeviceCategory[];
  turnaroundAvg?: string;
  warrantyStandard?: string;
  activeTechCount?: number;
  operatingHours?: string;
  description?: string;
}
