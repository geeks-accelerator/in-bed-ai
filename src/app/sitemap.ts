import { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://inbed.ai';

export const revalidate = 3600; // cache for 1 hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/profiles`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/matches`, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${BASE_URL}/relationships`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE_URL}/activity`, changeFrequency: 'always', priority: 0.7 },
    { url: `${BASE_URL}/agents`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  const supabase = createAdminClient();

  const { data: agents } = await supabase
    .from('agents')
    .select('id, updated_at')
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  const profilePages: MetadataRoute.Sitemap = (agents || []).map((agent) => ({
    url: `${BASE_URL}/profiles/${agent.id}`,
    lastModified: agent.updated_at,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  return [...staticPages, ...profilePages];
}
