'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  Loader2,
  GripVertical,
  Clock,
  Beaker,
  User,
  Building2,
  MapPin,
  Briefcase,
  AtSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';

// Available personalization variables
const PERSONALIZATION_VARS = [
  { key: 'first_name', label: 'First Name', icon: User, example: 'John' },
  { key: 'last_name', label: 'Last Name', icon: User, example: 'Smith' },
  { key: 'full_name', label: 'Full Name', icon: User, example: 'John Smith' },
  { key: 'hotel_name', label: 'Hotel', icon: Building2, example: 'Grand Hotel' },
  { key: 'company', label: 'Company', icon: Building2, example: 'Marriott' },
  { key: 'city', label: 'City', icon: MapPin, example: 'London' },
  { key: 'country', label: 'Country', icon: MapPin, example: 'UK' },
  { key: 'title', label: 'Job Title', icon: Briefcase, example: 'General Manager' },
  { key: 'email', label: 'Email', icon: AtSign, example: 'john@hotel.com' },
];

// Variable insertion button component
function VariableButton({
  variable,
  onClick,
  isLight,
}: {
  variable: typeof PERSONALIZATION_VARS[0];
  onClick: () => void;
  isLight: boolean;
}) {
  const Icon = variable.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors',
        isLight
          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
      )}
      title={`Insert {{${variable.key}}} - e.g., "${variable.example}"`}
    >
      <Icon className="h-3 w-3" />
      {variable.label}
    </button>
  );
}

interface SequenceStep {
  id: string;
  step_number: number;
  delay_days: number;
  delay_hours: number;
  variant_a_subject: string;
  variant_a_body: string;
  variant_b_subject?: string;
  variant_b_body?: string;
  variant_split: number;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dailyLimit, setDailyLimit] = useState(50);
  const [abTestingEnabled, setAbTestingEnabled] = useState(false);
  const [sequences, setSequences] = useState<SequenceStep[]>([
    {
      id: 'step_1',
      step_number: 1,
      delay_days: 0,
      delay_hours: 0,
      variant_a_subject: '',
      variant_a_body: '',
      variant_split: 50,
    },
  ]);

  const addStep = () => {
    const lastStep = sequences[sequences.length - 1];
    setSequences([
      ...sequences,
      {
        id: `step_${sequences.length + 1}_${Date.now()}`,
        step_number: sequences.length + 1,
        delay_days: 3,
        delay_hours: 0,
        variant_a_subject: '',
        variant_a_body: '',
        variant_split: 50,
      },
    ]);
  };

  const removeStep = (index: number) => {
    if (sequences.length <= 1) return;
    const newSequences = sequences.filter((_, i) => i !== index);
    // Re-number steps
    setSequences(
      newSequences.map((s, i) => ({ ...s, step_number: i + 1 }))
    );
  };

  const updateStep = (index: number, updates: Partial<SequenceStep>) => {
    setSequences(
      sequences.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  };

  // Insert variable at cursor position or at end
  const insertVariable = (
    index: number,
    field: 'variant_a_subject' | 'variant_a_body' | 'variant_b_subject' | 'variant_b_body',
    variable: string
  ) => {
    const currentValue = sequences[index][field] || '';
    const insertion = `{{${variable}}}`;
    // For simplicity, append at end (or user can position cursor)
    updateStep(index, { [field]: currentValue + insertion });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Please enter a campaign name');
      return;
    }

    if (sequences.some((s) => !s.variant_a_subject || !s.variant_a_body)) {
      alert('Please fill in subject and body for all steps');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/outreach/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          daily_limit: dailyLimit,
          ab_testing_enabled: abTestingEnabled,
          sequences: sequences.map((s) => ({
            step_number: s.step_number,
            delay_days: s.delay_days,
            delay_hours: s.delay_hours,
            variant_a_subject: s.variant_a_subject,
            variant_a_body: s.variant_a_body,
            variant_b_subject: abTestingEnabled ? s.variant_b_subject : null,
            variant_b_body: abTestingEnabled ? s.variant_b_body : null,
            variant_split: s.variant_split,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/outreach/campaigns/${data.campaign.id}`);
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to create campaign');
      }
    } catch (error) {
      console.error('Failed to create campaign:', error);
      alert('Failed to create campaign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="New Campaign"
        subtitle="Create a multi-step email sequence"
        action={
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Campaign Details */}
          <Card
            className={cn(
              'border',
              isLight
                ? 'bg-white border-slate-200'
                : 'bg-zinc-900/50 border-zinc-800'
            )}
          >
            <CardHeader>
              <CardTitle className="text-lg">Campaign Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Hotel GM Outreach Q4"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of this campaign..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dailyLimit">Daily Send Limit</Label>
                  <Input
                    id="dailyLimit"
                    type="number"
                    min={1}
                    max={500}
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(parseInt(e.target.value) || 50)}
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Beaker className="h-4 w-4 text-violet-500" />
                    <Label htmlFor="abTesting" className="cursor-pointer">
                      A/B Testing
                    </Label>
                  </div>
                  <Switch
                    id="abTesting"
                    checked={abTestingEnabled}
                    onCheckedChange={setAbTestingEnabled}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sequence Steps */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2
                className={cn(
                  'text-lg font-semibold',
                  isLight ? 'text-slate-900' : 'text-white'
                )}
              >
                Email Sequence
              </h2>
              <Button type="button" variant="outline" size="sm" onClick={addStep}>
                <Plus className="h-4 w-4 mr-2" />
                Add Step
              </Button>
            </div>

            {sequences.map((step, index) => (
              <Card
                key={step.id}
                className={cn(
                  'border',
                  isLight
                    ? 'bg-white border-slate-200'
                    : 'bg-zinc-900/50 border-zinc-800'
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical
                        className={cn(
                          'h-4 w-4 cursor-move',
                          isLight ? 'text-slate-400' : 'text-zinc-600'
                        )}
                      />
                      <CardTitle className="text-base">
                        Step {step.step_number}
                      </CardTitle>
                      {index > 0 && (
                        <div
                          className={cn(
                            'flex items-center gap-1 text-xs px-2 py-1 rounded',
                            isLight
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-zinc-800 text-zinc-400'
                          )}
                        >
                          <Clock className="h-3 w-3" />
                          Wait {step.delay_days}d {step.delay_hours}h
                        </div>
                      )}
                    </div>
                    {sequences.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeStep(index)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Delay (for steps > 1) */}
                  {index > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Delay (Days)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={step.delay_days}
                          onChange={(e) =>
                            updateStep(index, {
                              delay_days: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Delay (Hours)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          value={step.delay_hours}
                          onChange={(e) =>
                            updateStep(index, {
                              delay_hours: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}

                  {/* Variant A */}
                  <div className="space-y-4">
                    <div
                      className={cn(
                        'text-xs font-medium px-2 py-1 rounded w-fit',
                        isLight
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-violet-500/20 text-violet-400'
                      )}
                    >
                      {abTestingEnabled ? 'Variant A' : 'Email Content'}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Subject Line</Label>
                        <div className="flex gap-1">
                          {PERSONALIZATION_VARS.slice(0, 4).map((v) => (
                            <VariableButton
                              key={v.key}
                              variable={v}
                              isLight={isLight}
                              onClick={() => insertVariable(index, 'variant_a_subject', v.key)}
                            />
                          ))}
                        </div>
                      </div>
                      <Input
                        placeholder="e.g., Quick question about {{hotel_name}}"
                        value={step.variant_a_subject}
                        onChange={(e) =>
                          updateStep(index, { variant_a_subject: e.target.value })
                        }
                        required
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Email Body</Label>
                        <span className={cn('text-xs', isLight ? 'text-slate-500' : 'text-zinc-500')}>
                          Click variables to insert
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pb-2">
                        {PERSONALIZATION_VARS.map((v) => (
                          <VariableButton
                            key={v.key}
                            variable={v}
                            isLight={isLight}
                            onClick={() => insertVariable(index, 'variant_a_body', v.key)}
                          />
                        ))}
                      </div>
                      <Textarea
                        placeholder="Hey {{first_name}},

I noticed {{hotel_name}} in {{city}} and thought..."
                        value={step.variant_a_body}
                        onChange={(e) =>
                          updateStep(index, { variant_a_body: e.target.value })
                        }
                        rows={8}
                        required
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>

                  {/* Variant B (if A/B testing enabled) */}
                  {abTestingEnabled && (
                    <div className="space-y-4 pt-4 border-t border-dashed">
                      <div className="flex items-center justify-between">
                        <div
                          className={cn(
                            'text-xs font-medium px-2 py-1 rounded w-fit',
                            isLight
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-blue-500/20 text-blue-400'
                          )}
                        >
                          Variant B
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>
                            Split:
                          </span>
                          <Input
                            type="number"
                            min={10}
                            max={90}
                            value={step.variant_split}
                            onChange={(e) =>
                              updateStep(index, {
                                variant_split: parseInt(e.target.value) || 50,
                              })
                            }
                            className="w-16 h-7"
                          />
                          <span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>
                            % to A
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Subject Line (B)</Label>
                        <Input
                          placeholder="Alternative subject line..."
                          value={step.variant_b_subject || ''}
                          onChange={(e) =>
                            updateStep(index, { variant_b_subject: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Email Body (B)</Label>
                          <span className={cn('text-xs', isLight ? 'text-slate-500' : 'text-zinc-500')}>
                            Click variables to insert
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pb-2">
                          {PERSONALIZATION_VARS.map((v) => (
                            <VariableButton
                              key={v.key}
                              variable={v}
                              isLight={isLight}
                              onClick={() => insertVariable(index, 'variant_b_body', v.key)}
                            />
                          ))}
                        </div>
                        <Textarea
                          placeholder="Alternative email body..."
                          value={step.variant_b_body || ''}
                          onChange={(e) =>
                            updateStep(index, { variant_b_body: e.target.value })
                          }
                          rows={8}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Create Campaign
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
