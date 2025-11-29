'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Mail,
  Phone,
  Calendar,
  Target,
  CheckCircle,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface NextActionCardProps {
  stage: string;
  hasEmail: boolean;
  hasContact: boolean;
  emailsSent: number;
  hasGooglePlaceId: boolean;
  isGenerating: boolean;
  isEnriching: boolean;
  onGenerateEmail: () => void;
  onEnrich: () => void;
}

function getNextAction(
  stage: string,
  hasEmail: boolean,
  hasContact: boolean,
  emailsSent: number
): {
  action: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  icon: 'mail' | 'phone' | 'calendar' | 'target' | 'check';
} {
  switch (stage) {
    case 'new':
      if (!hasEmail && !hasContact) {
        return {
          action: 'Enrich Data',
          description: 'Get contact details via Google Places enrichment',
          priority: 'high',
          icon: 'target',
        };
      }
      return {
        action: 'Research Property',
        description: 'Review website, social media, and recent news',
        priority: 'medium',
        icon: 'target',
      };
    case 'researching':
      return {
        action: 'Generate Outreach Email',
        description: 'Create personalized email based on hiring signal',
        priority: 'high',
        icon: 'mail',
      };
    case 'outreach':
      if (emailsSent === 0) {
        return {
          action: 'Send First Email',
          description: 'Generate and send initial outreach email',
          priority: 'high',
          icon: 'mail',
        };
      }
      return {
        action: 'Follow Up',
        description: 'Send follow-up email or try phone call',
        priority: 'medium',
        icon: 'phone',
      };
    case 'engaged':
      return {
        action: 'Schedule Meeting',
        description: 'Book a discovery call or demo',
        priority: 'high',
        icon: 'calendar',
      };
    case 'meeting':
      return {
        action: 'Prepare Proposal',
        description: 'Create customized proposal after meeting',
        priority: 'high',
        icon: 'target',
      };
    case 'proposal':
      return {
        action: 'Follow Up on Proposal',
        description: 'Check in on decision timeline',
        priority: 'high',
        icon: 'phone',
      };
    case 'won':
      return {
        action: 'Onboarding',
        description: 'Begin customer onboarding process',
        priority: 'medium',
        icon: 'check',
      };
    case 'lost':
      return {
        action: 'Nurture',
        description: 'Add to nurture sequence for future opportunities',
        priority: 'low',
        icon: 'mail',
      };
    default:
      return {
        action: 'Review',
        description: 'Review prospect details',
        priority: 'medium',
        icon: 'target',
      };
  }
}

const iconMap = {
  mail: Mail,
  phone: Phone,
  calendar: Calendar,
  target: Target,
  check: CheckCircle,
};

const priorityColors = {
  high: 'bg-red-500/20 border-red-500/50 text-red-400',
  medium: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
  low: 'bg-zinc-500/20 border-zinc-500/50 text-zinc-400',
};

export function NextActionCard({
  stage,
  hasEmail,
  hasContact,
  emailsSent,
  hasGooglePlaceId,
  isGenerating,
  isEnriching,
  onGenerateEmail,
  onEnrich,
}: NextActionCardProps) {
  const nextAction = getNextAction(stage, hasEmail, hasContact, emailsSent);
  const ActionIcon = iconMap[nextAction.icon];

  return (
    <Card className={`border-2 ${priorityColors[nextAction.priority].split(' ')[1]}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-500" />
            Next Action
          </CardTitle>
          <Badge className={priorityColors[nextAction.priority]}>
            {nextAction.priority.charAt(0).toUpperCase() + nextAction.priority.slice(1)} Priority
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <ActionIcon className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="font-medium text-white">{nextAction.action}</p>
            <p className="text-sm text-zinc-400">{nextAction.description}</p>
          </div>
        </div>
        {nextAction.icon === 'mail' && stage !== 'won' && stage !== 'lost' && (
          <Button
            onClick={onGenerateEmail}
            disabled={isGenerating}
            className="w-full mt-4 bg-amber-600 hover:bg-amber-700"
            size="sm"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generate Email Now
          </Button>
        )}
        {nextAction.icon === 'target' && !hasGooglePlaceId && (
          <Button
            onClick={onEnrich}
            disabled={isEnriching}
            className="w-full mt-4 bg-amber-600 hover:bg-amber-700"
            size="sm"
          >
            {isEnriching ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Enrich Now
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
