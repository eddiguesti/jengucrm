# Step 14: Deployment & Rollback

## ✅ DOCUMENTED - December 2024

## Goal
Deploy changes safely with minimal risk. Be able to quickly roll back if something goes wrong. Never deploy on Friday.

---

## Current Status

### What's Implemented

1. **Wrangler deploy** - `npx wrangler deploy` for Cloudflare Workers
2. **D1 migrations** - `npx wrangler d1 migrations apply`
3. **Rollback capability** - `npx wrangler rollback`
4. **Feature flags** - EMERGENCY_STOP flag in KV_CONFIG
5. **Health checks** - `/health` endpoint for post-deploy verification

### What's Documented Below

- Pre-deployment checklist
- Backward-compatible migration patterns
- Environment validation
- Safe deployment scripts
- Rollback procedures
- Zero-downtime deployment patterns

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT FLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Code Change → CI Tests → Staging Deploy → Prod Deploy      │
│       │           │            │               │            │
│       ▼           ▼            ▼               ▼            │
│    Commit      Pass?       Smoke Test      Gradual         │
│               No→Stop      Pass?           Rollout         │
│                           No→Fix                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## What to Verify

- [ ] All changes go through CI/CD pipeline
- [ ] Staging environment mirrors production
- [ ] Database migrations are backward-compatible
- [ ] Rollback procedure is documented and tested
- [ ] Feature flags exist for risky changes
- [ ] Deployment does not interrupt in-flight operations

---

## Common Deployment Failures

| Failure | Impact | Prevention |
|---------|--------|------------|
| Breaking schema change | App crashes | Backward-compatible migrations |
| Missing env variable | Silent failures | Validate env on startup |
| Incompatible code/DB | Data corruption | Two-phase deploy |
| Forgot to deploy worker | Old behavior | Automated deployment |
| Failed migration rollback | Stuck state | Test rollback scripts |

---

## How to Make It Robust

### 1. Pre-Deployment Checklist

**File: `cloudflare/scripts/pre-deploy-check.ts`**
```typescript
import { execSync } from 'child_process';

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

async function runPreDeployChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. Check all tests pass
  try {
    execSync('npm test', { stdio: 'pipe' });
    results.push({ name: 'Tests', passed: true, message: 'All tests passed' });
  } catch (e) {
    results.push({ name: 'Tests', passed: false, message: 'Tests failed' });
  }

  // 2. Check TypeScript compiles
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
    results.push({ name: 'TypeScript', passed: true, message: 'No type errors' });
  } catch (e) {
    results.push({ name: 'TypeScript', passed: false, message: 'Type errors found' });
  }

  // 3. Check no console.log in production code
  try {
    const output = execSync('grep -r "console.log" src/ --include="*.ts" || true', {
      encoding: 'utf-8',
    });
    const hasLogs = output.trim().length > 0;
    results.push({
      name: 'Console logs',
      passed: !hasLogs,
      message: hasLogs ? 'Remove console.log statements' : 'No console.log found',
    });
  } catch (e) {
    results.push({ name: 'Console logs', passed: true, message: 'Check passed' });
  }

  // 4. Check migrations are sequential
  const migrationCheck = checkMigrationSequence();
  results.push(migrationCheck);

  // 5. Check not Friday
  const day = new Date().getDay();
  results.push({
    name: 'Not Friday',
    passed: day !== 5,
    message: day === 5 ? 'DO NOT DEPLOY ON FRIDAY!' : 'Safe to deploy',
  });

  // 6. Check current branch
  const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
  results.push({
    name: 'Branch',
    passed: branch === 'main',
    message: `Current branch: ${branch}`,
  });

  return results;
}

function checkMigrationSequence(): CheckResult {
  const fs = require('fs');
  const path = require('path');

  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql'));

  const numbers = files.map((f: string) => parseInt(f.split('_')[0])).sort((a: number, b: number) => a - b);

  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] !== numbers[i - 1] + 1) {
      return {
        name: 'Migration sequence',
        passed: false,
        message: `Gap in migrations: ${numbers[i - 1]} to ${numbers[i]}`,
      };
    }
  }

  return {
    name: 'Migration sequence',
    passed: true,
    message: `${files.length} migrations in sequence`,
  };
}

// Run checks
runPreDeployChecks().then(results => {
  console.log('\n=== Pre-Deployment Checks ===\n');

  let allPassed = true;
  for (const result of results) {
    const icon = result.passed ? '✓' : '✗';
    console.log(`${icon} ${result.name}: ${result.message}`);
    if (!result.passed) allPassed = false;
  }

  console.log('\n');
  if (allPassed) {
    console.log('All checks passed. Safe to deploy.');
    process.exit(0);
  } else {
    console.log('DEPLOYMENT BLOCKED: Fix issues above first.');
    process.exit(1);
  }
});
```

### 2. Backward-Compatible Migrations

**Rule: Add before remove, never rename**

```sql
-- GOOD: Adding a column (backward compatible)
ALTER TABLE prospects ADD COLUMN new_field TEXT;

-- GOOD: Making column nullable (backward compatible)
-- (SQLite doesn't support ALTER COLUMN, so recreate table)

-- BAD: Removing column in same deploy as code change
ALTER TABLE prospects DROP COLUMN old_field;

-- BAD: Renaming column
ALTER TABLE prospects RENAME COLUMN old_name TO new_name;
```

**Two-Phase Migration Pattern:**

```
Phase 1 (Deploy 1):
- Add new column
- Update code to write to BOTH old and new columns
- Deploy code change

Phase 2 (Deploy 2, days later):
- Update code to read from new column only
- Deploy code change

Phase 3 (Deploy 3, weeks later):
- Remove old column
- Deploy migration
```

### 3. Environment Validation

**File: `cloudflare/src/lib/env-validator.ts`**
```typescript
interface EnvRequirements {
  required: string[];
  optional: string[];
}

const ENV_REQUIREMENTS: EnvRequirements = {
  required: [
    'GROK_API_KEY',
    'MILLIONVERIFIER_API_KEY',
    'SMTP_INBOX_1',
  ],
  optional: [
    'SMTP_INBOX_2',
    'SMTP_INBOX_3',
    'SMTP_INBOX_4',
    'ALERT_WEBHOOK_URL',
    'DEBUG_MODE',
  ],
};

export function validateEnvironment(env: Record<string, unknown>): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const key of ENV_REQUIREMENTS.required) {
    if (!env[key]) {
      missing.push(key);
    }
  }

  // Check optional variables
  for (const key of ENV_REQUIREMENTS.optional) {
    if (!env[key]) {
      warnings.push(key);
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    console.log(`[WARN] Optional env vars not set: ${warnings.join(', ')}`);
  }

  // Throw on missing required
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate formats
  validateSmtpFormat(env);
}

function validateSmtpFormat(env: Record<string, unknown>): void {
  for (let i = 1; i <= 4; i++) {
    const key = `SMTP_INBOX_${i}`;
    const value = env[key] as string;

    if (value) {
      const parts = value.split('|');
      if (parts.length < 4) {
        throw new Error(`${key} format invalid. Expected: email|password|host|port|displayName`);
      }
    }
  }
}
```

### 4. Safe Deployment Script

**File: `cloudflare/scripts/deploy.sh`**
```bash
#!/bin/bash
set -e

echo "=== Cloudflare Worker Deployment ==="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check not Friday
DAY=$(date +%u)
if [ "$DAY" -eq 5 ]; then
    echo -e "${RED}ERROR: No deployments on Friday!${NC}"
    exit 1
fi

# Run pre-deploy checks
echo -e "${YELLOW}Running pre-deploy checks...${NC}"
npx tsx scripts/pre-deploy-check.ts
if [ $? -ne 0 ]; then
    echo -e "${RED}Pre-deploy checks failed. Aborting.${NC}"
    exit 1
fi

# Get current deployment ID for rollback
echo -e "${YELLOW}Getting current deployment...${NC}"
CURRENT_DEPLOYMENT=$(npx wrangler deployments list --json 2>/dev/null | jq -r '.[0].id' || echo "none")
echo "Current deployment: $CURRENT_DEPLOYMENT"

# Run migrations first
echo -e "${YELLOW}Running D1 migrations...${NC}"
npx wrangler d1 migrations apply marketing-agent-db --remote

# Deploy worker
echo -e "${YELLOW}Deploying worker...${NC}"
npx wrangler deploy

# Get new deployment ID
NEW_DEPLOYMENT=$(npx wrangler deployments list --json 2>/dev/null | jq -r '.[0].id' || echo "unknown")

# Run smoke tests
echo -e "${YELLOW}Running smoke tests...${NC}"
sleep 5  # Wait for deployment to propagate

HEALTH_RESPONSE=$(curl -s "https://marketing-agent.jengu.workers.dev/health")
if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}Health check passed${NC}"
else
    echo -e "${RED}Health check failed! Rolling back...${NC}"
    echo "Response: $HEALTH_RESPONSE"

    if [ "$CURRENT_DEPLOYMENT" != "none" ]; then
        npx wrangler rollback "$CURRENT_DEPLOYMENT"
        echo -e "${YELLOW}Rolled back to: $CURRENT_DEPLOYMENT${NC}"
    fi
    exit 1
fi

# Success
echo -e "${GREEN}=== Deployment Successful ===${NC}"
echo "New deployment: $NEW_DEPLOYMENT"
echo "Previous: $CURRENT_DEPLOYMENT (for rollback)"

# Save rollback info
echo "$CURRENT_DEPLOYMENT" > .last-deployment
```

### 5. Feature Flags

**File: `cloudflare/src/lib/feature-flags.ts`**
```typescript
interface FeatureFlags {
  // Email features
  SEND_EMAILS_ENABLED: boolean;
  MAX_EMAILS_PER_RUN: number;

  // Enrichment features
  ENRICHMENT_ENABLED: boolean;
  WEBSITE_FINDER_ENABLED: boolean;

  // New/experimental features
  NEW_EMAIL_TEMPLATE_ENABLED: boolean;
  AI_REPLY_CLASSIFICATION: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  SEND_EMAILS_ENABLED: true,
  MAX_EMAILS_PER_RUN: 5,
  ENRICHMENT_ENABLED: true,
  WEBSITE_FINDER_ENABLED: true,
  NEW_EMAIL_TEMPLATE_ENABLED: false,
  AI_REPLY_CLASSIFICATION: false,
};

export async function getFeatureFlags(env: Env): Promise<FeatureFlags> {
  try {
    const stored = await env.KV_CONFIG.get('feature_flags');
    if (stored) {
      return { ...DEFAULT_FLAGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to load feature flags:', e);
  }
  return DEFAULT_FLAGS;
}

export async function setFeatureFlag(
  env: Env,
  flag: keyof FeatureFlags,
  value: boolean | number
): Promise<void> {
  const flags = await getFeatureFlags(env);
  (flags as Record<string, unknown>)[flag] = value;
  await env.KV_CONFIG.put('feature_flags', JSON.stringify(flags));
}

// Usage in code:
// const flags = await getFeatureFlags(env);
// if (flags.SEND_EMAILS_ENABLED) { ... }
```

### 6. Rollback Procedure

**File: `cloudflare/scripts/rollback.sh`**
```bash
#!/bin/bash
set -e

echo "=== Emergency Rollback ==="

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Option 1: Rollback to last known good deployment
if [ -f ".last-deployment" ]; then
    LAST_DEPLOYMENT=$(cat .last-deployment)
    echo "Rolling back to: $LAST_DEPLOYMENT"
    npx wrangler rollback "$LAST_DEPLOYMENT"
    echo -e "${GREEN}Rollback complete${NC}"
    exit 0
fi

# Option 2: List deployments and pick one
echo "Available deployments:"
npx wrangler deployments list

echo ""
read -p "Enter deployment ID to rollback to: " DEPLOYMENT_ID

if [ -n "$DEPLOYMENT_ID" ]; then
    npx wrangler rollback "$DEPLOYMENT_ID"
    echo -e "${GREEN}Rollback complete${NC}"
else
    echo -e "${RED}No deployment ID provided${NC}"
    exit 1
fi
```

### 7. Database Migration Rollback

**File: `cloudflare/migrations/rollback/007_rollback.sql`**
```sql
-- Rollback for 007_failed_tasks.sql
-- Run manually if needed: wrangler d1 execute marketing-agent-db --file=migrations/rollback/007_rollback.sql

DROP TABLE IF EXISTS failed_tasks;
DROP INDEX IF EXISTS idx_failed_tasks_type;
DROP INDEX IF EXISTS idx_failed_tasks_created;
```

**Migration rollback tracking:**
```sql
-- Track which migrations have been applied
CREATE TABLE IF NOT EXISTS _migration_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_name TEXT UNIQUE NOT NULL,
  applied_at TEXT DEFAULT (datetime('now')),
  rolled_back_at TEXT
);
```

### 8. Zero-Downtime Deployment

```
┌─────────────────────────────────────────────────────────┐
│               ZERO-DOWNTIME DEPLOY                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Deploy new worker version                           │
│     └── Old version keeps running                       │
│                                                         │
│  2. Cloudflare gradually shifts traffic                 │
│     └── 10% → 50% → 100%                               │
│                                                         │
│  3. Monitor metrics during rollout                      │
│     └── Error rate, latency, success rate              │
│                                                         │
│  4. Auto-rollback if errors spike                       │
│     └── Return to previous version                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 9. Post-Deployment Verification

**File: `cloudflare/scripts/post-deploy-verify.ts`**
```typescript
const WORKER_URL = 'https://marketing-agent.jengu.workers.dev';

interface VerifyResult {
  endpoint: string;
  status: 'pass' | 'fail';
  message: string;
  latency: number;
}

async function verifyDeployment(): Promise<void> {
  const results: VerifyResult[] = [];

  // Test endpoints
  const tests = [
    { path: '/health', expectedStatus: 200 },
    { path: '/api/stats', expectedStatus: 200 },
    { path: '/api/campaigns', expectedStatus: 200 },
    { path: '/api/prospects?limit=1', expectedStatus: 200 },
  ];

  for (const test of tests) {
    const start = Date.now();
    try {
      const response = await fetch(`${WORKER_URL}${test.path}`);
      const latency = Date.now() - start;

      results.push({
        endpoint: test.path,
        status: response.status === test.expectedStatus ? 'pass' : 'fail',
        message: `Status: ${response.status} (expected ${test.expectedStatus})`,
        latency,
      });
    } catch (error) {
      results.push({
        endpoint: test.path,
        status: 'fail',
        message: `Error: ${error}`,
        latency: Date.now() - start,
      });
    }
  }

  // Print results
  console.log('\n=== Post-Deployment Verification ===\n');

  let allPassed = true;
  for (const result of results) {
    const icon = result.status === 'pass' ? '✓' : '✗';
    console.log(`${icon} ${result.endpoint}: ${result.message} (${result.latency}ms)`);
    if (result.status === 'fail') allPassed = false;
  }

  // Check average latency
  const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;
  console.log(`\nAverage latency: ${avgLatency.toFixed(0)}ms`);

  if (avgLatency > 2000) {
    console.log('WARNING: High latency detected');
    allPassed = false;
  }

  console.log('\n');
  if (allPassed) {
    console.log('All verifications passed.');
  } else {
    console.log('VERIFICATION FAILED - Consider rollback');
    process.exit(1);
  }
}

verifyDeployment();
```

---

## Deployment Checklist

### Before Deploying
- [ ] All tests pass locally
- [ ] TypeScript compiles without errors
- [ ] Migrations are backward-compatible
- [ ] Feature flags in place for risky changes
- [ ] Not Friday
- [ ] Team aware of deployment

### During Deployment
- [ ] Run pre-deploy checks
- [ ] Note current deployment ID for rollback
- [ ] Apply migrations first
- [ ] Deploy worker
- [ ] Run smoke tests immediately

### After Deployment
- [ ] Verify health endpoint
- [ ] Check key API endpoints respond
- [ ] Monitor error rates for 15 minutes
- [ ] Verify cron jobs still running
- [ ] Check no spike in bounces/errors

---

## Emergency Procedures

### If Something Breaks

1. **Immediate**: Run `./scripts/rollback.sh`
2. **If rollback fails**: Disable via feature flag:
   ```bash
   curl -X POST https://worker/api/config \
     -d '{"SEND_EMAILS_ENABLED": false}'
   ```
3. **If both fail**: Contact Cloudflare support

### Rollback Decision Tree

```
Error detected after deploy?
├── Yes, critical (data loss, crashes)
│   └── Immediate rollback
├── Yes, minor (slow, intermittent)
│   └── Monitor 10 min, then decide
└── No errors
    └── Continue monitoring
```

---

## Verification Checklist

- [ ] Pre-deploy script exists and runs
- [ ] Rollback script exists and tested
- [ ] Feature flags implemented
- [ ] Migration rollbacks documented
- [ ] Post-deploy verification automated
- [ ] No Friday deploy rule enforced
- [ ] Team knows rollback procedure
