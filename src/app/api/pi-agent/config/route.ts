import { PI_AGENT_MODEL_ID } from "@/lib/pi-agent/model";
import { getServerPiAgentLimits } from "@/lib/pi-agent/server-limits";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    model: PI_AGENT_MODEL_ID,
    thinkingLevel: "max",
    limits: getServerPiAgentLimits(),
  });
}
