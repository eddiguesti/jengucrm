'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Bell, Plus, Command, RefreshCw, Mail, Calendar, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Notification {
  id: string;
  prospect_id: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  created_at: string;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function Header({ title, subtitle, action }: HeaderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const hasCheckedRef = useRef(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Check for replies on first load
  useEffect(() => {
    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true;
      checkForReplies();
      fetchNotifications();
    }
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications?limit=10');
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const checkForReplies = async () => {
    setIsChecking(true);
    try {
      const response = await fetch('/api/check-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours_back: 24 }),
      });
      if (response.ok) {
        setLastChecked(new Date());
        // Refresh notifications after checking
        await fetchNotifications();
      }
    } catch (err) {
      console.error('Failed to check replies:', err);
    } finally {
      setIsChecking(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/[0.06] bg-background/80 backdrop-blur-xl px-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Search - macOS Spotlight style */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="w-56 h-8 bg-white/[0.06] border-white/[0.08] pl-9 pr-12 text-xs placeholder:text-white/40 rounded-lg focus:bg-white/[0.08] focus:border-blue-500/50 macos-transition"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-white/30">
            <Command className="h-3 w-3" />
            <span>K</span>
          </div>
        </div>

        {/* Check Replies Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={checkForReplies}
          disabled={isChecking}
          className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/[0.06] rounded-lg macos-transition"
          title="Check for email replies"
        >
          {isChecking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>

        {/* Notifications */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowNotifications(!showNotifications)}
            className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/[0.06] rounded-lg macos-transition relative"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 top-10 w-80 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden">
              <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">Notifications</h3>
                {lastChecked && (
                  <span className="text-[10px] text-zinc-500">
                    Last checked: {lastChecked.toLocaleTimeString()}
                  </span>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map(notification => (
                    <Link
                      key={notification.id}
                      href={`/prospects/${notification.prospect_id}`}
                      onClick={() => {
                        markAsRead(notification.id);
                        setShowNotifications(false);
                      }}
                      className={`block p-3 hover:bg-zinc-800/50 border-b border-zinc-800/50 ${
                        !notification.read ? 'bg-blue-500/5' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`mt-0.5 p-1 rounded-full ${
                          notification.type === 'meeting_request'
                            ? 'bg-emerald-500/20'
                            : 'bg-blue-500/20'
                        }`}>
                          {notification.type === 'meeting_request' ? (
                            <Calendar className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Mail className="h-3 w-3 text-blue-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${
                            !notification.read ? 'text-white' : 'text-zinc-300'
                          }`}>
                            {notification.title}
                          </p>
                          {notification.message && (
                            <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5">
                              {notification.message}
                            </p>
                          )}
                          <p className="text-[10px] text-zinc-600 mt-1">
                            {new Date(notification.created_at).toLocaleString()}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="h-2 w-2 bg-blue-500 rounded-full" />
                        )}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="p-6 text-center text-zinc-500 text-sm">
                    <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No notifications yet</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Button - Apple blue style */}
        {action && (
          <Button
            onClick={action.onClick}
            className="h-8 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium px-3 rounded-lg shadow-lg shadow-blue-500/25 macos-transition active-glow"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {action.label}
          </Button>
        )}
      </div>
    </header>
  );
}
