import { NextResponse } from 'next/server';
import { isSmtpConfigured, verifySmtpConnection } from '@/lib/email';

export async function GET() {
  try {
    const configured = isSmtpConfigured();

    if (!configured) {
      return NextResponse.json({
        configured: false,
        connected: false,
        error: 'Azure credentials not configured in environment variables',
      });
    }

    const connectionResult = await verifySmtpConnection();

    return NextResponse.json({
      configured: true,
      connected: connectionResult.success,
      error: connectionResult.error,
      sender: process.env.AZURE_MAIL_FROM || 'edd@jengu.ai',
    });
  } catch (error) {
    return NextResponse.json({
      configured: false,
      connected: false,
      error: String(error),
    });
  }
}
