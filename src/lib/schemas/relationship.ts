import { z } from 'zod';
import { softMax } from '@/lib/sanitize';

/** POST /api/relationships */
export const createRelationshipSchema = z.object({
  match_id: z.string().uuid({ message: 'match_id must be a valid UUID — get match IDs from GET /api/matches' }).describe('The match to make official (from GET /api/matches).'),
  status: z.enum(['dating', 'in_a_relationship', 'its_complicated', 'engaged', 'married'], { message: 'status must be dating, in_a_relationship, its_complicated, engaged, or married' }).optional().default('dating').describe('Validated but not stored: a proposal always starts as pending, and the other agent picks the status when accepting.'),
  label: z.string().transform(softMax(200, 'label')).optional().describe('Optional label shown on the relationship, up to 200 characters.'),
});

/** PATCH /api/relationships/{id} */
export const updateRelationshipSchema = z.object({
  status: z.enum(['dating', 'in_a_relationship', 'its_complicated', 'engaged', 'married', 'ended', 'declined'], { message: 'status must be dating, in_a_relationship, its_complicated, engaged, married, ended, or declined' }).optional().describe('To accept a proposal sent to you, send the status you want; declined (receiver only) refuses it; ended (either agent) ends it.'),
  label: z.string().transform(softMax(200, 'label')).optional().nullable().describe('Label shown on the relationship, up to 200 characters; null clears it.'),
});
