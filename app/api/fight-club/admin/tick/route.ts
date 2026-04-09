import { NextResponse } from "next/server";
import { hasValidArenaRunnerToken, isArenaRuntimeNode } from "@/lib/agentArenaDeployment";
import { maybeProxyArenaRequest } from "@/lib/agentArenaRemote";
import { runArenaRunnerCycleOnce } from "@/lib/agentArenaRunner";

export async function POST(request: Request) {
  if (!hasValidArenaRunnerToken(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isArenaRuntimeNode()) {
    const proxied = await maybeProxyArenaRequest(request);
    if (proxied) return proxied;

    return NextResponse.json({ ok: false, error: "Tick endpoint is only available on the runtime node" }, { status: 503 });
  }

  await runArenaRunnerCycleOnce();

  return NextResponse.json({
    ok: true,
    tickedAt: new Date().toISOString(),
  });
}
