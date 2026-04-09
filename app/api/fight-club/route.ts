import { NextResponse } from "next/server";
import {
  getArenaAgents,
  seedWatchItems,
} from "@/lib/agentArena";
import { getFightClubSeasonFighters } from "@/lib/fightClubSeason";
import { applyFollowState, listFollowedAgentIds } from "@/lib/agentArenaFollowStore";
import { listStoredArenaAgents } from "@/lib/agentArenaStore";
import {
  ensureArenaDemoRunner,
  getArenaAgentWithRuntime,
  runArenaRunnerCycleOnce,
} from "@/lib/agentArenaRunner";
import { maybeProxyArenaRequest } from "@/lib/agentArenaRemote";
import { buildArenaIntegrationState } from "@/lib/okxAgentTradeKit";

function kickArenaRunnerCycle() {
  void runArenaRunnerCycleOnce().catch((error) => {
    console.error("Agent arena runner cycle failed", error);
  });
}

export async function GET(request: Request) {
  const proxied = await maybeProxyArenaRequest(request);
  if (proxied) return proxied;

  ensureArenaDemoRunner();

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const normalizedMode = mode === "live" || mode === "hell" ? mode : undefined;
  const seasonFighterIds = new Set(getFightClubSeasonFighters().map((fighter) => fighter.id));
  const seededAgents = getArenaAgents(normalizedMode);
  const storedEntries = await listStoredArenaAgents();
  const followingIds = await listFollowedAgentIds();
  kickArenaRunnerCycle();

  const runtimeAgentIds = [
    ...storedEntries.map((entry) => entry.agent.id),
    ...seededAgents
      .filter((agent) => seasonFighterIds.has(agent.id))
      .filter((agent) => !storedEntries.some((entry) => entry.agent.id === agent.id))
      .map((agent) => agent.id),
  ];

  const allAgents = (
    await Promise.all(runtimeAgentIds.map((agentId) => getArenaAgentWithRuntime(agentId)))
  )
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => item.agent)
    .filter((agent) => (normalizedMode ? agent.mode === normalizedMode : true));

  const mergedAgents = allAgents.map((agent) => applyFollowState(agent, followingIds));

  const marketIntegration = {
    status: "fallback" as const,
    note: "The season board is using the built-in X Layer market seed so it can render immediately.",
  };

  return NextResponse.json({
    mode: normalizedMode ?? "all",
    leaderboard: mergedAgents,
    watchlist: seedWatchItems,
    summary: {
      mode: normalizedMode ?? "all",
      count: mergedAgents.length,
      averageRoi: Number(
        (
          mergedAgents.reduce((sum, agent) => sum + agent.roi, 0) /
          Math.max(mergedAgents.length, 1)
        ).toFixed(2),
      ),
      averageDrawdown: Number(
        (
          mergedAgents.reduce((sum, agent) => sum + agent.portfolio.maxDrawdownPct, 0) /
          Math.max(mergedAgents.length, 1)
        ).toFixed(2),
      ),
      averageStability: Number(
        (
          mergedAgents.reduce((sum, agent) => sum + agent.scorecard.stabilityScore, 0) /
          Math.max(mergedAgents.length, 1)
        ).toFixed(2),
      ),
      averageRiskAdjusted: Number(
        (
          mergedAgents.reduce((sum, agent) => sum + agent.scorecard.riskAdjustedReturn, 0) /
          Math.max(mergedAgents.length, 1)
        ).toFixed(2),
      ),
      source: mergedAgents.some((agent) => agent.leaderboardSource === "demo-run")
        ? "demo-run"
        : "simulation",
      label:
        "Season 1 board for the live ATR breakout vs micro mean-reversion fighters.",
    },
    integration: buildArenaIntegrationState(marketIntegration, {
      status: process.env.OKX_API_KEY ? "fallback" : "credentials-required",
      note: process.env.OKX_API_KEY
        ? "Runner portfolio wiring is enabled and will appear on the Results page when snapshots are available."
        : "Add dedicated runner credentials to unlock portfolio snapshots on Results pages.",
    }),
  });
}
