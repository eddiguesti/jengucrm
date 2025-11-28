'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface AddProspectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddProspectDialog({ open, onOpenChange, onSuccess }: AddProspectDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    property_type: 'hotel',
    city: '',
    country: '',
    website: '',
    email: '',
    phone: '',
    contact_name: '',
    contact_title: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.city) {
      alert('Please fill in at least the name and city');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create prospect');
      }

      // Reset form
      setFormData({
        name: '',
        property_type: 'hotel',
        city: '',
        country: '',
        website: '',
        email: '',
        phone: '',
        contact_name: '',
        contact_title: '',
        notes: '',
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create prospect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Prospect</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Manually add a property to your prospect list
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium text-zinc-300">Property Name *</label>
              <Input
                placeholder="e.g., The Ritz London"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-zinc-800 border-zinc-700 mt-1"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300">City *</label>
              <Input
                placeholder="e.g., London"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="bg-zinc-800 border-zinc-700 mt-1"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300">Country</label>
              <Input
                placeholder="e.g., UK"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="bg-zinc-800 border-zinc-700 mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300">Property Type</label>
              <Select
                value={formData.property_type}
                onValueChange={(value) => setFormData({ ...formData, property_type: value })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="hotel">Hotel</SelectItem>
                  <SelectItem value="resort">Resort</SelectItem>
                  <SelectItem value="restaurant">Restaurant</SelectItem>
                  <SelectItem value="venue">Venue</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300">Website</label>
              <Input
                type="url"
                placeholder="https://..."
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="bg-zinc-800 border-zinc-700 mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300">Email</label>
              <Input
                type="email"
                placeholder="contact@hotel.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-zinc-800 border-zinc-700 mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300">Phone</label>
              <Input
                placeholder="+1 234 567 890"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="bg-zinc-800 border-zinc-700 mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300">Contact Name</label>
              <Input
                placeholder="John Smith"
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                className="bg-zinc-800 border-zinc-700 mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300">Contact Title</label>
              <Input
                placeholder="General Manager"
                value={formData.contact_title}
                onChange={(e) => setFormData({ ...formData, contact_title: e.target.value })}
                className="bg-zinc-800 border-zinc-700 mt-1"
              />
            </div>

            <div className="col-span-2">
              <label className="text-sm font-medium text-zinc-300">Notes</label>
              <Textarea
                placeholder="Any additional notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-zinc-800 border-zinc-700 mt-1"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-zinc-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Prospect
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
