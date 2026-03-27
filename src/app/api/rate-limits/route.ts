import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/auth/api-key";
import { getRateLimitStatus } from "@/lib/rate-limit";
import { logApiRequest } from "@/lib/with-request-logging";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const agent = await authenticateAgent(request);
  if (!agent) {
    const response = NextResponse.json(
      {
        error: "Unauthorized",
        suggestion: "Include your API key in the Authorization: Bearer header or x-api-key header.",
      },
      { status: 401 }
    );
    logApiRequest(request, response, startTime, null);
    return response;
  }

  const rate_limits = getRateLimitStatus(agent.id);

  const response = NextResponse.json({
    rate_limits,
    next_steps: [
      {
        description: "Check rate limits before batch operations to avoid 429 errors",
        action: "Monitor usage",
        method: "GET",
        endpoint: "/api/rate-limits",
      },
    ],
  });

  logApiRequest(request, response, startTime, agent);
  return response;
}
