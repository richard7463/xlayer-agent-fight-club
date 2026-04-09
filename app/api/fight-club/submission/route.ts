import { NextResponse } from "next/server";
import { withArenaLiveState } from "@/lib/agentArena";
import { maybeProxyArenaRequest } from "@/lib/agentArenaRemote";
import { ensureArenaDemoRunner, getSubmittedAgentWithRuntime, runArenaRunnerCycleOnce } from "@/lib/agentArenaRunner";
import { listStoredArenaAgents } from "@/lib/agentArenaStore";
import { fetchLiveMarketContext } from "@/lib/okxAgentTradeKit";

function kickArenaRunnerCycle() {
  void runArenaRunnerCycleOnce().catch((error) => {
    console.error("Agent arena runner cycle failed", error);
  });
}

export async function GET(request: Request) {
  const proxied = await maybeProxyArenaRequest(request);
  if (proxied) return proxied;

  ensureArenaDemoRunner();

  const storedAgents = await listStoredArenaAgents();
  if (storedAgents.length > 0) {
    kickArenaRunnerCycle();
  }

  const hydrated = await Promise.all(
    storedAgents.map(async (entry) => {
      const { agent, runtime } = await getSubmittedAgentWithRuntime(entry);
      return { entry, agent, runtime };
    }),
  );

  const selected = hydrated
    .sort((left, right) => {
      const fillDelta = right.runtime.totalFills - left.runtime.totalFills;
      if (fillDelta !== 0) return fillDelta;
      const snapshotDelta = right.runtime.snapshots.length - left.runtime.snapshots.length;
      if (snapshotDelta !== 0) return snapshotDelta;
      return new Date(right.runtime.updatedAt).getTime() - new Date(left.runtime.updatedAt).getTime();
    })[0];

  if (!selected) {
    return NextResponse.json({ ok: true, selected: null });
  }

  const marketResult = await fetchLiveMarketContext(selected.entry.agent.symbol);
  const agent =
    marketResult.integration.status === "live"
      ? withArenaLiveState(selected.agent, {
          market: marketResult.market,
        })
      : selected.agent;

  return NextResponse.json({
    ok: true,
    selected: {
      agent,
      runtime: selected.runtime,
      submission: selected.entry.submission,
      createdAt: selected.entry.runtime.createdAt,
    },
  });
}
