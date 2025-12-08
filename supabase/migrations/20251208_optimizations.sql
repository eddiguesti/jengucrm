-- ============================================
-- JENGU CRM OPTIMIZATION MIGRATIONS
-- Revenue tracking, A/B testing, DLQ, analytics
-- Run: npx supabase db push or manually in Supabase SQL editor
-- ============================================

-- 1. Revenue & Deal Tracking (for ROI calculation)
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS deal_value DECIMAL(10,2);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS won_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS lost_reason TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS sales_cycle_days INT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS timezone TEXT; -- For time-zone aware sending

-- 2. A/B Test Tracking for Emails
ALTER TABLE emails ADD COLUMN IF NOT EXISTS strategy_variant VARCHAR(50);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ab_test_id VARCHAR(50);

-- 3. Dead Letter Queue for failed jobs
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type VARCHAR(50) NOT NULL, -- enrichment, email, scrape, reply_check
  payload JSONB NOT NULL,
  error TEXT,
  error_code VARCHAR(50),
  attempts INT DEFAULT 1,
  max_attempts INT DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_retry ON dead_letter_queue(next_retry_at)
  WHERE processed_at IS NULL AND attempts < max_attempts;

CREATE INDEX IF NOT EXISTS idx_dlq_job_type ON dead_letter_queue(job_type, created_at DESC);

-- 4. Country to Timezone mapping table
CREATE TABLE IF NOT EXISTS country_timezones (
  country TEXT PRIMARY KEY,
  timezone TEXT NOT NULL,
  utc_offset INT, -- hours from UTC
  business_hours_start INT DEFAULT 9, -- 9am local
  business_hours_end INT DEFAULT 17 -- 5pm local
);

-- Insert common country timezones
INSERT INTO country_timezones (country, timezone, utc_offset) VALUES
  ('United Kingdom', 'Europe/London', 0),
  ('UK', 'Europe/London', 0),
  ('United States', 'America/New_York', -5),
  ('USA', 'America/New_York', -5),
  ('France', 'Europe/Paris', 1),
  ('Germany', 'Europe/Berlin', 1),
  ('Italy', 'Europe/Rome', 1),
  ('Spain', 'Europe/Madrid', 1),
  ('Netherlands', 'Europe/Amsterdam', 1),
  ('Belgium', 'Europe/Brussels', 1),
  ('Switzerland', 'Europe/Zurich', 1),
  ('Austria', 'Europe/Vienna', 1),
  ('Portugal', 'Europe/Lisbon', 0),
  ('Ireland', 'Europe/Dublin', 0),
  ('Greece', 'Europe/Athens', 2),
  ('Poland', 'Europe/Warsaw', 1),
  ('Sweden', 'Europe/Stockholm', 1),
  ('Norway', 'Europe/Oslo', 1),
  ('Denmark', 'Europe/Copenhagen', 1),
  ('Finland', 'Europe/Helsinki', 2),
  ('Czech Republic', 'Europe/Prague', 1),
  ('Hungary', 'Europe/Budapest', 1),
  ('Romania', 'Europe/Bucharest', 2),
  ('Bulgaria', 'Europe/Sofia', 2),
  ('Croatia', 'Europe/Zagreb', 1),
  ('Slovakia', 'Europe/Bratislava', 1),
  ('Slovenia', 'Europe/Ljubljana', 1),
  ('United Arab Emirates', 'Asia/Dubai', 4),
  ('UAE', 'Asia/Dubai', 4),
  ('Dubai', 'Asia/Dubai', 4),
  ('Saudi Arabia', 'Asia/Riyadh', 3),
  ('Qatar', 'Asia/Qatar', 3),
  ('Bahrain', 'Asia/Bahrain', 3),
  ('Kuwait', 'Asia/Kuwait', 3),
  ('Oman', 'Asia/Muscat', 4),
  ('Singapore', 'Asia/Singapore', 8),
  ('Hong Kong', 'Asia/Hong_Kong', 8),
  ('Japan', 'Asia/Tokyo', 9),
  ('South Korea', 'Asia/Seoul', 9),
  ('China', 'Asia/Shanghai', 8),
  ('Thailand', 'Asia/Bangkok', 7),
  ('Vietnam', 'Asia/Ho_Chi_Minh', 7),
  ('Malaysia', 'Asia/Kuala_Lumpur', 8),
  ('Indonesia', 'Asia/Jakarta', 7),
  ('Philippines', 'Asia/Manila', 8),
  ('India', 'Asia/Kolkata', 5),
  ('Australia', 'Australia/Sydney', 10),
  ('New Zealand', 'Pacific/Auckland', 12),
  ('Canada', 'America/Toronto', -5),
  ('Mexico', 'America/Mexico_City', -6),
  ('Brazil', 'America/Sao_Paulo', -3),
  ('Argentina', 'America/Buenos_Aires', -3),
  ('Chile', 'America/Santiago', -4),
  ('Colombia', 'America/Bogota', -5),
  ('Peru', 'America/Lima', -5),
  ('South Africa', 'Africa/Johannesburg', 2),
  ('Egypt', 'Africa/Cairo', 2),
  ('Morocco', 'Africa/Casablanca', 0),
  ('Turkey', 'Europe/Istanbul', 3),
  ('Israel', 'Asia/Jerusalem', 2),
  ('Russia', 'Europe/Moscow', 3)
ON CONFLICT (country) DO NOTHING;

-- 5. Chain hotel brands for auto-filtering
CREATE TABLE IF NOT EXISTS chain_brands (
  id SERIAL PRIMARY KEY,
  brand_name TEXT NOT NULL UNIQUE,
  parent_company TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Insert major chain brands to filter out
INSERT INTO chain_brands (brand_name, parent_company) VALUES
  -- Marriott
  ('Marriott', 'Marriott International'),
  ('Sheraton', 'Marriott International'),
  ('Westin', 'Marriott International'),
  ('W Hotels', 'Marriott International'),
  ('St. Regis', 'Marriott International'),
  ('Ritz-Carlton', 'Marriott International'),
  ('JW Marriott', 'Marriott International'),
  ('Renaissance', 'Marriott International'),
  ('Courtyard', 'Marriott International'),
  ('Residence Inn', 'Marriott International'),
  ('Fairfield', 'Marriott International'),
  ('SpringHill', 'Marriott International'),
  ('TownePlace', 'Marriott International'),
  ('Aloft', 'Marriott International'),
  ('Element', 'Marriott International'),
  ('AC Hotels', 'Marriott International'),
  ('Moxy', 'Marriott International'),
  ('Autograph', 'Marriott International'),
  ('Tribute', 'Marriott International'),
  ('Le Meridien', 'Marriott International'),
  ('Edition', 'Marriott International'),
  ('Luxury Collection', 'Marriott International'),
  ('Four Points', 'Marriott International'),
  -- Hilton
  ('Hilton', 'Hilton Worldwide'),
  ('Conrad', 'Hilton Worldwide'),
  ('Waldorf Astoria', 'Hilton Worldwide'),
  ('DoubleTree', 'Hilton Worldwide'),
  ('Embassy Suites', 'Hilton Worldwide'),
  ('Hampton', 'Hilton Worldwide'),
  ('Homewood Suites', 'Hilton Worldwide'),
  ('Home2 Suites', 'Hilton Worldwide'),
  ('Hilton Garden Inn', 'Hilton Worldwide'),
  ('Tru by Hilton', 'Hilton Worldwide'),
  ('Curio', 'Hilton Worldwide'),
  ('Canopy', 'Hilton Worldwide'),
  ('Tapestry', 'Hilton Worldwide'),
  ('LXR', 'Hilton Worldwide'),
  ('Tempo', 'Hilton Worldwide'),
  ('Signia', 'Hilton Worldwide'),
  -- Hyatt
  ('Hyatt', 'Hyatt Hotels'),
  ('Grand Hyatt', 'Hyatt Hotels'),
  ('Park Hyatt', 'Hyatt Hotels'),
  ('Andaz', 'Hyatt Hotels'),
  ('Hyatt Regency', 'Hyatt Hotels'),
  ('Hyatt Place', 'Hyatt Hotels'),
  ('Hyatt House', 'Hyatt Hotels'),
  ('Thompson', 'Hyatt Hotels'),
  ('Alila', 'Hyatt Hotels'),
  ('Miraval', 'Hyatt Hotels'),
  ('Caption', 'Hyatt Hotels'),
  -- IHG
  ('IHG', 'IHG Hotels'),
  ('InterContinental', 'IHG Hotels'),
  ('Crowne Plaza', 'IHG Hotels'),
  ('Holiday Inn', 'IHG Hotels'),
  ('Holiday Inn Express', 'IHG Hotels'),
  ('Kimpton', 'IHG Hotels'),
  ('Hotel Indigo', 'IHG Hotels'),
  ('Even Hotels', 'IHG Hotels'),
  ('Staybridge', 'IHG Hotels'),
  ('Candlewood', 'IHG Hotels'),
  ('Regent', 'IHG Hotels'),
  ('Six Senses', 'IHG Hotels'),
  ('Vignette', 'IHG Hotels'),
  -- Accor
  ('Accor', 'Accor'),
  ('Sofitel', 'Accor'),
  ('Pullman', 'Accor'),
  ('MGallery', 'Accor'),
  ('Novotel', 'Accor'),
  ('Mercure', 'Accor'),
  ('ibis', 'Accor'),
  ('ibis Styles', 'Accor'),
  ('ibis budget', 'Accor'),
  ('Fairmont', 'Accor'),
  ('Raffles', 'Accor'),
  ('Swissotel', 'Accor'),
  ('Banyan Tree', 'Accor'),
  ('Movenpick', 'Accor'),
  ('Mantis', 'Accor'),
  ('25hours', 'Accor'),
  ('SLS', 'Accor'),
  ('Delano', 'Accor'),
  ('Mondrian', 'Accor'),
  -- Wyndham
  ('Wyndham', 'Wyndham Hotels'),
  ('Ramada', 'Wyndham Hotels'),
  ('Days Inn', 'Wyndham Hotels'),
  ('Super 8', 'Wyndham Hotels'),
  ('Microtel', 'Wyndham Hotels'),
  ('La Quinta', 'Wyndham Hotels'),
  ('Baymont', 'Wyndham Hotels'),
  ('Wingate', 'Wyndham Hotels'),
  ('Hawthorn', 'Wyndham Hotels'),
  ('Tryp', 'Wyndham Hotels'),
  -- Best Western
  ('Best Western', 'Best Western'),
  ('Best Western Plus', 'Best Western'),
  ('Best Western Premier', 'Best Western'),
  ('Vib', 'Best Western'),
  ('Glo', 'Best Western'),
  ('Aiden', 'Best Western'),
  ('Sadie', 'Best Western'),
  -- Choice Hotels
  ('Choice Hotels', 'Choice Hotels'),
  ('Comfort Inn', 'Choice Hotels'),
  ('Comfort Suites', 'Choice Hotels'),
  ('Quality Inn', 'Choice Hotels'),
  ('Sleep Inn', 'Choice Hotels'),
  ('Clarion', 'Choice Hotels'),
  ('Econo Lodge', 'Choice Hotels'),
  ('Rodeway Inn', 'Choice Hotels'),
  ('Cambria', 'Choice Hotels'),
  ('Ascend', 'Choice Hotels'),
  -- Radisson
  ('Radisson', 'Radisson Hotel Group'),
  ('Radisson Blu', 'Radisson Hotel Group'),
  ('Radisson Red', 'Radisson Hotel Group'),
  ('Radisson Collection', 'Radisson Hotel Group'),
  ('Park Inn', 'Radisson Hotel Group'),
  ('Park Plaza', 'Radisson Hotel Group'),
  ('Country Inn', 'Radisson Hotel Group'),
  -- Others
  ('Four Seasons', 'Four Seasons'),
  ('Mandarin Oriental', 'Mandarin Oriental'),
  ('Peninsula', 'Peninsula Hotels'),
  ('Shangri-La', 'Shangri-La'),
  ('Aman', 'Aman Resorts'),
  ('One&Only', 'Kerzner'),
  ('Belmond', 'LVMH'),
  ('Rosewood', 'Rosewood Hotels'),
  ('Langham', 'Langham Hospitality'),
  ('Kempinski', 'Kempinski'),
  ('Jumeirah', 'Jumeirah'),
  ('Loews', 'Loews Hotels'),
  ('Omni', 'Omni Hotels'),
  ('Preferred Hotels', 'Preferred Hotels'),
  ('Leading Hotels', 'Leading Hotels of the World'),
  ('Small Luxury Hotels', 'SLH'),
  ('Relais & Chateaux', 'Relais & Chateaux'),
  ('Premier Inn', 'Whitbread'),
  ('Travelodge', 'Travelodge'),
  ('Motel 6', 'G6 Hospitality'),
  ('Red Roof', 'Red Roof'),
  ('Drury', 'Drury Hotels'),
  ('OYO', 'OYO Rooms'),
  ('CitizenM', 'CitizenM'),
  ('Hoxton', 'Ennismore'),
  ('Gleneagles', 'Ennismore'),
  ('Mama Shelter', 'Ennismore'),
  ('nhow', 'NH Hotels'),
  ('NH', 'NH Hotels'),
  ('NH Collection', 'NH Hotels'),
  ('Anantara', 'Minor Hotels'),
  ('Avani', 'Minor Hotels'),
  ('Oaks', 'Minor Hotels'),
  ('Tivoli', 'Minor Hotels')
ON CONFLICT (brand_name) DO NOTHING;

-- 6. Objection templates for auto-replies
CREATE TABLE IF NOT EXISTS objection_templates (
  id SERIAL PRIMARY KEY,
  objection_type VARCHAR(50) NOT NULL, -- budget, timing, authority, need, competitor
  template_name VARCHAR(100) NOT NULL,
  subject_template TEXT,
  body_template TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  success_rate DECIMAL(5,2), -- track which templates work
  times_used INT DEFAULT 0,
  times_replied INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert objection handling templates
INSERT INTO objection_templates (objection_type, template_name, body_template) VALUES
  ('budget', 'roi_focus', E'Totally understand - budget''s always a consideration.\n\nHere''s the thing though: most hotels find the ROI covers the cost within 2-3 weeks. We''re not talking big upfront investment here.\n\nWorth a quick 15-min chat to see if the numbers would work for you? No commitment, just a reality check.\n\nEdd'),
  ('budget', 'pay_per_result', E'Fair point on budget.\n\nWhat if we structured it so you only pay when you see results? We''ve done that with a few hotels who were in similar positions.\n\nMight be worth a quick chat to see if something like that could work?\n\nEdd'),
  ('timing', 'future_prep', E'No rush at all - timing is everything.\n\nTell you what: let me send over a quick process map anyway. No commitment, but at least when the time IS right, you''ll have a clear picture of what''s possible and roughly what ROI you''re sitting on.\n\nWould that be useful?\n\nEdd'),
  ('timing', 'seasonal', E'Makes sense - I know [season] is hectic.\n\nHow about we pencil something in for [next month]? That way you''re not scrambling to fit it in, and we can hit the ground running when things calm down.\n\nEdd'),
  ('authority', 'forward_request', E'Totally get it - would you mind forwarding this to whoever handles operations/tech decisions?\n\nWould genuinely appreciate it. Happy to take it from there.\n\nEdd'),
  ('authority', 'intro_offer', E'No problem at all.\n\nWould it help if I put together a one-pager you could share with them? Something short that explains what we do and why it might be worth a look.\n\nLet me know and I''ll send it over.\n\nEdd'),
  ('need', 'pain_probe', E'Fair enough - sounds like things are running smoothly.\n\nOut of curiosity though: how are you currently handling [specific task]? Most hotels I talk to find that''s where the hidden time-sink is.\n\nMight not be relevant for you, but worth asking.\n\nEdd'),
  ('need', 'competitor_angle', E'Got it. Though I''d be curious - are any of your competitors in the area doing anything with AI/automation?\n\nNot trying to create urgency artificially, but it''s becoming table stakes in some markets. Worth keeping an eye on at least.\n\nEdd'),
  ('competitor', 'differentiation', E'Interesting - who are you working with currently?\n\nNot trying to poach, but we approach things differently. We''re not a software vendor - we build custom solutions that you own. No recurring fees, no vendor lock-in.\n\nMight be worth a comparison chat?\n\nEdd'),
  ('competitor', 'complement', E'Makes sense you''ve already got something in place.\n\nWe often work alongside existing systems rather than replacing them. Sometimes there are gaps that are worth plugging.\n\nWould you be open to a quick chat to see if there''s anything we could add?\n\nEdd')
ON CONFLICT DO NOTHING;

-- 7. Re-engagement tracking
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS re_engagement_attempts INT DEFAULT 0;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_re_engagement_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS re_engagement_reason TEXT;

-- 8. Open rate tracking index for analytics
CREATE INDEX IF NOT EXISTS idx_emails_opened ON emails(opened_at) WHERE opened_at IS NOT NULL;

-- 9. Campaign performance tracking
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_opens INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS open_rate DECIMAL(5,2);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS best_send_hour INT; -- Best performing send hour
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS revenue_generated DECIMAL(10,2) DEFAULT 0;

-- 10. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON dead_letter_queue TO authenticated;
GRANT SELECT ON country_timezones TO authenticated;
GRANT SELECT ON chain_brands TO authenticated;
GRANT SELECT, INSERT, UPDATE ON objection_templates TO authenticated;
GRANT USAGE ON SEQUENCE dead_letter_queue_id_seq TO authenticated;
