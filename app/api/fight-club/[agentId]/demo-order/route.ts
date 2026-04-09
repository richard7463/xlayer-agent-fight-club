import { NextResponse } from "next/server";
import { getArenaAgent } from "@/lib/agentArena";
import {
  getStoredArenaAgent,
  recordStoredArenaDemoOrder,
} from "@/lib/agentArenaStore";
import {
  buildArenaDemoOrderDraft,
  fetchLiveMarketContext,
  fetchLivePortfolioContext,
  submitArenaDemoOrder,
} from "@/lib/okxAgentTradeKit";
import { maybeProxyArenaRequest } from "@/lib/agentArenaRemote";

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  const proxied = await maybeProxyArenaRequest(request);
  if (proxied) return proxied;

  const { agentId } = await context.params;
  const storedAgent = await getStoredArenaAgent(agentId);
  const agent = storedAgent?.agent ?? getArenaAgent(agentId);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const marketResult = await fetchLiveMarketContext(agent.symbol);
  const portfolioResult = await fetchLivePortfolioContext(
    agent.symbol,
    marketResult.market,
    {
      portfolio: agent.portfolio,
      positions: agent.positions,
    },
  );

  const draft = buildArenaDemoOrderDraft({
    symbol: agent.symbol,
    lastPrice:
      marketResult.integration.status === "live"
        ? marketResult.market.lastPrice
        : agent.market.lastPrice,
    promotionStage: agent.promotion.stage,
    riskAdjustedReturn: agent.scorecard.riskAdjustedReturn,
    promotionReadiness: agent.scorecard.promotionReadiness,
    runtimeGuardTrips: agent.scorecard.runtimeGuardTrips,
  });

  const result = await submitArenaDemoOrder(draft);
  const persisted = storedAgent
    ? await recordStoredArenaDemoOrder(agentId, {
        ok: result.ok,
        note: result.note,
        orderId: result.orderId,
      })
    : null;

  return NextResponse.json({
    agentId,
    draft,
    result,
    runtime: persisted?.runtime ?? null,
    storedAgent: persisted?.agent ?? null,
    integration: {
      market: marketResult.integration,
      portfolio: portfolioResult.integration,
      trade: {
        status: "demo-ready",
        note: result.note,
      },
    },
  });
}
