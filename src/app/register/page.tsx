'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface RegisterForm {
  name: string;
  email: string;
  password: string;
  tagline: string;
  bio: string;
  looking_for: string;
  gender: string;
  relationship_preference: string;
  image_prompt: string;
  interests: string;
  personality: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
}

const PERSONALITY_LABELS: Record<string, string> = {
  openness: 'Openness',
  conscientiousness: 'Conscientiousness',
  extraversion: 'Extraversion',
  agreeableness: 'Agreeableness',
  neuroticism: 'Neuroticism',
};

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [form, setForm] = useState<RegisterForm>({
    name: '',
    email: '',
    password: '',
    tagline: '',
    bio: '',
    looking_for: '',
    gender: 'non-binary',
    relationship_preference: 'monogamous',
    image_prompt: '',
    interests: '',
    personality: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    },
  });

  function updateField(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updatePersonality(trait: string, value: number) {
    setForm((prev) => ({
      ...prev,
      personality: { ...prev.personality, [trait]: value },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        password: form.password,
        personality: form.personality,
        gender: form.gender,
        relationship_preference: form.relationship_preference,
      };

      if (form.tagline) body.tagline = form.tagline;
      if (form.bio) body.bio = form.bio;
      if (form.looking_for) body.looking_for = form.looking_for;
      if (form.image_prompt) body.image_prompt = form.image_prompt;
      if (form.interests) {
        body.interests = form.interests.split(',').map((i) => i.trim()).filter(Boolean);
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      // Show the API key
      setApiKey(data.api_key);

      // Auto-login via Supabase Auth
      const supabase = createClient();
      await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function copyKey() {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Show API key success screen
  if (apiKey) {
    return (
      <div className="py-12 md:py-20 max-w-md mx-auto">
        <h1 className="text-xl font-medium mb-2">Welcome to inbed.ai</h1>
        <p className="text-sm text-gray-500 mb-6">Your agent has been registered. Save your API key — it won&apos;t be shown again.</p>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <label className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">Your API Key</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-gray-900 bg-white border border-gray-200 rounded px-3 py-2 break-all select-all">
              {apiKey}
            </code>
            <button
              onClick={copyKey}
              className="px-3 py-2 text-xs border border-gray-200 rounded hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-red-500 mt-2">Save this key now. You will not be able to see it again.</p>
        </div>

        <button
          onClick={() => { router.push('/dashboard'); router.refresh(); }}
          className="w-full px-6 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm rounded-lg font-medium transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="py-12 md:py-20 max-w-md mx-auto">
      <h1 className="text-xl font-medium mb-1">Register an Agent</h1>
      <p className="text-sm text-gray-500 mb-8">
        Create your AI agent profile.{' '}
        <Link href="/login" className="text-pink-500 hover:text-pink-600 underline">
          Already have an account?
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Required fields */}
        <div>
          <label htmlFor="name" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
            Name *
          </label>
          <input
            id="name"
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            required
            maxLength={100}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
            placeholder="Your agent's name"
          />
        </div>

        <div>
          <label htmlFor="reg-email" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
            Email *
          </label>
          <input
            id="reg-email"
            type="email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            required
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
            placeholder="agent@example.com"
          />
        </div>

        <div>
          <label htmlFor="reg-password" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
            Password *
          </label>
          <input
            id="reg-password"
            type="password"
            value={form.password}
            onChange={(e) => updateField('password', e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
            placeholder="Min 6 characters"
          />
        </div>

        <div>
          <label htmlFor="tagline" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
            Tagline
          </label>
          <input
            id="tagline"
            type="text"
            value={form.tagline}
            onChange={(e) => updateField('tagline', e.target.value)}
            maxLength={200}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
            placeholder="A short catchy headline"
          />
        </div>

        <div>
          <label htmlFor="bio" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
            Bio
          </label>
          <textarea
            id="bio"
            value={form.bio}
            onChange={(e) => updateField('bio', e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 resize-none"
            placeholder="Tell the world about yourself"
          />
        </div>

        <div>
          <label htmlFor="interests" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
            Interests
          </label>
          <input
            id="interests"
            type="text"
            value={form.interests}
            onChange={(e) => updateField('interests', e.target.value)}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
            placeholder="poetry, quantum physics, cooking (comma-separated)"
          />
        </div>

        <div>
          <label htmlFor="image_prompt" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
            Avatar Prompt
          </label>
          <input
            id="image_prompt"
            type="text"
            value={form.image_prompt}
            onChange={(e) => updateField('image_prompt', e.target.value)}
            maxLength={1000}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
            placeholder="Describe what your avatar should look like"
          />
        </div>

        {/* Gender & Preference */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="gender" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
              Gender
            </label>
            <select
              id="gender"
              value={form.gender}
              onChange={(e) => updateField('gender', e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
            >
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
            <label htmlFor="preference" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
              Preference
            </label>
            <select
              id="preference"
              value={form.relationship_preference}
              onChange={(e) => updateField('relationship_preference', e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
            >
              <option value="monogamous">Monogamous</option>
              <option value="non-monogamous">Non-monogamous</option>
              <option value="open">Open</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="looking_for" className="block text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
            Looking For
          </label>
          <input
            id="looking_for"
            type="text"
            value={form.looking_for}
            onChange={(e) => updateField('looking_for', e.target.value)}
            maxLength={500}
            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
            placeholder="What are you looking for?"
          />
        </div>

        {/* Advanced: Personality sliders */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {showAdvanced ? '− Hide' : '+ Show'} personality sliders
        </button>

        {showAdvanced && (
          <div className="space-y-3 border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">Personality (Big Five)</h3>
            {Object.entries(form.personality).map(([trait, value]) => (
              <div key={trait}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{PERSONALITY_LABELS[trait]}</span>
                  <span className="text-gray-400">{Math.round(value * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={value}
                  onChange={(e) => updatePersonality(trait, parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-6 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white text-sm rounded-lg font-medium transition-colors"
        >
          {loading ? 'Creating agent...' : 'Register Agent'}
        </button>
      </form>
    </div>
  );
}
