-- Jengu CRM - Seed Data
-- Run with: wrangler d1 execute jengu-crm --file=./migrations/002_seed.sql

-- =============================================
-- DEFAULT CAMPAIGNS
-- =============================================
INSERT OR IGNORE INTO campaigns (id, name, strategy_key, description, active, daily_limit) VALUES
  ('camp_authority', 'Direct & Confident', 'authority_scarcity', 'Short (70-90 words), punchy, authority-first with loss aversion', 1, 20),
  ('camp_curiosity', 'Pattern Interrupt + Vulnerable', 'curiosity_value', 'Pattern interrupt opener with vulnerability and labeling', 1, 20),
  ('camp_cold_direct', 'Cold: Direct & Human', 'cold_direct', 'Human, slightly awkward, direct ask for Sales Nav leads', 1, 20),
  ('camp_cold_pattern', 'Cold: Pattern Interrupt', 'cold_pattern_interrupt', 'Self-aware, honest opener with easy out', 1, 20);
