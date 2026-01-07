import { NextResponse } from 'next/server';
import { getSmtpInboxes } from '@/lib/email';

export async function GET() {
  const raw1 = process.env.SMTP_INBOX_1;
  const raw2 = process.env.SMTP_INBOX_2;
  const raw3 = process.env.SMTP_INBOX_3;
  const cronSecret = process.env.CRON_SECRET;
  const mvApiKey = process.env.MILLIONVERIFIER_API_KEY;

  const inboxes = getSmtpInboxes();

  // Test MillionVerifier API if key is set
  let mvTest = null;
  if (mvApiKey) {
    try {
      const params = new URLSearchParams({
        api: mvApiKey,
        email: 'test@gmail.com',
        timeout: '5',
      });
      const response = await fetch(`https://api.millionverifier.com/api/v3/?${params}`);
      const data = await response.json();
      mvTest = {
        status: 'success',
        result: data.result,
        credits: data.credits,
      };
    } catch (error) {
      mvTest = {
        status: 'error',
        error: String(error),
      };
    }
  }

  return NextResponse.json({
    cron_secret_info: {
      is_set: !!cronSecret,
      length: cronSecret?.length || 0,
      prefix: cronSecret?.substring(0, 8) || 'NOT_SET',
    },
    millionverifier: {
      is_set: !!mvApiKey,
      key_prefix: mvApiKey?.substring(0, 8) || 'NOT_SET',
      test_result: mvTest,
    },
    raw_env_values: {
      SMTP_INBOX_1: raw1,
      SMTP_INBOX_2: raw2,
      SMTP_INBOX_3: raw3,
    },
    parsed_inboxes: inboxes.map(i => ({
      email: i.email,
      password_length: i.password?.length,
      password_first_3: i.password?.substring(0, 3),
      password_last_3: i.password?.substring(i.password.length - 3),
      host: i.host,
      port: i.port,
    })),
  });
}
