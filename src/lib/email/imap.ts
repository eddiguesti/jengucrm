/**
 * IMAP inbox checking
 * Monitors inboxes for replies to outbound emails
 */

import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';

import type { SmtpInbox, IncomingEmail } from './types';
import { getSmtpInboxes, getGmailInboxes, GMAIL_SMTP_USER, GMAIL_SMTP_PASS, type GmailInbox } from './config';
import { logger } from '../logger';
import { TIMEOUTS } from '../constants';

/**
 * Check a single SMTP inbox for new emails via IMAP
 */
async function checkImapInbox(inbox: SmtpInbox, sinceDate: Date): Promise<IncomingEmail[]> {
  return new Promise((resolve) => {
    const emails: IncomingEmail[] = [];
    let resolved = false;
    let pendingParsing = 0;

    let imap: Imap | null = null;

    const timeout = setTimeout(() => {
      if (!resolved) {
        logger.info({ inbox: inbox.email, count: emails.length }, 'IMAP timeout');
        resolved = true;
        // Clean up connection on timeout
        if (imap) {
          try { imap.end(); } catch { /* ignore */ }
        }
        resolve(emails);
      }
    }, TIMEOUTS.IMAP_OPERATION);

    imap = new Imap({
      user: inbox.email,
      password: inbox.password,
      host: inbox.host,
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: TIMEOUTS.IMAP_CONNECTION,
      authTimeout: TIMEOUTS.IMAP_AUTH,
    });

    const finishIfComplete = () => {
      if (pendingParsing <= 0 && !resolved) {
        clearTimeout(timeout);
        resolved = true;
        resolve(emails);
      }
    };

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err) => {
        if (err) {
          logger.error({ inbox: inbox.email, error: err }, 'IMAP open box failed');
          clearTimeout(timeout);
          imap.end();
          if (!resolved) {
            resolved = true;
            resolve([]);
          }
          return;
        }

        const searchDate = sinceDate.toISOString().split('T')[0];
        imap.search(['ALL', ['SINCE', searchDate]], (searchErr, results) => {
          if (searchErr || !results || results.length === 0) {
            clearTimeout(timeout);
            imap.end();
            if (!resolved) {
              resolved = true;
              resolve([]);
            }
            return;
          }

          pendingParsing = results.length;

          const fetch = imap.fetch(results, {
            bodies: '',
            struct: true,
          });

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              let buffer = '';
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
              stream.once('end', async () => {
                try {
                  const parsed: ParsedMail = await simpleParser(buffer);
                  const fromAddress = parsed.from?.value?.[0]?.address || '';
                  const toAddress = parsed.to && !Array.isArray(parsed.to)
                    ? parsed.to.value?.[0]?.address || inbox.email
                    : inbox.email;

                  if (fromAddress.toLowerCase() !== inbox.email.toLowerCase()) {
                    const textBody = parsed.text || '';
                    const bodyPreview = textBody.substring(0, 500).replace(/\n+/g, ' ').trim();

                    emails.push({
                      messageId: parsed.messageId || `imap-${Date.now()}-${Math.random()}`,
                      from: fromAddress,
                      to: toAddress,
                      subject: parsed.subject || '(No subject)',
                      bodyPreview,
                      body: textBody,
                      receivedAt: parsed.date || new Date(),
                      inReplyTo: parsed.inReplyTo,
                      conversationId: parsed.references?.[0],
                      inboxEmail: inbox.email,
                    });
                  }
                } catch (parseErr) {
                  logger.error({ inbox: inbox.email, error: parseErr }, 'Email parse failed');
                }
                pendingParsing--;
                finishIfComplete();
              });
            });
          });

          fetch.once('error', (fetchErr) => {
            logger.error({ inbox: inbox.email, error: fetchErr }, 'IMAP fetch error');
          });

          fetch.once('end', () => {
            setTimeout(() => {
              imap.end();
            }, 500);
          });
        });
      });
    });

    imap.once('error', (imapErr: Error) => {
      logger.error({ inbox: inbox.email, error: imapErr }, 'IMAP connection error');
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve([]);
      }
    });

    imap.once('end', () => {
      setTimeout(() => {
        finishIfComplete();
      }, 500);
    });

    imap.connect();
  });
}

/**
 * Check all configured SMTP inboxes for replies via IMAP
 */
export async function checkAllInboxesForReplies(sinceDate: Date): Promise<IncomingEmail[]> {
  const inboxes = getSmtpInboxes();
  const allEmails: IncomingEmail[] = [];

  const results = await Promise.all(
    inboxes.map(inbox => checkImapInbox(inbox, sinceDate))
  );

  for (const emails of results) {
    allEmails.push(...emails);
  }

  allEmails.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

  return allEmails;
}

/**
 * Check a single Gmail inbox for replies
 */
async function checkSingleGmailInbox(inbox: GmailInbox, sinceDate: Date): Promise<IncomingEmail[]> {
  return new Promise((resolve) => {
    const emails: IncomingEmail[] = [];
    let resolved = false;
    let pendingParsing = 0;

    let imap: Imap | null = null;

    const timeout = setTimeout(() => {
      if (!resolved) {
        logger.info({ inbox: inbox.email, count: emails.length }, 'Gmail IMAP timeout');
        resolved = true;
        // Clean up connection on timeout
        if (imap) {
          try { imap.end(); } catch { /* ignore */ }
        }
        resolve(emails);
      }
    }, TIMEOUTS.IMAP_OPERATION);

    const finishIfComplete = () => {
      if (pendingParsing <= 0 && !resolved) {
        clearTimeout(timeout);
        resolved = true;
        resolve(emails);
      }
    };

    imap = new Imap({
      user: inbox.email,
      password: inbox.password,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: TIMEOUTS.IMAP_CONNECTION,
      authTimeout: TIMEOUTS.IMAP_AUTH,
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err) => {
        if (err) {
          logger.error({ inbox: inbox.email, error: err }, 'Gmail IMAP open box failed');
          clearTimeout(timeout);
          imap.end();
          if (!resolved) {
            resolved = true;
            resolve([]);
          }
          return;
        }

        const searchDate = sinceDate.toISOString().split('T')[0];
        imap.search(['ALL', ['SINCE', searchDate]], (searchErr, results) => {
          if (searchErr || !results || results.length === 0) {
            clearTimeout(timeout);
            imap.end();
            if (!resolved) {
              resolved = true;
              resolve([]);
            }
            return;
          }

          pendingParsing = results.length;

          const fetch = imap.fetch(results, {
            bodies: '',
            struct: true,
          });

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              let buffer = '';
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
              stream.once('end', async () => {
                try {
                  const parsed: ParsedMail = await simpleParser(buffer);
                  const fromAddress = parsed.from?.value?.[0]?.address || '';
                  const toAddress = parsed.to && !Array.isArray(parsed.to)
                    ? parsed.to.value?.[0]?.address || inbox.email
                    : inbox.email;

                  // Skip our own outbound emails
                  if (fromAddress.toLowerCase() === inbox.email.toLowerCase()) {
                    pendingParsing--;
                    finishIfComplete();
                    return;
                  }

                  const textBody = parsed.text || '';
                  const bodyPreview = textBody.substring(0, 500).replace(/\n+/g, ' ').trim();

                  emails.push({
                    messageId: parsed.messageId || `gmail-${Date.now()}-${Math.random()}`,
                    from: fromAddress,
                    to: toAddress,
                    subject: parsed.subject || '(No subject)',
                    bodyPreview,
                    body: textBody,
                    receivedAt: parsed.date || new Date(),
                    inReplyTo: parsed.inReplyTo,
                    conversationId: parsed.references?.[0],
                    inboxEmail: inbox.email,
                    gmailSenderName: inbox.senderName, // Include sender name for replies
                  });
                } catch (parseErr) {
                  logger.error({ inbox: inbox.email, error: parseErr }, 'Gmail parse failed');
                }
                pendingParsing--;
                finishIfComplete();
              });
            });
          });

          fetch.once('error', (fetchErr) => {
            logger.error({ inbox: inbox.email, error: fetchErr }, 'Gmail IMAP fetch error');
          });

          fetch.once('end', () => {
            setTimeout(() => {
              imap.end();
            }, 500);
          });
        });
      });
    });

    imap.once('error', (imapErr: Error) => {
      logger.error({ inbox: inbox.email, error: imapErr }, 'Gmail IMAP connection error');
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve([]);
      }
    });

    imap.once('end', () => {
      setTimeout(() => {
        finishIfComplete();
      }, 500);
    });

    imap.connect();
  });
}

/**
 * Check all Gmail inboxes for replies to mystery shopper emails
 */
export async function checkGmailForReplies(sinceDate: Date): Promise<IncomingEmail[]> {
  const gmailInboxes = getGmailInboxes();

  // If new multi-inbox format exists, use it
  if (gmailInboxes.length > 0) {
    const results = await Promise.all(
      gmailInboxes.map(inbox => checkSingleGmailInbox(inbox, sinceDate))
    );
    const allEmails = results.flat();
    allEmails.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    return allEmails;
  }

  // Fall back to legacy single Gmail account
  if (!GMAIL_SMTP_USER || !GMAIL_SMTP_PASS) {
    return [];
  }

  const legacyInbox: GmailInbox = {
    email: GMAIL_SMTP_USER,
    password: GMAIL_SMTP_PASS,
    senderName: GMAIL_SMTP_USER.split('@')[0],
  };

  return checkSingleGmailInbox(legacyInbox, sinceDate);
}
