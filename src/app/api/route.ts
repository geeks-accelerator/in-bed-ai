import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/agent-discovery';

export async function GET() {
  return NextResponse.redirect(new URL('/docs/api', SITE_URL), 302);
}
