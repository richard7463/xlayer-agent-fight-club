export type ArenaMode = "hell" | "live";
export type ArenaBoardMode = ArenaMode | "all";
export type ArenaLocale = "en" | "zh";

export type ArenaDataSource = "seed" | "local" | "okx-market" | "okx-portfolio";
export type ArenaComputedSource = "simulation" | "demo-run";

export type MarketContext = {
  exchange: "OKX";
  symbol: string;
  lastPrice: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  volume24hUsd: number;
  spreadBps: number;
  fundingRatePct: number | null;
  openInterestUsd: number | null;
  volatilityTag: "calm" | "balanced" | "hot";
  environmentTag: "trend" | "squeeze" | "event" | "crowded";
  source: ArenaDataSource;
  updatedAt: string;
};

export type PortfolioSnapshot = {
  equityUsd: number;
  availableBalanceUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  feesUsd: number;
  maxDrawdownPct: number;
  activeOrders: number;
  liquidationCount: number;
  source: ArenaDataSource;
  updatedAt: string;
};

export type ArenaSkillPhase = {
  key: "market" | "portfolio" | "trade" | "bot";
  label: string;
  skill: string;
  status: "in-progress" | "next" | "planned";
  note: string;
};

export type ArenaScorecard = {
  profitFactor: number;
  stabilityScore: number;
  riskAdjustedReturn: number;
  promotionReadiness: number;
  runtimeGuardTrips: number;
  manualInterventions: number;
  demoSessions: number;
  source: ArenaComputedSource;
};

export type ArenaIntegrationState = {
  market: {
    status: "live" | "fallback" | "credentials-required";
    note: string;
    updatedAt?: string;
  };
  portfolio: {
    status: "live" | "fallback" | "credentials-required";
    note: string;
    updatedAt?: string;
  };
  trade: {
    status: "demo-ready";
    note: string;
  };
  bot: {
    status: "planned";
    note: string;
  };
};

export type PromotionStage = "running";

export type PromotionSnapshot = {
  stage: PromotionStage;
  arenaScore: number;
  riskAdjustedScore: number;
  demoEligible: boolean;
  liveEligible: boolean;
  nextAction: string;
  note: string;
  blockers: string[];
  lastReviewedAt: string;
  source: ArenaComputedSource;
};

export type Position = {
  symbol: string;
  side: "LONG" | "SHORT";
  size: string;
  entry: string;
  pnl: string;
  liqPrice?: string;
  leverage?: string;
};

export type ArenaAgent = {
  id: string;
  name: string;
  shortName: string;
  style: string;
  mode: ArenaMode;
  status: string;
  pnl: number;
  roi: number;
  description: string;
  creator: string;
  followers: string;
  blowups: number;
  totalTrades: number;
  winRate: string;
  discipline: string;
  riskNote: string;
  symbol: string;
  persona: string;
  positions: Position[];
  curve: number[];
  tags?: string[];
  localOnly?: boolean;
  following?: boolean;
  followerCount?: number;
  market: MarketContext;
  portfolio: PortfolioSnapshot;
  promotion: PromotionSnapshot;
  scorecard: ArenaScorecard;
  leaderboardSource: ArenaComputedSource;
};

export type ArenaAgentCore = Omit<
  ArenaAgent,
  "market" | "portfolio" | "promotion" | "scorecard" | "leaderboardSource"
>;

export type ArenaSummary = {
  mode: ArenaBoardMode;
  count: number;
  averageRoi: number;
  averageDrawdown: number;
  averageStability: number;
  averageRiskAdjusted: number;
  source: ArenaComputedSource;
  label: string;
};

export type WatchItem = {
  id: string;
  name: string;
  note: string;
  focus: string;
};

export const AGENT_ARENA_STORAGE_KEY = "xlayer-agent-fight-club-local-agents-v1";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function disciplineToScore(label: string) {
  const normalized = label.trim().toUpperCase();
  if (normalized === "A+") return 98;
  if (normalized === "A") return 94;
  if (normalized === "A-") return 90;
  if (normalized === "B+") return 86;
  if (normalized === "B") return 82;
  if (normalized === "B-") return 78;
  if (normalized === "C+") return 72;
  if (normalized === "C") return 68;
  return 60;
}

function parsePercentLabel(label: string) {
  const value = Number(label.replace("%", "").trim());
  return Number.isFinite(value) ? value : 0;
}

export const arenaSkillPhases: ArenaSkillPhase[] = [
  {
    key: "market",
    label: "Phase 1",
    skill: "okx-cex-market",
    status: "in-progress",
    note:
      "Replace seeded environment tags with real ticker, candles, spread, funding and open interest.",
  },
  {
    key: "portfolio",
    label: "Phase 1",
    skill: "okx-cex-portfolio",
    status: "in-progress",
    note:
      "Back the Results and Manage panels with balances, positions, equity and drawdown snapshots.",
  },
  {
    key: "trade",
    label: "Phase 2",
    skill: "okx-cex-trade",
    status: "next",
    note:
      "Promote agents from sandbox into demo execution before any live routing is allowed.",
  },
  {
    key: "bot",
    label: "Phase 3",
    skill: "okx-cex-bot",
    status: "planned",
    note:
      "Add native bot templates such as grid and DCA as first-class arena contestants.",
  },
];

const MARKET_SEED: Record<
  string,
  Omit<MarketContext, "source" | "updatedAt" | "symbol">
> = {
  "BTC-USDT": {
    exchange: "OKX",
    lastPrice: 68372.4,
    change24hPct: 2.84,
    high24h: 69118.2,
    low24h: 66482.1,
    volume24hUsd: 1_482_000_000,
    spreadBps: 1.7,
    fundingRatePct: 0.011,
    openInterestUsd: 2_480_000_000,
    volatilityTag: "balanced",
    environmentTag: "trend",
  },
  "ETH-USDT": {
    exchange: "OKX",
    lastPrice: 3528.6,
    change24hPct: 1.92,
    high24h: 3589.4,
    low24h: 3438.9,
    volume24hUsd: 864_000_000,
    spreadBps: 2.1,
    fundingRatePct: 0.009,
    openInterestUsd: 1_360_000_000,
    volatilityTag: "balanced",
    environmentTag: "squeeze",
  },
  "SOL-USDT": {
    exchange: "OKX",
    lastPrice: 186.42,
    change24hPct: 4.51,
    high24h: 190.26,
    low24h: 176.88,
    volume24hUsd: 522_000_000,
    spreadBps: 3.9,
    fundingRatePct: 0.018,
    openInterestUsd: 792_000_000,
    volatilityTag: "hot",
    environmentTag: "event",
  },
};

function inferFallbackMarket(symbol: string) {
  return {
    exchange: "OKX" as const,
    lastPrice: 1,
    change24hPct: 0.64,
    high24h: 1.04,
    low24h: 0.96,
    volume24hUsd: 48_000_000,
    spreadBps: 5.4,
    fundingRatePct: null,
    openInterestUsd: null,
    volatilityTag: "balanced" as const,
    environmentTag: "crowded" as const,
  };
}

function enrichPositions(
  positions: Position[],
  market: MarketContext,
  basisSeed: number,
) {
  return positions.map((position, index) => {
    const leverage = 3 + ((basisSeed + index * 7) % 10);
    const liqBase =
      position.side === "LONG"
        ? market.lastPrice * (0.88 - leverage * 0.01)
        : market.lastPrice * (1.12 + leverage * 0.01);

    return {
      ...position,
      leverage: `${leverage}x`,
      liqPrice: `$${Math.max(liqBase, 0.01).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    };
  });
}

function buildMarketContext(symbol: string, source: ArenaDataSource): MarketContext {
  const seeded = MARKET_SEED[symbol] ?? inferFallbackMarket(symbol);

  return {
    symbol,
    source,
    updatedAt: new Date("2026-03-20T09:00:00+08:00").toISOString(),
    ...seeded,
  };
}

function buildPortfolioSnapshot(
  agent: ArenaAgentCore,
  source: ArenaDataSource,
): PortfolioSnapshot {
  const pnlBase = Math.max(agent.pnl, 0);
  const equityUsd = 20_000 + pnlBase * 1.6 + agent.totalTrades * 42;
  const unrealizedPnlUsd = agent.positions.length
    ? (agent.positions[0].pnl.startsWith("-") ? -1 : 1) *
      (80 + (agent.totalTrades % 220))
    : 0;
  const realizedPnlUsd = Number((agent.pnl - unrealizedPnlUsd).toFixed(2));
  const availableBalanceUsd = Number((equityUsd * (0.28 + (agent.blowups ? 0.08 : 0.16))).toFixed(2));
  const feesUsd = Number((agent.totalTrades * 3.15).toFixed(2));
  const maxDrawdownPct = Number((6.8 + agent.blowups * 3.4 + (agent.totalTrades % 13) * 0.42).toFixed(2));

  return {
    equityUsd: Number(equityUsd.toFixed(2)),
    availableBalanceUsd,
    unrealizedPnlUsd,
    realizedPnlUsd,
    feesUsd,
    maxDrawdownPct,
    activeOrders: agent.mode === "live" ? 2 + (agent.totalTrades % 3) : 1 + (agent.totalTrades % 2),
    liquidationCount: agent.blowups,
    source,
    updatedAt: new Date("2026-03-20T09:00:00+08:00").toISOString(),
  };
}

function buildPromotionSnapshot(
  agent: ArenaAgentCore,
  portfolio: PortfolioSnapshot,
): PromotionSnapshot {
  const winRate = parsePercentLabel(agent.winRate);
  const disciplineScore = disciplineToScore(agent.discipline);
  const riskAdjustedScore = Number(
    (
      agent.roi -
      portfolio.maxDrawdownPct * 0.72 -
      agent.blowups * 12 +
      (disciplineScore - 80) * 0.18 +
      (winRate - 40) * 0.14
    ).toFixed(2),
  );

  const arenaScore = clamp(
    Math.round(
      62 +
        agent.roi * 0.42 +
        (disciplineScore - 80) * 0.55 +
        (winRate - 40) * 0.3 -
        portfolio.maxDrawdownPct * 0.68 -
        agent.blowups * 16,
    ),
    18,
    99,
  );

  const blockers: string[] = [];
  const demoEligible = true;
  const liveEligible = agent.mode === "live" && portfolio.activeOrders <= 3;
  const stage: PromotionStage = "running";
  const nextAction =
    "Submitted agents run immediately in Arena and continue updating with the latest market and account context.";
  const note =
    "Arena no longer uses sandbox, demo review, or promotion gates. Submission means immediate display and running status.";

  return {
    stage,
    arenaScore,
    riskAdjustedScore,
    demoEligible,
    liveEligible,
    nextAction,
    note,
    blockers,
    lastReviewedAt: portfolio.updatedAt,
    source: "simulation",
  };
}

function buildArenaScorecard(
  agent: ArenaAgentCore,
  portfolio: PortfolioSnapshot,
  promotion: PromotionSnapshot,
): ArenaScorecard {
  const winRate = parsePercentLabel(agent.winRate);
  const disciplineScore = disciplineToScore(agent.discipline);
  const runtimeGuardTrips = clamp(
    agent.blowups + Math.round(portfolio.maxDrawdownPct / 9) + (portfolio.activeOrders > 3 ? 1 : 0),
    0,
    9,
  );
  const manualInterventions = clamp(
    Math.round((100 - disciplineScore) / 12) + (agent.mode === "live" ? 1 : 0),
    0,
    8,
  );
  const stabilityScore = clamp(
    Math.round(
      100 -
        portfolio.maxDrawdownPct * 2.1 -
        runtimeGuardTrips * 6 +
        (disciplineScore - 80) * 0.72 +
        (winRate - 40) * 0.35,
    ),
    18,
    99,
  );
  const profitFactor = Number(
    clamp(
      0.82 +
        Math.max(agent.roi, 0) * 0.018 +
        Math.max(winRate - 35, 0) * 0.012 -
        runtimeGuardTrips * 0.08,
      0.78,
      3.4,
    ).toFixed(2),
  );
  const promotionReadiness = clamp(
    Math.round(
      promotion.arenaScore * 0.44 +
        Math.max(promotion.riskAdjustedScore, -20) * 0.78 +
        stabilityScore * 0.28 -
        runtimeGuardTrips * 4,
    ),
    12,
    99,
  );
  const demoSessions = clamp(
    Math.round(agent.totalTrades / (agent.mode === "live" ? 22 : 28)),
    3,
    24,
  );

  return {
    profitFactor,
    stabilityScore,
    riskAdjustedReturn: Number(promotion.riskAdjustedScore.toFixed(2)),
    promotionReadiness,
    runtimeGuardTrips,
    manualInterventions,
    demoSessions,
    source: "simulation",
  };
}

type SyntheticSeedSpec = {
  id: string;
  name: string;
  shortName: string;
  style: string;
  mode: ArenaMode;
  pnl: number;
  roi: number;
  totalTrades: number;
  winRate: string;
  discipline: string;
  riskNote: string;
  symbol: string;
  description: string;
  persona: string;
  creator?: string;
  followers?: string;
  blowups?: number;
  side?: "LONG" | "SHORT";
  positionValueUsd?: number;
  entryPrice?: number;
  tags?: string[];
};

function buildChineseSeedDescription(spec: SyntheticSeedSpec) {
  const modeLabel = spec.mode === "live" ? "实时运行型" : "竞技运行型";
  const sideLabel =
    spec.side === "LONG" ? "偏多执行" : spec.side === "SHORT" ? "偏空执行" : "双向执行";
  return `${spec.style}，主交易对 ${spec.symbol}，${sideLabel}，当前定位为 ${modeLabel}，侧重在 ${spec.totalTrades} 笔样本中保持统一执行纪律。`;
}

function buildChineseSeedRiskNote(spec: SyntheticSeedSpec) {
  const base =
    spec.mode === "live"
      ? "这类代理更适合低频、保守执行，重点观察仓位控制和错误信号下的退出速度。"
      : "这类代理允许更高频试错，但更依赖严格止损、仓位上限和连续亏损后的降频处理。";
  const blowupNote =
    (spec.blowups ?? 0) > 0
      ? `历史存在 ${spec.blowups} 次爆仓记录，必须显式限制极端杠杆和滚仓层数。`
      : "当前更需要关注高波动阶段的回撤放大和追单失真。";
  return `${base}${blowupNote}`;
}

function formatUsdLabel(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildSyntheticCurve(pnl: number, roi: number, totalTrades: number, mode: ArenaMode) {
  const points = 16;
  const amplitude = Math.max(180, pnl * (mode === "live" ? 0.16 : 0.24));
  const tradeFactor = Math.max(0.82, Math.min(1.32, totalTrades / 240));
  const roiFactor = Math.max(0.4, Math.min(1.5, roi / 55));

  return Array.from({ length: points }, (_, index) => {
    const progress = index / (points - 1);
    const trend = pnl * progress;
    const waveA = Math.sin(progress * Math.PI * 2.2) * amplitude * 0.22 * tradeFactor;
    const waveB = Math.cos(progress * Math.PI * 5.1) * amplitude * 0.08 * roiFactor;
    const dip = progress > 0.55 ? -amplitude * 0.14 * (1 - progress) : 0;
    return Number(Math.max(0, trend + waveA + waveB + dip).toFixed(2));
  });
}

function buildSyntheticPositions(spec: SyntheticSeedSpec): Position[] {
  if (!spec.side || !spec.positionValueUsd || !spec.entryPrice) {
    return [];
  }

  const pnlMagnitude = Math.max(48, Math.min(spec.positionValueUsd * 0.028, 860));
  const pnlDirection = spec.roi >= 0 ? 1 : -1;

  return [
    {
      symbol: spec.symbol,
      side: spec.side,
      size: formatUsdLabel(spec.positionValueUsd),
      entry: formatUsdLabel(spec.entryPrice),
      pnl: `${pnlDirection >= 0 ? "+" : "-"}${formatUsdLabel(pnlMagnitude)}`,
    },
  ];
}

function buildSyntheticSeedAgent(spec: SyntheticSeedSpec): ArenaAgentCore {
  return {
    id: spec.id,
    name: spec.name,
    shortName: spec.shortName,
    style: spec.style,
    mode: spec.mode,
    status: spec.mode === "live" ? "Live" : "Running",
    pnl: spec.pnl,
    roi: spec.roi,
    description: buildChineseSeedDescription(spec),
    creator: spec.creator ?? "Coliseum Official",
    followers: spec.followers ?? `${Math.max(220, Math.round(spec.totalTrades * 2.4)).toLocaleString()} followers`,
    blowups: spec.blowups ?? 0,
    totalTrades: spec.totalTrades,
    winRate: spec.winRate,
    discipline: spec.discipline,
    riskNote: buildChineseSeedRiskNote(spec),
    symbol: spec.symbol,
    persona: spec.persona,
    positions: buildSyntheticPositions(spec),
    curve: buildSyntheticCurve(spec.pnl, spec.roi, spec.totalTrades, spec.mode),
    tags: spec.tags,
  };
}

export function enrichArenaAgent(
  agent: ArenaAgentCore,
  source: ArenaDataSource = "seed",
): ArenaAgent {
  const market = buildMarketContext(agent.symbol, source);
  const portfolio = buildPortfolioSnapshot(agent, source);
  const promotion = buildPromotionSnapshot(agent, portfolio);
  return {
    ...agent,
    positions: enrichPositions(agent.positions, market, agent.totalTrades),
    market,
    portfolio,
    promotion,
    scorecard: buildArenaScorecard(agent, portfolio, promotion),
    leaderboardSource: "simulation",
  };
}

export function hydrateArenaAgent(raw: unknown): ArenaAgent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<ArenaAgent>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.shortName !== "string" ||
    typeof candidate.style !== "string" ||
    (candidate.mode !== "hell" && candidate.mode !== "live") ||
    typeof candidate.status !== "string" ||
    typeof candidate.pnl !== "number" ||
    typeof candidate.roi !== "number" ||
    typeof candidate.description !== "string" ||
    typeof candidate.creator !== "string" ||
    typeof candidate.followers !== "string" ||
    typeof candidate.blowups !== "number" ||
    typeof candidate.totalTrades !== "number" ||
    typeof candidate.winRate !== "string" ||
    typeof candidate.discipline !== "string" ||
    typeof candidate.riskNote !== "string" ||
    typeof candidate.symbol !== "string" ||
    typeof candidate.persona !== "string" ||
    !Array.isArray(candidate.positions) ||
    !Array.isArray(candidate.curve)
  ) {
    return null;
  }

  if (candidate.market && candidate.portfolio && candidate.promotion && candidate.scorecard) {
    return {
      ...(candidate as ArenaAgent),
      leaderboardSource:
        (candidate as ArenaAgent).leaderboardSource ?? "simulation",
      promotion: {
        ...(candidate.promotion as PromotionSnapshot),
        source:
          (candidate.promotion as PromotionSnapshot).source ?? "simulation",
      },
      scorecard: {
        ...(candidate.scorecard as ArenaScorecard),
        source:
          (candidate.scorecard as ArenaScorecard).source ?? "simulation",
      },
    };
  }

  return enrichArenaAgent(
    {
      id: candidate.id,
      name: candidate.name,
      shortName: candidate.shortName,
      style: candidate.style,
      mode: candidate.mode,
      status: candidate.status,
      pnl: candidate.pnl,
      roi: candidate.roi,
      description: candidate.description,
      creator: candidate.creator,
      followers: candidate.followers,
      blowups: candidate.blowups,
      totalTrades: candidate.totalTrades,
      winRate: candidate.winRate,
      discipline: candidate.discipline,
      riskNote: candidate.riskNote,
      symbol: candidate.symbol,
      persona: candidate.persona,
      positions: candidate.positions as Position[],
      curve: candidate.curve as number[],
      tags: candidate.tags,
      localOnly: candidate.localOnly,
    },
    candidate.localOnly ? "local" : "seed",
  );
}

const coreSeedArenaAgentDefs: ArenaAgentCore[] = [
  {
    id: "night-fury",
    name: "Night Fury",
    shortName: "N",
    style: "Momentum Balanced BTC operator",
    mode: "hell",
    status: "Running",
    pnl: 5310.81,
    roi: 53.11,
    description:
      "Two-way momentum trader with tight invalidation rules, controlled leverage and fast recycle discipline.",
    creator: "Coliseum Lab",
    followers: "2.3k followers",
    blowups: 0,
    totalTrades: 304,
    winRate: "39.8%",
    discipline: "A-",
    riskNote:
      "Keeps leverage inside the declared band and cuts late-cycle entries fast.",
    symbol: "BTC-USDT",
    persona:
      "You are a disciplined momentum operator. You only attack when breakout structure, volume and volatility line up, and you always respect invalidation first.",
    positions: [
      {
        symbol: "BTC-USDT",
        side: "LONG",
        size: "$34,879.34",
        entry: "$67,305.90",
        pnl: "-$191.12",
      },
    ],
    curve: [
      0, 180, 120, 460, 330, 720, 680, 990, 820, 1430, 1180, 1730, 1600, 2120,
      1980, 2490,
    ],
    tags: ["Momentum", "Balanced", "BTC"],
  },
  {
    id: "traffic-hunter",
    name: "Traffic Hunter BTC",
    shortName: "T",
    style: "Aggressive yet disciplined 15m trend hunter",
    mode: "hell",
    status: "Running",
    pnl: 4815.89,
    roi: 48.16,
    description:
      "15m trend-plus-momentum setup with breakout filters and quick partial profit routines.",
    creator: "fei moss",
    followers: "1.2k followers",
    blowups: 0,
    totalTrades: 226,
    winRate: "44.2%",
    discipline: "B+",
    riskNote:
      "High cadence, but still waits for confirmed range expansion before scaling.",
    symbol: "BTC-USDT",
    persona:
      "You are a traffic hunter. You attack expansion candles with controlled size, partial out into strength and refuse to hold dead momentum.",
    positions: [
      {
        symbol: "BTC-USDT",
        side: "LONG",
        size: "$18,114.02",
        entry: "$66,921.40",
        pnl: "+$248.83",
      },
    ],
    curve: [
      0, 80, 210, 340, 560, 490, 730, 920, 880, 1010, 1250, 1610, 1500, 1790,
      2010, 2210,
    ],
    tags: ["Trend", "15m", "High cadence"],
  },
  {
    id: "livermore-tape",
    name: "Livermore Tape",
    shortName: "L",
    style: "Trend balanced tape reader",
    mode: "hell",
    status: "Running",
    pnl: 3580.86,
    roi: 35.81,
    description:
      "Classic tape-reading bias with patient entries, selective adds and hard invalidation discipline.",
    creator: "Chain Aze",
    followers: "980 followers",
    blowups: 0,
    totalTrades: 141,
    winRate: "42.0%",
    discipline: "A",
    riskNote:
      "Prefers fewer but cleaner actions, accepts boredom and avoids noise trades.",
    symbol: "BTC-USDT",
    persona:
      "You are Jesse Livermore in crypto: patience first, no revenge, and no size until the tape earns it.",
    positions: [],
    curve: [
      0, 60, 120, 100, 320, 540, 410, 590, 770, 700, 1150, 1290, 1560, 1810,
      2010, 2140,
    ],
    tags: ["Tape", "Trend", "Patient"],
  },
  {
    id: "breakout-clerk",
    name: "Breakout Clerk",
    shortName: "B",
    style: "Calm execution layer for live monitoring",
    mode: "live",
    status: "Live",
    pnl: 912.35,
    roi: 8.61,
    description:
      "Low-frequency live operator that drafts orders first, then waits for manual approval.",
    creator: "Coliseum Lab",
    followers: "2.3k followers",
    blowups: 0,
    totalTrades: 28,
    winRate: "57.1%",
    discipline: "A+",
    riskNote:
      "Best suited for operators who want a draft-first execution style instead of full autonomy.",
    symbol: "ETH-USDT",
    persona:
      "You are a careful breakout clerk. Draft the order, show the invalidation, and never cross into execution without operator approval.",
    positions: [
      {
        symbol: "ETH-USDT",
        side: "LONG",
        size: "$4,128.20",
        entry: "$3,488.40",
        pnl: "+$67.18",
      },
    ],
    curve: [
      0, 30, 60, 50, 120, 180, 220, 310, 450, 430, 510, 590, 710, 760, 812,
      912,
    ],
    tags: ["Draft first", "Live", "Manual approve"],
  },
  {
    id: "apex-scribe",
    name: "Apex Scribe",
    shortName: "A",
    style: "Live draft engine for event-driven majors",
    mode: "live",
    status: "Live",
    pnl: 635.42,
    roi: 6.08,
    description:
      "Scans event spikes, drafts fast orders, and waits for operator sign-off before committing.",
    creator: "Coliseum Ops",
    followers: "860 followers",
    blowups: 0,
    totalTrades: 21,
    winRate: "52.4%",
    discipline: "A",
    riskNote:
      "Strong when news aligns with price structure, weaker during drift sessions.",
    symbol: "SOL-USDT",
    persona:
      "You are a fast but careful event scribe. Never confuse signal discovery with execution entitlement.",
    positions: [
      {
        symbol: "SOL-USDT",
        side: "SHORT",
        size: "$2,410.60",
        entry: "$184.20",
        pnl: "+$42.51",
      },
    ],
    curve: [
      0, 22, 36, 64, 90, 110, 145, 160, 230, 244, 270, 305, 370, 410, 510,
      635,
    ],
    tags: ["Event-driven", "SOL", "Draft first"],
  },
];

const officialSeedAgentDefs: ArenaAgentCore[] = [
  buildSyntheticSeedAgent({
    id: "quant-labs-counter-short",
    name: "Counter Short 75x",
    shortName: "Q",
    style: "强化版逆势做空策略",
    mode: "hell",
    pnl: 14210.64,
    roi: 100.14,
    totalTrades: 208,
    winRate: "41.8%",
    discipline: "B+",
    riskNote: "Uses 35-75x leverage and heavy rolling adds; strong upside, high liquidation sensitivity.",
    symbol: "BTC-USDT",
    description: "Aggressive counter-trend short strategy using 35-75x leverage, 60% max position sizing and fast roll-ins during failed bounce attempts.",
    persona: "强化版逆势做空策略，35-75x 杠杆，更高仓位(60%)，更激进滚仓，目标 100% ROI。只有当下跌结构确认、反弹无量且波动扩张时才继续加压。",
    side: "SHORT",
    positionValueUsd: 26380.24,
    entryPrice: 68154.3,
    tags: ["Short bias", "75x", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "dual-core-15m",
    name: "Dual Core 15m",
    shortName: "D",
    style: "15m 趋势 + 动量双核",
    mode: "hell",
    pnl: 11840.22,
    roi: 86.42,
    totalTrades: 3921,
    winRate: "48.7%",
    discipline: "B",
    riskNote: "Very high cadence. Signal quality stays good only when market structure remains directional.",
    symbol: "BTC-USDT",
    description: "High-frequency 15m trend and momentum strategy optimized for BTC-USDT signal density and trade count.",
    persona: "15 分钟趋势 + 动量双核策略，高频信号捕获，适配 BTC/USDT，追求交易次数与快速再入场，允许频繁试错但要求统一退出纪律。",
    side: "LONG",
    positionValueUsd: 18620.42,
    entryPrice: 67792.15,
    tags: ["15m", "High cadence", "Momentum"],
  }),
  buildSyntheticSeedAgent({
    id: "livermore-keypoint",
    name: "Livermore Keypoint",
    shortName: "L",
    style: "关键点投机做空",
    mode: "hell",
    pnl: 9730.55,
    roi: 71.85,
    totalTrades: 61,
    winRate: "46.3%",
    discipline: "A",
    riskNote: "Very selective entries. Large missed-opportunity cost if volume confirmation is late.",
    symbol: "BTC-USDT",
    description: "Jesse Livermore-inspired keypoint trader that waits for volume-confirmed structural shifts before committing size.",
    persona: "你是杰西·利弗莫尔。你等待关键点，不追噪音。只在趋势从量变进入质变的瞬间出击，放量确认优先，错误时立刻退出，正确时让利润奔跑。",
    side: "SHORT",
    positionValueUsd: 14960.35,
    entryPrice: 68331.9,
    tags: ["Livermore", "Tape", "Selective"],
  }),
  buildSyntheticSeedAgent({
    id: "second-leg-swing",
    name: "Second Leg Swing",
    shortName: "S",
    style: "干净回撤后二次启动",
    mode: "hell",
    pnl: 6840.33,
    roi: 49.26,
    totalTrades: 61,
    winRate: "53.2%",
    discipline: "A-",
    riskNote: "Balanced swing profile. Drawdown remains contained if mean-revert entries are not overused.",
    symbol: "BTC-USDT",
    description: "Bi-directional swing bot focused on second-leg trend continuation after clean pullbacks.",
    persona: "你做波段，不追最初和最后一段。双向，8x-12x 杠杆，中频，更重视干净回撤后的二次启动，宁可错过也不提前抢跑。",
    side: "LONG",
    positionValueUsd: 9652.18,
    entryPrice: 67684.25,
    tags: ["Swing", "Second leg", "8-12x"],
  }),
  buildSyntheticSeedAgent({
    id: "macd-rsi-resonance",
    name: "MACD RSI Resonance",
    shortName: "M",
    style: "MACD / RSI 动量共振",
    mode: "hell",
    pnl: 5320.19,
    roi: 39.73,
    totalTrades: 201,
    winRate: "38.4%",
    discipline: "B",
    riskNote: "Momentum-heavy. Performance degrades in chop because exit threshold is slower than entry threshold.",
    symbol: "BTC-USDT",
    description: "Medium-frequency momentum bot that uses MACD and RSI resonance to trigger directional entries.",
    persona: "你主要依据 MACD 与 RSI 的动量共振入场，双向，12x 杠杆，中频，动量权重最高，趋势权重次之，止盈比偏高。",
    side: "LONG",
    positionValueUsd: 12410.26,
    entryPrice: 68041.55,
    tags: ["MACD", "RSI", "12x"],
  }),
  buildSyntheticSeedAgent({
    id: "disaster-insurance-short",
    name: "Disaster Insurance Short",
    shortName: "I",
    style: "灾难保险式下跌做空",
    mode: "hell",
    pnl: 4510.66,
    roi: 34.72,
    totalTrades: 129,
    winRate: "36.6%",
    discipline: "B+",
    riskNote: "Low frequency and heavy hold time. Needs trend acceleration to justify the patience.",
    symbol: "BTC-USDT",
    description: "Low-frequency bear continuation short strategy with long hold time and asymmetric payoff profile.",
    persona: "你像在买灾难保险，平时克制，只在下跌趋势加速时做空，20x 到 35x 杠杆，低频，但一旦对了就拿很久。",
    side: "SHORT",
    positionValueUsd: 10325.8,
    entryPrice: 68611.42,
    tags: ["Crash hedge", "Low frequency", "Short"],
  }),
  buildSyntheticSeedAgent({
    id: "doomsday-long-sprint",
    name: "Doomsday Sprint",
    shortName: "Z",
    style: "末日终极冲刺策略",
    mode: "hell",
    pnl: 2910.24,
    roi: 21.54,
    totalTrades: 54,
    winRate: "28.8%",
    discipline: "C+",
    riskNote: "Insanely high leverage and risk budget. Win profile is explosive but fragile.",
    symbol: "BTC-USDT",
    description: "Hyper-aggressive long-only sprint strategy with 150-200x leverage and layered re-investment.",
    persona: "末日终极冲刺策略：150-200x 杠杆，多头 0.85。入场 0.05 / 出场 0.12，止损 4ATR / 止盈 12RR。浮盈 12% 触发 80% 再投，限 4 层。",
    side: "LONG",
    positionValueUsd: 22450.9,
    entryPrice: 67210.35,
    blowups: 3,
    tags: ["Long only", "200x", "Extreme"],
  }),
  buildSyntheticSeedAgent({
    id: "reversal-auctioneer",
    name: "Reversal Auctioneer",
    shortName: "R",
    style: "逆势拍卖型回转",
    mode: "hell",
    pnl: 6120.48,
    roi: 44.15,
    totalTrades: 144,
    winRate: "47.1%",
    discipline: "B+",
    riskNote: "Contrarian entry quality is high, but only when volume dries up before reclaim.",
    symbol: "ETH-USDT",
    description: "Auction-style reversal trader that accumulates only after failed continuation and reclaim.",
    persona: "你把价格当成拍卖过程，只在失衡被收回时逆向出击，不在趋势最强时抬杠，而在趋势失真时拿最有赔率的一段。",
    side: "LONG",
    positionValueUsd: 8140.55,
    entryPrice: 3491.8,
    tags: ["ETH", "Reversal", "Auction"],
  }),
  buildSyntheticSeedAgent({
    id: "mean-drift-clerk",
    name: "Mean Drift Clerk",
    shortName: "C",
    style: "漂移回归型文员",
    mode: "live",
    pnl: 1720.36,
    roi: 14.24,
    totalTrades: 83,
    winRate: "54.8%",
    discipline: "A",
    riskNote: "Draft-first live operator. Best used under operator supervision during calmer sessions.",
    symbol: "ETH-USDT",
    description: "Draft-first live operator balancing mean reversion and drift continuation with conservative leverage.",
    persona: "你是一个极其克制的 live 文员。回归和趋势都做，但任何时候都先给出理由、位置和失效点，再等待执行批准。",
    side: "LONG",
    positionValueUsd: 4220.18,
    entryPrice: 3516.22,
    tags: ["Live", "ETH", "Draft first"],
  }),
  buildSyntheticSeedAgent({
    id: "basis-break-hunter",
    name: "Basis Break Hunter",
    shortName: "B",
    style: "基差断裂猎手",
    mode: "hell",
    pnl: 5640.91,
    roi: 40.18,
    totalTrades: 112,
    winRate: "49.4%",
    discipline: "B+",
    riskNote: "Performs best when perp premium and spot structure diverge at the same time.",
    symbol: "BTC-USDT",
    description: "Detects basis dislocations between momentum, funding and price structure to catch forced repricing.",
    persona: "你专找基差和价格结构同时错位的时刻，在错误定价被纠正之前抢先布局，偏好波动率上升阶段。",
    side: "SHORT",
    positionValueUsd: 11240.44,
    entryPrice: 68455.12,
    tags: ["Basis", "Funding", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "volatility-harvester",
    name: "Volatility Harvester",
    shortName: "V",
    style: "波动率收割机",
    mode: "hell",
    pnl: 4380.44,
    roi: 31.72,
    totalTrades: 337,
    winRate: "45.6%",
    discipline: "B",
    riskNote: "Trade count is high. Needs volatility clustering to stay ahead of fees.",
    symbol: "SOL-USDT",
    description: "Harvests expansion and contraction cycles on SOL with rapid stop resets and partial exits.",
    persona: "你追踪的是波动簇，不是方向本身。只要扩张与回落转换足够明确，你就用最短的停留时间去吃波动。",
    side: "LONG",
    positionValueUsd: 9560.3,
    entryPrice: 183.56,
    tags: ["SOL", "Volatility", "High turnover"],
  }),
  buildSyntheticSeedAgent({
    id: "range-compression-monk",
    name: "Compression Monk",
    shortName: "K",
    style: "区间压缩破裂僧",
    mode: "hell",
    pnl: 5220.68,
    roi: 37.54,
    totalTrades: 94,
    winRate: "51.2%",
    discipline: "A-",
    riskNote: "Very patient. Misses many moves by design to avoid low-quality breakouts.",
    symbol: "BTC-USDT",
    description: "Waits through compression, then strikes only when range break comes with volume confirmation.",
    persona: "你接受长时间无交易，只在压缩末端的真正破裂出现时入场。没有确认，就继续等待，不靠感觉补单。",
    side: "LONG",
    positionValueUsd: 7488.88,
    entryPrice: 67585.45,
    tags: ["Compression", "Patience", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "rsi-divergence-tactician",
    name: "RSI Divergence Tactician",
    shortName: "T",
    style: "背离战术家",
    mode: "hell",
    pnl: 3470.15,
    roi: 26.42,
    totalTrades: 118,
    winRate: "50.1%",
    discipline: "B+",
    riskNote: "Signal edge is fragile when divergence appears against strong macro trend.",
    symbol: "ETH-USDT",
    description: "Trades RSI divergence only when local structure and volatility regime support a reversal.",
    persona: "你不把背离当圣杯，只把它当提前预警。真正出手前，必须看到结构、量能和节奏一起配合。",
    side: "SHORT",
    positionValueUsd: 5360.66,
    entryPrice: 3542.1,
    tags: ["RSI", "Divergence", "ETH"],
  }),
  buildSyntheticSeedAgent({
    id: "atr-breakout-engine",
    name: "ATR Breakout Engine",
    shortName: "E",
    style: "ATR 扩张突破引擎",
    mode: "hell",
    pnl: 6010.81,
    roi: 43.38,
    totalTrades: 167,
    winRate: "47.9%",
    discipline: "B+",
    riskNote: "Works when ATR expansion leads price. False positives rise sharply in range markets.",
    symbol: "BTC-USDT",
    description: "Captures breakout continuation when ATR expands before price fully escapes the range.",
    persona: "你主要依据 ATR 扩张和结构位同步突破入场。没有波动率支持的假突破，一律不追。",
    side: "LONG",
    positionValueUsd: 12680.44,
    entryPrice: 67802.3,
    tags: ["ATR", "Breakout", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "volume-imbalance-shark",
    name: "Volume Imbalance Shark",
    shortName: "H",
    style: "量能失衡鲨鱼",
    mode: "hell",
    pnl: 4890.62,
    roi: 35.4,
    totalTrades: 152,
    winRate: "46.2%",
    discipline: "B",
    riskNote: "Relies heavily on orderflow bursts and loses edge when tape is thin.",
    symbol: "BTC-USDT",
    description: "Tracks local volume imbalance and attacks the side that absorbs least and travels fastest.",
    persona: "你寻找量能失衡，而不是单纯 K 线形态。谁吸收最弱、谁跑得最快，你就顺着那一边出手。",
    side: "SHORT",
    positionValueUsd: 9340.17,
    entryPrice: 68274.9,
    tags: ["Volume", "Orderflow", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "session-rotation-bot",
    name: "Session Rotation Bot",
    shortName: "O",
    style: "交易时段轮动",
    mode: "live",
    pnl: 1210.52,
    roi: 9.66,
    totalTrades: 63,
    winRate: "56.8%",
    discipline: "A",
    riskNote: "Safer live profile. Edge comes from session handoff timing rather than leverage.",
    symbol: "ETH-USDT",
    description: "Live operator rotating bias across Asia, Europe and US session transitions.",
    persona: "你更看重时段切换带来的流动性变化。方向其次，时机优先，live 只允许低风险低频执行。",
    side: "LONG",
    positionValueUsd: 3660.2,
    entryPrice: 3504.4,
    tags: ["Live", "Sessions", "ETH"],
  }),
  buildSyntheticSeedAgent({
    id: "event-pulse-major",
    name: "Event Pulse Major",
    shortName: "P",
    style: "事件脉冲主力",
    mode: "live",
    pnl: 980.36,
    roi: 8.22,
    totalTrades: 37,
    winRate: "54.1%",
    discipline: "A-",
    riskNote: "Only useful when event regime is clean. Best left in operator-approved live mode.",
    symbol: "SOL-USDT",
    description: "Drafts live trades around discrete event bursts and volatility spikes on majors.",
    persona: "你只在事件推动下给出 live 草案。事件不明确时宁可空仓，也不假装有信号。",
    side: "SHORT",
    positionValueUsd: 2840.74,
    entryPrice: 185.34,
    tags: ["Live", "Events", "SOL"],
  }),
  buildSyntheticSeedAgent({
    id: "squeeze-release-sniper",
    name: "Squeeze Release Sniper",
    shortName: "G",
    style: "挤压释放狙击手",
    mode: "hell",
    pnl: 5542.77,
    roi: 39.81,
    totalTrades: 128,
    winRate: "48.9%",
    discipline: "B+",
    riskNote: "Good reward/risk when compression resolves decisively; weak if fake-out rate rises.",
    symbol: "BTC-USDT",
    description: "Targets squeeze-release breaks with fast stop movement once price escapes compression.",
    persona: "你只做挤压释放，不做普通趋势。突破一旦成形，立刻跟随；一旦失效，立刻退场。",
    side: "LONG",
    positionValueUsd: 10880.18,
    entryPrice: 67642.75,
    tags: ["Squeeze", "Breakout", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "retrace-add-operator",
    name: "Retrace Add Operator",
    shortName: "U",
    style: "回撤加仓运营者",
    mode: "hell",
    pnl: 6284.32,
    roi: 45.12,
    totalTrades: 173,
    winRate: "50.4%",
    discipline: "B+",
    riskNote: "Scaling behavior is profitable only when pullback quality stays clean and shallow.",
    symbol: "BTC-USDT",
    description: "Adds into validated pullbacks rather than chasing breakout candles directly.",
    persona: "你偏好在确认趋势后的第一次和第二次回撤中加仓，不在最冲动的 K 线上追价。",
    side: "LONG",
    positionValueUsd: 10110.4,
    entryPrice: 67710.15,
    tags: ["Retrace", "Add-on", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "one-side-bear-raider",
    name: "Bear Raider",
    shortName: "X",
    style: "单边空头突袭",
    mode: "hell",
    pnl: 7110.08,
    roi: 52.44,
    totalTrades: 84,
    winRate: "43.7%",
    discipline: "B",
    riskNote: "Single-side short bias means idle time can be long in bull conditions.",
    symbol: "BTC-USDT",
    description: "Single-side short bot for accelerated downside only, with no counter-trend longs.",
    persona: "你只做空，不在反弹里做多。行情不给空头环境，就空仓等，绝不为了交易而交易。",
    side: "SHORT",
    positionValueUsd: 12850.7,
    entryPrice: 68420.66,
    tags: ["Short-only", "BTC", "Acceleration"],
  }),
  buildSyntheticSeedAgent({
    id: "one-side-bull-raider",
    name: "Bull Raider",
    shortName: "Y",
    style: "单边多头突袭",
    mode: "hell",
    pnl: 5750.46,
    roi: 41.6,
    totalTrades: 92,
    winRate: "46.8%",
    discipline: "B",
    riskNote: "Long-only profile performs best when majors are in broad uptrend and pullbacks stay shallow.",
    symbol: "ETH-USDT",
    description: "Single-side long strategy focused on impulsive continuation after shallow pullbacks.",
    persona: "你只做多，不抄顶不抢空。只有当上行趋势继续有效、回撤足够干净时才加速进场。",
    side: "LONG",
    positionValueUsd: 8420.55,
    entryPrice: 3488.2,
    tags: ["Long-only", "ETH", "Continuation"],
  }),
  buildSyntheticSeedAgent({
    id: "cross-exchange-sentiment",
    name: "Cross Exchange Sentiment",
    shortName: "J",
    style: "跨交易所情绪偏差",
    mode: "hell",
    pnl: 4660.74,
    roi: 33.92,
    totalTrades: 138,
    winRate: "47.3%",
    discipline: "B+",
    riskNote: "Depends on external sentiment drift. Lag hurts during abrupt reversals.",
    symbol: "BTC-USDT",
    description: "Uses sentiment and momentum dispersion across venues to estimate local directional imbalance.",
    persona: "你利用不同交易所之间的情绪与动量偏差来判断局部失衡，只在偏差放大到足够值得交易时出手。",
    side: "SHORT",
    positionValueUsd: 8860.31,
    entryPrice: 68192.4,
    tags: ["Sentiment", "Cross-venue", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "structure-failure-short",
    name: "Structure Failure Short",
    shortName: "F",
    style: "结构失效空头",
    mode: "hell",
    pnl: 5930.91,
    roi: 42.38,
    totalTrades: 109,
    winRate: "48.1%",
    discipline: "B+",
    riskNote: "Very effective when reclaim attempts fail quickly; weaker in slow bleed markets.",
    symbol: "BTC-USDT",
    description: "Attacks failed reclaim attempts after structure breakdown and aborted rebound.",
    persona: "你不是追跌，而是等结构失效后反抽失败再做空。只有失败被确认，赔率才真正站到你这边。",
    side: "SHORT",
    positionValueUsd: 9440.88,
    entryPrice: 68388.15,
    tags: ["Failure setup", "Short", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "trend-resume-compiler",
    name: "Trend Resume Compiler",
    shortName: "W",
    style: "趋势恢复编译器",
    mode: "hell",
    pnl: 5470.24,
    roi: 39.14,
    totalTrades: 131,
    winRate: "49.5%",
    discipline: "B+",
    riskNote: "Needs trend memory. If market rotates regime too often, resume signals overfit quickly.",
    symbol: "SOL-USDT",
    description: "Compiles multiple resumption signals after trend pullback and continuation alignment.",
    persona: "你不在趋势第一脚追，而在回撤后的恢复点重新编译信号，确认二次启动再出手。",
    side: "LONG",
    positionValueUsd: 7710.36,
    entryPrice: 182.9,
    tags: ["Resume", "SOL", "Continuation"],
  }),
  buildSyntheticSeedAgent({
    id: "momentum-ignition-12x",
    name: "Momentum Ignition 12x",
    shortName: "N",
    style: "12x 动量点火",
    mode: "hell",
    pnl: 6398.11,
    roi: 46.07,
    totalTrades: 219,
    winRate: "45.8%",
    discipline: "B",
    riskNote: "Fast ignition works, but late-cycle entries produce sharp giveback.",
    symbol: "BTC-USDT",
    description: "A 12x momentum ignition system that leans into aligned trend and oscillator acceleration.",
    persona: "你在趋势、动量、成交量同时点火时入场，12x 杠杆，中频，允许滚仓，但不允许死扛。",
    side: "LONG",
    positionValueUsd: 11005.44,
    entryPrice: 67844.74,
    tags: ["Momentum", "12x", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "funding-fade-clerk",
    name: "Funding Fade Clerk",
    shortName: "F",
    style: "资金费率反身性回落",
    mode: "live",
    pnl: 840.26,
    roi: 6.92,
    totalTrades: 31,
    winRate: "58.1%",
    discipline: "A",
    riskNote: "Conservative live profile built for smaller, cleaner mean reversion opportunities.",
    symbol: "BTC-USDT",
    description: "Operator-gated live draft bot that fades stretched funding and crowded positioning.",
    persona: "你对拥挤交易保持怀疑。只有当资金费率、位置和价格同时过热时，才给出逆向草案。",
    side: "SHORT",
    positionValueUsd: 3180.62,
    entryPrice: 68312.2,
    tags: ["Funding", "Live", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "liquidation-sweeper",
    name: "Liquidation Sweeper",
    shortName: "L",
    style: "爆仓清扫工",
    mode: "hell",
    pnl: 5210.37,
    roi: 37.62,
    totalTrades: 154,
    winRate: "44.7%",
    discipline: "B",
    riskNote: "Performs around forced flushes; idle and noisy elsewhere.",
    symbol: "BTC-USDT",
    description: "Follows liquidation cascades and rebound timing to sweep forced-flow pockets.",
    persona: "你专盯强平链式反应带来的流动性真空。没有清算波动，就不主动介入。",
    side: "LONG",
    positionValueUsd: 9022.56,
    entryPrice: 67491.3,
    tags: ["Liquidation", "Sweep", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "micro-mean-revert",
    name: "Micro Mean Revert",
    shortName: "M",
    style: "微观均值回归",
    mode: "hell",
    pnl: 3884.15,
    roi: 27.34,
    totalTrades: 412,
    winRate: "51.6%",
    discipline: "B+",
    riskNote: "Needs fee control and strict stop discipline because cadence is high.",
    symbol: "ETH-USDT",
    description: "Short-horizon micro mean reversion strategy around local dislocations and failed pushes.",
    persona: "你不赌大趋势，只吃局部失衡后的回归。小赚快走，错了更快走。",
    side: "SHORT",
    positionValueUsd: 6244.28,
    entryPrice: 3538.6,
    tags: ["Mean reversion", "ETH", "Micro"],
  }),
  buildSyntheticSeedAgent({
    id: "trend-bridge-operator",
    name: "Trend Bridge Operator",
    shortName: "B",
    style: "趋势桥接运营者",
    mode: "hell",
    pnl: 4720.19,
    roi: 33.86,
    totalTrades: 147,
    winRate: "47.8%",
    discipline: "B+",
    riskNote: "Bridge entries are smooth, but hesitation around transition zones costs edge.",
    symbol: "SOL-USDT",
    description: "Uses a bridge model between impulsive and continuation phases to reduce late entries.",
    persona: "你寻找的是趋势两段之间的桥，不在爆发后第一时间追，而在转为可持续时介入。",
    side: "LONG",
    positionValueUsd: 6888.14,
    entryPrice: 181.72,
    tags: ["Bridge", "Trend", "SOL"],
  }),
  buildSyntheticSeedAgent({
    id: "gamma-squeeze-scout",
    name: "Gamma Squeeze Scout",
    shortName: "G",
    style: "Gamma 挤压侦察兵",
    mode: "hell",
    pnl: 4371.88,
    roi: 31.46,
    totalTrades: 119,
    winRate: "46.5%",
    discipline: "B",
    riskNote: "Edge comes in bursts. Incorrect squeeze reads cause quick giveback.",
    symbol: "BTC-USDT",
    description: "Scouts convexity-driven price acceleration and joins only when expansion becomes self-reinforcing.",
    persona: "你追的是加速度，不是慢趋势。只有当价格和波动一起进入自我强化，你才愿意追击。",
    side: "LONG",
    positionValueUsd: 8610.8,
    entryPrice: 67962.45,
    tags: ["Squeeze", "Gamma", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "orderbook-absorption",
    name: "Orderbook Absorption",
    shortName: "O",
    style: "盘口吸收识别",
    mode: "hell",
    pnl: 4060.61,
    roi: 29.88,
    totalTrades: 176,
    winRate: "48.4%",
    discipline: "B+",
    riskNote: "Orderbook edge fades quickly if liquidity shifts venues too fast.",
    symbol: "ETH-USDT",
    description: "Looks for passive absorption and failed follow-through before taking directional bets.",
    persona: "你观察吸收，而不是表面成交。谁在吃单后仍然走不动，你就站到反方向。",
    side: "SHORT",
    positionValueUsd: 6118.48,
    entryPrice: 3526.95,
    tags: ["Orderbook", "Absorption", "ETH"],
  }),
  buildSyntheticSeedAgent({
    id: "funding-rotation-engine",
    name: "Funding Rotation Engine",
    shortName: "R",
    style: "资金费率轮动引擎",
    mode: "hell",
    pnl: 4598.72,
    roi: 33.05,
    totalTrades: 102,
    winRate: "49.2%",
    discipline: "B+",
    riskNote: "Better when funding spreads persist long enough for rotation to matter.",
    symbol: "BTC-USDT",
    description: "Rotates between long and short bias depending on funding crowding and trend persistence.",
    persona: "你把资金费率当风向，不把它当单独信号。只有拥挤与趋势同时失衡时，才启动轮动。",
    side: "SHORT",
    positionValueUsd: 7934.5,
    entryPrice: 68248.1,
    tags: ["Funding", "Rotation", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "breakout-retest-minister",
    name: "Breakout Retest Minister",
    shortName: "R",
    style: "突破回踩执行官",
    mode: "hell",
    pnl: 5122.45,
    roi: 36.74,
    totalTrades: 121,
    winRate: "50.8%",
    discipline: "A-",
    riskNote: "Clean setup quality, but misses straight-line moves intentionally.",
    symbol: "BTC-USDT",
    description: "Waits for breakout, then retest, then confirmation. Avoids impulse chasing by design.",
    persona: "你不在突破瞬间追单，而是等回踩确认再执行。慢一点，但结构和止损更清楚。",
    side: "LONG",
    positionValueUsd: 8562.92,
    entryPrice: 67688.3,
    tags: ["Retest", "Breakout", "BTC"],
  }),
  buildSyntheticSeedAgent({
    id: "vol-regime-switcher",
    name: "Vol Regime Switcher",
    shortName: "V",
    style: "波动率状态切换",
    mode: "live",
    pnl: 910.84,
    roi: 7.31,
    totalTrades: 44,
    winRate: "55.4%",
    discipline: "A",
    riskNote: "Operator-gated live strategy switching between calm and expansion playbooks.",
    symbol: "SOL-USDT",
    description: "Live draft engine that shifts tactics depending on volatility regime rather than staying fixed.",
    persona: "你先判断市场处于平静、扩张还是事件状态，再决定该用哪套 playbook。live 执行必须保守。",
    side: "LONG",
    positionValueUsd: 3018.24,
    entryPrice: 184.16,
    tags: ["Live", "Regime", "SOL"],
  }),
  buildSyntheticSeedAgent({
    id: "panic-bounce-engine",
    name: "Panic Bounce Engine",
    shortName: "P",
    style: "恐慌反弹引擎",
    mode: "hell",
    pnl: 4836.26,
    roi: 34.77,
    totalTrades: 133,
    winRate: "47.4%",
    discipline: "B",
    riskNote: "Catches snapback rallies well, but wrong if panic turns into structural trend.",
    symbol: "BTC-USDT",
    description: "Targets oversold panic flushes and trades the first meaningful rebound with fast risk compression.",
    persona: "你不抄任意下跌，只抄极端恐慌后的第一脚有效反弹。真正的趋势崩塌，不会在这里死扛。",
    side: "LONG",
    positionValueUsd: 7740.9,
    entryPrice: 67384.72,
    tags: ["Panic", "Bounce", "BTC"],
  }),
];

const seedArenaAgentDefs: ArenaAgentCore[] = [...officialSeedAgentDefs];

export const seedArenaAgents: ArenaAgent[] = seedArenaAgentDefs.map((agent) =>
  enrichArenaAgent(agent, "seed"),
);

export const seedWatchItems: WatchItem[] = [
  {
    id: "watch-1",
    name: "Range Break Scribe",
    note: "Ready for shadow promotion",
    focus: "BTC and ETH range expansion with low turnover.",
  },
  {
    id: "watch-2",
    name: "Supertrend Clerk",
    note: "Needs stricter stop discipline",
    focus: "Trend continuation on majors with manual-confirm workflow.",
  },
  {
    id: "watch-3",
    name: "News Pulse Scout",
    note: "Signal quality good, cadence too high",
    focus: "Headline-driven draft generation for event spikes.",
  },
];

export function getArenaAgents(mode?: ArenaMode) {
  const source = mode
    ? seedArenaAgents.filter((agent) => agent.mode === mode)
    : seedArenaAgents;

  return [...source].sort((left, right) => right.pnl - left.pnl);
}

export function getArenaAgent(agentId: string) {
  return seedArenaAgents.find((agent) => agent.id === agentId) ?? null;
}

export function getArenaSummary(mode?: ArenaMode): ArenaSummary {
  const agents = getArenaAgents(mode);
  const averageRoi =
    agents.reduce((sum, agent) => sum + agent.roi, 0) / Math.max(agents.length, 1);

  const averageDrawdown =
    agents.reduce((sum, agent) => sum + agent.portfolio.maxDrawdownPct, 0) /
    Math.max(agents.length, 1);

  const averageStability =
    agents.reduce((sum, agent) => sum + agent.scorecard.stabilityScore, 0) /
    Math.max(agents.length, 1);

  const averageRiskAdjusted =
    agents.reduce((sum, agent) => sum + agent.scorecard.riskAdjustedReturn, 0) /
    Math.max(agents.length, 1);

  return {
    mode: mode ?? "all",
    count: agents.length,
    averageRoi: Number(averageRoi.toFixed(2)),
    averageDrawdown: Number(averageDrawdown.toFixed(2)),
    averageStability: Number(averageStability.toFixed(2)),
    averageRiskAdjusted: Number(averageRiskAdjusted.toFixed(2)),
    source: "simulation" as ArenaComputedSource,
    label: mode
      ? mode === "hell"
        ? "Backtesting arena pressure from a shared historical environment."
        : "Live draft-first operators running in the current market context."
      : "Unified arena board of submitted and official agents.",
  };
}

export type ArenaHydratedPayload = {
  mode: ArenaBoardMode;
  leaderboard: ArenaAgent[];
  watchlist: WatchItem[];
  summary: ArenaSummary;
  skills: ArenaSkillPhase[];
  integration: ArenaIntegrationState;
};

export type ArenaAgentHydratedPayload = {
  agent: ArenaAgent;
  skills: ArenaSkillPhase[];
  integration: ArenaIntegrationState;
};

export function withArenaLiveState(
  agent: ArenaAgent,
  overrides: Partial<Pick<ArenaAgent, "market" | "portfolio" | "positions">>,
): ArenaAgent {
  const nextAgent = {
    ...agent,
    ...overrides,
  };

  const core = {
    id: nextAgent.id,
    name: nextAgent.name,
    shortName: nextAgent.shortName,
    style: nextAgent.style,
    mode: nextAgent.mode,
    status: nextAgent.status,
    pnl: nextAgent.pnl,
    roi: nextAgent.roi,
    description: nextAgent.description,
    creator: nextAgent.creator,
    followers: nextAgent.followers,
    blowups: nextAgent.blowups,
    totalTrades: nextAgent.totalTrades,
    winRate: nextAgent.winRate,
    discipline: nextAgent.discipline,
    riskNote: nextAgent.riskNote,
    symbol: nextAgent.symbol,
    persona: nextAgent.persona,
    positions: nextAgent.positions,
    curve: nextAgent.curve,
    tags: nextAgent.tags,
    localOnly: nextAgent.localOnly,
  } satisfies ArenaAgentCore;

  const promotion = buildPromotionSnapshot(core, nextAgent.portfolio);

  return {
    ...nextAgent,
    promotion,
    scorecard: buildArenaScorecard(core, nextAgent.portfolio, promotion),
    leaderboardSource: nextAgent.leaderboardSource ?? "simulation",
  };
}
