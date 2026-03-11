import React from 'react';

interface Notification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  type: 'info' | 'warning' | 'error' | 'success';
}

interface Props {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onClearAll: () => void;
}

const TYPE_STYLES = {
  info: 'border-l-blue-500 bg-blue-50',
  warning: 'border-l-yellow-500 bg-yellow-50',
  error: 'border-l-red-500 bg-red-50',
  success: 'border-l-green-500 bg-green-50',
};

export function NotificationList({ notifications, onMarkRead, onClearAll }: Props) {
  const isEmpty = notifications.length === 0;

  return (
    <section aria-label="Notifications" className="w-full max-w-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">
          Notifications
          {!isEmpty && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({notifications.filter((n) => !n.read).length} unread)
            </span>
          )}
        </h2>
        <button
          onClick={onClearAll}
          disabled={isEmpty}
          className="text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
        >
          Clear all
        </button>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center min-h-[160px] text-center text-gray-400 gap-2">
          <span className="text-4xl" role="img" aria-label="Bell">🔔</span>
          <p className="font-medium text-gray-600">All caught up!</p>
          <p className="text-sm">No notifications right now. Check back later.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`border-l-4 rounded-r-md p-3 ${TYPE_STYLES[n.type]} ${
                n.read ? 'opacity-60' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-sm">{n.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{n.body}</p>
                </div>
                <div className="flex flex-col items-end gap-1 ml-4 shrink-0">
                  <span className="text-xs text-gray-400">{n.timestamp}</span>
                  {!n.read && (
                    <button
                      onClick={() => onMarkRead(n.id)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
