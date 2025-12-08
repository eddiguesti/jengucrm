'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { MobilePageHeader } from '@/components/layout/mobile-page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  Mail,
  Calendar,
  Loader2,
  RefreshCw,
  CheckCheck,
  Trash2,
  ExternalLink,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';
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
  prospects?: {
    name: string;
    company: string;
  };
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'meeting_request':
      return <Calendar className="h-4 w-4 text-emerald-400" />;
    case 'positive_reply':
      return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    case 'email_reply':
      return <MessageSquare className="h-4 w-4 text-blue-400" />;
    case 'bounce':
      return <AlertCircle className="h-4 w-4 text-red-400" />;
    default:
      return <Mail className="h-4 w-4 text-blue-400" />;
  }
}

function getNotificationBadge(type: string, isLight: boolean) {
  switch (type) {
    case 'meeting_request':
      return (
        <Badge className={cn(
          "text-[10px]",
          isLight ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
        )}>
          Meeting Request
        </Badge>
      );
    case 'positive_reply':
      return (
        <Badge className={cn(
          "text-[10px]",
          isLight ? "bg-green-50 text-green-600 border-green-200" : "bg-green-500/20 text-green-400 border-green-500/30"
        )}>
          Positive Reply
        </Badge>
      );
    case 'bounce':
      return (
        <Badge className={cn(
          "text-[10px]",
          isLight ? "bg-red-50 text-red-600 border-red-200" : "bg-red-500/20 text-red-400 border-red-500/30"
        )}>
          Bounce
        </Badge>
      );
    default:
      return (
        <Badge className={cn(
          "text-[10px]",
          isLight ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-blue-500/20 text-blue-400 border-blue-500/30"
        )}>
          Reply
        </Badge>
      );
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function NotificationsPageContent() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const searchParams = useSearchParams();
  const typeFilter = searchParams.get('type'); // Type filter from URL

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/notifications?limit=100');
      if (response.ok) {
        const data = await response.json();
        let filtered = data.notifications || [];
        // Apply type filter if present
        if (typeFilter) {
          filtered = filtered.filter((n: Notification) => n.type === typeFilter);
        }
        setNotifications(filtered);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  const clearTypeFilter = () => {
    window.history.pushState({}, '', '/notifications');
    window.location.reload();
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
    } catch (error) {
      console.error('Failed to mark as read:', error);
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
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.read).length;

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'meeting_request': return 'Meeting Requests';
      case 'positive_reply': return 'Positive Replies';
      case 'email_reply': return 'Email Replies';
      case 'bounce': return 'Bounces';
      default: return type;
    }
  };

  return (
    <div className={cn(
      "flex flex-col h-full transition-colors",
      isLight
        ? "bg-gradient-to-br from-[#fef9f3] via-white to-[#f6f2eb]"
        : "bg-background"
    )}>
      <Header
        title="Notifications"
        subtitle={typeFilter ? getTypeLabel(typeFilter) : `${unreadCount} unread`}
        action={{
          label: 'Refresh',
          onClick: fetchNotifications,
        }}
      />

      <MobilePageHeader
        title="Notifications"
        subtitle={typeFilter ? getTypeLabel(typeFilter) : `${unreadCount} unread`}
        action={{
          icon: <RefreshCw className="h-4 w-4" />,
          label: 'Refresh',
          onClick: fetchNotifications,
        }}
      />

      {/* Type filter indicator */}
      {typeFilter && (
        <div className="px-4 md:px-6 py-2">
          <div className={cn(
            "flex items-center gap-2 p-2 rounded-lg",
            isLight ? "bg-purple-50 border border-purple-200" : "bg-purple-500/10 border border-purple-500/20"
          )}>
            <Calendar className={cn("h-4 w-4", isLight ? "text-purple-600" : "text-purple-400")} />
            <span className={cn("text-sm", isLight ? "text-purple-700" : "text-purple-400")}>
              Showing: {getTypeLabel(typeFilter)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearTypeFilter}
              className={cn(
                "ml-auto h-6 px-2",
                isLight ? "text-purple-600 hover:text-purple-800" : "text-purple-400 hover:text-purple-300"
              )}
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 px-4 pb-4 md:p-6 overflow-auto">
        {/* Actions Bar */}
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
              className={cn(
                "h-8 text-xs",
                filter === 'all'
                  ? isLight ? "bg-sky-500 text-white" : "bg-blue-600 text-white"
                  : isLight ? "border-slate-200" : "border-zinc-700"
              )}
            >
              All ({notifications.length})
            </Button>
            <Button
              variant={filter === 'unread' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('unread')}
              className={cn(
                "h-8 text-xs",
                filter === 'unread'
                  ? isLight ? "bg-sky-500 text-white" : "bg-blue-600 text-white"
                  : isLight ? "border-slate-200" : "border-zinc-700"
              )}
            >
              Unread ({unreadCount})
            </Button>
          </div>

          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="h-8 text-xs"
            >
              <CheckCheck className="h-3 w-3 mr-1.5" />
              Mark All Read
            </Button>
          )}
        </div>

        {/* Notifications List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <Card className={cn(
            isLight ? "bg-white border-slate-200" : "bg-zinc-900 border-zinc-800"
          )}>
            <CardContent className="p-8 md:p-12 text-center">
              <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2">
                {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </p>
              <p className="text-sm text-muted-foreground/70">
                You&apos;ll receive notifications when prospects reply to your emails
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredNotifications.map((notification) => (
              <Card
                key={notification.id}
                className={cn(
                  "overflow-hidden transition-all",
                  !notification.read && (isLight ? "bg-sky-50/50" : "bg-blue-500/5"),
                  isLight
                    ? "bg-white border-slate-200 hover:border-slate-300"
                    : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      isLight ? "bg-slate-100" : "bg-zinc-800"
                    )}>
                      {getNotificationIcon(notification.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getNotificationBadge(notification.type, isLight)}
                        <span className="text-xs text-muted-foreground">
                          {formatDate(notification.created_at)}
                        </span>
                        {!notification.read && (
                          <div className="h-2 w-2 rounded-full bg-blue-500" />
                        )}
                      </div>

                      <p className={cn(
                        "font-medium",
                        isLight ? "text-slate-900" : "text-white"
                      )}>
                        {notification.title}
                      </p>

                      {notification.message && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                      )}

                      {notification.prospects && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {notification.prospects.name}
                          {notification.prospects.company && ` · ${notification.prospects.company}`}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => markAsRead(notification.id)}
                          title="Mark as read"
                        >
                          <CheckCheck className="h-4 w-4" />
                        </Button>
                      )}
                      <Link href={`/prospects/${notification.prospect_id}`}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="View prospect"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600"
                        onClick={() => deleteNotification(notification.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col h-full bg-background">
        <Header title="Notifications" subtitle="Loading..." />
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </div>
    }>
      <NotificationsPageContent />
    </Suspense>
  );
}
