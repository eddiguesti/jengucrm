'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Bell, Plus } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function Header({ title, subtitle, action }: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6">
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Search..."
            className="w-64 bg-zinc-900 border-zinc-800 pl-9 text-sm placeholder:text-zinc-500"
          />
        </div>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
          <Bell className="h-5 w-5" />
        </Button>

        {/* Action Button */}
        {action && (
          <Button onClick={action.onClick} className="bg-amber-600 hover:bg-amber-700">
            <Plus className="h-4 w-4 mr-2" />
            {action.label}
          </Button>
        )}
      </div>
    </header>
  );
}
