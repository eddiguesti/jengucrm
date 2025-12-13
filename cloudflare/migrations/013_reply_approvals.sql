-- Step 09: Reply Detection & Processing
-- Tables for reply approvals and notifications

-- Reply approvals table - stores one-click approval tokens
CREATE TABLE IF NOT EXISTS reply_approvals (
  id TEXT PRIMARY KEY,                    -- UUID token for approval link
  reply_id TEXT NOT NULL,                 -- Reference to the inbound reply email
  prospect_id TEXT NOT NULL,              -- Prospect we're replying to
  suggested_reply TEXT NOT NULL,          -- Pre-generated reply content
  recipient_email TEXT NOT NULL,          -- Email address to send reply to
  prospect_name TEXT NOT NULL,            -- For display in notification
  sent INTEGER NOT NULL DEFAULT 0,        -- 0 = pending, 1 = sent
  sent_at TEXT,                           -- When the reply was sent
  expires_at TEXT NOT NULL,               -- Token expiry (24 hours from creation)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (reply_id) REFERENCES emails(id),
  FOREIGN KEY (prospect_id) REFERENCES prospects(id)
);

-- Indexes for reply_approvals
CREATE INDEX IF NOT EXISTS idx_reply_approvals_prospect ON reply_approvals(prospect_id);
CREATE INDEX IF NOT EXISTS idx_reply_approvals_expires ON reply_approvals(expires_at);
CREATE INDEX IF NOT EXISTS idx_reply_approvals_sent ON reply_approvals(sent);

-- Notifications table - stores pending notification emails to edd@jengu.ai
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,                    -- UUID
  type TEXT NOT NULL,                     -- 'reply_alert', 'bounce_alert', 'system_alert'
  recipient TEXT NOT NULL,                -- Who to notify (edd@jengu.ai)
  subject TEXT NOT NULL,                  -- Email subject
  body TEXT NOT NULL,                     -- Email body
  prospect_id TEXT,                       -- Related prospect (if applicable)
  reply_id TEXT,                          -- Related reply (if applicable)
  sent INTEGER NOT NULL DEFAULT 0,        -- 0 = pending, 1 = sent
  sent_at TEXT,                           -- When notification was sent
  error TEXT,                             -- Any error during send
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (prospect_id) REFERENCES prospects(id),
  FOREIGN KEY (reply_id) REFERENCES emails(id)
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_sent ON notifications(sent);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
