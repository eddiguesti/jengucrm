-- Seed 2 ready prospects from Supabase
-- These are the only prospects with truly personal emails not yet contacted

INSERT INTO prospects (
  id, name, city, country, property_type,
  contact_name, contact_email, contact_title,
  phone, website, stage, tier, score,
  lead_source, source_url, source_job_title,
  created_at, updated_at, archived, email_verified, email_bounced
) VALUES (
  '4ab35dce-5ed4-4d3d-ac77-201adcf532a7',
  'Hôtel Restaurant de l''Union',
  NULL,
  'France',
  'hotel',
  'Xavier Ribot',
  'xavier0037@hotmail.com',
  'Owner & General Manager',
  '7735934424855',
  'http://hotelrestaurantlunion.com',
  'enriched',
  'warm',
  10,
  'sales_navigator',
  NULL,
  NULL,
  datetime('now'),
  datetime('now'),
  0,
  0,
  0
) ON CONFLICT(id) DO NOTHING;

INSERT INTO prospects (
  id, name, city, country, property_type,
  contact_name, contact_email, contact_title,
  phone, website, stage, tier, score,
  lead_source, source_url, source_job_title,
  created_at, updated_at, archived, email_verified, email_bounced
) VALUES (
  '9ddb9f68-1de8-4a05-98fa-9c9cbd0ab818',
  'Hôtel & Spa Le Moulin de Moissac',
  NULL,
  'France',
  'hotel',
  'Caroline Carcone',
  'caroline@lemoulindemoissac.com',
  'Sales Manager',
  '1511425522032',
  'https://www.lemoulindemoissac.com',
  'enriched',
  'warm',
  18,
  'sales_navigator',
  NULL,
  NULL,
  datetime('now'),
  datetime('now'),
  0,
  0,
  0
) ON CONFLICT(id) DO NOTHING;
