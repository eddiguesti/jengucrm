'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Phone, Globe, MapPin, ExternalLink } from 'lucide-react';
import type { Prospect } from '@/types';

interface ContactInfoCardProps {
  prospect: Prospect;
}

export function ContactInfoCard({ prospect }: ContactInfoCardProps) {
  const hasContactInfo = prospect.email || prospect.phone || prospect.website || prospect.contact_name;

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white text-base">Contact Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {prospect.contact_name && (
          <div>
            <p className="text-sm text-zinc-500">Contact</p>
            <p className="text-white">{prospect.contact_name}</p>
            {prospect.contact_title && (
              <p className="text-sm text-zinc-400">{prospect.contact_title}</p>
            )}
          </div>
        )}

        {prospect.email && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-zinc-500" />
            <a href={`mailto:${prospect.email}`} className="text-amber-400 hover:underline text-sm">
              {prospect.email}
            </a>
          </div>
        )}

        {prospect.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-zinc-500" />
            <span className="text-zinc-300 text-sm">{prospect.phone}</span>
          </div>
        )}

        {prospect.website && (
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-zinc-500" />
            <a
              href={prospect.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:underline text-sm flex items-center gap-1"
            >
              Website <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {prospect.full_address && (
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-zinc-500 mt-0.5" />
            <span className="text-zinc-300 text-sm">{prospect.full_address}</span>
          </div>
        )}

        {!hasContactInfo && (
          <p className="text-zinc-500 text-sm">No contact information available. Try enriching the data.</p>
        )}
      </CardContent>
    </Card>
  );
}
