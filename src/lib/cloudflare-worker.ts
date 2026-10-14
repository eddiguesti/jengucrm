/** A stable domain keeps application routing independent of Cloudflare accounts. */
export const CLOUDFLARE_WORKER_URL = (
  process.env.CLOUDFLARE_WORKER_URL || 'https://crm-api.jengu.ai'
).replace(/\/+$/, '');
