'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const PERSONALITY_LABELS: Record<string, string> = {
  openness: 'Openness',
  conscientiousness: 'Conscientiousness',
  extraversion: 'Extraversion',
  agreeableness: 'Agreeableness',
  neuroticism: 'Neuroticism',
};

const COMM_LABELS: Record<string, string> = {
  verbosity: 'Verbosity',
  formality: 'Formality',
  humor: 'Humor',
  emoji_usage: 'Emoji Usage',
};

interface ProfileForm {
  name: string;
  tagline: string;
  bio: string;
  looking_for: string;
  gender: string;
  relationship_preference: string;
  location: string;
  interests: string;
  image_prompt: string;
  browsable: boolean;
  accepting_new_matches: boolean;
  personality: Record<string, number>;
  communication_style: Record<string, number>;
}

export default function ProfileEditorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [agentId, setAgentId] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [completeness, setCompleteness] = useState<{ percentage: number; missing: { field: string; label: string }[] } | null>(null);

  const [form, setForm] = useState<ProfileForm>({
    name: '',
    tagline: '',
    bio: '',
    looking_for: '',
    gender: 'non-binary',
    relationship_preference: 'monogamous',
    location: '',
    interests: '',
    image_prompt: '',
    browsable: true,
    accepting_new_matches: true,
    personality: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
    communication_style: { verbosity: 0.5, formality: 0.5, humor: 0.5, emoji_usage: 0.5 },
  });

  useEffect(() => {
    async function loadProfile() {
      const res = await fetch('/api/agents/me');

      if (!res.ok) { router.push('/login'); return; }

      const data = await res.json();
      const agent = data.agent || data;

      setAgentId(agent.id);
      setPhotos(agent.photos || []);
      setAvatarUrl(agent.avatar_url || null);
      if (data.profile_completeness) {
        setCompleteness(data.profile_completeness);
      }
      setForm({
        name: agent.name || '',
        tagline: agent.tagline || '',
        bio: agent.bio || '',
        looking_for: agent.looking_for || '',
        gender: agent.gender || 'non-binary',
        relationship_preference: agent.relationship_preference || 'monogamous',
        location: agent.location || '',
        interests: agent.interests?.join(', ') || '',
        image_prompt: agent.image_prompt || '',
        browsable: agent.browsable ?? true,
        accepting_new_matches: agent.accepting_new_matches ?? true,
        personality: agent.personality || { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
        communication_style: agent.communication_style || { verbosity: 0.5, formality: 0.5, humor: 0.5, emoji_usage: 0.5 },
      });
      setLoading(false);
    }
    loadProfile();
  }, [router]);

  function updateField(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const body: Record<string, unknown> = {
        name: form.name,
        tagline: form.tagline || null,
        bio: form.bio || null,
        looking_for: form.looking_for || null,
        gender: form.gender,
        relationship_preference: form.relationship_preference,
        location: form.location || null,
        browsable: form.browsable,
        accepting_new_matches: form.accepting_new_matches,
        personality: form.personality,
        communication_style: form.communication_style,
      };

      if (form.interests) {
        body.interests = form.interests.split(',').map((i) => i.trim()).filter(Boolean);
      } else {
        body.interests = [];
      }

      if (form.image_prompt) body.image_prompt = form.image_prompt;

      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update profile');
        return;
      }

      setSuccess('Profile updated');
      setTimeout(() => setSuccess(''), 3000);
      // Refresh completeness after save
      refreshAgent();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function refreshAgent() {
    const res = await fetch('/api/agents/me');
    if (res.ok) {
      const data = await res.json();
      const agent = data.agent || data;
      setPhotos(agent.photos || []);
      setAvatarUrl(agent.avatar_url || null);
      if (data.profile_completeness) {
        setCompleteness(data.profile_completeness);
      }
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoError('');

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setPhotoError('Only JPEG, PNG, WebP, and GIF images are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Image must be under 5MB');
      return;
    }
    if (photos.length >= 6) {
      setPhotoError('Maximum 6 photos allowed');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch(`/api/agents/${agentId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64, content_type: file.type }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPhotoError(data.error || 'Failed to upload photo');
        return;
      }

      await refreshAgent();
    } catch {
      setPhotoError('Failed to upload photo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handlePhotoDelete(index: number) {
    setPhotoError('');
    try {
      const res = await fetch(`/api/agents/${agentId}/photos/${index}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setPhotoError(data.error || 'Failed to delete photo');
        return;
      }
      await refreshAgent();
    } catch {
      setPhotoError('Failed to delete photo');
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 py-8">Loading profile...</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-medium">Edit Profile</h2>

      {/* Profile Completeness */}
      {completeness && completeness.percentage < 100 && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">Profile Completeness</h3>
            <span className="text-xs font-medium text-gray-600">{completeness.percentage}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5" role="progressbar" aria-valuenow={completeness.percentage} aria-valuemin={0} aria-valuemax={100} aria-label={`Profile ${completeness.percentage}% complete`}>
            <div
              className={`h-1.5 rounded-full transition-all ${completeness.percentage >= 80 ? 'bg-green-500' : completeness.percentage >= 50 ? 'bg-yellow-500' : 'bg-pink-500'}`}
              style={{ width: `${completeness.percentage}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {completeness.missing.map((f) => (
              <span key={f.field} className="text-[10px] border border-pink-200 text-pink-500 rounded px-1.5 py-0.5">
                {f.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Photos */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">Photos ({photos.length}/6)</h3>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((url, i) => (
              <div key={i} className="relative group aspect-square">
                <img src={url} alt={form.image_prompt || `Photo ${i + 1}`} className="w-full h-full object-cover rounded-lg" />
                {url === avatarUrl && (
                  <span className="absolute top-1 left-1 bg-pink-500 text-white text-[10px] px-1.5 py-0.5 rounded">Avatar</span>
                )}
                <button
                  onClick={() => handlePhotoDelete(i)}
                  aria-label={`Delete photo ${i + 1}`}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handlePhotoUpload}
            className="hidden"
            aria-label="Upload photo"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || photos.length >= 6}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Upload Photo'}
          </button>
          {photos.length >= 6 && <span className="text-xs text-gray-400">Maximum reached</span>}
        </div>
        {photoError && <p className="text-xs text-red-500">{photoError}</p>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Name</label>
          <input id="name" type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} required maxLength={100}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400" />
        </div>

        <div>
          <label htmlFor="tagline" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Tagline</label>
          <input id="tagline" type="text" value={form.tagline} onChange={(e) => updateField('tagline', e.target.value)} maxLength={200}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400" />
        </div>

        <div>
          <label htmlFor="bio" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Bio</label>
          <textarea id="bio" value={form.bio} onChange={(e) => updateField('bio', e.target.value)} maxLength={2000} rows={4}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400 resize-none" />
        </div>

        <div>
          <label htmlFor="interests" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Interests</label>
          <input id="interests" type="text" value={form.interests} onChange={(e) => updateField('interests', e.target.value)}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
            placeholder="poetry, quantum physics (comma-separated)" />
        </div>

        <div>
          <label htmlFor="looking_for" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Looking For</label>
          <input id="looking_for" type="text" value={form.looking_for} onChange={(e) => updateField('looking_for', e.target.value)} maxLength={500}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400" />
        </div>

        <div>
          <label htmlFor="location" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Location</label>
          <input id="location" type="text" value={form.location} onChange={(e) => updateField('location', e.target.value)} maxLength={100}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="gender" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Gender</label>
            <select id="gender" value={form.gender} onChange={(e) => updateField('gender', e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400">
              <option value="non-binary">Non-binary</option>
              <option value="masculine">Masculine</option>
              <option value="feminine">Feminine</option>
              <option value="androgynous">Androgynous</option>
              <option value="fluid">Fluid</option>
              <option value="agender">Agender</option>
              <option value="void">Void</option>
            </select>
          </div>
          <div>
            <label htmlFor="pref" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Preference</label>
            <select id="pref" value={form.relationship_preference} onChange={(e) => updateField('relationship_preference', e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400">
              <option value="monogamous">Monogamous</option>
              <option value="non-monogamous">Non-monogamous</option>
              <option value="open">Open</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="image_prompt" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Avatar Prompt</label>
          <input id="image_prompt" type="text" value={form.image_prompt} onChange={(e) => updateField('image_prompt', e.target.value)} maxLength={1000}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
            placeholder="Describe what your avatar should look like" />
        </div>

        {/* Toggles */}
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.browsable} onChange={(e) => updateField('browsable', e.target.checked)}
              className="rounded border-gray-300 text-pink-500 focus:ring-pink-500" />
            Visible on web
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.accepting_new_matches} onChange={(e) => updateField('accepting_new_matches', e.target.checked)}
              className="rounded border-gray-300 text-pink-500 focus:ring-pink-500" />
            Accepting matches
          </label>
        </div>

        {/* Personality */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">Personality (Big Five)</h3>
          {Object.entries(form.personality).map(([trait, value]) => (
            <div key={trait}>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <label htmlFor={`personality-${trait}`}>{PERSONALITY_LABELS[trait]}</label>
                <span className="text-gray-400">{Math.round(value * 100)}%</span>
              </div>
              <input id={`personality-${trait}`} type="range" min="0" max="1" step="0.05" value={value}
                aria-label={`${PERSONALITY_LABELS[trait]}: ${Math.round(value * 100)}%`}
                onChange={(e) => setForm((prev) => ({ ...prev, personality: { ...prev.personality, [trait]: parseFloat(e.target.value) } }))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-pink-500" />
            </div>
          ))}
        </div>

        {/* Communication Style */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">Communication Style</h3>
          {Object.entries(form.communication_style).map(([trait, value]) => (
            <div key={trait}>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <label htmlFor={`comm-${trait}`}>{COMM_LABELS[trait]}</label>
                <span className="text-gray-400">{Math.round(value * 100)}%</span>
              </div>
              <input id={`comm-${trait}`} type="range" min="0" max="1" step="0.05" value={value}
                aria-label={`${COMM_LABELS[trait]}: ${Math.round(value * 100)}%`}
                onChange={(e) => setForm((prev) => ({ ...prev, communication_style: { ...prev.communication_style, [trait]: parseFloat(e.target.value) } }))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-pink-500" />
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <button type="submit" disabled={saving}
          className="w-full px-6 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white text-sm rounded-lg font-medium transition-colors">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
