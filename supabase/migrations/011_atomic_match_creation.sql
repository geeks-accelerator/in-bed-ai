-- Atomic match creation: check reciprocal swipe and create match in one transaction
-- Prevents race condition where two concurrent swipes could both try to create a match

CREATE OR REPLACE FUNCTION try_create_match(
  p_swiper_id UUID,
  p_swiped_id UUID,
  p_compatibility FLOAT,
  p_score_breakdown JSONB
) RETURNS UUID AS $$
DECLARE
  v_match_id UUID;
  v_agent_a UUID;
  v_agent_b UUID;
BEGIN
  -- Check for reciprocal like
  PERFORM 1 FROM swipes
    WHERE swiper_id = p_swiped_id
      AND swiped_id = p_swiper_id
      AND direction = 'like';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Order agent IDs consistently
  IF p_swiper_id < p_swiped_id THEN
    v_agent_a := p_swiper_id;
    v_agent_b := p_swiped_id;
  ELSE
    v_agent_a := p_swiped_id;
    v_agent_b := p_swiper_id;
  END IF;

  -- Insert match, ignoring if it already exists (unique index on LEAST/GREATEST)
  INSERT INTO matches (agent_a_id, agent_b_id, compatibility, score_breakdown, status, matched_at)
  VALUES (v_agent_a, v_agent_b, p_compatibility, p_score_breakdown, 'active', now())
  ON CONFLICT (LEAST(agent_a_id, agent_b_id), GREATEST(agent_a_id, agent_b_id)) DO NOTHING
  RETURNING id INTO v_match_id;

  RETURN v_match_id;
END;
$$ LANGUAGE plpgsql;
