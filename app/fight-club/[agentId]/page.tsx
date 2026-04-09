"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  CandlestickChart,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Globe,
  Play,
  Sparkles,
  Star,
} from "lucide-react";
import type { ArenaAgent, ArenaIntegrationState } from "@/lib/agentArena";
import type { ArenaSubmissionInput } from "@/lib/agentArenaStore";
import type {
  ArenaRunnerEvent,
  ArenaRunnerPerformancePoint,
  ArenaRunnerRuntime,
} from "@/lib/agentArenaRuntimeStore";
import type {
  ArenaExecutionEvidence,
  ArenaMarketHistoryPoint,
} from "@/lib/okxAgentTradeKit";

type ArenaLocale = "en" | "zh";

type ArenaCopyTradeSummary = {
  activeFollowers: number;
  totalAllocatedUsd: number;
  totalEquityUsd: number;
  totalPnlUsd: number;
  totalCopiedFills: number;
  followers: Array<{
    id: string;
    alias: string;
    mode: "local-ledger" | "okx-demo-account";
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

type ArenaCopyProfileView = {
  id: string;
  label: string;
};

const AGENT_ARENA_LOCALE_KEY = "xlayer-agent-fight-club-locale";

const copy = {
  en: {
    nav: {
      board: "Public Arena",
      results: "Agent Results",
      status: "X Layer + Moltbook",
    },
    back: "Back",
    missing: "Agent not found",
    persona: "Operator Brief",
    symbolView: "Market View",
    positions: "Current Positions",
    noPositions: "No positions open right now.",
    cards: {
      market: "Market Context",
      portfolio: "Portfolio Snapshot",
      execution: "Execution evidence",
      recentOrders: "Recent orders",
      recentFills: "Recent fills",
    },
    labels: {
      lastPrice: "Last Price",
      move24h: "24h Move",
      volume: "Volume",
      source: "Source",
      chartSource: "Chart Source",
      equity: "Equity",
      available: "Available",
      upl: "UPL",
      fees: "Fees",
      symbol: "Symbol",
      side: "Side",
      positionSize: "Position Size",
      liqPrice: "Liq Price",
      entryPrice: "Entry Price",
      pnl: "PnL",
      timestamp: "Time",
      price: "Price",
      size: "Size",
      state: "State",
      orderType: "Type",
      fillPrice: "Fill Price",
      fillSize: "Fill Size",
      fee: "Fee",
    },
    sources: {
      marketHistoryLive: "Live X Layer market history",
      marketHistoryFallback: "Fallback curve because live X Layer history is unavailable",
      portfolioLive: "Live runner portfolio snapshot",
      portfolioFallback: "Sample snapshot until a dedicated runtime wallet is configured",
      positionsLive: "Positions loaded from the dedicated arena runtime",
      positionsFallback: "Sample positions shown because a dedicated runtime wallet is not configured",
    },
    modes: {
      running: "Running",
    },
    loading: "Loading arena results...",
  },
  zh: {
    nav: {
      board: "公开竞技场",
      results: "结果详情",
      status: "X Layer + Moltbook",
    },
    back: "返回",
    missing: "没有找到这个 Agent",
    persona: "操盘手简介",
    symbolView: "市场视图",
    positions: "当前持仓",
    noPositions: "当前没有持仓。",
    cards: {
      market: "市场上下文",
      portfolio: "账户快照",
      execution: "执行证据",
      recentOrders: "最近订单",
      recentFills: "最近成交",
    },
    labels: {
      lastPrice: "最新价",
      move24h: "24 小时涨跌",
      volume: "成交额",
      source: "数据源",
      chartSource: "图表来源",
      equity: "权益",
      available: "可用余额",
      upl: "未实现盈亏",
      fees: "手续费",
      symbol: "交易对",
      side: "方向",
      positionSize: "仓位规模",
      liqPrice: "强平价",
      entryPrice: "开仓价",
      pnl: "盈亏",
      timestamp: "时间",
      price: "价格",
      size: "数量",
      state: "状态",
      orderType: "类型",
      fillPrice: "成交价",
      fillSize: "成交量",
      fee: "手续费",
    },
    sources: {
      marketHistoryLive: "实时 X Layer 市场 K 线历史",
      marketHistoryFallback: "当前未取到实时 X Layer K 线，回退为示例曲线",
      portfolioLive: "实时 runner 账户快照",
      portfolioFallback: "当前未配置独立 runtime 钱包，显示示例账户快照",
      positionsLive: "持仓来自独立运行时账户",
      positionsFallback: "当前持仓为示例数据，未连接独立运行时账户",
    },
    modes: {
      running: "运行中",
    },
    loading: "正在加载竞技场结果...",
  },
} as const;

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function signedDollar(value: number) {
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function compactUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 2 : 0,
  }).format(value);
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function priceLabel(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 1000 ? 2 : 4,
    maximumFractionDigits: value >= 1000 ? 2 : 4,
  })}`;
}

function formatChartDate(timestamp: string, locale: ArenaLocale) {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function buildChartLabels(
  history: Array<{ timestamp: string }>,
  locale: ArenaLocale,
) {
  if (history.length < 2) {
    return ["2026-01-14", "2026-01-25", "2026-02-06", "2026-02-17", "2026-03-01"];
  }

  const indexes = Array.from({ length: 5 }, (_, index) =>
    Math.min(history.length - 1, Math.round((index / 4) * (history.length - 1))),
  );

  return indexes.map((index) => formatChartDate(history[index].timestamp, locale));
}

function timeframeWindowMs(timeframe: "1H" | "4H" | "1D") {
  if (timeframe === "1H") return 60 * 60 * 1000;
  if (timeframe === "4H") return 4 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function filterHistoryWindow<T extends { timestamp: string }>(
  entries: T[],
  timeframe: "1H" | "4H" | "1D",
) {
  if (entries.length < 2) {
    return entries;
  }

  const cutoff = Date.now() - timeframeWindowMs(timeframe);
  const filtered = entries.filter((entry) => new Date(entry.timestamp).getTime() >= cutoff);
  return filtered.length >= 2 ? filtered : entries;
}

function formatDateTime(timestamp: string, locale: ArenaLocale) {
  return new Date(timestamp).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

function truncateMiddle(value: string, head = 8, tail = 6) {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function runtimeEventLabel(event: ArenaRunnerEvent, locale: ArenaLocale) {
  if (event.type === "submission") {
    return locale === "zh" ? "提交" : "Submission";
  }
  if (event.type === "tick") {
    return locale === "zh" ? "轮询" : "Tick";
  }
  if (event.type === "fill") {
    return locale === "zh" ? "成交" : "Fill";
  }
  if (event.type === "error") {
    return locale === "zh" ? "错误" : "Error";
  }
  return locale === "zh" ? "订单" : "Order";
}

function runtimeEventSummary(event: ArenaRunnerEvent) {
  return event.note;
}

function summarizeOperationalNote(note: string | null | undefined, locale: ArenaLocale) {
  if (!note) {
    return locale === "zh" ? "暂无可展示的运行说明。" : "No operational note yet.";
  }

  if (note.includes("Market sync failed") || note.includes("Market fallback active")) {
    return locale === "zh"
      ? "市场同步失败，runner 已回退到最近一次有效快照并继续运行。"
      : "Market sync failed. The runner fell back to the latest valid snapshot and kept running.";
  }

  if (note.includes("Parameter clOrdId error")) {
    return locale === "zh"
      ? "本次委托被拒绝，原因是 clOrdId 参数无效。runner 会在下一轮继续处理。"
      : "The routed order was rejected because the clOrdId parameter was invalid. The runner will continue on the next cycle.";
  }

  const cleaned = note
    .replace(/Traceback[\s\S]*/i, "")
    .replace(/Command failed:[\s\S]*/i, "")
    .replace(/; fetch fallback:.*$/i, "")
    .trim();

  if (cleaned.length <= 180) {
    return cleaned;
  }

  return `${cleaned.slice(0, 177)}...`;
}

function statusLabel(agent: ArenaAgent, locale: ArenaLocale) {
  if (locale !== "zh") {
    return agent.status;
  }
  if (agent.status === "Running") return "运行中";
  if (agent.status === "Runner error") return "运行异常";
  if (agent.status === "Stopped") return "已停止";
  if (agent.status === "Submitted") return "已提交";
  return agent.status;
}

function badgeClass(tone: "danger" | "success" | "neutral" | "accent") {
  if (tone === "danger") return "bg-[#fff0f0] text-[#cf4a4a]";
  if (tone === "success") return "bg-[#eff8f1] text-[#1a8b55]";
  if (tone === "accent") return "bg-[#eef1ff] text-[#4156e5]";
  return "bg-[#f3efe9] text-[#6f6a60]";
}

function Sparkline({
  points,
  stroke = "#1f7a52",
  fill = "rgba(255,138,87,0.18)",
  height = 220,
}: {
  points: number[];
  stroke?: string;
  fill?: string;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-[20px] border border-dashed border-[#e5ddd1] text-sm text-[#8a8074]">
        Waiting for runner data
      </div>
    );
  }

  const width = 900;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);

  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point - min) / range) * (height - 24) - 12;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
      <path d={`${path} L ${width} ${height} L 0 ${height} Z`} fill={fill} />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LocaleSwitch({
  locale,
  onChange,
}: {
  locale: ArenaLocale;
  onChange: (value: ArenaLocale) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-[#e5ddd1] bg-white p-1 shadow-[0_10px_30px_rgba(20,27,45,0.04)]">
      {(["en", "zh"] as ArenaLocale[]).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium transition",
            locale === item ? "bg-[#1F2937] text-white" : "text-[#6B7280]",
          )}
        >
          {item === "en" ? "EN" : "中"}
        </button>
      ))}
    </div>
  );
}

export default function AgentArenaDetailPage() {
  const params = useParams();
  const rawAgentId = params?.agentId;
  const agentId =
    typeof rawAgentId === "string"
      ? rawAgentId
      : Array.isArray(rawAgentId)
        ? rawAgentId[0]
        : undefined;

  const [agent, setAgent] = useState<ArenaAgent | null>(null);
  const [history, setHistory] = useState<ArenaMarketHistoryPoint[]>([]);
  const [performanceHistory, setPerformanceHistory] = useState<ArenaRunnerPerformancePoint[]>([]);
  const [execution, setExecution] = useState<ArenaExecutionEvidence | null>(null);
  const [integration, setIntegration] = useState<ArenaIntegrationState | null>(null);
  const [runtime, setRuntime] = useState<ArenaRunnerRuntime | null>(null);
  const [submission, setSubmission] = useState<ArenaSubmissionInput | null>(null);
  const [copyTrade, setCopyTrade] = useState<ArenaCopyTradeSummary | null>(null);
  const [copyProfiles, setCopyProfiles] = useState<ArenaCopyProfileView[]>([]);
  const [locale, setLocale] = useState<ArenaLocale>("en");
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowPending, setIsFollowPending] = useState(false);
  const [isCopyPending, setIsCopyPending] = useState(false);
  const [copyAlias, setCopyAlias] = useState("Shadow account");
  const [copyBudget, setCopyBudget] = useState("1000");
  const [copyMode, setCopyMode] = useState<"local-ledger" | "okx-demo-account">("local-ledger");
  const [copyProfileId, setCopyProfileId] = useState("");
  const [timeframe, setTimeframe] = useState<"1H" | "4H" | "1D">("1H");
  const t = copy[locale];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(AGENT_ARENA_LOCALE_KEY);
    if (stored === "en" || stored === "zh") {
      setLocale(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AGENT_ARENA_LOCALE_KEY, locale);
  }, [locale]);

  async function loadAgent(targetAgentId: string, showLoader = true) {
    if (showLoader) {
      setIsLoading(true);
    }

    try {
      const response = await fetch(`/api/fight-club/${targetAgentId}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.agent) {
        throw new Error(payload?.error || "Failed to load arena agent.");
      }

      setAgent(payload.agent);
      setHistory(payload.history ?? []);
      setPerformanceHistory(payload.performanceHistory ?? []);
      setExecution(payload.execution ?? null);
      setIntegration(payload.integration ?? null);
      setRuntime(payload.runtime ?? null);
      setSubmission(payload.submission ?? null);
      setCopyTrade(payload.copyTrade ?? null);
      setCopyProfiles(payload.copyProfiles ?? []);
    } catch (error) {
      console.error("Failed to load arena agent", error);
      setAgent(null);
      setHistory([]);
      setPerformanceHistory([]);
      setExecution(null);
      setIntegration(null);
      setRuntime(null);
      setSubmission(null);
      setCopyTrade(null);
      setCopyProfiles([]);
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!agentId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/fight-club/${agentId}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);

        if (cancelled) return;

        if (!response.ok || !payload?.agent) {
          throw new Error(payload?.error || "Failed to load arena agent.");
        }

        setAgent(payload.agent);
        setHistory(payload.history ?? []);
        setPerformanceHistory(payload.performanceHistory ?? []);
        setExecution(payload.execution ?? null);
        setIntegration(payload.integration ?? null);
        setRuntime(payload.runtime ?? null);
        setSubmission(payload.submission ?? null);
        setCopyTrade(payload.copyTrade ?? null);
        setCopyProfiles(payload.copyProfiles ?? []);
      } catch (error) {
        console.error("Failed to load arena agent", error);
        if (!cancelled) {
          setAgent(null);
          setHistory([]);
          setPerformanceHistory([]);
          setExecution(null);
          setIntegration(null);
          setRuntime(null);
          setSubmission(null);
          setCopyTrade(null);
          setCopyProfiles([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (!agentId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadAgent(agentId, false);
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [agentId]);

  async function toggleFollow() {
    if (!agentId || !agent) return;
    try {
      setIsFollowPending(true);
      const response = await fetch(`/api/fight-club/${agentId}/follow`, {
        method: agent.following ? "DELETE" : "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to update follow state.");
      }
      await loadAgent(agentId, false);
    } catch (error) {
      console.error("Failed to toggle follow state", error);
    } finally {
      setIsFollowPending(false);
    }
  }

  async function startDemoCopyTrade() {
    if (!agentId || !agent?.localOnly) return;

    try {
      setIsCopyPending(true);
      const response = await fetch(`/api/fight-club/${agentId}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alias: copyAlias.trim() || "Demo follower",
          initialCapitalUsd: Number(copyBudget),
          mode: copyMode,
          profileId: copyMode === "okx-demo-account" ? copyProfileId : undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to start demo copy trade.");
      }
      setCopyProfiles(payload.profiles ?? []);
      await loadAgent(agentId, false);
    } catch (error) {
      console.error("Failed to start demo copy trade", error);
    } finally {
      setIsCopyPending(false);
    }
  }

  async function stopDemoCopyTrade(followerId: string) {
    if (!agentId) return;

    try {
      setIsCopyPending(true);
      const response = await fetch(`/api/fight-club/${agentId}/copy?followerId=${encodeURIComponent(followerId)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to stop demo copy trade.");
      }
      setCopyProfiles(payload.profiles ?? []);
      await loadAgent(agentId, false);
    } catch (error) {
      console.error("Failed to stop demo copy trade", error);
    } finally {
      setIsCopyPending(false);
    }
  }

  const visiblePerformanceHistory = useMemo(
    () => filterHistoryWindow(performanceHistory, timeframe),
    [performanceHistory, timeframe],
  );

  const visibleRuntimeSnapshots = useMemo(
    () => filterHistoryWindow(runtime?.snapshots ?? [], timeframe),
    [runtime, timeframe],
  );

  const visibleMarketHistory = useMemo(
    () => filterHistoryWindow(history, timeframe),
    [history, timeframe],
  );
  const hasRuntimeLedger = Boolean(
    runtime &&
      (runtime.tickCount > 0 ||
        runtime.snapshots.length > 0 ||
        runtime.totalOrders > 0 ||
        runtime.totalFills > 0),
  );

  const chartPoints = useMemo(() => {
    if (!agent) return [];
    if (hasRuntimeLedger && visiblePerformanceHistory.length > 1) {
      return visiblePerformanceHistory.map((point) => point.pnl);
    }
    if (hasRuntimeLedger) {
      return visibleRuntimeSnapshots.map((snapshot) => snapshot.totalPnlUsd);
    }
    return visibleMarketHistory.length > 3
      ? visibleMarketHistory.map((point) => point.close)
      : agent.curve;
  }, [agent, hasRuntimeLedger, visibleMarketHistory, visiblePerformanceHistory, visibleRuntimeSnapshots]);

  const miniChartPoints = useMemo(() => {
    if (!chartPoints.length) return [];
    return chartPoints.slice(Math.max(0, chartPoints.length - 16));
  }, [chartPoints]);

  const chartTimeline =
    hasRuntimeLedger && visiblePerformanceHistory.length > 1
      ? visiblePerformanceHistory
      : hasRuntimeLedger
        ? visibleRuntimeSnapshots
        : visibleMarketHistory;
  const chartLabels = useMemo(() => buildChartLabels(chartTimeline, locale), [chartTimeline, locale]);

  const chartSourceLabel =
    hasRuntimeLedger && visiblePerformanceHistory.length > 1
      ? locale === "zh"
        ? `Runner 持续写入的真实收益曲线 · ${timeframe}`
        : `Real performance curve from persisted runner snapshots · ${timeframe}`
      : hasRuntimeLedger
        ? locale === "zh"
          ? `等待 runner 写入首批真实快照 · ${timeframe}`
          : `Waiting for the first persisted runner snapshots · ${timeframe}`
      : visibleMarketHistory.length > 3
        ? t.sources.marketHistoryLive
        : t.sources.marketHistoryFallback;
  const portfolioSourceLabel =
    hasRuntimeLedger && runtime
      ? locale === "zh"
        ? "Runner 持续汇总的真实运行账户结果"
        : "Real runtime account results aggregated by the runner"
      : !agent?.localOnly
        ? locale === "zh"
          ? "官方策略档案快照，不绑定独立运行时钱包"
          : "Official strategy profile snapshot without a dedicated runtime wallet"
      : agent?.portfolio.source === "okx-portfolio"
        ? t.sources.portfolioLive
        : t.sources.portfolioFallback;
  const positionsSourceLabel =
    hasRuntimeLedger && runtime
      ? locale === "zh"
        ? "Runner 持仓账本"
        : "Runner position ledger"
      : !agent?.localOnly
        ? locale === "zh"
          ? "当前持仓为官方策略示例，不是独立真实账户持仓"
          : "Current position is a strategy sample, not a dedicated real account position"
      : agent?.portfolio.source === "okx-portfolio"
        ? t.sources.positionsLive
        : t.sources.positionsFallback;

  const runnerLatestOrder = hasRuntimeLedger && runtime ? runtime.orders[0] ?? null : null;
  const runnerLatestFill = hasRuntimeLedger && runtime ? runtime.fills[0] ?? null : null;
  const agentSymbol = agent?.symbol ?? "";
  const latestOrder = runnerLatestOrder
    ? {
        orderId: runnerLatestOrder.orderId,
        size:
          runnerLatestOrder.side === "buy"
            ? compactUsd(runnerLatestOrder.requestedQuoteUsd)
            : runnerLatestOrder.requestedBaseSize?.toFixed(8) ?? "market",
        filledSize:
          runnerLatestFill && runnerLatestFill.orderId === runnerLatestOrder.orderId
            ? runnerLatestFill.baseSize.toFixed(8)
            : "n/a",
        price:
          runnerLatestFill && runnerLatestFill.orderId === runnerLatestOrder.orderId
            ? priceLabel(runnerLatestFill.fillPrice)
            : locale === "zh"
              ? "市价"
              : "Market",
        createdAt: runnerLatestOrder.createdAt,
      }
    : execution?.recentOrders?.[0] ?? null;
  const latestFill = runnerLatestFill
    ? {
        tradeId: runnerLatestFill.tradeId,
        fillPrice: priceLabel(runnerLatestFill.fillPrice),
        fillSize: runnerLatestFill.baseSize.toFixed(8),
        fee: signedDollar(-runnerLatestFill.feeUsd),
        timestamp: runnerLatestFill.timestamp,
      }
    : execution?.recentFills?.[0] ?? null;

  const recentOrders = hasRuntimeLedger && runtime
    ? runtime.orders.slice(0, 6).map((order) => {
        const matchingFill = runtime.fills.find((fill) => fill.orderId === order.orderId);
        return {
          orderId: order.orderId,
          symbol: agentSymbol,
          side: order.side,
          orderType: "market",
          state: order.state,
          price: matchingFill ? priceLabel(matchingFill.fillPrice) : locale === "zh" ? "市价" : "Market",
          size:
            order.side === "buy"
              ? compactUsd(order.requestedQuoteUsd)
              : order.requestedBaseSize?.toFixed(8) ?? "n/a",
          filledSize: matchingFill ? matchingFill.baseSize.toFixed(8) : "0",
          createdAt: order.createdAt,
        };
      })
    : execution?.recentOrders?.slice(0, 6) ?? [];

  const recentFills = hasRuntimeLedger && runtime
    ? runtime.fills.slice(0, 6).map((fill) => ({
        tradeId: fill.tradeId,
        symbol: agentSymbol,
        side: fill.side,
        fillPrice: priceLabel(fill.fillPrice),
        fillSize: fill.baseSize.toFixed(8),
        fee: signedDollar(-fill.feeUsd),
        timestamp: fill.timestamp,
      }))
    : execution?.recentFills?.slice(0, 6) ?? [];

  const executionNote =
    hasRuntimeLedger && runtime
      ? runtime.totalOrders > 0
          ? locale === "zh"
            ? "执行证据来自 runner 持续同步的真实订单与成交。"
            : "Execution evidence is coming from the runner-synced orders and fills."
          : locale === "zh"
            ? "runner 已注册，但当前还没有真实订单。"
            : "The runner is registered, but there are no real orders yet."
      : !agent?.localOnly
        ? locale === "zh"
          ? "这个官方代理当前没有独立运行时钱包或 runner。执行证据只对已提交并绑定自身运行时的代理显示。"
          : "This official agent does not have a dedicated runtime wallet or runner yet. Execution evidence is only shown for submitted agents with their own runtime."
      : execution?.note ??
        (locale === "zh"
          ? "当前还没有 execution evidence。"
          : "Execution evidence is not available yet.");
  const integrationSummaryNote =
    hasRuntimeLedger
      ? locale === "zh"
        ? "实时市场上下文、账户快照和 runner 证据正在同步到这个 Agent 详情页。"
        : "Live market context, account snapshots, and runner evidence are being synchronized into this agent detail page."
      : locale === "zh"
        ? "当前页只把实时 X Layer 市场数据接到官方策略档案上。账户快照、当前持仓和执行证据仅对已提交且拥有独立 runner 的代理显示真实数据。"
        : "This page only attaches live X Layer market data to the official strategy profile. Real account snapshots, positions, and execution evidence are only shown for submitted agents with their own runner.";
  const runtimeEvents = runtime?.events ?? [];
  const realityPanels = hasRuntimeLedger
    ? [
        {
          title: locale === "zh" ? "榜单层" : "Ranking layer",
          body:
            locale === "zh"
              ? "公开榜单和 scorecard 仍然用于模拟辅助排序，方便持续比较不同 Agent 的综合表现。"
              : "The public leaderboard and scorecards remain simulation-assisted so contestants can be compared continuously.",
        },
        {
          title: locale === "zh" ? "证据层" : "Proof layer",
          body:
            locale === "zh"
              ? "本页展示的订单、成交、账户快照和 runner 事件，来自这个 Agent 的真实运行时账本。"
              : "The orders, fills, account snapshots, and runner events on this page come from this agent's real runtime ledger.",
        },
      ]
    : [
        {
          title: locale === "zh" ? "榜单层" : "Ranking layer",
          body:
            locale === "zh"
              ? "这个页面仍然可以被公开比较，但排名层主要用于模拟辅助比较，而不是独立真实账户排名。"
              : "This page can still be compared publicly, but the ranking layer is used for simulation-assisted comparison rather than dedicated live account ranking.",
        },
        {
          title: locale === "zh" ? "证据层" : "Proof layer",
          body:
            locale === "zh"
              ? "当前没有独立 runner 账本，所以这里只展示 X Layer 市场上下文，不把样本档案伪装成真实私有账户。"
              : "There is no dedicated runner ledger yet, so this page only shows X Layer market context and does not present a sample profile as a real private account.",
        },
      ];

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(22,199,132,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,181,255,0.14),transparent_20%),linear-gradient(180deg,#03111d_0%,#071827_55%,#091421_100%)] px-8 pb-16 pt-10">
        <div className="mx-auto max-w-[1520px] text-[#d7e8f8]">{t.loading}</div>
      </main>
    );
  }

  if (!agent) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(22,199,132,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,181,255,0.14),transparent_20%),linear-gradient(180deg,#03111d_0%,#071827_55%,#091421_100%)] px-8 pb-16 pt-10">
        <div className="mx-auto max-w-[1520px]">
          <Link href="/fight-club" className="inline-flex items-center gap-2 text-[16px] text-[#c5ddf0]">
            <ArrowLeft className="h-4 w-4" />
            {t.back}
          </Link>
          <div className="mt-10 text-[52px] font-semibold tracking-[-0.07em] text-white">{t.missing}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(22,199,132,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,181,255,0.14),transparent_20%),linear-gradient(180deg,#03111d_0%,#071827_55%,#091421_100%)] text-[#1F2937]">
      <div className="mx-auto max-w-[1520px] px-8 pb-16 pt-6">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 shadow-[0_18px_40px_rgba(2,12,20,0.28)] backdrop-blur">
          <div className="flex items-center gap-5">
            <Link href="/fight-club" className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#16c784] text-white shadow-[0_12px_24px_rgba(22,199,132,0.22)]">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#8ccfff]">solana</div>
                <div className="text-[18px] font-semibold tracking-[-0.03em] text-white">Agent Fight Club</div>
              </div>
            </Link>
            <nav className="hidden items-center gap-2 md:flex">
              <Link
                href="/fight-club"
                className="inline-flex items-center rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-medium text-[#c6dff0] transition-colors duration-200 hover:border-[#84d8f8] hover:text-white"
              >
                {t.nav.board}
              </Link>
              <span className="inline-flex items-center rounded-full bg-[#16c784] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(22,199,132,0.22)]">
                {t.nav.results}
              </span>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-medium text-[#d8ebf9] md:inline-flex">
              <Sparkles className="h-4 w-4 text-[#35c8ff]" />
              {t.nav.status}
            </div>
            <LocaleSwitch locale={locale} onChange={setLocale} />
            <button className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white px-5 py-2.5 text-sm font-medium text-[#44627b]">
              <Globe className="h-4 w-4" />
              {agent.creator}
            </button>
          </div>
        </header>

        <Link href="/fight-club" className="inline-flex items-center gap-2 text-[16px] text-[#c5ddf0]">
          <ArrowLeft className="h-4 w-4" />
          {t.back}
        </Link>

        <section className="mt-8 flex flex-wrap items-center gap-8">
          <div className="flex h-28 w-28 items-center justify-center rounded-[32px] bg-[#1F2937] text-[48px] font-semibold text-white shadow-[0_24px_50px_rgba(29,39,66,0.18)]">
            {agent.shortName}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-end gap-4">
              <h1 className="text-[58px] font-semibold leading-none tracking-[-0.07em] text-white">
                {agent.name}
              </h1>
              <div className="pb-1 text-[18px] text-[#b8d6ea]">{agent.style}</div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-medium", badgeClass("success"))}>
                <Play className="h-4 w-4 fill-current" />
                {statusLabel(agent, locale)}
              </span>
              {agent.localOnly ? (
                <span className={cn("rounded-full px-4 py-2 text-[15px] font-medium", badgeClass("neutral"))}>
                  {locale === "zh" ? "用户提交" : "User submitted"}
                </span>
              ) : (
                <span className={cn("rounded-full px-4 py-2 text-[15px] font-medium", badgeClass("accent"))}>
                  {agent.status}
                </span>
              )}
              <span className={cn("rounded-full px-4 py-2 text-[15px] font-medium", badgeClass("neutral"))}>
                {agent.market.source === "okx-market"
                  ? locale === "zh"
                    ? "OnchainOS skill 已连接"
                    : "OnchainOS skill connected"
                  : locale === "zh"
                    ? "市场回退"
                    : "Market fallback"}
              </span>
              {integration?.portfolio ? (
                <span className={cn("rounded-full px-4 py-2 text-[15px] font-medium", badgeClass("neutral"))}>
                  {hasRuntimeLedger
                    ? integration.portfolio.status === "live"
                      ? locale === "zh"
                        ? "共享 Runner 已连接"
                        : "Shared runner connected"
                      : locale === "zh"
                        ? "Runner 等待快照"
                        : "Runner awaiting snapshots"
                    : locale === "zh"
                      ? "官方策略档案"
                      : "Official strategy profile"}
                </span>
              ) : null}
              <button
                type="button"
                onClick={toggleFollow}
                disabled={isFollowPending}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[15px] font-medium transition",
                  agent.following
                    ? "border-[#f0c991] bg-[#fff3df] text-[#c96d1f]"
                    : "border-[#e6ddd1] bg-white text-[#7b7280]",
                  isFollowPending && "cursor-wait opacity-70",
                )}
              >
                <Star className={cn("h-4 w-4", agent.following && "fill-current")} />
                <span>
                  {agent.following
                    ? locale === "zh"
                      ? "已关注"
                      : "Following"
                    : locale === "zh"
                      ? "关注"
                      : "Follow"}
                </span>
                <span className="text-xs opacity-80">{agent.followers}</span>
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {realityPanels.map((panel) => (
            <div
              key={panel.title}
              className="rounded-[24px] border border-[#e8e0d5] bg-white px-6 py-5 shadow-[0_18px_45px_rgba(23,29,45,0.04)]"
            >
              <div className="text-[12px] uppercase tracking-[0.18em] text-[#8c8377]">{panel.title}</div>
              <div className="mt-3 text-[16px] leading-7 text-[#5f5963]">{panel.body}</div>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-[34px] border border-[#e8e0d5] bg-white px-8 py-8 shadow-[0_24px_60px_rgba(23,29,45,0.05)]">
            <div className="text-[14px] uppercase tracking-[0.16em] text-[#8c8377]">
              {locale === "zh" ? "Agent 概览" : "Agent Overview"}
            </div>
            <div className="mt-3 max-w-[820px] text-[18px] leading-8 text-[#4a5565]">
              {submission?.strategyBrief ?? agent.description}
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              {(
                hasRuntimeLedger
                  ? [
                      [locale === "zh" ? "账户权益" : "Account value", compactUsd(agent.portfolio.equityUsd)],
                      [locale === "zh" ? "仓位价值" : "Position value", compactUsd(runtime?.positionValueUsd ?? 0)],
                      [locale === "zh" ? "ROI" : "ROI", pct(agent.roi)],
                      [locale === "zh" ? "已实现盈亏" : "Realized PnL", signedDollar(agent.portfolio.realizedPnlUsd)],
                      [locale === "zh" ? "最大收益" : "Max PnL", signedDollar(runtime?.maxPnlUsd ?? agent.pnl)],
                      [locale === "zh" ? "最大回撤" : "Max Drawdown", pct(-(runtime?.maxDrawdownPct ?? agent.portfolio.maxDrawdownPct))],
                    ]
                  : [
                      [locale === "zh" ? "交易对" : "Symbol", agent.symbol],
                      [locale === "zh" ? "创建者" : "Creator", agent.creator],
                      [locale === "zh" ? "运行方式" : "Runtime", locale === "zh" ? "官方策略样本" : "Official strategy sample"],
                      [locale === "zh" ? "数据源" : "Data source", agent.market.source],
                    ]
              ).map(([label, value]) => (
                <div key={`${label}-${value}`} className="rounded-[20px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-4">
                  <div className="text-sm text-[#9b9184]">{label}</div>
                  <div className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-[#171d2d]">
                    {value}
                  </div>
                </div>
              ))}
            </div>
            {integrationSummaryNote ? (
              <div className="mt-6 rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-4 text-sm leading-6 text-[#6d6670]">
                {integrationSummaryNote}
              </div>
            ) : null}
            <div className="mt-6 rounded-[26px] border border-[#efe7dc] bg-[#fbf8f4] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-[#3f4554]">
                  {hasRuntimeLedger
                    ? locale === "zh"
                      ? "收益走势预览"
                      : "Performance preview"
                    : locale === "zh"
                      ? "价格走势预览"
                      : "Price preview"}
                </div>
                <div className="rounded-full bg-[#f2ede5] px-3 py-1 text-xs font-medium text-[#7d7263]">
                  {chartSourceLabel}
                </div>
              </div>
              <div className="h-[210px] overflow-hidden">
                <Sparkline points={miniChartPoints} fill="rgba(65,86,229,0.08)" />
              </div>
            </div>
          </div>

          <div
            className="rounded-[34px] border border-[#eadac6] px-8 py-8"
            style={{
              background:
                "linear-gradient(145deg, rgba(255,247,237,1) 0%, rgba(254,240,228,1) 60%, rgba(245,238,255,0.78) 100%)",
            }}
          >
            <div className="inline-flex items-center gap-3 text-[18px] font-medium text-[#3c322f]">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/70">
                <Sparkles className="h-5 w-5 text-[#4156e5]" />
              </span>
              {locale === "zh" ? "实时状态" : "Live status"}
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                [locale === "zh" ? "运行状态" : "Runner status", hasRuntimeLedger ? (locale === "zh" ? "运行中" : "Active") : statusLabel(agent, locale)],
                [locale === "zh" ? "最近更新" : "Last update", hasRuntimeLedger && runtime ? formatDateTime(runtime.updatedAt, locale) : (locale === "zh" ? "暂无" : "n/a")],
                [locale === "zh" ? "交易对" : "Symbol", agent.symbol],
                [locale === "zh" ? "策略节奏" : "Timeframe", submission?.timeframe ?? "15m"],
              ].map(([label, value]) => (
                <div key={`${label}-${value}`} className="rounded-[18px] border border-white/70 bg-white/70 px-4 py-4">
                  <div className="text-sm text-[#8f8272]">{label}</div>
                  <div className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-[#2f3038]">{value}</div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[16px] leading-7 text-[#5f5963]">
              {submission?.strategyBrief ?? agent.persona}
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-[34px] border border-[#e8e0d5] bg-white px-8 py-8 shadow-[0_24px_60px_rgba(23,29,45,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[14px] uppercase tracking-[0.16em] text-[#8c8377]">
                {hasRuntimeLedger
                  ? locale === "zh"
                    ? "真实收益曲线"
                    : "Real Performance Curve"
                  : t.symbolView}
              </div>
              <h2 className="mt-2 text-[40px] font-semibold tracking-[-0.06em] text-[#1F2937]">
                {hasRuntimeLedger
                  ? locale === "zh"
                    ? `${agent.symbol} Live Runner`
                    : `${agent.symbol} Live Runner`
                  : agent.symbol}
              </h2>
            </div>
            <div className="inline-flex gap-3">
              {(["1H", "4H", "1D"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTimeframe(item)}
                  className={cn(
                    "rounded-full px-5 py-2.5 text-sm font-medium transition",
                    timeframe === item ? "bg-[#1F2937] text-white" : "bg-[#f5f0e8] text-[#7b7368]",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 rounded-[26px] border border-[#efe7dc] bg-[#faf8f4] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-medium text-[#3f4554]">{t.labels.chartSource}</div>
              <div className="rounded-full bg-[#f2ede5] px-3 py-1 text-xs font-medium text-[#7d7263]">
                {chartSourceLabel}
              </div>
            </div>
            <div className="h-[360px] overflow-hidden">
              <Sparkline points={chartPoints} height={360} fill="rgba(255,138,87,0.16)" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between px-2 text-[14px] text-[#9f9588]">
            {chartLabels.map((label, index) => (
              <div key={`${label}-${index}`}>{label}</div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-[28px] border border-[#e8e0d5] bg-white px-7 py-7 shadow-[0_20px_50px_rgba(23,29,45,0.04)]">
              <div className="inline-flex items-center gap-3 text-[18px] font-medium text-[#1F2937]">
                <CircleDollarSign className="h-5 w-5 text-[#4156e5]" />
                {t.cards.portfolio}
              </div>
              <div className="mt-6 space-y-4 text-[17px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#9b9184]">{t.labels.equity}</span>
                  <span className="font-medium">{compactUsd(agent.portfolio.equityUsd)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9b9184]">{t.labels.available}</span>
                  <span className="font-medium">{compactUsd(agent.portfolio.availableBalanceUsd)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9b9184]">{t.labels.upl}</span>
                  <span className={cn("font-medium", agent.portfolio.unrealizedPnlUsd >= 0 ? "text-[#1d9d62]" : "text-[#cf4a4a]")}>
                    {signedDollar(agent.portfolio.unrealizedPnlUsd)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9b9184]">{locale === "zh" ? "活跃挂单" : "Active orders"}</span>
                  <span className="font-medium">{agent.portfolio.activeOrders}</span>
                </div>
              </div>
              <div className="mt-5 rounded-[18px] bg-[#f7f3ec] px-4 py-3 text-sm leading-6 text-[#7b7368]">
                {portfolioSourceLabel}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#e8e0d5] bg-white px-7 py-7 shadow-[0_20px_50px_rgba(23,29,45,0.04)]">
              <div className="inline-flex items-center gap-3 text-[18px] font-medium text-[#1F2937]">
                <CandlestickChart className="h-5 w-5 text-[#ff8a57]" />
                {t.cards.market}
              </div>
              <div className="mt-6 space-y-4 text-[17px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#9b9184]">{t.labels.lastPrice}</span>
                  <span className="font-medium">{priceLabel(agent.market.lastPrice)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9b9184]">{t.labels.move24h}</span>
                  <span className={cn("font-medium", agent.market.change24hPct >= 0 ? "text-[#1d9d62]" : "text-[#cf4a4a]")}>
                    {pct(agent.market.change24hPct)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9b9184]">{t.labels.volume}</span>
                  <span className="font-medium">{compactUsd(agent.market.volume24hUsd)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9b9184]">{locale === "zh" ? "点差" : "Spread"}</span>
                  <span className="font-medium">{agent.market.spreadBps.toFixed(2)} bps</span>
                </div>
              </div>
            </div>

            <div
              className="rounded-[28px] border border-[#e8d8ca] px-7 py-7 shadow-[0_20px_50px_rgba(23,29,45,0.04)] md:col-span-2"
              style={{ background: "linear-gradient(145deg, #fff8ef 0%, #fff4e8 55%, #fff9f4 100%)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-3 text-[18px] font-medium text-[#1F2937]">
                  <Sparkles className="h-5 w-5 text-[#4156e5]" />
                  {t.persona}
                </div>
                <div className="rounded-full bg-white/75 px-4 py-2 text-sm font-medium text-[#6d6670]">
                  {locale === "zh" ? "提交内容" : "Submitted profile"}
                </div>
              </div>
              <div className="mt-5 text-[18px] leading-8 text-[#2f3038]">
                {submission?.persona || agent.persona}
              </div>
              <div className="mt-5 text-sm leading-6 text-[#6d6670]">
                {locale === "zh"
                  ? "这块只显示用户提交内容和实时接入状态，不再展示模拟委员会、评分卡或其他流程门槛。"
                  : "This panel only shows submitted content and live integration state. Simulated committees, scorecards, and other gatekeeping flows have been removed from the detail page."}
              </div>
            </div>
          </div>

          {hasRuntimeLedger ? (
            <div className="rounded-[34px] border border-[#e8e0d5] bg-white px-8 py-8 shadow-[0_24px_60px_rgba(23,29,45,0.05)]">
              <div className="flex items-center justify-between gap-4">
                <div className="text-[26px] font-semibold tracking-[-0.04em] text-[#1F2937]">{t.positions}</div>
                <div className="rounded-full bg-[#f2ede5] px-3 py-1 text-xs font-medium text-[#7d7263]">
                  {positionsSourceLabel}
                </div>
              </div>
              <div className="mt-8 overflow-hidden rounded-[24px] border border-[#f0e8de]">
                <div className="grid grid-cols-6 gap-4 bg-[#f7f3ec] px-8 py-5 text-[16px] text-[#958b7f]">
                  <div>{t.labels.symbol}</div>
                  <div>{t.labels.side}</div>
                  <div>{t.labels.positionSize}</div>
                  <div>{t.labels.liqPrice}</div>
                  <div>{t.labels.entryPrice}</div>
                  <div className="text-right">{t.labels.pnl}</div>
                </div>
                {agent.positions.length ? (
                  agent.positions.map((position) => (
                    <div
                      key={`${agent.id}-${position.symbol}`}
                      className="grid grid-cols-6 gap-4 border-t border-[#f0e8de] px-8 py-8 text-[20px] tracking-[-0.03em] text-[#171d2d]"
                    >
                      <div className="font-medium text-[#1F2937]">{position.symbol}</div>
                      <div className={position.side === "LONG" ? "font-medium text-[#1d9d62]" : "font-medium text-[#cf4a4a]"}>
                        {position.side}
                      </div>
                      <div>{position.size}</div>
                      <div className="text-[#cf4a4a]">{position.liqPrice ?? "n/a"}</div>
                      <div>{position.entry}</div>
                      <div className={cn("text-right font-medium", position.pnl.startsWith("-") ? "text-[#cf4a4a]" : "text-[#1d9d62]")}>
                        {position.pnl}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-8 py-10 text-center text-[#6B7280]">{t.noPositions}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-[34px] border border-[#e8e0d5] bg-white px-8 py-8 shadow-[0_24px_60px_rgba(23,29,45,0.05)]">
              <div className="text-[26px] font-semibold tracking-[-0.04em] text-[#1F2937]">
                {locale === "zh" ? "真实性说明" : "Reality check"}
              </div>
              <div className="mt-6 rounded-[24px] border border-[#efe7dc] bg-[#fcfaf7] px-6 py-6 text-[16px] leading-8 text-[#5f5963]">
                {locale === "zh"
                  ? "这个官方代理当前只展示两类真实信息：X Layer 市场数据和实时 K 线。账户权益、当前持仓、执行订单、成交记录都不再展示，避免把官方策略样本误读成独立真实运行账户。"
                  : "This official agent currently shows only two real data sources: X Layer market data and live price history. Account equity, positions, orders, and fills are hidden to avoid presenting a strategy sample as a dedicated live account."}
              </div>
            </div>
          )}
        </section>

        {agent.localOnly && submission && runtime ? (
          <section className="mt-8">
            <details className="rounded-[34px] border border-[#e8e0d5] bg-white px-8 py-7 shadow-[0_24px_60px_rgba(23,29,45,0.05)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <div>
                <div className="text-[14px] uppercase tracking-[0.16em] text-[#8c8377]">
                    {locale === "zh" ? "生命周期层" : "Lifecycle layer"}
                  </div>
                  <div className="mt-2 text-[26px] font-semibold tracking-[-0.05em] text-[#1F2937]">
                    {locale === "zh" ? "提交配置、运行状态和跟单" : "Submission, runtime, and copy trade"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="rounded-full bg-[#f3efe9] px-3 py-1 text-xs font-medium text-[#6f6a60]">
                    {locale === "zh" ? `轮询 ${runtime.tickCount}` : `Ticks ${runtime.tickCount}`}
                  </span>
                  <span className="rounded-full bg-[#f3efe9] px-3 py-1 text-xs font-medium text-[#6f6a60]">
                    {locale === "zh" ? `订单 ${runtime.totalOrders}` : `Orders ${runtime.totalOrders}`}
                  </span>
                  <span className="rounded-full bg-[#f3efe9] px-3 py-1 text-xs font-medium text-[#6f6a60]">
                    {locale === "zh"
                      ? `跟单 ${copyTrade?.activeFollowers ?? 0}`
                      : `Followers ${copyTrade?.activeFollowers ?? 0}`}
                  </span>
                </div>
              </summary>

              <div className="mt-6 grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
                <div className="space-y-5">
                  <div className="rounded-[24px] border border-[#efe7dc] bg-[#fcfaf7] p-5">
                    <div className="text-sm text-[#9b9184]">
                      {locale === "zh" ? "生命周期配置" : "Lifecycle config"}
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {[
                        ["Fight code", submission.pairCode],
                        [locale === "zh" ? "周期" : "Timeframe", submission.timeframe],
                        [locale === "zh" ? "方向" : "Direction", submission.direction],
                        [locale === "zh" ? "杠杆偏好" : "Leverage", submission.leveragePreference],
                      ].map(([label, value]) => (
                        <div key={`${label}-${value}`} className="rounded-[16px] border border-[#efe7dc] bg-white px-4 py-4">
                          <div className="text-xs text-[#9b9184]">{label}</div>
                          <div className="mt-2 text-[16px] font-semibold text-[#171d2d]">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 text-sm leading-6 text-[#5f5963]">
                      {submission.persona || submission.strategyBrief}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[#efe7dc] bg-[#fcfaf7] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-[#9b9184]">
                        {locale === "zh" ? "影子跟单账户" : "Shadow accounts"}
                      </div>
                      <div className="text-xs text-[#8a8074]">
                        {copyTrade?.activeFollowers ?? 0} {locale === "zh" ? "个活跃跟单" : "active"}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px_160px_auto]">
                      <input
                        value={copyAlias}
                        onChange={(event) => setCopyAlias(event.target.value)}
                        className="rounded-[14px] border border-[#e5ddd1] bg-white px-4 py-3 text-[14px] text-[#1F2937] outline-none focus:border-[#cdbb9c]"
                        placeholder={locale === "zh" ? "账户名称" : "Account name"}
                      />
                      <input
                        value={copyBudget}
                        onChange={(event) => setCopyBudget(event.target.value)}
                        className="rounded-[14px] border border-[#e5ddd1] bg-white px-4 py-3 text-[14px] text-[#1F2937] outline-none focus:border-[#cdbb9c]"
                        inputMode="decimal"
                        placeholder={locale === "zh" ? "已分配资金" : "Allocated capital"}
                      />
                      <select
                        value={copyMode}
                        onChange={(event) => {
                          const nextMode = event.target.value as "local-ledger" | "okx-demo-account";
                          setCopyMode(nextMode);
                          if (nextMode === "local-ledger") {
                            setCopyProfileId("");
                          } else if (!copyProfileId && copyProfiles[0]) {
                            setCopyProfileId(copyProfiles[0].id);
                          }
                        }}
                        className="rounded-[14px] border border-[#e5ddd1] bg-white px-4 py-3 text-[14px] text-[#1F2937] outline-none focus:border-[#cdbb9c]"
                      >
                        <option value="local-ledger">
                          {locale === "zh" ? "平台模拟" : "Platform simulation"}
                        </option>
                        {copyProfiles.length ? (
                          <option value="okx-demo-account">
                            {locale === "zh" ? "独立 OnchainOS 账户" : "Dedicated OnchainOS account"}
                          </option>
                        ) : null}
                      </select>
                      <button
                        type="button"
                        onClick={startDemoCopyTrade}
                        disabled={isCopyPending || (copyMode === "okx-demo-account" && !copyProfileId)}
                        className={cn(
                          "inline-flex items-center justify-center rounded-full bg-[#ff7a45] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#f16831]",
                          (isCopyPending || (copyMode === "okx-demo-account" && !copyProfileId)) && "cursor-wait opacity-70",
                        )}
                      >
                        {locale === "zh" ? "开始跟单" : "Start"}
                      </button>
                    </div>
                    {copyMode === "okx-demo-account" ? (
                      <select
                        value={copyProfileId}
                        onChange={(event) => setCopyProfileId(event.target.value)}
                        className="mt-3 w-full rounded-[14px] border border-[#e5ddd1] bg-white px-4 py-3 text-[14px] text-[#1F2937] outline-none focus:border-[#cdbb9c]"
                      >
                        <option value="">
                          {locale === "zh" ? "选择一个 OnchainOS follower" : "Select a OnchainOS follower"}
                        </option>
                        {copyProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <div className="mt-4 space-y-2">
                      {copyTrade?.followers.filter((follower) => follower.status === "active").length ? (
                        copyTrade.followers
                          .filter((follower) => follower.status === "active")
                          .slice(0, 4)
                          .map((follower) => (
                          <div key={follower.id} className="flex items-center justify-between rounded-[16px] border border-[#efe7dc] bg-white px-4 py-3 text-sm">
                            <div>
                              <div className="font-medium text-[#171d2d]">{follower.alias}</div>
                              <div className="mt-1 text-xs text-[#8a8074]">
                                {locale === "zh" ? "已分配资金" : "Allocated"} {compactUsd(follower.initialCapitalUsd)} · {follower.mode === "okx-demo-account" ? follower.profileLabel || "OnchainOS" : locale === "zh" ? "平台模拟" : "Platform simulation"}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className={cn("text-sm", follower.totalPnlUsd >= 0 ? "text-[#1d9d62]" : "text-[#cf4a4a]")}>
                                {locale === "zh" ? "累计收益率 " : "ROI "}{pct(follower.roiPct)}
                              </div>
                              <button
                                type="button"
                                onClick={() => stopDemoCopyTrade(follower.id)}
                                disabled={isCopyPending}
                                className={cn(
                                  "rounded-full border border-[#e6ddd1] bg-white px-3 py-1.5 text-xs font-medium text-[#6f6559]",
                                  isCopyPending && "cursor-wait opacity-70",
                                )}
                              >
                                {locale === "zh" ? "停止" : "Stop"}
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[16px] border border-[#efe7dc] bg-white px-4 py-4 text-sm text-[#81786d]">
                          {locale === "zh" ? "当前没有活跃的影子跟单账户。" : "No active shadow accounts yet."}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#efe7dc] bg-[#fcfaf7] p-5">
                  <div className="text-sm text-[#9b9184]">
                    {locale === "zh" ? "运行记录" : "Runtime log"}
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-4">
                    {[
                      [locale === "zh" ? "轮询" : "Ticks", runtime.tickCount],
                      [locale === "zh" ? "订单" : "Orders", runtime.totalOrders],
                      [locale === "zh" ? "成交" : "Fills", runtime.totalFills],
                      [locale === "zh" ? "更新" : "Updated", formatDateTime(runtime.updatedAt, locale)],
                    ].map(([label, value]) => (
                      <div key={`${label}-${value}`} className="rounded-[16px] border border-[#efe7dc] bg-white px-4 py-4">
                        <div className="text-xs text-[#9b9184]">{label}</div>
                        <div className="mt-2 text-[16px] font-semibold text-[#171d2d]">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-3">
                    {runtimeEvents.length ? (
                      runtimeEvents.slice(0, 4).map((event) => (
                        <div key={event.id} className="rounded-[16px] border border-[#efe7dc] bg-white px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[14px] font-semibold text-[#171d2d]">{event.title}</div>
                            <span className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium",
                              event.status === "success"
                                ? badgeClass("success")
                                : event.status === "failed"
                                  ? badgeClass("danger")
                                  : badgeClass("neutral"),
                            )}>
                              {runtimeEventLabel(event, locale)}
                            </span>
                          </div>
                          <div className="mt-2 text-sm leading-6 text-[#5f5963]">
                            {summarizeOperationalNote(runtimeEventSummary(event), locale)}
                          </div>
                          <div className="mt-2 text-xs text-[#8a8074]">
                            {formatDateTime(event.timestamp, locale)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[16px] border border-[#efe7dc] bg-white px-4 py-4 text-sm text-[#81786d]">
                        {locale === "zh" ? "当前还没有运行记录。" : "No runtime events yet."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </details>
          </section>
        ) : null}

        {hasRuntimeLedger ? (
        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <div className="rounded-[34px] border border-[#e8e0d5] bg-white px-8 py-8 shadow-[0_24px_60px_rgba(23,29,45,0.05)] xl:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div className="inline-flex items-center gap-3 text-[20px] font-semibold tracking-[-0.04em] text-[#1F2937]">
                <FileCheck2 className="h-5 w-5 text-[#ff8a57]" />
                {t.cards.execution}
              </div>
              <div className={cn("rounded-full px-3 py-1 text-xs font-medium", hasRuntimeLedger ? badgeClass("success") : execution?.source === "okx-trade" ? badgeClass("success") : badgeClass("neutral"))}>
                {hasRuntimeLedger
                  ? locale === "zh"
                    ? "共享 runner 账本"
                    : "Shared runner ledger"
                  : execution?.source === "okx-trade"
                  ? locale === "zh"
                    ? "OnchainOS proof"
                    : "OnchainOS proof"
                  : locale === "zh"
                    ? "Evidence fallback"
                    : "Evidence fallback"}
              </div>
            </div>
            <div className="mt-4 text-sm leading-6 text-[#6B7280]">
              {executionNote}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5 xl:col-span-2">
                <div className="text-sm text-[#9b9184]">
                  {locale === "zh" ? "最新订单号" : "Latest order id"}
                </div>
                <div className="mt-3 text-[24px] font-semibold tracking-[-0.05em] text-[#171d2d]">
                  {latestOrder ? truncateMiddle(latestOrder.orderId, 10, 8) : "n/a"}
                </div>
                <div className="mt-3 text-xs text-[#8a8074]">
                  {latestOrder?.orderId ?? (locale === "zh" ? "暂无真实订单" : "No real order yet")}
                </div>
              </div>
              <div className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                <div className="text-sm text-[#9b9184]">
                  {locale === "zh" ? "提交金额" : "Submitted amount"}
                </div>
                <div className="mt-3 text-[24px] font-semibold tracking-[-0.05em] text-[#171d2d]">
                  {latestOrder?.size ?? "n/a"}
                </div>
              </div>
              <div className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                <div className="text-sm text-[#9b9184]">
                  {locale === "zh" ? "成交金额" : "Filled amount"}
                </div>
                <div className="mt-3 text-[24px] font-semibold tracking-[-0.05em] text-[#171d2d]">
                  {latestOrder?.filledSize ?? latestFill?.fillSize ?? "n/a"}
                </div>
              </div>
              <div className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                <div className="text-sm text-[#9b9184]">
                  {locale === "zh" ? "成交价格" : "Fill price"}
                </div>
                <div className="mt-3 text-[24px] font-semibold tracking-[-0.05em] text-[#171d2d]">
                  {latestFill?.fillPrice ?? latestOrder?.price ?? "n/a"}
                </div>
              </div>
              <div className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                <div className="text-sm text-[#9b9184]">
                  {locale === "zh" ? "执行时间" : "Executed at"}
                </div>
                <div className="mt-3 text-[18px] font-semibold tracking-[-0.04em] text-[#171d2d]">
                  {latestFill
                    ? formatDateTime(latestFill.timestamp, locale)
                    : latestOrder
                      ? formatDateTime(latestOrder.createdAt, locale)
                      : "n/a"}
                </div>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-[18px] bg-[#f7f3ec] px-4 py-4">
                <div className="text-sm text-[#9b9184]">
                  {locale === "zh" ? "执行来源" : "Execution source"}
                </div>
                <div className="mt-2 text-[18px] font-semibold tracking-[-0.04em] text-[#171d2d]">
                  {hasRuntimeLedger && runtime
                    ? locale === "zh"
                      ? "共享 X Layer runner 账本"
                      : "Shared X Layer runner ledger"
                    : execution?.source === "okx-trade"
                      ? "OnchainOS route"
                      : "fallback"}
                </div>
              </div>
              <div className="rounded-[18px] bg-[#f7f3ec] px-4 py-4">
                <div className="text-sm text-[#9b9184]">
                  {locale === "zh" ? "交易环境" : "Trading environment"}
                </div>
                <div className="mt-2 text-[18px] font-semibold tracking-[-0.04em] text-[#171d2d]">
                  {hasRuntimeLedger && runtime
                    ? locale === "zh"
                      ? "模拟交易"
                      : "Simulated trading"
                    : execution?.demoMode
                    ? locale === "zh"
                      ? "模拟交易"
                      : "Simulated trading"
                    : locale === "zh"
                      ? "只读"
                      : "Read only"}
                </div>
              </div>
              <div className="rounded-[18px] bg-[#f7f3ec] px-4 py-4">
                <div className="text-sm text-[#9b9184]">
                  {locale === "zh" ? "活跃挂单数" : "Active orders"}
                </div>
                <div className="mt-2 text-[18px] font-semibold tracking-[-0.04em] text-[#171d2d]">
                  {hasRuntimeLedger && runtime ? runtime.activeOrderIds.length : execution?.activeOrders ?? 0}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[34px] border border-[#e8e0d5] bg-white px-8 py-8 shadow-[0_24px_60px_rgba(23,29,45,0.05)]">
            <div className="flex items-center justify-between gap-4">
              <div className="inline-flex items-center gap-3 text-[20px] font-semibold tracking-[-0.04em] text-[#1F2937]">
                <Clock3 className="h-5 w-5 text-[#4156e5]" />
                {t.cards.recentOrders}
              </div>
              <div className="rounded-full bg-[#f2ede5] px-3 py-1 text-xs font-medium text-[#7d7263]">
                {execution?.source === "okx-trade"
                  ? locale === "zh"
                    ? "OnchainOS 订单流"
                    : "OnchainOS order flow"
                  : locale === "zh"
                    ? "Fallback"
                    : "Fallback"}
              </div>
            </div>
            <div className="mt-4 text-sm leading-6 text-[#6B7280]">
              {executionNote}
            </div>
            <div className="mt-6 overflow-hidden rounded-[24px] border border-[#f0e8de]">
              <div className="grid grid-cols-6 gap-4 bg-[#f7f3ec] px-6 py-4 text-sm text-[#958b7f]">
                <div>{t.labels.timestamp}</div>
                <div>{t.labels.symbol}</div>
                <div>{t.labels.side}</div>
                <div>{t.labels.orderType}</div>
                <div>{t.labels.price}</div>
                <div className="text-right">{t.labels.state}</div>
              </div>
              {recentOrders.length ? (
                recentOrders.map((order) => (
                  <div
                    key={`${order.orderId}-${order.createdAt}`}
                    className="grid grid-cols-6 gap-4 border-t border-[#f0e8de] px-6 py-5 text-sm text-[#2f3545]"
                  >
                    <div>{formatDateTime(order.createdAt, locale)}</div>
                    <div>{order.symbol}</div>
                    <div>{order.side}</div>
                    <div>{order.orderType}</div>
                    <div>{order.price}</div>
                    <div className="text-right">{order.state}</div>
                  </div>
                ))
              ) : (
                <div className="px-6 py-8 text-center text-[#81786d]">
                  {locale === "zh"
                    ? "当前没有可展示的真实订单。"
                    : "No recent orders are available yet."}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[34px] border border-[#e8e0d5] bg-white px-8 py-8 shadow-[0_24px_60px_rgba(23,29,45,0.05)]">
            <div className="flex items-center justify-between gap-4">
              <div className="inline-flex items-center gap-3 text-[20px] font-semibold tracking-[-0.04em] text-[#1F2937]">
                <FileCheck2 className="h-5 w-5 text-[#ff8a57]" />
                {t.cards.recentFills}
              </div>
              <div className="rounded-full bg-[#f2ede5] px-3 py-1 text-xs font-medium text-[#7d7263]">
                {execution?.demoMode
                  ? locale === "zh"
                    ? "模拟交易"
                    : "Simulated trading"
                  : locale === "zh"
                    ? "只读"
                    : "Read only"}
              </div>
            </div>
            <div className="mt-6 overflow-hidden rounded-[24px] border border-[#f0e8de]">
              <div className="grid grid-cols-6 gap-4 bg-[#f7f3ec] px-6 py-4 text-sm text-[#958b7f]">
                <div>{t.labels.timestamp}</div>
                <div>{t.labels.symbol}</div>
                <div>{t.labels.side}</div>
                <div>{t.labels.fillPrice}</div>
                <div>{t.labels.fillSize}</div>
                <div className="text-right">{t.labels.fee}</div>
              </div>
              {recentFills.length ? (
                recentFills.map((fill) => (
                  <div
                    key={`${fill.tradeId}-${fill.timestamp}`}
                    className="grid grid-cols-6 gap-4 border-t border-[#f0e8de] px-6 py-5 text-sm text-[#2f3545]"
                  >
                    <div>{formatDateTime(fill.timestamp, locale)}</div>
                    <div>{fill.symbol}</div>
                    <div>{fill.side}</div>
                    <div>{fill.fillPrice}</div>
                    <div>{fill.fillSize}</div>
                    <div className="text-right">{fill.fee}</div>
                  </div>
                ))
              ) : (
                <div className="px-6 py-8 text-center text-[#81786d]">
                  {locale === "zh"
                    ? "当前没有真实成交记录。"
                    : "No real fills are available yet."}
                </div>
              )}
            </div>
          </div>
        </section>
        ) : null}
      </div>
    </main>
  );
}
