#!/bin/bash
# Overnight enrichment - runs website finder then email finder

cd /Users/edd/Documents/Jengu/marketing-agent

echo "=== OVERNIGHT ENRICHMENT STARTED: $(date) ===" >> /tmp/enrichment.log

# Step 1: Find websites for all prospects (up to 5000)
echo "Starting website finder..." >> /tmp/enrichment.log
npx tsx scripts/find-websites-grok.ts --limit=5000 >> /tmp/enrichment.log 2>&1

echo "Website finder complete: $(date)" >> /tmp/enrichment.log

# Step 2: Find emails for prospects with websites (up to 1000)
echo "Starting email finder..." >> /tmp/enrichment.log
npx tsx scripts/enrich-with-millionverifier.ts --limit=1000 >> /tmp/enrichment.log 2>&1

echo "Email finder complete: $(date)" >> /tmp/enrichment.log

echo "=== OVERNIGHT ENRICHMENT COMPLETE: $(date) ===" >> /tmp/enrichment.log
