/**
 * Repository Exports
 * Centralized exports for all repository instances
 */

export { prospectRepository, ProspectRepository } from './prospect.repository';
export type { Prospect, ProspectFilters } from './prospect.repository';

export { emailRepository, EmailRepository } from './email.repository';
export type { Email, EmailFilters } from './email.repository';

export { campaignRepository, CampaignRepository } from './campaign.repository';
export type { Campaign, CampaignWithStats } from './campaign.repository';

export { activityRepository, ActivityRepository } from './activity.repository';
export type { Activity, CreateActivityInput } from './activity.repository';

export { BaseRepository } from './base.repository';
export type { PaginatedResult, PaginationOptions } from './base.repository';
