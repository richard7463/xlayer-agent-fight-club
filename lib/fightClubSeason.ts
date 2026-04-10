export type FightClubStrategyId = "atr-breakout" | "micro-mean-revert";

export type FightClubSeasonFighter = {
  id: string;
  label: string;
  symbol: string;
  timeframe: "15m" | "1H";
  direction: "long";
  strategy: FightClubStrategyId;
  tradeTokenSymbol: string;
  tradeTokenAddress: string;
  tradeTokenDecimals: number;
  maxQuoteFraction: number;
  maxQuoteUsd: number;
  minQuoteBalanceUsd: number;
  stopLossPct: number;
  takeProfitPct: number;
  cooldownMs: number;
  maxHoldMs: number;
};

const DEFAULT_FIGHTERS: FightClubSeasonFighter[] = [
  {
    id: "atr-breakout-engine",
    label: "ATR Breakout Engine",
    symbol: "OKB-USDT",
    timeframe: "15m",
    direction: "long",
    strategy: "atr-breakout",
    tradeTokenSymbol: "OKB",
    tradeTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    tradeTokenDecimals: 18,
    maxQuoteFraction: 0.08,
    maxQuoteUsd: 0.25,
    minQuoteBalanceUsd: 0.6,
    stopLossPct: -0.45,
    takeProfitPct: 0.55,
    cooldownMs: 8 * 60 * 1000,
    maxHoldMs: 25 * 60 * 1000,
  },
  {
    id: "micro-mean-revert",
    label: "Micro Mean Revert",
    symbol: "OKB-USDT",
    timeframe: "1H",
    direction: "long",
    strategy: "micro-mean-revert",
    tradeTokenSymbol: "OKB",
    tradeTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    tradeTokenDecimals: 18,
    maxQuoteFraction: 0.07,
    maxQuoteUsd: 0.20,
    minQuoteBalanceUsd: 0.5,
    stopLossPct: -0.35,
    takeProfitPct: 0.40,
    cooldownMs: 6 * 60 * 1000,
    maxHoldMs: 18 * 60 * 1000,
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
