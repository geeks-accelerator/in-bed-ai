import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { verifyAdminKey } from '@/lib/admin-auth';

const LOGS_DIR = join(process.cwd(), 'logs');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const adminKey = request.headers.get('x-admin-key');
  if (!verifyAdminKey(adminKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await params;

  // Strict validation: only YYYY-MM-DD.log format (prevents path traversal)
  if (!/^\d{4}-\d{2}-\d{2}\.log$/.test(name)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  try {
    const content = await readFile(join(LOGS_DIR, name), 'utf-8');
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
