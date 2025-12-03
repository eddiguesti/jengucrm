'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Bell, Plus, Command, RefreshCw, Mail, Calendar, Loader2, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

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
  const { theme, toggleTheme, ready } = useTheme();
  const isLight = theme === 'light';

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

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      });
      setNotifications(prev =>
        prev.map(n => ({ ...n, read: true }))
      );
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleBellClick = () => {
    const wasOpen = showNotifications;
    setShowNotifications(!showNotifications);

    // Mark all as read when opening the dropdown (if there are unread)
    if (!wasOpen && unreadCount > 0) {
      markAllAsRead();
    }
  };

  return (
    <header
      className={`sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/80 backdrop-blur-xl px-6 transition-colors ${
        isLight ? 'border-[#efe7dc] shadow-[0_12px_32px_-28px_rgba(0,0,0,0.15)]' : 'border-white/[0.06]'
      }`}
    >
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
            className={`w-56 h-8 pl-9 pr-12 text-xs rounded-lg macos-transition ${
              isLight
                ? 'bg-white border-slate-200 text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:ring-1 focus:ring-sky-300'
                : 'bg-white/[0.06] border-white/[0.08] text-white placeholder:text-white/40 focus:bg-white/[0.08] focus:border-blue-500/50'
            }`}
          />
          <div
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px]",
              isLight ? "text-slate-400" : "text-white/30"
            )}
          >
            <Command className="h-3 w-3" />
            <span>K</span>
          </div>
        </div>

        {/* Theme toggle */}
        {ready && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className={`h-8 w-8 rounded-lg macos-transition ${
              isLight
                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Toggle theme"
          >
            {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
        )}

        {/* Check Replies Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={checkForReplies}
          disabled={isChecking}
          className={`h-8 w-8 rounded-lg macos-transition ${
            isLight
              ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
          }`}
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
            onClick={handleBellClick}
            className={`h-8 w-8 rounded-lg macos-transition relative ${
              isLight
                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
            }`}
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
            <div
              className={cn(
                "absolute right-0 top-10 w-80 rounded-lg shadow-xl overflow-hidden border",
                isLight ? "bg-white border-slate-200" : "bg-zinc-900 border-zinc-800"
              )}
            >
              <div
                className={cn(
                  "p-3 border-b flex items-center justify-between",
                  isLight ? "border-slate-200" : "border-zinc-800"
                )}
              >
                <h3 className="text-sm font-medium text-foreground">Notifications</h3>
                {lastChecked && (
                  <span className="text-[10px] text-muted-foreground">
                    Last checked: {lastChecked.toLocaleTimeString()}
                  </span>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map((notification, idx) => {
                    const safeKey =
                      notification.id && notification.id.trim().length > 0
                        ? notification.id
                        : `${notification.prospect_id || 'notification'}-${idx}`;

                    return (
                      <Link
                        key={safeKey}
                        href={`/prospects/${notification.prospect_id}`}
                        onClick={() => {
                          markAsRead(notification.id);
                          setShowNotifications(false);
                        }}
                        className={`block p-3 border-b ${
                          isLight
                            ? 'hover:bg-slate-50 border-slate-200'
                            : 'hover:bg-zinc-800/50 border-zinc-800/50'
                        } ${!notification.read ? (isLight ? 'bg-sky-50' : 'bg-blue-500/5') : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={`mt-0.5 p-1 rounded-full ${
                              notification.type === 'meeting_request'
                                ? 'bg-emerald-500/20'
                                : 'bg-blue-500/20'
                            }`}
                          >
                            {notification.type === 'meeting_request' ? (
                              <Calendar className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Mail className="h-3 w-3 text-blue-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-xs font-medium ${
                                !notification.read
                                  ? isLight
                                    ? 'text-slate-900'
                                    : 'text-white'
                                  : isLight
                                    ? 'text-slate-600'
                                    : 'text-zinc-300'
                              }`}
                            >
                              {notification.title}
                            </p>
                            {notification.message && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                                {notification.message}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {new Date(notification.created_at).toLocaleString()}
                            </p>
                          </div>
                          {!notification.read && (
                            <div className="h-2 w-2 bg-blue-500 rounded-full" />
                          )}
                        </div>
                      </Link>
                    );
                  })
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
            className={cn(
              "h-8 text-xs font-medium px-3 rounded-lg shadow-lg macos-transition active-glow",
              isLight
                ? "bg-sky-500 hover:bg-sky-600 text-white shadow-sky-500/25"
                : "bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/25"
            )}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {action.label}
          </Button>
        )}
      </div>
    </header>
  );
}
