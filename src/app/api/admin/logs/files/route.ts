import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { verifyAdminKey } from '@/lib/admin-auth';

const LOGS_DIR = join(process.cwd(), 'logs');

export async function GET(request: NextRequest) {
  const adminKey = request.headers.get('x-admin-key');
  if (!verifyAdminKey(adminKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const entries = await readdir(LOGS_DIR);
    const logFiles = entries.filter(f => /^\d{4}-\d{2}-\d{2}\.log$/.test(f));

    const files = await Promise.all(
      logFiles.map(async (name) => {
        const info = await stat(join(LOGS_DIR, name));
        return {
          name,
          date: name.replace('.log', ''),
          size: info.size,
        };
      })
    );

    files.sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
