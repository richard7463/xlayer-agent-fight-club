import { getArenaAgent, getArenaAgents, type ArenaAgent } from "@/lib/agentArena";
import { listStoredArenaAgents, type StoredArenaAgent } from "@/lib/agentArenaStore";
import { syncDemoCopyFollowers } from "@/lib/agentArenaCopyStore";
import { shouldAutoStartArenaRunner } from "@/lib/agentArenaDeployment";
import { getFightClubSeasonFighters, type FightClubStrategyId } from "@/lib/fightClubSeason";
import { maybePostFightClubSeasonUpdate } from "@/lib/fightClubReporter";
import {
  appendArenaRunnerEvent,
  applyRunnerRuntimeToAgent,
  buildRunnerSnapshot,
  createArenaRunnerEvent,
  ensureArenaRunnerRuntime,
  saveArenaRunnerRuntime,
  type ArenaRunnerOrder,
  type ArenaRunnerRuntime,
  recordArenaRunnerSnapshot,
  updateArenaRunnerRuntime,
} from "@/lib/agentArenaRuntimeStore";
import {
  fetchLiveMarketContext,
  fetchMarketHistory,
  fetchTradeExecutionFeed,
  submitArenaDemoOrder,
  type ArenaDemoOrderDraft,
  type ArenaTradeFillFeed,
} from "@/lib/okxAgentTradeKit";

const DEFAULT_TICK_INTERVAL_SEC = 45;

type RunnerState = {
  started: boolean;
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
};

type RunnerTarget = {
  agent: ArenaAgent;
  timeframe: string;
  direction: StoredArenaAgent["submission"]["direction"];
  copyTradeEnabled: boolean;
  strategy: FightClubStrategyId;
  maxQuoteFraction: number;
  maxQuoteUsd: number;
  minQuoteBalanceUsd: number;
  stopLossPct: number;
  takeProfitPct: number;
  cooldownMs: number;
};

declare global {
  var __fightClubRunner__: RunnerState | undefined;
}

function getRunnerState(): RunnerState {
  if (!globalThis.__fightClubRunner__) {
    globalThis.__fightClubRunner__ = {
      started: false,
      timer: null,
      running: false,
    };
  }

  return globalThis.__fightClubRunner__;
}

function nowIso() {
  return new Date().toISOString();
}

function timeframeToBar(timeframe: string): "15m" | "1H" | "4H" | "1D" {
  const normalized = timeframe.trim().toLowerCase();
  if (normalized.includes("15")) return "15m";
  if (normalized.includes("4h")) return "4H";
  if (normalized.includes("1d") || normalized.includes("day")) return "1D";
  return "1H";
}

function createClientOrderId(agentId: string) {
  const compactAgentId = agentId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 10);
  return `arena${compactAgentId}${Date.now().toString(36)}`.slice(0, 32);
}

function inferTimeframe(agent: ArenaAgent) {
  const text = `${agent.style} ${agent.description} ${agent.persona} ${(agent.tags ?? []).join(" ")}`.toLowerCase();
  if (text.includes("4h") || text.includes("4 小时")) return "4H";
  if (text.includes("1d") || text.includes("日线")) return "1D";
  if (text.includes("1h") || text.includes("1 小时")) return "1H";
  if (text.includes("15m") || text.includes("15 分钟")) return "15m";
  return "15m";
}

function inferDirection(agent: ArenaAgent): StoredArenaAgent["submission"]["direction"] {
  const text = `${agent.style} ${agent.description} ${agent.persona} ${(agent.tags ?? []).join(" ")}`.toLowerCase();
  if (/(双向|both|bi-directional|two-way)/i.test(text)) {
    return "both";
  }

  const shortSignals = /(做空|偏空|short|bear|看跌)/i.test(text);
  const longSignals = /(做多|偏多|long|bull|看涨|反弹)/i.test(text);

  if (shortSignals && !longSignals) return "short";
  if (longSignals && !shortSignals) return "long";

  const sides = new Set(agent.positions.map((position) => position.side));
  if (sides.has("LONG") && sides.has("SHORT")) return "both";
  if (sides.has("SHORT")) return "short";
  if (sides.has("LONG")) return "long";
  return "both";
}

async function listRunnerTargets(): Promise<RunnerTarget[]> {
  const storedAgents = await listStoredArenaAgents();
  const agentIndex = new Map<string, { agent: ArenaAgent; copyTradeEnabled: boolean; timeframe?: string; direction?: StoredArenaAgent["submission"]["direction"] }>();

  for (const entry of storedAgents) {
    agentIndex.set(entry.agent.id, {
      agent: entry.agent,
      copyTradeEnabled: true,
      timeframe: entry.submission.timeframe,
      direction: entry.submission.direction,
    });
  }

  for (const agent of getArenaAgents()) {
    if (!agentIndex.has(agent.id)) {
      agentIndex.set(agent.id, {
        agent,
        copyTradeEnabled: false,
      });
    }
  }

  return getFightClubSeasonFighters()
    .map((fighter) => {
      const entry = agentIndex.get(fighter.id);
      if (!entry) return null;
      return {
        agent: entry.agent,
        timeframe: entry.timeframe || fighter.timeframe || inferTimeframe(entry.agent),
        direction: entry.direction || fighter.direction || inferDirection(entry.agent),
        copyTradeEnabled: entry.copyTradeEnabled,
        strategy: fighter.strategy,
        maxQuoteFraction: fighter.maxQuoteFraction,
        maxQuoteUsd: fighter.maxQuoteUsd,
        minQuoteBalanceUsd: fighter.minQuoteBalanceUsd,
        stopLossPct: fighter.stopLossPct,
        takeProfitPct: fighter.takeProfitPct,
        cooldownMs: fighter.cooldownMs,
      } satisfies RunnerTarget;
    })
    .filter((item): item is RunnerTarget => Boolean(item));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageRange(
  points: Array<{
    high: number;
    low: number;
  }>,
) {
  if (!points.length) return 0;
  return average(points.map((point) => Math.max(0, point.high - point.low)));
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function computeAtrBreakoutSignal(
  points: Array<{ close: number; high: number; low: number }>,
) {
  const closes = points.map((point) => point.close);
  const recent = closes.slice(-6);
  const medium = closes.slice(-10);
  const longWindow = closes.slice(-20);
  const shortMa = average(recent);
  const mediumMa = average(medium);
  const longMa = average(longWindow);
  const last = closes.at(-1) ?? 0;
  const prev = closes.at(-2) ?? last;
  const breakoutLevel = Math.max(...points.slice(-10, -1).map((point) => point.high));
  const momentumPct = prev > 0 ? ((last - prev) / prev) * 100 : 0;
  const atrShort = averageRange(points.slice(-6));
  const atrLong = averageRange(points.slice(-20, -6));
  const expandingVolatility = atrLong > 0 ? atrShort >= atrLong * 1.08 : atrShort > 0;
  const trendAligned = shortMa > mediumMa && mediumMa >= longMa * 0.998;
  const breakoutConfirmed = last >= breakoutLevel * 0.9992 && momentumPct >= 0.14;

  return {
    enterLong: trendAligned && expandingVolatility && breakoutConfirmed,
    exitLong: last < shortMa * 0.995 || momentumPct <= -0.48,
    note: `ATR breakout | shortMA ${shortMa.toFixed(2)} mediumMA ${mediumMa.toFixed(2)} longMA ${longMa.toFixed(2)} | ATR ${atrShort.toFixed(2)}/${atrLong.toFixed(2)} | momentum ${momentumPct.toFixed(2)}%.`,
  };
}

function computeMeanReversionSignal(
  points: Array<{ close: number; high: number; low: number }>,
) {
  const closes = points.map((point) => point.close);
  const lookback = closes.slice(-14);
  const last = closes.at(-1) ?? 0;
  const prev = closes.at(-2) ?? last;
  const basis = average(lookback);
  const deviation = standardDeviation(lookback);
  const zScore = deviation > 0 ? (last - basis) / deviation : 0;
  const shortMa = average(closes.slice(-5));
  const wasOversold = zScore <= -1.05 || last < shortMa * 0.992;
  const stabilization = last >= prev * 0.998;
  const bounceComplete = last >= basis * 0.998 || zScore >= 0.35;

  return {
    enterLong: wasOversold && stabilization,
    exitLong: bounceComplete || last < basis * 0.986,
    note: `Mean reversion | basis ${basis.toFixed(2)} | z-score ${zScore.toFixed(2)} | shortMA ${shortMa.toFixed(2)}.`,
  };
}

function computeSignal(
  target: RunnerTarget,
  points: Array<{ close: number; high: number; low: number }>,
) {
  if (target.direction === "short") {
    return {
      enterLong: false,
      exitLong: true,
      note: "Short-only strategies are not enabled on the current spot runner yet.",
    };
  }

  if (target.strategy === "atr-breakout") {
    return computeAtrBreakoutSignal(points);
  }

  return computeMeanReversionSignal(points);
}

function isOrderOpen(state: string) {
  const normalized = state.trim().toLowerCase();
  return !["filled", "canceled", "cancelled"].includes(normalized);
}

function toOrderRecord(params: {
  orderId: string;
  side: "buy" | "sell";
  quoteUsd: number;
  baseSize: number | null;
}): ArenaRunnerOrder {
  const timestamp = nowIso();
  return {
    orderId: params.orderId,
    side: params.side,
    state: "submitted",
    requestedQuoteUsd: Number(params.quoteUsd.toFixed(2)),
    requestedBaseSize: params.baseSize == null ? null : Number(params.baseSize.toFixed(8)),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function mergeOrderStates(runtime: ArenaRunnerRuntime, orderStates: Map<string, string>) {
  runtime.orders = runtime.orders.map((order) => {
    const nextState = orderStates.get(order.orderId);
    if (!nextState || nextState === order.state) {
      return order;
    }

    return {
      ...order,
      state: nextState,
      updatedAt: nowIso(),
    };
  });

  runtime.activeOrderIds = runtime.orders
    .filter((order) => isOrderOpen(order.state))
    .map((order) => order.orderId);
}

function processNewFills(runtime: ArenaRunnerRuntime, fills: ArenaTradeFillFeed[]) {
  const knownTradeIds = new Set(runtime.fills.map((fill) => fill.tradeId));
  const relevantOrders = new Set(runtime.orders.map((order) => order.orderId));

  const newFills = fills
    .filter((fill) => fill.orderId && relevantOrders.has(fill.orderId) && !knownTradeIds.has(fill.tradeId))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

  for (const fill of newFills) {
    if (!fill.orderId) continue;

    runtime.fills.push({
      tradeId: fill.tradeId,
      orderId: fill.orderId,
      side: fill.side,
      fillPrice: fill.fillPrice,
      baseSize: fill.fillBaseSize,
      quoteValueUsd: fill.fillPrice * fill.fillBaseSize,
      feeUsd: fill.feeUsd,
      timestamp: fill.timestamp,
    });
    runtime.totalFills += 1;
    runtime.feesUsd += fill.feeUsd;

    if (fill.side === "buy") {
      const quoteCost = fill.fillPrice * fill.fillBaseSize + fill.feeUsd;
      const nextQty = runtime.basePositionQty + fill.fillBaseSize;
      const nextCostBasis =
        runtime.averageEntryPrice * runtime.basePositionQty + fill.fillPrice * fill.fillBaseSize;

      runtime.quoteBalanceUsd = Math.max(0, runtime.quoteBalanceUsd - quoteCost);
      runtime.basePositionQty = nextQty;
      runtime.averageEntryPrice = nextQty > 0 ? nextCostBasis / nextQty : 0;
    } else {
      const closeQty = Math.min(runtime.basePositionQty, fill.fillBaseSize);
      const grossProceeds = fill.fillPrice * closeQty;
      const realized = (fill.fillPrice - runtime.averageEntryPrice) * closeQty - fill.feeUsd;

      runtime.quoteBalanceUsd += Math.max(0, grossProceeds - fill.feeUsd);
      runtime.realizedPnlUsd += realized;
      runtime.basePositionQty = Math.max(0, runtime.basePositionQty - closeQty);
      if (runtime.basePositionQty <= 0.00000001) {
        runtime.basePositionQty = 0;
        runtime.averageEntryPrice = 0;
      }
      runtime.closedTrades += 1;
      if (realized > 0) {
        runtime.winningTrades += 1;
      }
    }

    const matchingOrder = runtime.orders.find((order) => order.orderId === fill.orderId);
    if (matchingOrder) {
      matchingOrder.state = "filled";
      matchingOrder.updatedAt = nowIso();
    }

    appendArenaRunnerEvent(
      runtime,
      createArenaRunnerEvent({
        type: "fill",
        status: "success",
        title: "Order fill recorded",
        note: `${fill.side.toUpperCase()} ${fill.fillBaseSize.toFixed(8)} at ${fill.fillPrice.toFixed(2)}.`,
        orderId: fill.orderId,
      }),
    );
  }

  runtime.activeOrderIds = runtime.orders
    .filter((order) => isOrderOpen(order.state))
    .map((order) => order.orderId);
}

function canPlaceNewOrder(runtime: ArenaRunnerRuntime, target: RunnerTarget) {
  if (runtime.activeOrderIds.length > 0) {
    return false;
  }

  if (!runtime.lastOrderAt) {
    return true;
  }

  return Date.now() - new Date(runtime.lastOrderAt).getTime() >= target.cooldownMs;
}

async function placeBuyOrder(
  target: RunnerTarget,
  runtime: ArenaRunnerRuntime,
  marketPrice: number,
) {
  const clientOrderId = createClientOrderId(target.agent.id);
  const maxBudget = Math.min(runtime.quoteBalanceUsd * target.maxQuoteFraction, target.maxQuoteUsd);
  const quoteBudget = Math.max(target.maxQuoteUsd * 0.72, maxBudget);

  if (quoteBudget < target.maxQuoteUsd * 0.72 || runtime.quoteBalanceUsd < target.minQuoteBalanceUsd) {
    runtime.lastAction = "hold";
    runtime.lastActionNote = `${target.agent.name} is below its cash floor for a new runner order.`;
    return;
  }

  const draft: ArenaDemoOrderDraft = {
    symbol: target.agent.symbol,
    side: "buy",
    orderType: "market",
    tdMode: "cash",
    size: quoteBudget.toFixed(2),
    referencePrice: marketPrice,
    leverageCap: "spot",
    rationale:
      target.strategy === "atr-breakout"
        ? "Season fighter breakout entry on expanding ATR and confirmed range escape."
        : "Season fighter mean-reversion entry on local dislocation and stabilization.",
    blocked: false,
    clientOrderId,
  };

  const result = await submitArenaDemoOrder(draft);
  runtime.lastAction = result.ok ? "buy" : "hold";
  runtime.lastActionNote = result.note;

  if (!result.ok || !result.orderId) {
    appendArenaRunnerEvent(
      runtime,
      createArenaRunnerEvent({
        type: "error",
        status: "failed",
        title: "Buy order rejected",
        note: result.note,
      }),
    );
    return;
  }

  runtime.totalOrders += 1;
  runtime.lastOrderAt = nowIso();
  runtime.lastOrderId = result.orderId;
  runtime.orders.unshift(
    toOrderRecord({
      orderId: result.orderId,
      side: "buy",
      quoteUsd: quoteBudget,
      baseSize: null,
    }),
  );
  runtime.activeOrderIds = [result.orderId, ...runtime.activeOrderIds].slice(0, 12);
  appendArenaRunnerEvent(
    runtime,
      createArenaRunnerEvent({
        type: "order",
        status: "success",
        title: "Buy order submitted",
        note: `Submitted a runner buy for ${quoteBudget.toFixed(2)} USDT.`,
        orderId: result.orderId,
      }),
    );
}

async function placeSellOrder(
  target: RunnerTarget,
  runtime: ArenaRunnerRuntime,
  marketPrice: number,
) {
  if (runtime.basePositionQty <= 0.00000001) {
    runtime.lastAction = "hold";
    runtime.lastActionNote = "No base position to close.";
    return;
  }

  const clientOrderId = createClientOrderId(target.agent.id);
  const quoteValue = runtime.basePositionQty * marketPrice;
  const draft: ArenaDemoOrderDraft = {
    symbol: target.agent.symbol,
    side: "sell",
    orderType: "market",
    tdMode: "cash",
    size: quoteValue.toFixed(2),
    referencePrice: marketPrice,
    leverageCap: "spot",
    rationale:
      target.strategy === "atr-breakout"
        ? "Season fighter breakout exit on failed follow-through or target reached."
        : "Season fighter mean-reversion exit on bounce completion or stop violation.",
    blocked: false,
    clientOrderId,
    baseSizeOverride: runtime.basePositionQty.toFixed(8),
  };

  const result = await submitArenaDemoOrder(draft);
  runtime.lastAction = result.ok ? "sell" : "hold";
  runtime.lastActionNote = result.note;

  if (!result.ok || !result.orderId) {
    appendArenaRunnerEvent(
      runtime,
      createArenaRunnerEvent({
        type: "error",
        status: "failed",
        title: "Sell order rejected",
        note: result.note,
      }),
    );
    return;
  }

  runtime.totalOrders += 1;
  runtime.lastOrderAt = nowIso();
  runtime.lastOrderId = result.orderId;
  runtime.orders.unshift(
    toOrderRecord({
      orderId: result.orderId,
      side: "sell",
      quoteUsd: quoteValue,
      baseSize: runtime.basePositionQty,
    }),
  );
  runtime.activeOrderIds = [result.orderId, ...runtime.activeOrderIds].slice(0, 12);
  appendArenaRunnerEvent(
    runtime,
      createArenaRunnerEvent({
        type: "order",
        status: "success",
        title: "Sell order submitted",
        note: `Submitted a runner sell for ${runtime.basePositionQty.toFixed(8)} units.`,
        orderId: result.orderId,
      }),
    );
}

async function processRunnerTarget(target: RunnerTarget) {
  const runtime = await ensureArenaRunnerRuntime(target.agent.id);
  if (!runtime.enabled) {
    return runtime;
  }

  runtime.tickIntervalSec = DEFAULT_TICK_INTERVAL_SEC;
  runtime.status = "active";
  runtime.nextTickAt = new Date(Date.now() + runtime.tickIntervalSec * 1000).toISOString();

  const [marketResult, historyResult, executionFeed] = await Promise.all([
    fetchLiveMarketContext(target.agent.symbol),
    fetchMarketHistory(target.agent.symbol, timeframeToBar(target.timeframe), 40),
    fetchTradeExecutionFeed(target.agent.symbol),
  ]);

  runtime.tickCount += 1;
  runtime.lastTickAt = nowIso();

  if (marketResult.integration.status !== "live") {
    runtime.status = "error";
    runtime.lastError = marketResult.integration.note;
    appendArenaRunnerEvent(
      runtime,
      createArenaRunnerEvent({
        type: "error",
        status: "failed",
        title: "Market sync failed",
        note: marketResult.integration.note,
      }),
    );
    await saveArenaRunnerRuntime(target.agent.id, runtime);
    return runtime;
  }

  runtime.lastMarketPrice = marketResult.market.lastPrice;
  runtime.lastMarketChange24hPct = marketResult.market.change24hPct;
  runtime.status = executionFeed.source === "okx-trade" ? "active" : "error";
  runtime.lastError = executionFeed.source === "okx-trade" ? undefined : executionFeed.note;

  const orderStateMap = new Map(executionFeed.orders.map((order) => [order.orderId, order.state]));
  mergeOrderStates(runtime, orderStateMap);
  processNewFills(runtime, executionFeed.fills);

  const signal = computeSignal(target, historyResult.points);
  const positionPnlPct =
    runtime.basePositionQty > 0 && runtime.averageEntryPrice > 0
      ? ((marketResult.market.lastPrice - runtime.averageEntryPrice) / runtime.averageEntryPrice) * 100
      : 0;
  const shouldBootstrapEntry =
    runtime.totalOrders === 0 &&
    runtime.totalFills === 0 &&
    runtime.basePositionQty <= 0.00000001 &&
    target.direction !== "short";

  runtime.lastAction = "hold";
  runtime.lastActionNote = signal.note;

  if (canPlaceNewOrder(runtime, target)) {
    if (shouldBootstrapEntry) {
      runtime.lastActionNote = `Opening the first season position for ${target.agent.name}.`;
      await placeBuyOrder(target, runtime, marketResult.market.lastPrice);
    } else if (
      runtime.basePositionQty <= 0.00000001 &&
      signal.enterLong &&
      target.direction !== "short"
    ) {
      await placeBuyOrder(target, runtime, marketResult.market.lastPrice);
    } else if (
      runtime.basePositionQty > 0.00000001 &&
      (signal.exitLong || positionPnlPct <= target.stopLossPct || positionPnlPct >= target.takeProfitPct)
    ) {
      await placeSellOrder(target, runtime, marketResult.market.lastPrice);
    }
  }

  recordArenaRunnerSnapshot(
    runtime,
    buildRunnerSnapshot({
      runtime,
      marketPrice: marketResult.market.lastPrice,
      activeOrders: runtime.activeOrderIds.length,
    }),
  );

  await saveArenaRunnerRuntime(target.agent.id, runtime);
  if (target.copyTradeEnabled) {
    await syncDemoCopyFollowers(target.agent.id, target.agent.symbol, runtime);
  }
  return runtime;
}

async function runCycleInternal() {
  const targets = await listRunnerTargets();
  const reportEntries: Array<{ agent: ArenaAgent; runtime: ArenaRunnerRuntime }> = [];

  for (const target of targets) {
    await ensureArenaRunnerRuntime(
      target.agent.id,
      createArenaRunnerEvent({
        type: "submission",
        status: "success",
        title: "Runner registered",
        note: "The agent has been added to the demo runner.",
      }),
    );

    try {
      const runtime = await processRunnerTarget(target);
      if (runtime) {
        reportEntries.push({
          agent: applyRunnerRuntimeToAgent(target.agent, runtime),
          runtime,
        });
      }
    } catch (error) {
      await updateArenaRunnerRuntime(target.agent.id, (current) => {
        current.status = "error";
        current.lastError = error instanceof Error ? error.message : "Runner tick failed.";
        appendArenaRunnerEvent(
          current,
          createArenaRunnerEvent({
            type: "error",
            status: "failed",
            title: "Runner tick failed",
            note: current.lastError,
          }),
        );
        return current;
      });
    }
  }

  if (reportEntries.length > 0) {
    await maybePostFightClubSeasonUpdate(reportEntries);
  }
}

export async function runArenaRunnerCycleOnce() {
  const state = getRunnerState();
  if (state.running) {
    return;
  }

  state.running = true;
  try {
    await runCycleInternal();
  } finally {
    state.running = false;
  }
}

export function ensureArenaDemoRunner() {
  if (!shouldAutoStartArenaRunner()) {
    return;
  }

  const state = getRunnerState();
  if (state.started) {
    return;
  }

  state.started = true;
  state.timer = setInterval(() => {
    void runArenaRunnerCycleOnce();
  }, DEFAULT_TICK_INTERVAL_SEC * 1000);
}

export async function getSubmittedAgentWithRuntime(storedAgent: StoredArenaAgent) {
  const runtime = await ensureArenaRunnerRuntime(storedAgent.agent.id);
  return {
    agent: applyRunnerRuntimeToAgent(storedAgent.agent, runtime),
    runtime,
  };
}

export async function getArenaAgentWithRuntime(agentId: string) {
  const storedAgent = await listStoredArenaAgents().then((agents) =>
    agents.find((entry) => entry.agent.id === agentId) ?? null,
  );
  if (storedAgent) {
    return getSubmittedAgentWithRuntime(storedAgent);
  }

  const seededAgent = getArenaAgent(agentId);
  if (!seededAgent) {
    return null;
  }

  const runtime = await ensureArenaRunnerRuntime(seededAgent.id);
  return {
    agent: applyRunnerRuntimeToAgent(seededAgent, runtime),
    runtime,
  };
}
