export type FightClubStrategyId = "atr-breakout" | "micro-mean-revert";

export type FightClubSeasonFighter = {
  id: string;
  label: string;
  symbol: string;
  timeframe: "15m" | "1H";
  direction: "long";
  strategy: FightClubStrategyId;
  maxQuoteFraction: number;
  maxQuoteUsd: number;
  minQuoteBalanceUsd: number;
  stopLossPct: number;
  takeProfitPct: number;
  cooldownMs: number;
};

const DEFAULT_FIGHTERS: FightClubSeasonFighter[] = [
  {
    id: "atr-breakout-engine",
    label: "ATR Breakout Engine",
    symbol: "BTC-USDT",
    timeframe: "15m",
    direction: "long",
    strategy: "atr-breakout",
    maxQuoteFraction: 0.22,
    maxQuoteUsd: 45,
    minQuoteBalanceUsd: 24,
    stopLossPct: -0.7,
    takeProfitPct: 1.1,
    cooldownMs: 60 * 1000,
  },
  {
    id: "micro-mean-revert",
    label: "Micro Mean Revert",
    symbol: "ETH-USDT",
    timeframe: "15m",
    direction: "long",
    strategy: "micro-mean-revert",
    maxQuoteFraction: 0.16,
    maxQuoteUsd: 30,
    minQuoteBalanceUsd: 18,
    stopLossPct: -0.55,
    takeProfitPct: 0.85,
    cooldownMs: 45 * 1000,
  },
];

function parseActiveIds() {
  const raw = process.env.FIGHT_CLUB_ACTIVE_FIGHTERS?.trim();
  if (!raw) {
    return DEFAULT_FIGHTERS.map((fighter) => fighter.id);
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getFightClubSeasonFighters() {
  const activeIds = new Set(parseActiveIds());
  return DEFAULT_FIGHTERS.filter((fighter) => activeIds.has(fighter.id));
}

export function getFightClubSeasonFighter(agentId: string) {
  return getFightClubSeasonFighters().find((fighter) => fighter.id === agentId) ?? null;
}

export function isFightClubSeasonFighter(agentId: string) {
  return getFightClubSeasonFighters().some((fighter) => fighter.id === agentId);
}

export function getFightClubSkillSurface() {
  return [
    "okx-agentic-wallet",
    "okx-dex-swap",
    "okx-dex-market",
    "okx-wallet-portfolio",
    "moltbook.posts",
    "moltbook.comments",
    "moltbook.heartbeat",
  ];
}
