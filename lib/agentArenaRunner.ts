import { getArenaAgent, getArenaAgents, type ArenaAgent } from "@/lib/agentArena";
import { listStoredArenaAgents, type StoredArenaAgent } from "@/lib/agentArenaStore";
import { syncDemoCopyFollowers } from "@/lib/agentArenaCopyStore";
import { shouldAutoStartArenaRunner } from "@/lib/agentArenaDeployment";
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
const ORDER_COOLDOWN_MS = 5 * 60 * 1000;

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
  const storedIds = new Set(storedAgents.map((entry) => entry.agent.id));

  const storedTargets: RunnerTarget[] = storedAgents.map((entry) => ({
    agent: entry.agent,
    timeframe: entry.submission.timeframe,
    direction: entry.submission.direction,
    copyTradeEnabled: true,
  }));

  const officialTargets: RunnerTarget[] = getArenaAgents()
    .filter((agent) => !storedIds.has(agent.id))
    .map((agent) => ({
      agent,
      timeframe: inferTimeframe(agent),
      direction: inferDirection(agent),
      copyTradeEnabled: false,
    }));

  return [...storedTargets, ...officialTargets];
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeSignal(
  closes: number[],
  direction: StoredArenaAgent["submission"]["direction"],
) {
  const recent = closes.slice(-6);
  const longWindow = closes.slice(-14);
  const shortMa = average(recent);
  const longMa = average(longWindow);
  const last = closes.at(-1) ?? 0;
  const prev = closes.at(-2) ?? last;
  const momentumPct = prev > 0 ? ((last - prev) / prev) * 100 : 0;
  const bullish = shortMa >= longMa * 0.998 && momentumPct >= -0.05;
  const bearish = shortMa < longMa * 0.997 || momentumPct <= -0.4;

  if (direction === "short") {
    return {
      enterLong: false,
      exitLong: true,
      note: "Short-only strategies are not enabled on the current spot runner yet.",
    };
  }

  return {
    enterLong: bullish,
    exitLong: bearish,
    note: `shortMA ${shortMa.toFixed(2)} vs longMA ${longMa.toFixed(2)}, momentum ${momentumPct.toFixed(2)}%.`,
  };
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

function canPlaceNewOrder(runtime: ArenaRunnerRuntime) {
  if (runtime.activeOrderIds.length > 0) {
    return false;
  }

  if (!runtime.lastOrderAt) {
    return true;
  }

  return Date.now() - new Date(runtime.lastOrderAt).getTime() >= ORDER_COOLDOWN_MS;
}

async function placeBuyOrder(
  target: RunnerTarget,
  runtime: ArenaRunnerRuntime,
  marketPrice: number,
) {
  const clientOrderId = createClientOrderId(target.agent.id);
  const maxBudget = Math.min(runtime.quoteBalanceUsd * 0.18, 520);
  const quoteBudget = Math.max(420, Math.min(maxBudget, runtime.quoteBalanceUsd * 0.25));

  if (quoteBudget < 420 || runtime.quoteBalanceUsd < 450) {
    runtime.lastAction = "hold";
    runtime.lastActionNote = "Not enough quote balance to place a new demo order.";
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
    rationale: "Auto-enter long on bullish spot signal.",
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
      note: `Submitted a spot demo buy for ${quoteBudget.toFixed(2)} USDT.`,
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
    rationale: "Auto-exit long position on bearish or stop/take-profit signal.",
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
      note: `Submitted a spot demo sell for ${runtime.basePositionQty.toFixed(8)} units.`,
      orderId: result.orderId,
    }),
  );
}

async function processRunnerTarget(target: RunnerTarget) {
  const runtime = await ensureArenaRunnerRuntime(target.agent.id);
  if (!runtime.enabled) {
    return;
  }

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
    return;
  }

  runtime.lastMarketPrice = marketResult.market.lastPrice;
  runtime.lastMarketChange24hPct = marketResult.market.change24hPct;
  runtime.status = executionFeed.source === "okx-trade" ? "active" : "error";
  runtime.lastError = executionFeed.source === "okx-trade" ? undefined : executionFeed.note;

  const orderStateMap = new Map(executionFeed.orders.map((order) => [order.orderId, order.state]));
  mergeOrderStates(runtime, orderStateMap);
  processNewFills(runtime, executionFeed.fills);

  const closes = historyResult.points.map((point) => point.close);
  const signal = computeSignal(closes, target.direction);
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

  if (canPlaceNewOrder(runtime)) {
    if (shouldBootstrapEntry) {
      runtime.lastActionNote = "Opening an initial demo position so the runner starts with a real execution trail.";
      await placeBuyOrder(target, runtime, marketResult.market.lastPrice);
    } else if (
      runtime.basePositionQty <= 0.00000001 &&
      signal.enterLong &&
      target.direction !== "short"
    ) {
      await placeBuyOrder(target, runtime, marketResult.market.lastPrice);
    } else if (
      runtime.basePositionQty > 0.00000001 &&
      (signal.exitLong || positionPnlPct <= -1.4 || positionPnlPct >= 2.8)
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
}

async function runCycleInternal() {
  const targets = await listRunnerTargets();
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
      await processRunnerTarget(target);
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
