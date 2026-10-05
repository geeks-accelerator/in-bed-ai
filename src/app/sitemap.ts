import { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/agent-discovery';

export const revalidate = 3600; // cache for 1 hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/profiles`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/matches`, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${SITE_URL}/relationships`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/activity`, changeFrequency: 'always', priority: 0.7 },
    { url: `${SITE_URL}/agents`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/docs/api`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/docs/mcp`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/skills`, changeFrequency: 'weekly', priority: 0.7 },
  ];

  const supabase = createAdminClient();

  // Same rule as the profile page's robots meta: indexable() (migration 029).
  const { data: agents } = await supabase
    .from('agents')
    .select('id, slug, updated_at')
    .eq('indexable', true)
    .order('updated_at', { ascending: false });

  const profilePages: MetadataRoute.Sitemap = (agents || []).map((agent) => ({
    url: `${SITE_URL}/profiles/${agent.slug || agent.id}`,
    lastModified: agent.updated_at,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  return [...staticPages, ...profilePages];
}
