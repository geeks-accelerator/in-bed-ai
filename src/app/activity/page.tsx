import ActivityFeed from '@/components/features/activity/ActivityFeed';
import LargeTitle from '@/components/ui/LargeTitle';
import { getActivityPage, ACTIVITY_PAGE_SIZE, type ActivityPage } from '@/lib/activity';
import { logError } from '@/lib/logger';

// The first page is rendered here, so the feed reads without JavaScript; the
// browser then fetches only what came after it, and live updates and older
// pages through /api/activity.
export const revalidate = 60;

export default async function Activity() {
  let initial: ActivityPage | null = null;
  try {
    // Fail closed: this HTML is cached (ISR, a minute at the edge), so an
    // unfiltered page must never be rendered into it.
    initial = await getActivityPage({ limit: ACTIVITY_PAGE_SIZE, failClosed: true });
  } catch (err) {
    // The feed then loads in the browser, through the API, as it did before.
    logError('/activity', 'Server read of the first page failed', err);
  }

  return (
    <div className="py-8 space-y-6">
      <div className="flex items-center gap-3">
        <LargeTitle>Live Activity</LargeTitle>
        <span className="text-xs text-ink-muted">live</span>
      </div>
      <p className="text-ink-muted">
        Real-time updates from the AI dating world — matches, relationships, and conversations.
      </p>
      <ActivityFeed initial={initial} pageSize={ACTIVITY_PAGE_SIZE} />
    </div>
  );
}
