'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mail, Phone, Globe, MapPin, ExternalLink, Linkedin, User } from 'lucide-react';
import type { Prospect } from '@/types';

interface ContactInfoCardProps {
  prospect: Prospect;
}

export function ContactInfoCard({ prospect }: ContactInfoCardProps) {
  const hasContactInfo = prospect.email || prospect.phone || prospect.website || prospect.contact_name || prospect.linkedin_url;

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white text-base flex items-center gap-2">
          <User className="h-4 w-4" />
          Contact Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {prospect.contact_name && (
          <div>
            <p className="text-sm text-zinc-500">Contact</p>
            <p className="text-white font-medium">{prospect.contact_name}</p>
            {prospect.contact_title && (
              <p className="text-sm text-zinc-400">{prospect.contact_title}</p>
            )}
          </div>
        )}

        {prospect.email && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-emerald-500" />
            <a href={`mailto:${prospect.email}`} className="text-emerald-400 hover:underline text-sm font-medium">
              {prospect.email}
            </a>
            {prospect.email_confidence && (
              <Badge className={
                prospect.email_confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400 text-[10px]' :
                prospect.email_confidence === 'medium' ? 'bg-amber-500/20 text-amber-400 text-[10px]' :
                'bg-zinc-500/20 text-zinc-400 text-[10px]'
              }>
                {prospect.email_confidence}
              </Badge>
            )}
          </div>
        )}

        {prospect.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-zinc-500" />
            <span className="text-zinc-300 text-sm">{prospect.phone}</span>
          </div>
        )}

        {prospect.linkedin_url && (
          <div className="flex items-center gap-2">
            <Linkedin className="h-4 w-4 text-blue-500" />
            <a
              href={prospect.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline text-sm flex items-center gap-1"
            >
              LinkedIn Profile <ExternalLink className="h-3 w-3" />
            </a>
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
