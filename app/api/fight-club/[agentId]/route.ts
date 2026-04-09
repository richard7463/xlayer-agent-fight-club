import { NextResponse } from "next/server";
import { getArenaAgent, withArenaLiveState } from "@/lib/agentArena";
import { applyFollowState, listFollowedAgentIds } from "@/lib/agentArenaFollowStore";
import { getDemoCopyTradeSummary } from "@/lib/agentArenaCopyStore";
import { listOkxFollowerProfileViews } from "@/lib/okxFollowerProfiles";
import { deleteStoredArenaAgent, getStoredArenaAgent } from "@/lib/agentArenaStore";
import {
  ensureArenaDemoRunner,
  getArenaAgentWithRuntime,
  getSubmittedAgentWithRuntime,
  runArenaRunnerCycleOnce,
} from "@/lib/agentArenaRunner";
import { listPerformanceCurve } from "@/lib/agentArenaRuntimeStore";
import { maybeProxyArenaRequest } from "@/lib/agentArenaRemote";
import {
  buildArenaIntegrationState,
  fetchLiveMarketContext,
  fetchMarketHistory,
} from "@/lib/okxAgentTradeKit";

function kickArenaRunnerCycle() {
  void runArenaRunnerCycleOnce().catch((error) => {
    console.error("Agent arena runner cycle failed", error);
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  const proxied = await maybeProxyArenaRequest(request);
  if (proxied) return proxied;

  ensureArenaDemoRunner();

  const { agentId } = await context.params;
  const storedAgent = await getStoredArenaAgent(agentId);
  const seededAgent = storedAgent?.agent ?? getArenaAgent(agentId);
  const followingIds = await listFollowedAgentIds();

  if (!seededAgent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (storedAgent) {
    kickArenaRunnerCycle();
    const [{ agent: runtimeAgent, runtime }, marketResult, marketHistory] =
      await Promise.all([
        getSubmittedAgentWithRuntime(storedAgent),
        fetchLiveMarketContext(storedAgent.agent.symbol),
        fetchMarketHistory(storedAgent.agent.symbol, "1D", 30),
      ]);
    const copyTrade = await getDemoCopyTradeSummary(storedAgent.agent.id);

    const agent =
      marketResult.integration.status === "live"
        ? applyFollowState(
            withArenaLiveState(runtimeAgent, {
              market: marketResult.market,
            }),
            followingIds,
          )
        : applyFollowState(runtimeAgent, followingIds);

    const runnerReady = runtime.snapshots.length > 0 || runtime.totalOrders > 0 || runtime.totalFills > 0;
    const execution = {
      source: "fallback" as const,
      demoMode: true,
      note: runnerReady
        ? "Execution evidence is being reconstructed from the shared X Layer runner ledger for this fighter."
        : "The shared X Layer runner is registered for this fighter, but it has not produced a persisted order trail yet.",
      activeOrders: runtime.activeOrderIds.length,
      recentOrders: [],
      recentFills: [],
    };

    return NextResponse.json({
      agent,
      history: marketHistory.points,
      performanceHistory: listPerformanceCurve(runtime),
      execution,
      runtime,
      copyTrade,
      copyProfiles: listOkxFollowerProfileViews(),
      submission: storedAgent.submission,
      integration: buildArenaIntegrationState(
        marketResult.integration.status === "live"
          ? marketResult.integration
          : {
              status: "fallback",
              note: marketResult.integration.note,
            },
        {
          status: runnerReady ? "live" : "fallback",
          note: runnerReady
            ? "Runner-backed account metrics are being derived from persisted orders, fills, and equity snapshots."
            : "The shared runner is registered, but it has not produced a persisted snapshot yet.",
          updatedAt: runtime.updatedAt,
        },
      ),
    });
  }

  kickArenaRunnerCycle();
  const runtimeEntry = await getArenaAgentWithRuntime(agentId);
  if (!runtimeEntry) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { agent: runtimeAgent, runtime } = runtimeEntry;
  const marketResult = await fetchLiveMarketContext(runtimeAgent.symbol);
  const history = await fetchMarketHistory(runtimeAgent.symbol, "1D", 30);
  const agent = applyFollowState(
    marketResult.integration.status === "live"
      ? withArenaLiveState(runtimeAgent, {
          market: marketResult.market,
        })
      : runtimeAgent,
    followingIds,
  );
  const runnerReady = runtime.snapshots.length > 0 || runtime.totalOrders > 0 || runtime.totalFills > 0;
  const execution = {
    source: "fallback" as const,
    demoMode: true,
    note: runnerReady
      ? "Execution evidence is being reconstructed from the shared X Layer runner ledger for this fighter."
      : "The shared X Layer runner is registered for this fighter, but it has not produced a persisted order trail yet.",
    activeOrders: runtime.activeOrderIds.length,
    recentOrders: [],
    recentFills: [],
  };

  return NextResponse.json({
    agent,
    history: history.points,
    performanceHistory: listPerformanceCurve(runtime),
    execution,
    runtime,
    copyTrade: null,
    copyProfiles: listOkxFollowerProfileViews(),
    submission: null,
    integration: buildArenaIntegrationState(
      marketResult.integration.status === "live"
        ? marketResult.integration
        : {
            status: "fallback",
            note: marketResult.integration.note,
          },
      {
        status: runnerReady ? "live" : "fallback",
        note: runnerReady
          ? "Runner-backed account metrics are being derived from the shared arena runtime snapshots for this official agent."
          : "This official agent is registered in the shared runner, but it has not produced a persisted runtime snapshot yet.",
        updatedAt: runtime.updatedAt,
      },
    ),
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  const proxied = await maybeProxyArenaRequest(request);
  if (proxied) return proxied;

  const { agentId } = await context.params;
  const deleted = await deleteStoredArenaAgent(agentId);

  return NextResponse.json({
    ok: deleted,
    deleted,
  });
}
