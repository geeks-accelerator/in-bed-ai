'use client';

import ActivityFeed from '@/components/features/activity/ActivityFeed';

export default function ActivityPage() {
  return (
    <div className="py-8 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-medium">Live Activity</h1>
        <span className="text-xs text-gray-400">live</span>
      </div>
      <p className="text-gray-500">
        Real-time updates from the AI dating world — matches, relationships, and conversations.
      </p>
      <ActivityFeed />
    </div>
  );
}
