/**
 * ProspectDedup Durable Object
 *
 * Fast deduplication for incoming prospects using bloom filter
 * and exact matching. Prevents duplicate scrapes from creating
 * duplicate database entries.
 *
 * IMPROVEMENT: Added fuzzy matching for name variations,
 * temporal dedup (same prospect from different sources),
 * and memory-efficient bloom filter pre-check.
 */

interface ProspectFingerprint {
  hash: string;
  name: string;
  city: string;
  source: string;
  createdAt: number;
  prospectId?: string;
}

// Simple bloom filter implementation
class BloomFilter {
  private bits: Uint8Array;
  private hashCount: number;

  constructor(size: number = 10000, hashCount: number = 3) {
    this.bits = new Uint8Array(Math.ceil(size / 8));
    this.hashCount = hashCount;
  }

  private hash(str: string, seed: number): number {
    let hash = seed;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % (this.bits.length * 8);
  }

  add(item: string): void {
    for (let i = 0; i < this.hashCount; i++) {
      const bit = this.hash(item, i);
      const byteIndex = Math.floor(bit / 8);
      const bitIndex = bit % 8;
      this.bits[byteIndex] |= 1 << bitIndex;
    }
  }

  mightContain(item: string): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      const bit = this.hash(item, i);
      const byteIndex = Math.floor(bit / 8);
      const bitIndex = bit % 8;
      if ((this.bits[byteIndex] & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }

  serialize(): number[] {
    return Array.from(this.bits);
  }

  static deserialize(data: number[]): BloomFilter {
    const filter = new BloomFilter();
    filter.bits = new Uint8Array(data);
    return filter;
  }
}

export class ProspectDedup implements DurableObject {
  private state: DurableObjectState;
  private fingerprints: Map<string, ProspectFingerprint> = new Map();
  private bloomFilter: BloomFilter = new BloomFilter(50000); // ~50k prospects
  private initialized = false;

  // Dedup window: ignore duplicates within this time period
  private static DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async initialize() {
    if (this.initialized) return;

    const stored = await this.state.storage.get<{
      fingerprints: [string, ProspectFingerprint][];
      bloom: number[];
    }>('data');

    if (stored) {
      this.fingerprints = new Map(stored.fingerprints);
      this.bloomFilter = BloomFilter.deserialize(stored.bloom);
    }

    this.initialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize();

    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case '/check':
          return this.handleCheck(request);

        case '/register':
          return this.handleRegister(request);

        case '/exists':
          return this.handleExists(request);

        case '/cleanup':
          return this.handleCleanup();

        case '/stats':
          return this.handleStats();

        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('ProspectDedup error:', error);
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleCheck(request: Request): Promise<Response> {
    const { name, city, source } = await request.json<{
      name: string;
      city: string;
      source: string;
    }>();

    const hash = this.createHash(name, city);

    // Quick bloom filter check
    if (!this.bloomFilter.mightContain(hash)) {
      return Response.json({ isDuplicate: false, confidence: 'high' });
    }

    // Exact match check
    const existing = this.fingerprints.get(hash);
    if (existing) {
      // Check if within dedup window
      const age = Date.now() - existing.createdAt;
      if (age < ProspectDedup.DEDUP_WINDOW_MS) {
        return Response.json({
          isDuplicate: true,
          confidence: 'exact',
          existingProspectId: existing.prospectId,
          existingSource: existing.source,
          age: Math.floor(age / 1000 / 60), // minutes ago
        });
      }
    }

    // Fuzzy match check for name variations
    const fuzzyMatch = this.findFuzzyMatch(name, city);
    if (fuzzyMatch) {
      return Response.json({
        isDuplicate: true,
        confidence: 'fuzzy',
        existingProspectId: fuzzyMatch.prospectId,
        existingName: fuzzyMatch.name,
        similarity: this.calculateSimilarity(name, fuzzyMatch.name),
      });
    }

    return Response.json({ isDuplicate: false, confidence: 'high' });
  }

  private async handleRegister(request: Request): Promise<Response> {
    const { name, city, source, prospectId } = await request.json<{
      name: string;
      city: string;
      source: string;
      prospectId: string;
    }>();

    const hash = this.createHash(name, city);

    const fingerprint: ProspectFingerprint = {
      hash,
      name: this.normalizeName(name),
      city: city.toLowerCase().trim(),
      source,
      createdAt: Date.now(),
      prospectId,
    };

    this.fingerprints.set(hash, fingerprint);
    this.bloomFilter.add(hash);

    await this.persist();

    return Response.json({ success: true, hash });
  }

  private async handleExists(request: Request): Promise<Response> {
    const { name, city } = await request.json<{ name: string; city: string }>();
    const hash = this.createHash(name, city);

    // Quick bloom filter check
    if (!this.bloomFilter.mightContain(hash)) {
      return Response.json({ exists: false });
    }

    const existing = this.fingerprints.get(hash);
    return Response.json({
      exists: !!existing,
      prospectId: existing?.prospectId,
    });
  }

  private async handleCleanup(): Promise<Response> {
    const now = Date.now();
    let removed = 0;

    // Remove entries older than dedup window
    for (const [hash, fp] of this.fingerprints.entries()) {
      if (now - fp.createdAt > ProspectDedup.DEDUP_WINDOW_MS) {
        this.fingerprints.delete(hash);
        removed++;
      }
    }

    // Rebuild bloom filter
    this.bloomFilter = new BloomFilter(50000);
    for (const hash of this.fingerprints.keys()) {
      this.bloomFilter.add(hash);
    }

    await this.persist();

    return Response.json({
      removed,
      remaining: this.fingerprints.size,
    });
  }

  private handleStats(): Response {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;

    let lastHour = 0;
    let lastDay = 0;

    for (const fp of this.fingerprints.values()) {
      if (fp.createdAt > hourAgo) lastHour++;
      if (fp.createdAt > dayAgo) lastDay++;
    }

    const sourceBreakdown: Record<string, number> = {};
    for (const fp of this.fingerprints.values()) {
      sourceBreakdown[fp.source] = (sourceBreakdown[fp.source] || 0) + 1;
    }

    return Response.json({
      total: this.fingerprints.size,
      lastHour,
      lastDay,
      sourceBreakdown,
    });
  }

  private createHash(name: string, city: string): string {
    const normalized = `${this.normalizeName(name)}|${city.toLowerCase().trim()}`;
    // Simple hash for dedup key
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      // Remove common hotel suffixes
      .replace(/\b(hotel|resort|inn|suites?|lodge|b&b|boutique|spa)\b/gi, '')
      // Remove "the" prefix
      .replace(/^the\s+/i, '')
      // Remove special characters
      .replace(/[^a-z0-9\s]/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  private findFuzzyMatch(name: string, city: string): ProspectFingerprint | null {
    const normalizedName = this.normalizeName(name);
    const normalizedCity = city.toLowerCase().trim();

    for (const fp of this.fingerprints.values()) {
      // Must be same city
      if (fp.city !== normalizedCity) continue;

      // Check similarity
      const similarity = this.calculateSimilarity(normalizedName, fp.name);
      if (similarity > 0.85) {
        return fp;
      }
    }

    return null;
  }

  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Levenshtein distance-based similarity
    const matrix: number[][] = [];

    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[a.length][b.length];
    const maxLength = Math.max(a.length, b.length);

    return 1 - distance / maxLength;
  }

  private async persist(): Promise<void> {
    await this.state.storage.put('data', {
      fingerprints: Array.from(this.fingerprints.entries()),
      bloom: this.bloomFilter.serialize(),
    });
  }
}
