export function calculateScore(prospect: Record<string, unknown>): { total: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  let total = 0;

  // === CONTACT QUALITY (max 35) ===
  if (prospect.email) {
    const email = prospect.email as string;
    if (!email.startsWith('info@')) {
      breakdown.has_real_email = 15;
      total += 15;
    } else {
      breakdown.has_generated_email = 5;
      total += 5;
    }
  }
  if (prospect.contact_name) {
    breakdown.has_contact_person = 15;
    total += 15;
  }
  if (prospect.phone) {
    breakdown.has_phone = 5;
    total += 5;
  }

  // === ONLINE PRESENCE (max 25) ===
  if (prospect.website) {
    breakdown.has_website = 5;
    total += 5;
  }
  if (prospect.linkedin_url) {
    breakdown.has_linkedin = 10;
    total += 10;
  }
  if (prospect.instagram_handle) {
    breakdown.has_instagram = 5;
    total += 5;
  }
  if (prospect.google_place_id) {
    breakdown.google_verified = 5;
    total += 5;
  }

  // === PROPERTY QUALITY (max 30) ===
  const starRating = prospect.star_rating as number | null;
  if (starRating) {
    if (starRating >= 5) {
      breakdown.five_star = 15;
      total += 15;
    } else if (starRating >= 4) {
      breakdown.four_star = 10;
      total += 10;
    }
  }

  // Chain vs Independent
  const chain = prospect.chain_affiliation as string | null;
  if (chain) {
    const luxuryChains = [
      'Four Seasons', 'Ritz-Carlton', 'St. Regis', 'Mandarin Oriental',
      'Peninsula', 'Aman', 'Six Senses', 'Rosewood', 'Belmond'
    ];
    if (luxuryChains.some(c => chain.includes(c))) {
      breakdown.luxury_chain = 15;
      total += 15;
    } else {
      breakdown.chain_property = 5;
      total += 5;
    }
  } else {
    breakdown.independent = 5;
    total += 5;
  }

  // === MARKET (max 15) ===
  const premiumMarkets = [
    'london', 'paris', 'dubai', 'new york', 'miami', 'singapore',
    'hong kong', 'tokyo', 'maldives', 'monaco', 'zurich', 'geneva'
  ];
  const city = ((prospect.city as string) || '').toLowerCase();
  if (premiumMarkets.some(market => city.includes(market))) {
    breakdown.premium_market = 15;
    total += 15;
  }

  // === HIRING SIGNALS (max 20) ===
  const jobTitle = ((prospect.source_job_title as string) || '').toLowerCase();

  const seniorRoles = [
    'general manager', 'gm', 'director', 'ceo', 'owner',
    'managing director', 'president'
  ];
  if (seniorRoles.some(role => jobTitle.includes(role))) {
    breakdown.senior_decision_maker = 15;
    total += 15;
  }

  const growthRoles = ['revenue', 'marketing', 'digital', 'sales', 'technology', 'innovation'];
  if (growthRoles.some(role => jobTitle.includes(role))) {
    breakdown.growth_focused = 10;
    total += 10;
  }

  const opsRoles = ['operations', 'f&b', 'food', 'rooms division'];
  if (opsRoles.some(role => jobTitle.includes(role))) {
    breakdown.operations_role = 5;
    total += 5;
  }

  return { total, breakdown };
}

export function getTier(score: number): string {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}
