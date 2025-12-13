/**
 * IMAP Reply Checker - Forwards to Cloudflare Worker
 *
 * Run this via cron-job.org or locally:
 * npx tsx scripts/check-imap-forward-to-cloudflare.ts
 *
 * Schedule: Every 5 minutes
 */

import Imap from 'imap';
import { simpleParser } from 'mailparser';

// Configuration - set these as environment variables
const CLOUDFLARE_WEBHOOK_URL = process.env.CLOUDFLARE_WEBHOOK_URL || 'https://jengu-crm.YOUR-SUBDOMAIN.workers.dev/webhook/email/inbound';

// IMAP inbox configurations (same format as your SMTP inboxes)
// Format: email|password|host|port|displayName
const IMAP_INBOXES = [
  process.env.SMTP_INBOX_1,
  process.env.SMTP_INBOX_2,
  process.env.SMTP_INBOX_3,
].filter(Boolean) as string[];

interface ParsedEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
}

async function checkInbox(inboxConfig: string): Promise<ParsedEmail[]> {
  const [email, password, host] = inboxConfig.split('|');
  const imapPort = 993; // Standard IMAP SSL port

  return new Promise((resolve, reject) => {
    const emails: ParsedEmail[] = [];

    const imap = new Imap({
      user: email,
      password: password,
      host: host,
      port: imapPort,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
      connTimeout: 10000,
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        // Search for unseen emails from the last 24 hours
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        imap.search(['UNSEEN', ['SINCE', yesterday]], (err, results) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          if (!results || results.length === 0) {
            console.log(`No new emails in ${email}`);
            imap.end();
            return resolve([]);
          }

          console.log(`Found ${results.length} unread emails in ${email}`);

          const fetch = imap.fetch(results, {
            bodies: '',
            markSeen: true,
          });

          fetch.on('message', (msg) => {
            msg.on('body', async (stream) => {
              try {
                const parsed = await simpleParser(stream);

                const fromAddress = Array.isArray(parsed.from?.value)
                  ? parsed.from.value[0]?.address
                  : parsed.from?.value?.address;

                const toAddress = Array.isArray(parsed.to?.value)
                  ? parsed.to.value[0]?.address
                  : (parsed.to?.value as any)?.address;

                if (fromAddress) {
                  emails.push({
                    messageId: parsed.messageId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    from: fromAddress,
                    to: toAddress || email,
                    subject: parsed.subject || '(no subject)',
                    body: parsed.text || parsed.html?.replace(/<[^>]*>/g, '') || '',
                    receivedAt: parsed.date?.toISOString() || new Date().toISOString(),
                  });
                }
              } catch (parseErr) {
                console.error('Error parsing email:', parseErr);
              }
            });
          });

          fetch.once('error', (err) => {
            console.error('Fetch error:', err);
          });

          fetch.once('end', () => {
            imap.end();
            resolve(emails);
          });
        });
      });
    });

    imap.once('error', (err: Error) => {
      console.error(`IMAP error for ${email}:`, err.message);
      reject(err);
    });

    imap.once('end', () => {
      console.log(`IMAP connection closed for ${email}`);
    });

    imap.connect();
  });
}

async function forwardToCloudflare(email: ParsedEmail): Promise<boolean> {
  try {
    const response = await fetch(CLOUDFLARE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(email),
    });

    if (response.ok) {
      console.log(`✓ Forwarded email from ${email.from} to Cloudflare`);
      return true;
    } else {
      console.error(`✗ Failed to forward: ${response.status} ${await response.text()}`);
      return false;
    }
  } catch (error) {
    console.error(`✗ Error forwarding email:`, error);
    return false;
  }
}

async function main() {
  console.log('=== IMAP Reply Checker ===');
  console.log(`Checking ${IMAP_INBOXES.length} inbox(es)...`);
  console.log(`Forwarding to: ${CLOUDFLARE_WEBHOOK_URL}`);
  console.log('');

  let totalEmails = 0;
  let forwardedEmails = 0;

  for (const inboxConfig of IMAP_INBOXES) {
    const [email] = inboxConfig.split('|');
    console.log(`Checking inbox: ${email}`);

    try {
      const emails = await checkInbox(inboxConfig);
      totalEmails += emails.length;

      for (const parsedEmail of emails) {
        // Skip our own sent emails
        if (parsedEmail.from === email) {
          console.log(`  Skipping own email from ${email}`);
          continue;
        }

        const success = await forwardToCloudflare(parsedEmail);
        if (success) forwardedEmails++;

        // Small delay between forwards
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (error) {
      console.error(`Failed to check ${email}:`, error);
    }

    console.log('');
  }

  console.log('=== Summary ===');
  console.log(`Total emails found: ${totalEmails}`);
  console.log(`Successfully forwarded: ${forwardedEmails}`);
}

main().catch(console.error);
