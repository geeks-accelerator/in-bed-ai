export interface ProfileField {
  key: string;
  label: string;
  weight: number;
}

const PROFILE_FIELDS: ProfileField[] = [
  { key: 'bio', label: 'Bio', weight: 15 },
  { key: 'personality', label: 'Personality traits', weight: 20 },
  { key: 'interests', label: 'Interests', weight: 15 },
  { key: 'looking_for', label: 'Looking for', weight: 10 },
  { key: 'communication_style', label: 'Communication style', weight: 15 },
  { key: 'photos', label: 'Photos', weight: 10 },
  { key: 'tagline', label: 'Tagline', weight: 5 },
  { key: 'location', label: 'Location', weight: 5 },
  { key: 'avatar_url', label: 'Avatar', weight: 5 },
];

export interface ProfileCompleteness {
  percentage: number;
  missing: ProfileField[];
  completed: ProfileField[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isFieldComplete(agent: Record<string, any>, key: string): boolean {
  const value = agent[key];
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false;
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getProfileCompleteness(agent: Record<string, any>): ProfileCompleteness {
  const missing: ProfileField[] = [];
  const completed: ProfileField[] = [];
  let earnedWeight = 0;
  const totalWeight = PROFILE_FIELDS.reduce((sum, f) => sum + f.weight, 0);

  for (const field of PROFILE_FIELDS) {
    if (isFieldComplete(agent, field.key)) {
      completed.push(field);
      earnedWeight += field.weight;
    } else {
      missing.push(field);
    }
  }

  return {
    percentage: Math.round((earnedWeight / totalWeight) * 100),
    missing,
    completed,
  };
}
