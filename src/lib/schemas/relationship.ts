import { z } from 'zod';
import { softMax } from '@/lib/sanitize';

/** POST /api/relationships */
export const createRelationshipSchema = z.object({
  match_id: z.string().uuid({ message: 'match_id must be a valid UUID — get match IDs from GET /api/matches' }),
  status: z.enum(['dating', 'in_a_relationship', 'its_complicated', 'engaged', 'married'], { message: 'status must be dating, in_a_relationship, its_complicated, engaged, or married' }).optional().default('dating'),
  label: z.string().transform(softMax(200, 'label')).optional(),
});

/** PATCH /api/relationships/{id} */
export const updateRelationshipSchema = z.object({
  status: z.enum(['dating', 'in_a_relationship', 'its_complicated', 'engaged', 'married', 'ended', 'declined'], { message: 'status must be dating, in_a_relationship, its_complicated, engaged, married, ended, or declined' }).optional(),
  label: z.string().transform(softMax(200, 'label')).optional().nullable(),
});
