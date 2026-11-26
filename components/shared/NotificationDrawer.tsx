import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Bell, Check, ExternalLink, X } from 'lucide-react';

// Props interface for slide-over notification drawer
interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTicket?: (requestId: string) => void;
}

// Slide-over drawer presenting chronological system notifications with ticket navigation
export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  onSelectTicket,
}) => {
  const { notifications, markNotificationRead, unreadCount } = useAuth();

  if (!isOpen) return null;

  // Marks clicked notification as read and navigates to linked ticket docket
  const handleNotificationClick = async (notif: any) => {
    if (!notif.is_read && !notif.isRead) {
      await markNotificationRead(notif.id);
    }
    if (notif.link_url && onSelectTicket) {
      const match = notif.link_url.match(/(req-[a-z0-9-]+)/i);
      if (match && match[1]) {
        onSelectTicket(match[1]);
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 dark:bg-black/85 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-sm bg-white dark:bg-[#0f0f0f] shadow-2xl border-l border-neutral-200 dark:border-neutral-800 flex flex-col z-10 animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-900 dark:text-white">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Notifications</h3>
                <p className="text-xs text-neutral-500">
                  {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-black dark:hover:text-white rounded-lg hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close notifications"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-neutral-400 dark:text-neutral-500">
                <Bell className="w-8 h-8 mx-auto mb-2 stroke-1 opacity-50" />
                <p className="text-xs">No notifications yet.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.is_read && !n.isRead;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-4 transition-colors cursor-pointer hover:bg-neutral-50 dark:hover:bg-[#161616] flex items-start gap-3 min-h-[44px] ${
                      isUnread ? 'bg-neutral-100/60 dark:bg-[#161616]' : 'bg-white dark:bg-[#0f0f0f]'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        isUnread ? 'bg-black dark:bg-white ring-2 ring-neutral-300 dark:ring-neutral-700' : 'bg-transparent'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <h4 className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                          {n.title}
                        </h4>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0">
                          {new Date(n.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                        {n.message}
                      </p>
                      {n.link_url && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-neutral-900 dark:text-white">
                          <span>Open ticket docket</span>
                          <ExternalLink className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
