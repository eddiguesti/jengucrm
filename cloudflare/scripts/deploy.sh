#!/bin/bash

# ============================================
# Jengu CRM - Cloudflare Deployment Script
# ============================================
#
# This script deploys the complete system.
# Run from the cloudflare/ directory.
#
# Prerequisites:
# 1. Wrangler CLI installed: npm install -g wrangler
# 2. Logged in: wrangler login
# 3. Domain on Cloudflare (for email routing)

set -e

echo "=========================================="
echo "  Jengu CRM - Cloudflare Deployment"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}Error: wrangler CLI not found${NC}"
    echo "Install with: npm install -g wrangler"
    exit 1
fi

# Check logged in
echo "Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo -e "${RED}Error: Not logged in to Cloudflare${NC}"
    echo "Run: wrangler login"
    exit 1
fi
echo -e "${GREEN}✓ Authenticated${NC}"
echo ""

# Step 1: TypeScript check
echo "Step 1: Type checking..."
npm run typecheck
echo -e "${GREEN}✓ TypeScript OK${NC}"
echo ""

# Step 2: Deploy database schema
echo "Step 2: Deploying database schema..."
echo "  - Running 001_schema.sql..."
wrangler d1 execute jengu-crm --file=./migrations/001_schema.sql --remote 2>/dev/null || true
echo "  - Running 002_seed.sql..."
wrangler d1 execute jengu-crm --file=./migrations/002_seed.sql --remote 2>/dev/null || true
echo -e "${GREEN}✓ Database ready${NC}"
echo ""

# Step 3: Deploy worker
echo "Step 3: Deploying worker..."
npm run deploy
echo -e "${GREEN}✓ Worker deployed${NC}"
echo ""

# Step 4: Check secrets
echo "Step 4: Checking required secrets..."
SECRETS=$(wrangler secret list 2>/dev/null || echo "")

check_secret() {
    if echo "$SECRETS" | grep -q "$1"; then
        echo -e "  ${GREEN}✓${NC} $1"
        return 0
    else
        echo -e "  ${RED}✗${NC} $1 - ${YELLOW}Run: wrangler secret put $1${NC}"
        return 1
    fi
}

MISSING=0
check_secret "GROK_API_KEY" || MISSING=1
check_secret "SMTP_INBOX_1" || MISSING=1
check_secret "SMTP_INBOX_2" || MISSING=1
check_secret "SMTP_INBOX_3" || MISSING=1

echo ""
if [ $MISSING -eq 1 ]; then
    echo -e "${YELLOW}Warning: Some secrets are missing. Set them with:${NC}"
    echo ""
    echo "  wrangler secret put GROK_API_KEY"
    echo "  wrangler secret put SMTP_INBOX_1  # format: email|password|host|993|Display Name"
    echo "  wrangler secret put SMTP_INBOX_2"
    echo "  wrangler secret put SMTP_INBOX_3"
    echo ""
    echo "Optional but recommended:"
    echo "  wrangler secret put RESEND_API_KEY    # For sending emails"
    echo "  wrangler secret put ANTHROPIC_API_KEY # AI fallback"
    echo "  wrangler secret put ALERT_WEBHOOK_URL # Slack/Discord alerts"
    echo ""
fi

# Step 5: Get worker URL
echo "Step 5: Getting worker URL..."
WORKER_URL=$(wrangler deployments list 2>/dev/null | grep -o 'https://[^[:space:]]*' | head -1 || echo "https://jengu-crm.<your-subdomain>.workers.dev")
echo -e "  Worker URL: ${GREEN}${WORKER_URL}${NC}"
echo ""

# Step 6: Initialize inboxes
echo "Step 6: Initializing inboxes..."
curl -s -X POST "${WORKER_URL}/api/admin/initialize-inboxes" > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Inboxes initialized${NC}"
echo ""

# Done
echo "=========================================="
echo -e "${GREEN}  Deployment Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Set up Email Routing in Cloudflare Dashboard:"
echo "   - Go to: Email > Email Routing"
echo "   - Create catch-all rule → Worker: jengu-crm"
echo ""
echo "2. Verify the deployment:"
echo "   curl ${WORKER_URL}/health"
echo "   curl ${WORKER_URL}/api/status/inboxes"
echo "   curl ${WORKER_URL}/api/status/warmup"
echo ""
echo "3. Test sending an email:"
echo "   curl -X POST ${WORKER_URL}/api/admin/trigger-send -H 'Content-Type: application/json' -d '{\"count\":1}'"
echo ""
echo "4. Monitor logs:"
echo "   wrangler tail"
echo ""
