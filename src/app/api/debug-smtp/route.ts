import { NextResponse } from 'next/server';
import { getSmtpInboxes } from '@/lib/email';

export async function GET() {
  const raw1 = process.env.SMTP_INBOX_1;
  const raw2 = process.env.SMTP_INBOX_2;
  const raw3 = process.env.SMTP_INBOX_3;

  const inboxes = getSmtpInboxes();

  return NextResponse.json({
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
