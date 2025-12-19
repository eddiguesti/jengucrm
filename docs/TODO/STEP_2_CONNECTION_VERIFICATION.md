# STEP 2 — UI to Backend Connection Verification

## Goal
Confirm **every UI interaction triggers real backend logic**.

## Instructions for Claude
For EACH UI element identified in Step 1:
- Locate frontend handler
- Locate backend endpoint/function
- Verify request/response
- Verify database or external service interaction

## Output Required
Connection Matrix:
Feature | UI Trigger | Backend Function | External Service | Status

## Rules
- No mocked data
- No hard-coded responses
- No dead buttons
