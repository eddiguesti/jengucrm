/**
 * Service Layer Exports
 * Centralized exports for all service instances
 */

export { statsService, StatsService } from './stats.service';
export type { DashboardStats, EmailStats } from './stats.service';

export { campaignService, CampaignService } from './campaign.service';
export type { CampaignSummary } from './campaign.service';

export { emailService, EmailService } from './email.service';
export type { AutoEmailResult, EmailGenerationResult } from './email.service';
