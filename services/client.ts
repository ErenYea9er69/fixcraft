import {
  RepairRequest,
  Quote,
  RepairShop,
  Review,
  User,
  UserSettings,
  ChatMessage,
  EscrowRecord,
  Dispute,
  WarrantyClaim,
  AppNotification,
  AdminMetrics,
  AuditLog,
  DemoAccount,
  WarrantyClaimStatus,
  ShopProfileUpdateRequest,
} from '../types';

// Custom API error representing HTTP failure responses with tracking metadata
export class ApiError extends Error {
  status: number;
  requestId?: string | null;
  timestamp?: string | null;
  retryAfterSeconds?: number | null;
  details?: any;

  constructor(
    message: string,
    status: number,
    requestId?: string | null,
    timestamp?: string | null,
    retryAfterSeconds?: number | null,
    details?: any
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
    this.timestamp = timestamp;
    this.retryAfterSeconds = retryAfterSeconds;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

const API_BASE = (import.meta.env?.VITE_API_URL as string) || '/api';

// Generates a unique request correlation ID for tracking API calls
function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Retrieves the persisted JWT authentication token from browser local storage
export function getStoredToken(): string | null {
  return localStorage.getItem('fixcraft_token');
}

// Stores or removes the JWT authentication token in browser local storage
export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem('fixcraft_token', token);
  } else {
    localStorage.removeItem('fixcraft_token');
  }
}

// Centralized HTTP client wrapper executing authenticated JSON and FormData fetch requests
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const outgoingRequestId = headers.get('X-Request-Id') || generateRequestId();
  if (!headers.has('X-Request-Id')) {
    headers.set('X-Request-Id', outgoingRequestId);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (networkErr: any) {
    throw new ApiError(
      'Unable to connect to server. Please check your internet connection.',
      0,
      outgoingRequestId,
      new Date().toISOString(),
      null,
      networkErr
    );
  }

  if (!response.ok) {
    const requestId = response.headers.get('x-request-id') || outgoingRequestId;
    const retryAfterHeader = response.headers.get('retry-after');

    let errJson: any = null;
    try {
      errJson = await response.json();
    } catch {
      // Body is not valid JSON
    }

    const errorMsg = errJson?.error || response.statusText || 'Server error';

    let retryAfterSeconds: number | null = null;
    if (retryAfterHeader) {
      const parsed = parseInt(retryAfterHeader, 10);
      if (!isNaN(parsed)) retryAfterSeconds = parsed;
    } else if (typeof errJson?.retryAfterSeconds === 'number') {
      retryAfterSeconds = errJson.retryAfterSeconds;
    }

    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('auth:unauthorized', {
          detail: { requestId, message: errorMsg },
        })
      );
    }

    throw new ApiError(
      errorMsg,
      response.status,
      requestId,
      errJson?.timestamp || null,
      retryAfterSeconds,
      errJson
    );
  }

  return response.json();
}

// Primary FixCraft API client grouped by backend domains
export const api = {
  // Authentication & User Account Management endpoints
  auth: {
    login: (credentials: { email: string; password: string }) =>
      request<{ token: string; user: User; settings: UserSettings; shop?: RepairShop | null }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),

    register: (data: {
      name: string;
      email: string;
      password: string;
      role: 'customer' | 'shop';
      phone?: string;
      shopName?: string;
      address?: string;
      city?: string;
      specialties?: string[];
    }) =>
      request<{ token: string; user: User; settings: UserSettings; shop?: RepairShop | null }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getMe: () =>
      request<{ user: User; settings: UserSettings; shop?: RepairShop | null }>('/auth/me'),

    updateProfile: (data: {
      name?: string;
      phone?: string;
      avatar?: string;
      defaultAddress?: string;
      defaultCity?: string;
      themePreference?: 'light' | 'dark' | 'system';
      notifyEmail?: boolean;
      notifySms?: boolean;
    }) =>
      request<{ user: User; settings: UserSettings }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    changePassword: (data: { oldPassword: string; newPassword: string }) =>
      request<{ success: boolean; message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getNotifications: () =>
      request<AppNotification[]>('/auth/notifications'),

    markNotificationRead: (id: string) =>
      request<{ success: boolean }>(`/auth/notifications/${id}/read`, {
        method: 'PATCH',
      }),

    getDemoAccounts: () =>
      request<DemoAccount[]>('/auth/demo-accounts'),
  },

  // Customer repair requests, quote acceptance, disputes, and reviews endpoints
  client: {
    getMyRequests: () =>
      request<RepairRequest[]>('/client/requests'),

    createRequest: (data: {
      deviceCategory: string;
      deviceBrand: string;
      deviceModel: string;
      serialNumber?: string;
      deviceYear?: string;
      issueCategory?: string;
      issueTitle: string;
      description: string;
      photos?: string[];
      urgency?: string;
      preferredService?: string;
      location?: string;
    }) =>
      request<RepairRequest>('/client/requests', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    cancelRequest: (id: string) =>
      request<{ success: boolean; message: string }>(`/client/requests/${id}`, {
        method: 'DELETE',
      }),

    acceptQuote: (quoteId: string) =>
      request<{
        success: boolean;
        message: string;
        request: RepairRequest;
        escrow: EscrowRecord;
      }>(`/client/quotes/${quoteId}/accept`, {
        method: 'POST',
      }),

    confirmHandover: (requestId: string) =>
      request<{
        success: boolean;
        message: string;
        request: RepairRequest;
        escrow: EscrowRecord;
      }>(`/client/requests/${requestId}/confirm-handover`, {
        method: 'POST',
      }),

    openDispute: (requestId: string, data: { reason: string; customerStatement: string }) =>
      request<{
        success: boolean;
        message: string;
        dispute: Dispute;
      }>(`/client/requests/${requestId}/dispute`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    submitReview: (
      requestId: string,
      data: {
        rating: number;
        repairSpeedRating?: number;
        communicationRating?: number;
        qualityRating?: number;
        comment: string;
        tags?: string[];
      }
    ) =>
      request<Review>(`/client/requests/${requestId}/review`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    submitWarrantyClaim: (data: { requestId: string; claimIssue: string }) =>
      request<{
        success: boolean;
        message: string;
        claim: WarrantyClaim;
      }>('/client/warranty/claim', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // Workshop bench queue, inbound intake, quote submission, and stage advancement endpoints
  shop: {
    getProfile: () =>
      request<RepairShop>('/shop/profile'),

    updateProfile: (data: Partial<RepairShop> & ShopProfileUpdateRequest) => {
      const payload = {
        name: data.name,
        tagline: data.tagline,
        logo: data.logo,
        bannerImage: data.bannerImage ?? data.banner_image,
        address: data.address,
        city: data.city,
        phone: data.phone,
        email: data.email,
        specialties: data.specialties,
        turnaroundAvg: data.turnaroundAvg ?? data.turnaround_avg,
        warrantyStandard: data.warrantyStandard ?? data.warranty_standard,
        activeTechCount: data.activeTechCount ?? data.active_tech_count,
        operatingHours: data.operatingHours ?? data.operating_hours,
        description: data.description,
      };
      const cleaned = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined));
      return request<RepairShop>('/shop/profile', {
        method: 'PATCH',
        body: JSON.stringify(cleaned),
      });
    },

    getInboundRequests: () =>
      request<RepairRequest[]>('/shop/inbound-requests'),

    getBenchRepairs: () =>
      request<RepairRequest[]>('/shop/bench-repairs'),

    submitQuote: (data: {
      requestId: string;
      partsCost: number;
      laborCost: number;
      diagnosticFee?: number;
      diagnosticFeeWaived?: boolean;
      totalCost: number;
      partsQuality: string;
      estimatedTurnaround: string;
      turnaroundDays?: number;
      warrantyMonths?: number;
      warrantyDetails?: string;
      technicianNotes?: string;
    }) =>
      request<Quote>('/shop/quotes', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    withdrawQuote: (quoteId: string) =>
      request<{ success: boolean; message: string }>(`/shop/quotes/${quoteId}`, {
        method: 'DELETE',
      }),

    advanceRepairStage: (
      requestId: string,
      data: {
        status: string;
        technicianNotes?: string;
        photoProof?: string;
      }
    ) =>
      request<RepairRequest>(`/shop/requests/${requestId}/advance-stage`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    respondToDispute: (disputeId: string, data: { shopStatement: string }) =>
      request<{ success: boolean; message: string }>(`/shop/disputes/${disputeId}/respond`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getWarrantyClaims: () =>
      request<WarrantyClaim[]>('/shop/warranty-claims'),

    updateWarrantyClaim: (
      id: string,
      data: {
        status: WarrantyClaimStatus;
        shopResponse?: string;
      }
    ) =>
      request<{ success: boolean; message: string; claim: WarrantyClaim }>(`/shop/warranty-claims/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  // Administrative governance, dispute resolution, escrow ledgers, and audit log endpoints
  admin: {
    getMetrics: () =>
      request<AdminMetrics>('/admin/metrics'),

    getUsers: () =>
      request<User[]>('/admin/users'),

    setUserStatus: (id: string, isActive: boolean) =>
      request<{ success: boolean; message: string }>(`/admin/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),

    getPendingShops: () =>
      request<RepairShop[]>('/admin/shops/pending'),

    verifyShop: (id: string, verified: boolean) =>
      request<{ success: boolean; verified: boolean }>(`/admin/shops/${id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ verified }),
      }),

    getEscrowLedger: () =>
      request<EscrowRecord[]>('/admin/escrow'),

    getDisputes: () =>
      request<Dispute[]>('/admin/disputes'),

    resolveDispute: (
      disputeId: string,
      data: {
        resolution: 'refund_customer' | 'release_to_shop' | 'split_payout';
        customerRefundAmount?: number;
        shopPayoutAmount?: number;
        adminNotes?: string;
      }
    ) =>
      request<{
        success: boolean;
        message: string;
        dispute: Dispute;
        escrow: EscrowRecord;
      }>(`/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getAuditLogs: () =>
      request<AuditLog[]>('/admin/audit-logs'),
  },

  // Shared public directory, workshop profiles, ticket details, and ticket messaging endpoints
  shared: {
    getShopsDirectory: (specialty?: string) => {
      const query = specialty && specialty !== 'all' ? `?specialty=${encodeURIComponent(specialty)}` : '';
      return request<RepairShop[]>(`/shared/shops${query}`);
    },

    getShopPublicProfile: (id: string) =>
      request<RepairShop & { reviews: Review[] }>(`/shared/shops/${id}`),

    getRequestDetail: (requestId: string) =>
      request<RepairRequest>(`/shared/requests/${requestId}`),

    getTicketMessages: (requestId: string) =>
      request<ChatMessage[]>(`/shared/requests/${requestId}/messages`),

    sendTicketMessage: (
      requestId: string,
      data: {
        content: string;
        attachments?: string[];
        recipientId?: string;
      }
    ) =>
      request<ChatMessage>(`/shared/requests/${requestId}/messages`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // File and diagnostic image upload endpoint
  upload: {
    uploadImage: async (file: File): Promise<{ url: string; filename: string; size: number }> => {
      const formData = new FormData();
      formData.append('file', file);
      return request<{ url: string; filename: string; size: number }>('/upload', {
        method: 'POST',
        body: formData,
      });
    },
  },

  // System status and database health check endpoint
  health: {
    getHealth: () =>
      request<{
        status: 'ok' | 'degraded';
        uptime?: number;
        database: string;
        timestamp?: string;
      }>('/health'),
  },
};
