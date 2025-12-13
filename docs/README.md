# Jengu CRM Documentation

This directory contains all technical documentation for the Jengu CRM system.

## Quick Navigation

| I want to... | Go to |
|--------------|-------|
| Understand the system architecture | [architecture/overview.md](architecture/overview.md) |
| See API endpoints | [api/cloudflare-api.md](api/cloudflare-api.md) |
| Learn about reliability features | [reliability/](#reliability-implementation) |
| Deploy or rollback | [reliability/step-14-deployment-rollback.md](reliability/step-14-deployment-rollback.md) |
| Troubleshoot an issue | [reliability/step-15-operational-runbooks.md](reliability/step-15-operational-runbooks.md) |

---

## Directory Structure

```
docs/
├── README.md                    # This file
├── architecture/                # System design & architecture
│   ├── overview.md              # High-level architecture
│   └── system-documentation.md  # Detailed system docs
├── api/                         # API documentation
│   └── cloudflare-api.md        # Cloudflare Worker API reference
├── reliability/                 # 15-step reliability implementation
│   └── step-*.md                # Individual implementation steps
└── archive/                     # Historical planning documents
    └── *.md                     # Audit reports, old plans, etc.
```

---

## Architecture

| Document | Description |
|----------|-------------|
| [overview.md](architecture/overview.md) | System architecture v2 with data flow diagrams |
| [system-documentation.md](architecture/system-documentation.md) | Comprehensive system documentation |

---

## API Reference

| Document | Description |
|----------|-------------|
| [cloudflare-api.md](api/cloudflare-api.md) | Cloudflare Worker API endpoints |

---

## Reliability Implementation

The system follows a 15-step reliability plan. All steps are implemented or documented.

### Core Infrastructure (Steps 1-4)

| Step | Name | Status |
|------|------|--------|
| [01](reliability/step-01-architecture-contracts.md) | Architecture & Contracts | ✅ Implemented |
| [02](reliability/step-02-data-model-source-of-truth.md) | Data Model & Source of Truth | ✅ Implemented |
| [03](reliability/step-03-idempotency-deduplication.md) | Idempotency & Deduplication | ✅ Implemented |
| [04](reliability/step-04-queue-architecture.md) | Queue Architecture | ✅ Implemented |

### Rate Limiting & Email Safety (Steps 5-8)

| Step | Name | Status |
|------|------|--------|
| [05](reliability/step-05-rate-limiting.md) | Rate Limiting | ✅ Implemented |
| [06](reliability/step-06-email-sending-safety.md) | Email Sending Safety | ✅ Implemented |
| [07](reliability/step-07-deliverability-protections.md) | Deliverability Protections | ✅ Implemented |
| [08](reliability/step-08-bounce-complaint-handling.md) | Bounce & Complaint Handling | ✅ Implemented |

### Reply Processing & Sync (Steps 9-12)

| Step | Name | Status |
|------|------|--------|
| [09](reliability/step-09-reply-detection.md) | Reply Detection & Processing | ✅ Implemented |
| [10](reliability/step-10-crm-data-sync.md) | CRM Data Sync | ✅ Implemented |
| [11](reliability/step-11-observability-alerting.md) | Observability & Alerting | ✅ Implemented |
| [12](reliability/step-12-security-privacy.md) | Security & Privacy | ✅ Implemented |

### Operations (Steps 13-15)

| Step | Name | Status |
|------|------|--------|
| [13](reliability/step-13-testing-strategy.md) | Testing Strategy | ✅ Documented |
| [14](reliability/step-14-deployment-rollback.md) | Deployment & Rollback | ✅ Documented |
| [15](reliability/step-15-operational-runbooks.md) | Operational Runbooks | ✅ Documented |

---

## Key Operations Reference

### Emergency Stop
```bash
curl -X POST https://jengu-crm.edd-181.workers.dev/api/admin/emergency-stop
```

### Check System Health
```bash
curl https://jengu-crm.edd-181.workers.dev/health
```

### View Stats
```bash
curl https://jengu-crm.edd-181.workers.dev/api/stats
```

---

## Archive

Historical planning and audit documents (for reference only):

| Document | Description |
|----------|-------------|
| [audit-report.md](archive/audit-report.md) | System audit findings |
| [design-elevation-plan.md](archive/design-elevation-plan.md) | UI/UX improvement plan |
| [functional-improvements.md](archive/functional-improvements.md) | Feature improvement list |
| [outreach-strategy.md](archive/outreach-strategy.md) | Email outreach strategy docs |
| [refactor-plan.md](archive/refactor-plan.md) | Codebase refactoring plan |
| [system-audit.md](archive/system-audit.md) | Full system audit |
