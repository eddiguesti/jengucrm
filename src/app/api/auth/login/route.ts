import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const APP_PASSWORD = process.env.APP_PASSWORD || 'JenguCRMbeta1!';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (password === APP_PASSWORD) {
      // Set a secure cookie that expires in 30 days
      const cookieStore = await cookies();
      cookieStore.set('auth_token', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid password' },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  // Logout - clear the cookie
  const cookieStore = await cookies();
  cookieStore.delete('auth_token');
  return NextResponse.json({ success: true });
}
