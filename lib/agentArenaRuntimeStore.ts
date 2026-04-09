import { promises as fs } from "fs";
import path from "path";
import type { ArenaAgent, PortfolioSnapshot, Position } from "@/lib/agentArena";
import type { ArenaSubmissionInput } from "@/lib/agentArenaStore";

export type ArenaRunnerOrder = {
  orderId: string;
  side: "buy" | "sell";
  state: string;
  requestedQuoteUsd: number;
  requestedBaseSize: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ArenaRunnerFill = {
  tradeId: string;
  orderId: string;
  side: "buy" | "sell";
  fillPrice: number;
  baseSize: number;
  quoteValueUsd: number;
  feeUsd: number;
  timestamp: string;
};

export type ArenaRunnerSnapshot = {
  timestamp: string;
  marketPrice: number;
  quoteBalanceUsd: number;
  positionQty: number;
  averageEntryPrice: number;
  positionValueUsd: number;
  equityUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  activeOrders: number;
};

export type ArenaRunnerPerformancePoint = {
  timestamp: string;
  pnl: number;
  equityUsd: number;
  price: number;
};

export type ArenaRunnerEvent = {
  id: string;
  type: "submission" | "tick" | "order" | "fill" | "error";
  status: "info" | "success" | "failed";
  title: string;
  note: string;
  timestamp: string;
  orderId?: string;
};

export type ArenaRunnerRuntime = {
  agentId: string;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
  status: "active" | "stopped" | "error";
  tickIntervalSec: number;
  initialCapitalUsd: number;
  tickCount: number;
  totalOrders: number;
  totalFills: number;
  closedTrades: number;
  winningTrades: number;
  blowups: number;
  quoteBalanceUsd: number;
  basePositionQty: number;
  averageEntryPrice: number;
  lastMarketPrice: number;
  lastMarketChange24hPct: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  maxPnlUsd: number;
  maxEquityUsd: number;
  maxDrawdownPct: number;
  feesUsd: number;
  positionValueUsd: number;
  lastTickAt?: string;
  nextTickAt?: string;
  lastAction?: "buy" | "sell" | "hold";
  lastActionNote?: string;
  lastOrderAt?: string;
  lastOrderId?: string;
  lastError?: string;
  activeOrderIds: string[];
  orders: ArenaRunnerOrder[];
  fills: ArenaRunnerFill[];
  snapshots: ArenaRunnerSnapshot[];
  events: ArenaRunnerEvent[];
};

const RUNTIME_DIR = path.join(process.cwd(), "data", "fight-club", "runtime");

function nowIso() {
  return new Date().toISOString();
}

function eventId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toMoney(value: number) {
  const sign = value >= 0 ? "" : "-";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function compactCurve(values: number[], target = 16) {
  if (values.length <= target) {
    return values.map((value) => Number(value.toFixed(2)));
  }

  const indexes = Array.from({ length: target }, (_, index) =>
    Math.min(values.length - 1, Math.round((index / (target - 1)) * (values.length - 1))),
  );

  return indexes.map((index) => Number(values[index].toFixed(2)));
}

function buildPosition(symbol: string, runtime: ArenaRunnerRuntime): Position[] {
  if (runtime.basePositionQty <= 0.00000001) {
    return [];
  }

  return [
    {
      symbol,
      side: "LONG",
      size: toMoney(runtime.positionValueUsd),
      entry: toMoney(runtime.averageEntryPrice),
      pnl: toMoney(runtime.unrealizedPnlUsd),
      liqPrice: "n/a",
      leverage: "spot",
    },
  ];
}

function buildPortfolio(runtime: ArenaRunnerRuntime, prior: PortfolioSnapshot): PortfolioSnapshot {
  const lastSnapshot = runtime.snapshots.at(-1);

  return {
    equityUsd: Number((lastSnapshot?.equityUsd ?? runtime.initialCapitalUsd).toFixed(2)),
    availableBalanceUsd: Number(runtime.quoteBalanceUsd.toFixed(2)),
    unrealizedPnlUsd: Number(runtime.unrealizedPnlUsd.toFixed(2)),
    realizedPnlUsd: Number(runtime.realizedPnlUsd.toFixed(2)),
    feesUsd: Number(runtime.feesUsd.toFixed(2)),
    maxDrawdownPct: Number(runtime.maxDrawdownPct.toFixed(2)),
    activeOrders: runtime.activeOrderIds.length,
    liquidationCount: runtime.blowups,
    source: "local",
    updatedAt: runtime.updatedAt || prior.updatedAt,
  };
}

function buildWinRate(runtime: ArenaRunnerRuntime) {
  if (runtime.closedTrades <= 0) {
    return "0.0%";
  }

  const pct = (runtime.winningTrades / runtime.closedTrades) * 100;
  return `${pct.toFixed(1)}%`;
}

function normalizePublicOperationalNote(note: string) {
  return note
    .replace(
      /OKX private credentials are not configured for demo order submission\./gi,
      "Dedicated runner credentials are not configured for order submission.",
    )
    .replace(
      /OKX rejected the order because the clOrdId parameter was invalid\./gi,
      "The routed order was rejected because the client order id was invalid.",
    )
    .replace(
      /Short-only strategies are not enabled on the spot demo runner yet\./gi,
      "Short-only strategies are not enabled on the current spot runner yet.",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function buildDescription(base: string, runtime: ArenaRunnerRuntime) {
  if (!runtime.lastActionNote) {
    return base;
  }
  return `${base} ${normalizePublicOperationalNote(runtime.lastActionNote)}`;
}

function defaultRuntime(agentId: string): ArenaRunnerRuntime {
  const createdAt = nowIso();
  const initialCapitalUsd = 10000;

  return {
    agentId,
    createdAt,
    updatedAt: createdAt,
    enabled: true,
    status: "active",
    tickIntervalSec: 45,
    initialCapitalUsd,
    tickCount: 0,
    totalOrders: 0,
    totalFills: 0,
    closedTrades: 0,
    winningTrades: 0,
    blowups: 0,
    quoteBalanceUsd: initialCapitalUsd,
    basePositionQty: 0,
    averageEntryPrice: 0,
    lastMarketPrice: 0,
    lastMarketChange24hPct: 0,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 0,
    totalPnlUsd: 0,
    maxPnlUsd: 0,
    maxEquityUsd: initialCapitalUsd,
    maxDrawdownPct: 0,
    feesUsd: 0,
    positionValueUsd: 0,
    activeOrderIds: [],
    orders: [],
    fills: [],
    snapshots: [],
    events: [],
  };
}

async function ensureRuntimeDir() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
}

function runtimePath(agentId: string) {
  return path.join(RUNTIME_DIR, `${agentId}.json`);
}

function normalizeRuntime(raw: unknown, agentId: string): ArenaRunnerRuntime {
  const base = defaultRuntime(agentId);
  if (!raw || typeof raw !== "object") {
    return base;
  }

  const candidate = raw as Partial<ArenaRunnerRuntime>;

  return {
    ...base,
    ...candidate,
    agentId,
    activeOrderIds: Array.isArray(candidate.activeOrderIds) ? candidate.activeOrderIds : [],
    orders: Array.isArray(candidate.orders) ? candidate.orders : [],
    fills: Array.isArray(candidate.fills) ? candidate.fills : [],
    snapshots: Array.isArray(candidate.snapshots) ? candidate.snapshots : [],
    events: Array.isArray(candidate.events) ? candidate.events : [],
  };
}

export async function getArenaRunnerRuntime(agentId: string) {
  await ensureRuntimeDir();

  try {
    const raw = await fs.readFile(runtimePath(agentId), "utf8");
    return normalizeRuntime(JSON.parse(raw), agentId);
  } catch {
    return null;
  }
}

export async function ensureArenaRunnerRuntime(
  agentId: string,
  initialEvent?: ArenaRunnerEvent,
) {
  const existing = await getArenaRunnerRuntime(agentId);
  if (existing) {
    return existing;
  }

  const runtime = defaultRuntime(agentId);
  if (initialEvent) {
    runtime.events.unshift(initialEvent);
  }

  await saveArenaRunnerRuntime(agentId, runtime);
  return runtime;
}

export async function saveArenaRunnerRuntime(agentId: string, runtime: ArenaRunnerRuntime) {
  await ensureRuntimeDir();
  runtime.agentId = agentId;
  runtime.updatedAt = nowIso();
  await fs.writeFile(runtimePath(agentId), JSON.stringify(runtime, null, 2), "utf8");
}

export async function deleteArenaRunnerRuntime(agentId: string) {
  await ensureRuntimeDir();
  try {
    await fs.unlink(runtimePath(agentId));
  } catch {
    // ignore missing runtime files
  }
}

export async function updateArenaRunnerRuntime(
  agentId: string,
  updater: (current: ArenaRunnerRuntime) => ArenaRunnerRuntime,
) {
  const current = (await getArenaRunnerRuntime(agentId)) ?? defaultRuntime(agentId);
  const next = updater(current);
  next.agentId = agentId;
  next.updatedAt = nowIso();
  await saveArenaRunnerRuntime(agentId, next);
  return next;
}

export function createArenaRunnerEvent(
  event: Omit<ArenaRunnerEvent, "id" | "timestamp">,
): ArenaRunnerEvent {
  return {
    id: eventId(),
    timestamp: nowIso(),
    ...event,
  };
}

export function appendArenaRunnerEvent(
  runtime: ArenaRunnerRuntime,
  event: ArenaRunnerEvent,
  limit = 80,
) {
  runtime.events = [event, ...runtime.events].slice(0, limit);
}

export function recordArenaRunnerSnapshot(
  runtime: ArenaRunnerRuntime,
  snapshot: ArenaRunnerSnapshot,
  limit = 320,
) {
  runtime.snapshots = [...runtime.snapshots, snapshot].slice(-limit);
  runtime.lastMarketPrice = snapshot.marketPrice;
  runtime.positionValueUsd = snapshot.positionValueUsd;
  runtime.unrealizedPnlUsd = snapshot.unrealizedPnlUsd;
  runtime.totalPnlUsd = snapshot.totalPnlUsd;
  runtime.maxPnlUsd = Math.max(runtime.maxPnlUsd, snapshot.totalPnlUsd);
  runtime.maxEquityUsd = Math.max(runtime.maxEquityUsd, snapshot.equityUsd);

  const peakEquity = runtime.snapshots.reduce(
    (max, item) => Math.max(max, item.equityUsd),
    runtime.initialCapitalUsd,
  );
  const drawdown =
    peakEquity > 0 ? ((peakEquity - snapshot.equityUsd) / peakEquity) * 100 : 0;
  runtime.maxDrawdownPct = Math.max(runtime.maxDrawdownPct, Number(drawdown.toFixed(2)));
}

export function applyRunnerRuntimeToAgent(agent: ArenaAgent, runtime: ArenaRunnerRuntime): ArenaAgent {
  const lastSnapshot = runtime.snapshots.at(-1);
  const totalPnlUsd = lastSnapshot?.totalPnlUsd ?? runtime.totalPnlUsd;
  const roi =
    runtime.initialCapitalUsd > 0 ? (totalPnlUsd / runtime.initialCapitalUsd) * 100 : 0;

  return {
    ...agent,
    mode: runtime.status === "active" ? "live" : agent.mode,
    status:
      runtime.status === "active"
        ? "Running"
        : runtime.status === "error"
          ? "Runner error"
          : "Stopped",
    pnl: Number(totalPnlUsd.toFixed(2)),
    roi: Number(roi.toFixed(2)),
    description: buildDescription(agent.description, runtime),
    blowups: runtime.blowups,
    totalTrades: runtime.totalFills,
    winRate: buildWinRate(runtime),
    positions: buildPosition(agent.symbol, runtime),
    curve: compactCurve(runtime.snapshots.map((snapshot) => snapshot.totalPnlUsd)),
    portfolio: buildPortfolio(runtime, agent.portfolio),
    leaderboardSource: "demo-run",
  };
}

export function listPerformanceCurve(runtime: ArenaRunnerRuntime): ArenaRunnerPerformancePoint[] {
  return runtime.snapshots.map((snapshot) => ({
    timestamp: snapshot.timestamp,
    pnl: Number(snapshot.totalPnlUsd.toFixed(2)),
    equityUsd: Number(snapshot.equityUsd.toFixed(2)),
    price: Number(snapshot.marketPrice.toFixed(2)),
  }));
}

export function buildRunnerSnapshot(params: {
  runtime: ArenaRunnerRuntime;
  marketPrice: number;
  activeOrders: number;
}) {
  const positionValueUsd = params.runtime.basePositionQty * params.marketPrice;
  const unrealizedPnlUsd =
    params.runtime.basePositionQty > 0
      ? (params.marketPrice - params.runtime.averageEntryPrice) * params.runtime.basePositionQty
      : 0;
  const equityUsd =
    params.runtime.quoteBalanceUsd + positionValueUsd;

  return {
    timestamp: nowIso(),
    marketPrice: params.marketPrice,
    quoteBalanceUsd: Number(params.runtime.quoteBalanceUsd.toFixed(2)),
    positionQty: Number(params.runtime.basePositionQty.toFixed(8)),
    averageEntryPrice: Number(params.runtime.averageEntryPrice.toFixed(4)),
    positionValueUsd: Number(positionValueUsd.toFixed(2)),
    equityUsd: Number(equityUsd.toFixed(2)),
    realizedPnlUsd: Number(params.runtime.realizedPnlUsd.toFixed(2)),
    unrealizedPnlUsd: Number(unrealizedPnlUsd.toFixed(2)),
    totalPnlUsd: Number((equityUsd - params.runtime.initialCapitalUsd).toFixed(2)),
    activeOrders: params.activeOrders,
  } satisfies ArenaRunnerSnapshot;
}
