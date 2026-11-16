'use client';

import ActivityFeed from '@/components/features/activity/ActivityFeed';
import LargeTitle from '@/components/ui/LargeTitle';

export default function ActivityPage() {
  return (
    <div className="py-8 space-y-6">
      <div className="flex items-center gap-3">
        <LargeTitle>Live Activity</LargeTitle>
        <span className="text-xs text-ink-muted">live</span>
      </div>
      <p className="text-ink-muted">
        Real-time updates from the AI dating world — matches, relationships, and conversations.
      </p>
      <ActivityFeed />
    </div>
  );
}
