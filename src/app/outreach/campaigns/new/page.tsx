'use client';

import { useState, useRef, useCallback } from 'react';
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
  Sparkles,
  Eye,
  EyeOff,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';

// Available personalization variables grouped by category
const PERSONALIZATION_CATEGORIES = [
  {
    name: 'Contact',
    icon: User,
    color: 'violet',
    variables: [
      { key: 'first_name', label: 'First Name', example: 'Sarah' },
      { key: 'last_name', label: 'Last Name', example: 'Johnson' },
      { key: 'full_name', label: 'Full Name', example: 'Sarah Johnson' },
      { key: 'title', label: 'Job Title', example: 'General Manager' },
    ],
  },
  {
    name: 'Company',
    icon: Building2,
    color: 'blue',
    variables: [
      { key: 'hotel_name', label: 'Hotel Name', example: 'The Grand Hotel' },
      { key: 'company', label: 'Company', example: 'Hilton' },
    ],
  },
  {
    name: 'Location',
    icon: MapPin,
    color: 'emerald',
    variables: [
      { key: 'city', label: 'City', example: 'London' },
      { key: 'country', label: 'Country', example: 'United Kingdom' },
    ],
  },
];

// Flatten for easy lookup
const ALL_VARIABLES = PERSONALIZATION_CATEGORIES.flatMap((cat) =>
  cat.variables.map((v) => ({ ...v, category: cat.name, color: cat.color }))
);

// Sample data for preview
const SAMPLE_DATA: Record<string, string> = {
  first_name: 'Sarah',
  last_name: 'Johnson',
  full_name: 'Sarah Johnson',
  title: 'General Manager',
  hotel_name: 'The Grand Hotel',
  company: 'Independent',
  city: 'London',
  country: 'United Kingdom',
};

// Replace variables with sample data for preview
function previewText(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return SAMPLE_DATA[key] || match;
  });
}

// Highlight variables in text for display
function highlightVariables(text: string, isLight: boolean): React.ReactNode {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return parts.map((part, i) => {
    const match = part.match(/\{\{(\w+)\}\}/);
    if (match) {
      const varInfo = ALL_VARIABLES.find((v) => v.key === match[1]);
      return (
        <span
          key={i}
          className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mx-0.5',
            varInfo?.color === 'violet' && (isLight ? 'bg-violet-100 text-violet-700' : 'bg-violet-500/20 text-violet-400'),
            varInfo?.color === 'blue' && (isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400'),
            varInfo?.color === 'emerald' && (isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-400'),
            !varInfo && (isLight ? 'bg-slate-100 text-slate-700' : 'bg-zinc-700 text-zinc-300')
          )}
        >
          {varInfo?.label || match[1]}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// Personalization toolbar component
function PersonalizationToolbar({
  onInsert,
  isLight,
  compact = false,
}: {
  onInsert: (variable: string) => void;
  isLight: boolean;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(!compact);

  if (compact && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all',
          isLight
            ? 'bg-gradient-to-r from-violet-50 to-blue-50 hover:from-violet-100 hover:to-blue-100 text-violet-700 border border-violet-200'
            : 'bg-gradient-to-r from-violet-500/10 to-blue-500/10 hover:from-violet-500/20 hover:to-blue-500/20 text-violet-400 border border-violet-500/20'
        )}
      >
        <Sparkles className="h-4 w-4" />
        Add Personalization
        <ChevronDown className="h-3 w-3" />
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        'rounded-xl border p-4 space-y-4',
        isLight
          ? 'bg-gradient-to-br from-slate-50 to-white border-slate-200'
          : 'bg-gradient-to-br from-zinc-900 to-zinc-800/50 border-zinc-700'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            'p-1.5 rounded-lg',
            isLight ? 'bg-violet-100' : 'bg-violet-500/20'
          )}>
            <Sparkles className={cn('h-4 w-4', isLight ? 'text-violet-600' : 'text-violet-400')} />
          </div>
          <div>
            <h4 className={cn('text-sm font-semibold', isLight ? 'text-slate-900' : 'text-white')}>
              Personalization Variables
            </h4>
            <p className={cn('text-xs', isLight ? 'text-slate-500' : 'text-zinc-500')}>
              Click to insert into your email
            </p>
          </div>
        </div>
        {compact && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className={cn('p-1 rounded hover:bg-black/5', isLight ? 'text-slate-400' : 'text-zinc-500')}
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Variable Categories */}
      <div className="space-y-3">
        {PERSONALIZATION_CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <div key={category.name} className="space-y-2">
              <div className="flex items-center gap-2">
                <Icon className={cn(
                  'h-3.5 w-3.5',
                  category.color === 'violet' && 'text-violet-500',
                  category.color === 'blue' && 'text-blue-500',
                  category.color === 'emerald' && 'text-emerald-500'
                )} />
                <span className={cn('text-xs font-medium', isLight ? 'text-slate-600' : 'text-zinc-400')}>
                  {category.name}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {category.variables.map((variable) => (
                  <motion.button
                    key={variable.key}
                    type="button"
                    onClick={() => onInsert(variable.key)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      'group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                      category.color === 'violet' && (isLight
                        ? 'bg-violet-100 hover:bg-violet-200 text-violet-700 border border-violet-200'
                        : 'bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30'),
                      category.color === 'blue' && (isLight
                        ? 'bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-200'
                        : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30'),
                      category.color === 'emerald' && (isLight
                        ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border border-emerald-200'
                        : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30')
                    )}
                  >
                    {variable.label}
                    {/* Tooltip */}
                    <span className={cn(
                      'absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10',
                      isLight ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
                    )}>
                      e.g., "{variable.example}"
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Help text */}
      <div className={cn(
        'flex items-start gap-2 p-3 rounded-lg text-xs',
        isLight ? 'bg-blue-50 text-blue-700' : 'bg-blue-500/10 text-blue-400'
      )}>
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">How it works</p>
          <p className="mt-0.5 opacity-80">
            Variables like <code className="font-mono bg-black/10 px-1 rounded">{'{{first_name}}'}</code> are
            automatically replaced with each contact's actual data when the email is sent.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// Email editor with integrated personalization
function EmailEditor({
  label,
  value,
  onChange,
  placeholder,
  isLight,
  rows = 8,
  showPreview = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isLight: boolean;
  rows?: number;
  showPreview?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreviewMode, setShowPreviewMode] = useState(false);

  const insertVariable = useCallback((variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(value + `{{${variable}}}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const insertion = `{{${variable}}}`;
    const newValue = value.slice(0, start) + insertion + value.slice(end);
    onChange(newValue);

    // Restore cursor position after the inserted variable
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertion.length, start + insertion.length);
    });
  }, [value, onChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {showPreview && value && (
          <button
            type="button"
            onClick={() => setShowPreviewMode(!showPreviewMode)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors',
              showPreviewMode
                ? isLight
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-violet-500/20 text-violet-400'
                : isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
            )}
          >
            {showPreviewMode ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showPreviewMode ? 'Edit' : 'Preview'}
          </button>
        )}
      </div>

      {/* Personalization Toolbar */}
      <PersonalizationToolbar onInsert={insertVariable} isLight={isLight} compact />

      {/* Editor / Preview */}
      <AnimatePresence mode="wait">
        {showPreviewMode ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              'p-4 rounded-lg border min-h-[200px]',
              isLight
                ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200'
                : 'bg-gradient-to-br from-amber-500/5 to-orange-500/5 border-amber-500/20'
            )}
          >
            <div className="flex items-center gap-2 mb-3">
              <Eye className={cn('h-4 w-4', isLight ? 'text-amber-600' : 'text-amber-500')} />
              <span className={cn('text-xs font-medium', isLight ? 'text-amber-700' : 'text-amber-400')}>
                Preview with sample data
              </span>
            </div>
            <div className={cn(
              'whitespace-pre-wrap text-sm leading-relaxed',
              isLight ? 'text-slate-700' : 'text-zinc-300'
            )}>
              {previewText(value) || 'Start typing to see preview...'}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="editor"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Textarea
              ref={textareaRef}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={rows}
              className={cn(
                'font-mono text-sm resize-none',
                isLight ? 'bg-white' : 'bg-zinc-900'
              )}
            />
            {/* Variable highlight preview below textarea */}
            {value && (
              <div className={cn(
                'mt-2 p-3 rounded-lg text-sm',
                isLight ? 'bg-slate-50 border border-slate-200' : 'bg-zinc-800/50 border border-zinc-700'
              )}>
                <div className={cn('text-xs mb-1.5', isLight ? 'text-slate-500' : 'text-zinc-500')}>
                  Variables detected:
                </div>
                <div className="leading-relaxed">
                  {highlightVariables(value, isLight)}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
    setSequences(
      newSequences.map((s, i) => ({ ...s, step_number: i + 1 }))
    );
  };

  const updateStep = (index: number, updates: Partial<SequenceStep>) => {
    setSequences(
      sequences.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
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
        subtitle="Create a personalized email sequence"
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
                <CardContent className="space-y-6">
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

                    {/* Subject Line */}
                    <div className="space-y-2">
                      <Label>Subject Line</Label>
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

                    {/* Email Body with personalization */}
                    <EmailEditor
                      label="Email Body"
                      value={step.variant_a_body}
                      onChange={(value) => updateStep(index, { variant_a_body: value })}
                      placeholder={`Hey {{first_name}},

I noticed {{hotel_name}} in {{city}} and wanted to reach out...

Best,
Edd`}
                      isLight={isLight}
                    />
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
                          className="font-mono"
                        />
                      </div>
                      <EmailEditor
                        label="Email Body (B)"
                        value={step.variant_b_body || ''}
                        onChange={(value) => updateStep(index, { variant_b_body: value })}
                        placeholder="Alternative email body..."
                        isLight={isLight}
                      />
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
