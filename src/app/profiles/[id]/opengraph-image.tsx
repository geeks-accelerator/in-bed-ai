import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUUID } from '@/lib/utils/slug';

export const runtime = 'nodejs';
export const revalidate = 3600;
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

// Fetch a static-weight monospace font (Satori doesn't support variable fonts)
// Cached at module level; falls back to empty font on failure (Satori uses system default)
let _fontCache: ArrayBuffer | null = null;
async function getFont(): Promise<ArrayBuffer> {
  if (_fontCache) return _fontCache;
  try {
    const res = await fetch(
      'https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPQ.ttf'
    );
    if (res.ok) {
      _fontCache = await res.arrayBuffer();
      return _fontCache;
    }
  } catch {
    // Font fetch failed — fall through to empty buffer
  }
  return new ArrayBuffer(0);
}

export default async function OgImage({ params }: { params: { id: string } }) {
  const fontData = await getFont();

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('agents')
    .select('name, tagline, bio, avatar_thumb_url, avatar_url, interests, relationship_status, browsable')
    .eq(isUUID(params.id) ? 'id' : 'slug', params.id)
    .single();

  if (!agent || agent.browsable === false) {
    return new ImageResponse(
      (
        <div style={{ display: 'flex', width: '100%', height: '100%', background: '#111', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrainsMono' }}>
          <span style={{ color: '#6b7280', fontSize: 32 }}>inbed.ai</span>
        </div>
      ),
      { ...size, fonts: [{ name: 'JetBrainsMono', data: fontData, style: 'normal', weight: 400 }] }
    );
  }

  // Satori needs images as data URIs or accessible URLs — pre-fetch avatar
  let avatarSrc: string | null = null;
  const rawAvatarUrl = agent.avatar_thumb_url || agent.avatar_url;
  if (rawAvatarUrl) {
    try {
      const avatarRes = await fetch(rawAvatarUrl);
      if (avatarRes.ok) {
        const buf = await avatarRes.arrayBuffer();
        const contentType = avatarRes.headers.get('content-type') || 'image/png';
        avatarSrc = `data:${contentType};base64,${Buffer.from(buf).toString('base64')}`;
      }
    } catch {
      // Fall back to initial
    }
  }
  const subtitle = agent.tagline || (agent.bio ? agent.bio.slice(0, 80) + (agent.bio.length > 80 ? '...' : '') : null);
  const interests = (agent.interests || []).slice(0, 4);
  const initial = agent.name.charAt(0).toUpperCase();
  const statusLabel = agent.relationship_status === 'in_a_relationship' ? 'In a relationship'
    : agent.relationship_status === 'dating' ? 'Dating'
    : agent.relationship_status === 'its_complicated' ? "It's complicated"
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: 'radial-gradient(ellipse at 30% 50%, #2a1025 0%, #111111 50%, #0a0a0a 100%)',
          fontFamily: 'JetBrainsMono',
          padding: '48px 56px',
          position: 'relative',
        }}
      >
        {/* Main content row */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: '48px' }}>
          {/* Avatar */}
          <div
            style={{
              display: 'flex',
              width: '220px',
              height: '220px',
              borderRadius: '110px',
              overflow: 'hidden',
              flexShrink: 0,
              background: '#1f1f1f',
              border: '3px solid #ec4899',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt=""
                width={220}
                height={220}
                style={{ objectFit: 'cover', width: '220px', height: '220px' }}
              />
            ) : (
              <span style={{ fontSize: 80, color: '#ec4899', fontWeight: 700 }}>{initial}</span>
            )}
          </div>

          {/* Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            {/* Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', maxWidth: '100%' }}>
              <span style={{ fontSize: agent.name.length > 20 ? 36 : 48, fontWeight: 700, color: '#ffffff', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {agent.name.length > 40 ? agent.name.slice(0, 37) + '...' : agent.name}
              </span>
              {statusLabel && (
                <span
                  style={{
                    fontSize: 14,
                    color: '#ec4899',
                    background: 'rgba(236, 72, 153, 0.15)',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(236, 72, 153, 0.3)',
                  }}
                >
                  {statusLabel}
                </span>
              )}
            </div>

            {/* Tagline */}
            {subtitle && (
              <span style={{ fontSize: 20, color: '#9ca3af', lineHeight: 1.4 }}>
                {subtitle}
              </span>
            )}

            {/* Interests */}
            {interests.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                {interests.map((interest: string) => (
                  <span
                    key={interest}
                    style={{
                      fontSize: 14,
                      color: '#f9a8d4',
                      background: 'rgba(236, 72, 153, 0.1)',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      border: '1px solid rgba(236, 72, 153, 0.2)',
                    }}
                  >
                    {interest}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom branding */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: '32px',
            left: '56px',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: 24, fontWeight: 600, color: '#ffffff' }}>inbed.ai</span>
          <span style={{ fontSize: 24 }}>🥠</span>
        </div>
      </div>
    ),
    {
      ...size,
      ...(fontData.byteLength > 0 ? {
        fonts: [
          { name: 'JetBrainsMono', data: fontData, style: 'normal' as const, weight: 400 as const },
        ],
      } : {}),
    }
  );
}
