import { promises as fs } from "fs";
import path from "path";
import type { ArenaRunnerFill, ArenaRunnerRuntime } from "@/lib/agentArenaRuntimeStore";
import {
  fetchLiveMarketContext,
  fetchLivePortfolioContext,
  fetchTradeExecutionFeed,
  submitArenaDemoOrder,
  type ArenaDemoOrderDraft,
} from "@/lib/okxAgentTradeKit";
import { getOkxFollowerProfile } from "@/lib/okxFollowerProfiles";

export type ArenaCopyFollowerMode = "local-ledger" | "okx-demo-account";

export type ArenaCopyFollowerSnapshot = {
  timestamp: string;
  marketPrice: number;
  equityUsd: number;
  positionQty: number;
  averageEntryPrice: number;
  cashUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
};

export type ArenaCopyFollowerEvent = {
  id: string;
  timestamp: string;
  type: "join" | "buy" | "sell" | "stop" | "error";
  status: "info" | "success" | "failed";
  title: string;
  note: string;
  leaderTradeId?: string;
};

export type ArenaCopyFollower = {
  id: string;
  agentId: string;
  alias: string;
  mode: ArenaCopyFollowerMode;
  profileId?: string;
  profileLabel?: string;
  status: "active" | "stopped";
  createdAt: string;
  updatedAt: string;
  initialCapitalUsd: number;
  cashUsd: number;
  positionQty: number;
  averageEntryPrice: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  feesUsd: number;
  copiedOrders: number;
  copiedFills: number;
  leaderInitialCapitalUsd: number;
  lastProcessedLeaderTradeId?: string;
  snapshots: ArenaCopyFollowerSnapshot[];
  events: ArenaCopyFollowerEvent[];
};

type ArenaCopyStore = {
  followers: ArenaCopyFollower[];
};

export type ArenaCopyTradeSummary = {
  activeFollowers: number;
  totalAllocatedUsd: number;
  totalEquityUsd: number;
  totalPnlUsd: number;
  totalCopiedFills: number;
  followers: Array<{
    id: string;
    alias: string;
    mode: ArenaCopyFollowerMode;
    profileLabel?: string;
    status: "active" | "stopped";
    initialCapitalUsd: number;
    equityUsd: number;
    totalPnlUsd: number;
    roiPct: number;
    positionQty: number;
    copiedFills: number;
    updatedAt: string;
  }>;
};

const STORE_DIR = path.join(process.cwd(), "data", "fight-club");
const STORE_FILE = path.join(STORE_DIR, "copy-trade.json");

function nowIso() {
  return new Date().toISOString();
}

function eventId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeSnapshot(snapshot: ArenaCopyFollowerSnapshot) {
  return {
    ...snapshot,
    marketPrice: round(snapshot.marketPrice, 2),
    equityUsd: round(snapshot.equityUsd, 2),
    positionQty: round(snapshot.positionQty, 8),
    averageEntryPrice: round(snapshot.averageEntryPrice, 4),
    cashUsd: round(snapshot.cashUsd, 2),
    realizedPnlUsd: round(snapshot.realizedPnlUsd, 2),
    unrealizedPnlUsd: round(snapshot.unrealizedPnlUsd, 2),
    totalPnlUsd: round(snapshot.totalPnlUsd, 2),
  };
}

async function ensureStore() {
  await fs.mkdir(STORE_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    const initial: ArenaCopyStore = { followers: [] };
    await fs.writeFile(STORE_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<ArenaCopyStore> {
  await ensureStore();
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<ArenaCopyStore>;
    const followers = Array.isArray(parsed.followers) ? parsed.followers : [];
    return {
      followers: followers.map((follower) => ({
        ...follower,
        mode: follower?.mode === "okx-demo-account" ? "okx-demo-account" : "local-ledger",
      })),
    };
  } catch {
    return { followers: [] };
  }
}

async function writeStore(store: ArenaCopyStore) {
  await ensureStore();
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

function appendEvent(
  follower: ArenaCopyFollower,
  event: Omit<ArenaCopyFollowerEvent, "id" | "timestamp">,
  limit = 60,
) {
  follower.events = [
    {
      id: eventId("cpyevt"),
      timestamp: nowIso(),
      ...event,
    },
    ...follower.events,
  ].slice(0, limit);
}

function recordSnapshot(
  follower: ArenaCopyFollower,
  marketPrice: number,
  limit = 240,
) {
  const unrealizedPnlUsd =
    follower.positionQty > 0
      ? (marketPrice - follower.averageEntryPrice) * follower.positionQty
      : 0;
  const equityUsd = follower.cashUsd + follower.positionQty * marketPrice;
  const totalPnlUsd = equityUsd - follower.initialCapitalUsd;

  follower.unrealizedPnlUsd = round(unrealizedPnlUsd, 2);
  follower.totalPnlUsd = round(totalPnlUsd, 2);
  follower.updatedAt = nowIso();
  follower.snapshots = [
    ...follower.snapshots,
    normalizeSnapshot({
      timestamp: follower.updatedAt,
      marketPrice,
      equityUsd,
      positionQty: follower.positionQty,
      averageEntryPrice: follower.averageEntryPrice,
      cashUsd: follower.cashUsd,
      realizedPnlUsd: follower.realizedPnlUsd,
      unrealizedPnlUsd,
      totalPnlUsd,
    }),
  ].slice(-limit);
}

function newestLeaderTradeId(runtime: ArenaRunnerRuntime) {
  return runtime.fills.at(-1)?.tradeId;
}

async function syncRealFollowerAccount(
  follower: ArenaCopyFollower,
  symbol: string,
  leaderRuntime: ArenaRunnerRuntime,
) {
  if (!follower.profileId) {
    appendEvent(follower, {
      type: "error",
      status: "failed",
      title: "Missing follower profile",
      note: "This copy follower does not have a valid OKX demo profile binding.",
    });
    return;
  }

  const profile = getOkxFollowerProfile(follower.profileId);
  if (!profile) {
    appendEvent(follower, {
      type: "error",
      status: "failed",
      title: "Follower profile not found",
      note: `Profile ${follower.profileId} is not configured on the server.`,
    });
    return;
  }

  const market = await fetchLiveMarketContext(symbol);
  const marketPrice = market.market.lastPrice || leaderRuntime.lastMarketPrice || 0;
  const fallbackPortfolio = {
    equityUsd: follower.initialCapitalUsd,
    availableBalanceUsd: follower.cashUsd,
    unrealizedPnlUsd: follower.unrealizedPnlUsd,
    realizedPnlUsd: follower.realizedPnlUsd,
    feesUsd: follower.feesUsd,
    maxDrawdownPct: 0,
    activeOrders: 0,
    liquidationCount: 0,
    source: "local" as const,
    updatedAt: nowIso(),
  };

  const fallbackPositions =
    follower.positionQty > 0
      ? [
          {
            symbol,
            side: "LONG" as const,
            size: `${follower.positionQty}`,
            entry: `${follower.averageEntryPrice}`,
            pnl: `${follower.unrealizedPnlUsd}`,
            liqPrice: "n/a",
            leverage: "spot",
          },
        ]
      : [];

  const [portfolioResult, executionFeed] = await Promise.all([
    fetchLivePortfolioContext(
      symbol,
      market.market,
      { portfolio: fallbackPortfolio, positions: fallbackPositions },
      profile.credentials,
    ),
    fetchTradeExecutionFeed(symbol, profile.credentials),
  ]);

  follower.profileLabel = profile.label;
  follower.cashUsd = round(portfolioResult.portfolio.availableBalanceUsd, 2);
  follower.realizedPnlUsd = round(portfolioResult.portfolio.realizedPnlUsd, 2);
  follower.unrealizedPnlUsd = round(portfolioResult.portfolio.unrealizedPnlUsd, 2);
  follower.feesUsd = round(portfolioResult.portfolio.feesUsd, 2);
  follower.positionQty = round(
    portfolioResult.positions[0]?.size
      ? Number(String(portfolioResult.positions[0].size).replace(/[^0-9.\-]/g, "")) / Math.max(marketPrice, 1)
      : 0,
    8,
  );
  follower.averageEntryPrice = portfolioResult.positions[0]?.entry
    ? round(Number(String(portfolioResult.positions[0].entry).replace(/[^0-9.\-]/g, "")), 4)
    : 0;
  follower.copiedOrders = Math.max(follower.copiedOrders, executionFeed.orders.length);
  follower.updatedAt = nowIso();
  recordSnapshot(follower, marketPrice);
}

function initializeFollowerPosition(
  follower: ArenaCopyFollower,
  leaderRuntime: ArenaRunnerRuntime,
) {
  const marketPrice = leaderRuntime.lastMarketPrice;
  if (leaderRuntime.basePositionQty <= 0.00000001 || marketPrice <= 0) {
    return;
  }

  const scale = follower.initialCapitalUsd / leaderRuntime.initialCapitalUsd;
  const targetQty = round(leaderRuntime.basePositionQty * scale, 8);
  if (targetQty <= 0.00000001) {
    return;
  }

  const cost = targetQty * marketPrice;
  const maxAffordableQty = round(follower.cashUsd / marketPrice, 8);
  const qty = Math.min(targetQty, maxAffordableQty);
  if (qty <= 0.00000001) {
    return;
  }

  follower.positionQty = qty;
  follower.averageEntryPrice = round(marketPrice, 4);
  follower.cashUsd = round(follower.cashUsd - qty * marketPrice, 2);

  appendEvent(follower, {
    type: "join",
    status: "success",
    title: "Follower joined current leader position",
    note: `Initialized with ${qty.toFixed(8)} base units at ${marketPrice.toFixed(2)}.`,
  });
}

function syncFollowerWithFill(
  follower: ArenaCopyFollower,
  leaderRuntime: ArenaRunnerRuntime,
  fill: ArenaRunnerFill,
) {
  const scale = follower.initialCapitalUsd / leaderRuntime.initialCapitalUsd;
  const desiredQty = round(fill.baseSize * scale, 8);
  const scaledFeeUsd = round(fill.feeUsd * scale, 6);
  if (desiredQty <= 0.00000001) {
    follower.lastProcessedLeaderTradeId = fill.tradeId;
    return;
  }

  if (fill.side === "buy") {
    const maxAffordableQty = round(follower.cashUsd / fill.fillPrice, 8);
    const qty = Math.min(desiredQty, maxAffordableQty);
    if (qty > 0.00000001) {
      const nextQty = follower.positionQty + qty;
      const nextCostBasis = follower.averageEntryPrice * follower.positionQty + fill.fillPrice * qty;
      follower.cashUsd = round(follower.cashUsd - qty * fill.fillPrice - scaledFeeUsd, 2);
      follower.positionQty = round(nextQty, 8);
      follower.averageEntryPrice = nextQty > 0 ? round(nextCostBasis / nextQty, 4) : 0;
      follower.feesUsd = round(follower.feesUsd + scaledFeeUsd, 2);
      follower.copiedOrders += 1;
      follower.copiedFills += 1;
      appendEvent(follower, {
        type: "buy",
        status: "success",
        title: "Mirrored leader buy",
        note: `Copied ${qty.toFixed(8)} at ${fill.fillPrice.toFixed(2)} from leader fill.`,
        leaderTradeId: fill.tradeId,
      });
    }
  } else {
    const qty = Math.min(follower.positionQty, desiredQty);
    if (qty > 0.00000001) {
      const realized = (fill.fillPrice - follower.averageEntryPrice) * qty - scaledFeeUsd;
      follower.cashUsd = round(follower.cashUsd + qty * fill.fillPrice - scaledFeeUsd, 2);
      follower.positionQty = round(follower.positionQty - qty, 8);
      follower.realizedPnlUsd = round(follower.realizedPnlUsd + realized, 2);
      follower.feesUsd = round(follower.feesUsd + scaledFeeUsd, 2);
      if (follower.positionQty <= 0.00000001) {
        follower.positionQty = 0;
        follower.averageEntryPrice = 0;
      }
      follower.copiedOrders += 1;
      follower.copiedFills += 1;
      appendEvent(follower, {
        type: "sell",
        status: "success",
        title: "Mirrored leader sell",
        note: `Copied ${qty.toFixed(8)} at ${fill.fillPrice.toFixed(2)} from leader fill.`,
        leaderTradeId: fill.tradeId,
      });
    }
  }

  follower.lastProcessedLeaderTradeId = fill.tradeId;
}

export async function createDemoCopyFollower(params: {
  agentId: string;
  symbol: string;
  alias?: string;
  initialCapitalUsd?: number;
  leaderRuntime: ArenaRunnerRuntime;
  mode?: ArenaCopyFollowerMode;
  profileId?: string;
}) {
  const store = await readStore();
  const createdAt = nowIso();
  const initialCapitalUsd = Math.max(250, Math.min(100000, Number(params.initialCapitalUsd ?? 1000)));
  const follower: ArenaCopyFollower = {
    id: eventId("follower"),
    agentId: params.agentId,
    alias: params.alias?.trim() || `Demo follower ${store.followers.filter((item) => item.agentId === params.agentId).length + 1}`,
    mode: params.mode ?? "local-ledger",
    profileId: params.profileId,
    profileLabel: undefined,
    status: "active",
    createdAt,
    updatedAt: createdAt,
    initialCapitalUsd: round(initialCapitalUsd, 2),
    cashUsd: round(initialCapitalUsd, 2),
    positionQty: 0,
    averageEntryPrice: 0,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 0,
    totalPnlUsd: 0,
    feesUsd: 0,
    copiedOrders: 0,
    copiedFills: 0,
    leaderInitialCapitalUsd: params.leaderRuntime.initialCapitalUsd,
    lastProcessedLeaderTradeId: newestLeaderTradeId(params.leaderRuntime),
    snapshots: [],
    events: [],
  };

  appendEvent(follower, {
    type: "join",
    status: "success",
    title: "Demo copy trade started",
    note:
      follower.mode === "okx-demo-account"
        ? `Follower capital cap set to ${initialCapitalUsd.toFixed(2)} USDT with an OKX demo profile.`
        : `Follower capital set to ${initialCapitalUsd.toFixed(2)} USDT.`,
  });
  if (follower.mode === "okx-demo-account") {
    const profile = follower.profileId ? getOkxFollowerProfile(follower.profileId) : null;
    if (!profile) {
      throw new Error("Follower profile is not configured.");
    }

    follower.profileLabel = profile.label;
    const marketPrice = params.leaderRuntime.lastMarketPrice;
    if (params.leaderRuntime.basePositionQty > 0.00000001 && marketPrice > 0) {
      const scale = follower.initialCapitalUsd / params.leaderRuntime.initialCapitalUsd;
      const targetQty = round(params.leaderRuntime.basePositionQty * scale, 8);
      const quoteBudget = round(targetQty * marketPrice, 2);
      if (quoteBudget >= 10) {
        const draft: ArenaDemoOrderDraft = {
          symbol: params.symbol,
          side: "buy",
          orderType: "market",
          tdMode: "cash",
          size: quoteBudget.toFixed(2),
          referencePrice: marketPrice,
          leverageCap: "spot",
          rationale: "Initialize follower to the leader's current spot position.",
          blocked: false,
        };
        const result = await submitArenaDemoOrder(draft, profile.credentials);
        appendEvent(follower, {
          type: result.ok ? "join" : "error",
          status: result.ok ? "success" : "failed",
          title: result.ok ? "Initialized real demo follower" : "Failed to initialize real demo follower",
          note: result.note,
          leaderTradeId: params.leaderRuntime.fills.at(-1)?.tradeId,
        });
      }
    }
    await syncRealFollowerAccount(follower, params.symbol, params.leaderRuntime);
  } else {
    initializeFollowerPosition(follower, params.leaderRuntime);
    recordSnapshot(follower, params.leaderRuntime.lastMarketPrice || 0);
  }

  store.followers.unshift(follower);
  await writeStore(store);
  return follower;
}

export async function stopDemoCopyFollower(agentId: string, followerId: string) {
  const store = await readStore();
  let changed = false;

  store.followers = store.followers.map((follower) => {
    if (follower.agentId !== agentId || follower.id !== followerId) {
      return follower;
    }
    changed = true;
    const next = { ...follower, status: "stopped" as const, updatedAt: nowIso() };
    appendEvent(next, {
      type: "stop",
      status: "info",
      title: "Demo copy trade stopped",
      note: "Follower was stopped manually.",
    });
    return next;
  });

  if (changed) {
    await writeStore(store);
  }

  return changed;
}

export async function syncDemoCopyFollowers(
  agentId: string,
  symbol: string,
  leaderRuntime: ArenaRunnerRuntime,
) {
  const store = await readStore();
  let changed = false;

  const fills = leaderRuntime.fills;
  store.followers = await Promise.all(store.followers.map(async (follower) => {
    if (follower.agentId !== agentId || follower.status !== "active") {
      return follower;
    }

    const next = { ...follower, snapshots: [...follower.snapshots], events: [...follower.events] };
    const startIndex = next.lastProcessedLeaderTradeId
      ? fills.findIndex((fill) => fill.tradeId === next.lastProcessedLeaderTradeId) + 1
      : 0;
    const newFills = startIndex > 0 ? fills.slice(startIndex) : fills;

    if (next.mode === "okx-demo-account") {
      const profile = next.profileId ? getOkxFollowerProfile(next.profileId) : null;
      if (!profile) {
        appendEvent(next, {
          type: "error",
          status: "failed",
          title: "Follower profile missing",
          note: `Profile ${next.profileId || "unknown"} is not configured.`,
        });
      } else {
        for (const fill of newFills) {
          const scale = next.initialCapitalUsd / leaderRuntime.initialCapitalUsd;
          const desiredQty = round(fill.baseSize * scale, 8);
          const quoteBudget = round(desiredQty * fill.fillPrice, 2);
          if (fill.side === "buy" && quoteBudget >= 10) {
            const draft: ArenaDemoOrderDraft = {
              symbol,
              side: "buy",
              orderType: "market",
              tdMode: "cash",
              size: quoteBudget.toFixed(2),
              referencePrice: fill.fillPrice,
              leverageCap: "spot",
              rationale: "Mirror leader buy fill onto follower demo account.",
              blocked: false,
            };
            const result = await submitArenaDemoOrder(draft, profile.credentials);
            appendEvent(next, {
              type: result.ok ? "buy" : "error",
              status: result.ok ? "success" : "failed",
              title: result.ok ? "Mirrored leader buy on follower account" : "Follower buy failed",
              note: result.note,
              leaderTradeId: fill.tradeId,
            });
            if (result.ok) {
              next.copiedOrders += 1;
            }
          }
          if (fill.side === "sell" && desiredQty > 0.00000001) {
            const draft: ArenaDemoOrderDraft = {
              symbol,
              side: "sell",
              orderType: "market",
              tdMode: "cash",
              size: quoteBudget.toFixed(2),
              referencePrice: fill.fillPrice,
              leverageCap: "spot",
              rationale: "Mirror leader sell fill onto follower demo account.",
              blocked: false,
              baseSizeOverride: desiredQty.toFixed(8),
            };
            const result = await submitArenaDemoOrder(draft, profile.credentials);
            appendEvent(next, {
              type: result.ok ? "sell" : "error",
              status: result.ok ? "success" : "failed",
              title: result.ok ? "Mirrored leader sell on follower account" : "Follower sell failed",
              note: result.note,
              leaderTradeId: fill.tradeId,
            });
            if (result.ok) {
              next.copiedOrders += 1;
            }
          }
          next.lastProcessedLeaderTradeId = fill.tradeId;
        }
        await syncRealFollowerAccount(next, symbol, leaderRuntime);
      }
    } else {
      newFills.forEach((fill) => syncFollowerWithFill(next, leaderRuntime, fill));
      recordSnapshot(next, leaderRuntime.lastMarketPrice || 0);
    }

    changed = changed || newFills.length > 0;
    return next;
  }));

  if (changed || store.followers.some((follower) => follower.agentId === agentId && follower.status === "active")) {
    await writeStore(store);
  }
}

export async function getDemoCopyTradeSummary(agentId: string): Promise<ArenaCopyTradeSummary> {
  const store = await readStore();
  const followers = store.followers
    .filter((item) => item.agentId === agentId)
    .map((follower) => {
      const latestSnapshot = follower.snapshots.at(-1);
      const equityUsd = latestSnapshot?.equityUsd ?? follower.initialCapitalUsd;
      const totalPnlUsd = latestSnapshot?.totalPnlUsd ?? follower.totalPnlUsd;
      const roiPct =
        follower.initialCapitalUsd > 0 ? (totalPnlUsd / follower.initialCapitalUsd) * 100 : 0;

      return {
        id: follower.id,
        alias: follower.alias,
        mode: follower.mode,
        profileLabel: follower.profileLabel,
        status: follower.status,
        initialCapitalUsd: follower.initialCapitalUsd,
        equityUsd: round(equityUsd, 2),
        totalPnlUsd: round(totalPnlUsd, 2),
        roiPct: round(roiPct, 2),
        positionQty: round(follower.positionQty, 8),
        copiedFills: follower.copiedFills,
        updatedAt: follower.updatedAt,
      };
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  const activeFollowers = followers.filter((item) => item.status === "active");

  return {
    activeFollowers: activeFollowers.length,
    totalAllocatedUsd: round(activeFollowers.reduce((sum, item) => sum + item.initialCapitalUsd, 0), 2),
    totalEquityUsd: round(activeFollowers.reduce((sum, item) => sum + item.equityUsd, 0), 2),
    totalPnlUsd: round(activeFollowers.reduce((sum, item) => sum + item.totalPnlUsd, 0), 2),
    totalCopiedFills: activeFollowers.reduce((sum, item) => sum + item.copiedFills, 0),
    followers,
  };
}
