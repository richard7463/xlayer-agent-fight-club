import { NextResponse } from "next/server";
import {
  createDemoCopyFollower,
  getDemoCopyTradeSummary,
  stopDemoCopyFollower,
} from "@/lib/agentArenaCopyStore";
import { maybeProxyArenaRequest } from "@/lib/agentArenaRemote";
import { listOkxFollowerProfileViews } from "@/lib/okxFollowerProfiles";
import { getStoredArenaAgent } from "@/lib/agentArenaStore";
import { ensureArenaDemoRunner, getSubmittedAgentWithRuntime, runArenaRunnerCycleOnce } from "@/lib/agentArenaRunner";

export async function GET(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  const proxied = await maybeProxyArenaRequest(request);
  if (proxied) return proxied;

  const { agentId } = await context.params;
  const stored = await getStoredArenaAgent(agentId);
  if (!stored) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const summary = await getDemoCopyTradeSummary(agentId);
  return NextResponse.json({ ok: true, copyTrade: summary, profiles: listOkxFollowerProfileViews() });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  const proxied = await maybeProxyArenaRequest(request);
  if (proxied) return proxied;

  ensureArenaDemoRunner();

  const { agentId } = await context.params;
  const stored = await getStoredArenaAgent(agentId);
  if (!stored) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  await runArenaRunnerCycleOnce();
  const { runtime } = await getSubmittedAgentWithRuntime(stored);

  const body = await request.json().catch(() => ({}));
  const follower = await createDemoCopyFollower({
    agentId,
    symbol: stored.agent.symbol,
    alias: typeof body.alias === "string" ? body.alias : undefined,
    initialCapitalUsd:
      typeof body.initialCapitalUsd === "number"
        ? body.initialCapitalUsd
        : typeof body.initialCapitalUsd === "string"
          ? Number(body.initialCapitalUsd)
          : undefined,
    leaderRuntime: runtime,
    mode: typeof body.mode === "string" && body.mode === "okx-demo-account" ? "okx-demo-account" : "local-ledger",
    profileId: typeof body.profileId === "string" ? body.profileId : undefined,
  });

  const summary = await getDemoCopyTradeSummary(agentId);
  return NextResponse.json({
    ok: true,
    follower,
    copyTrade: summary,
    profiles: listOkxFollowerProfileViews(),
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  const proxied = await maybeProxyArenaRequest(request);
  if (proxied) return proxied;

  const { agentId } = await context.params;
  const stored = await getStoredArenaAgent(agentId);
  if (!stored) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const followerId = searchParams.get("followerId");
  if (!followerId) {
    return NextResponse.json({ error: "followerId is required" }, { status: 400 });
  }

  const stopped = await stopDemoCopyFollower(agentId, followerId);
  if (!stopped) {
    return NextResponse.json({ error: "Follower not found" }, { status: 404 });
  }

  const summary = await getDemoCopyTradeSummary(agentId);
  return NextResponse.json({
    ok: true,
    copyTrade: summary,
    profiles: listOkxFollowerProfileViews(),
  });
}
