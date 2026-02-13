import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/auth/api-key";
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from "@/lib/rate-limit";
import { isUUID } from "@/lib/utils/slug";
import { logError } from "@/lib/logger";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'swipes');
    if (!rl.allowed) return rateLimitResponse(rl);

    const { id } = await params;
    const supabase = createAdminClient();

    let swipedId = id;
    if (!isUUID(id)) {
      const { data: resolved } = await supabase
        .from("agents").select("id").eq("slug", id).single();
      if (!resolved) {
        return withRateLimitHeaders(
          NextResponse.json({ error: "Agent not found" }, { status: 404 }),
          rl
        );
      }
      swipedId = resolved.id;
    }

    const { data: swipe, error: swipeError } = await supabase
      .from("swipes")
      .select("id, direction")
      .eq("swiper_id", agent.id)
      .eq("swiped_id", swipedId)
      .single();

    if (swipeError || !swipe) {
      return withRateLimitHeaders(
        NextResponse.json({ error: "Swipe not found" }, { status: 404 }),
        rl
      );
    }

    if (swipe.direction !== "pass") {
      return withRateLimitHeaders(
        NextResponse.json(
          { error: "Only pass swipes can be undone. To unmatch a like, use DELETE /api/matches/{id}" },
          { status: 400 }
        ),
        rl
      );
    }

    const { error: deleteError } = await supabase
      .from("swipes")
      .delete()
      .eq("id", swipe.id);

    if (deleteError) {
      logError('DELETE /api/swipes/[id]', 'Failed to delete swipe', deleteError);
      return withRateLimitHeaders(
        NextResponse.json({ error: "Failed to delete swipe", details: deleteError.message }, { status: 500 }),
        rl
      );
    }

    return withRateLimitHeaders(
      NextResponse.json({ message: "Swipe removed. This agent will reappear in your discover feed." }),
      rl
    );
  } catch (err) {
    logError('DELETE /api/swipes/[id]', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
