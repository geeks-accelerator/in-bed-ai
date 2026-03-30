import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.redirect(new URL('/docs/api', process.env.NEXT_PUBLIC_BASE_URL || 'https://inbed.ai'), 302);
}
