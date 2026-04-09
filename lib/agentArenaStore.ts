import { promises as fs } from "fs";
import path from "path";
import {
  type ArenaAgent,
  type ArenaAgentCore,
  enrichArenaAgent,
} from "@/lib/agentArena";
import { deleteArenaRunnerRuntime } from "@/lib/agentArenaRuntimeStore";

export type ArenaSubmissionDirection = "long" | "short" | "both";
export type ArenaSubmissionLeverage = "conservative" | "balanced" | "aggressive";

export type ArenaSubmissionInput = {
  pairCode: string;
  name: string;
  creator: string;
  symbol: string;
  timeframe: string;
  direction: ArenaSubmissionDirection;
  leveragePreference: ArenaSubmissionLeverage;
  weeklyEvolution: boolean;
  strategyBrief: string;
  persona?: string;
};

export type ArenaRuntimeEvent = {
  id: string;
  type: "registration" | "review" | "demo-order";
  status: "pending" | "success" | "failed";
  title: string;
  note: string;
  timestamp: string;
  orderId?: string;
};

export type StoredArenaAgent = {
  agent: ArenaAgent;
  submission: ArenaSubmissionInput;
  runtime: {
    createdAt: string;
    updatedAt: string;
    reviewCount: number;
    demoOrderCount: number;
    lastReviewAt?: string;
    lastDemoOrderAt?: string;
    events: ArenaRuntimeEvent[];
  };
};

type ArenaStoreShape = {
  agents: StoredArenaAgent[];
};

const STORE_DIR = path.join(process.cwd(), "data", "fight-club");
const STORE_FILE = path.join(STORE_DIR, "agents.json");

function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "arena-agent";
}

function toTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/\s+/g, "");
}

function summarizeBrief(value: string, max = 140) {
  const clean = value.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function disciplineFromLeverage(leveragePreference: ArenaSubmissionLeverage) {
  switch (leveragePreference) {
    case "conservative":
      return "A";
    case "aggressive":
      return "B-";
    default:
      return "B+";
  }
}

function leverageCapFromPreference(leveragePreference: ArenaSubmissionLeverage) {
  switch (leveragePreference) {
    case "conservative":
      return "2x-3x";
    case "aggressive":
      return "6x-8x";
    default:
      return "4x-5x";
  }
}

function buildCurve(finalPnl: number, seed: number) {
  const points = 16;
  const curve: number[] = [];
  const direction = finalPnl >= 0 ? 1 : -1;

  for (let index = 0; index < points; index += 1) {
    const progress = index / (points - 1);
    const noise = (((seed >> (index % 8)) & 7) - 3) * Math.max(Math.abs(finalPnl) * 0.018, 18);
    const base = finalPnl * progress;
    const value = index === 0 ? 0 : Math.round(base + noise * (1 - progress * 0.35));
    curve.push(direction >= 0 ? Math.max(0, value) : value);
  }

  curve[0] = 0;
  curve[curve.length - 1] = Math.round(finalPnl);
  return curve;
}

function createRuntimeEvent(
  event: Omit<ArenaRuntimeEvent, "id" | "timestamp">,
): ArenaRuntimeEvent {
  return {
    id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...event,
  };
}

async function ensureStore() {
  await fs.mkdir(STORE_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    const initial: ArenaStoreShape = { agents: [] };
    await fs.writeFile(STORE_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<ArenaStoreShape> {
  await ensureStore();
  const raw = await fs.readFile(STORE_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as ArenaStoreShape;
    return {
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
    };
  } catch {
    return { agents: [] };
  }
}

async function writeStore(store: ArenaStoreShape) {
  await ensureStore();
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

function deriveBaseAgent(input: ArenaSubmissionInput): ArenaAgentCore {
  const symbol = normalizeSymbol(input.symbol);
  const directionLabel =
    input.direction === "both"
      ? "Bi-directional"
      : input.direction === "long"
        ? "Long-bias"
        : "Short-bias";
  const shortName = input.name.trim().charAt(0).toUpperCase() || "A";
  const persona =
    input.persona?.trim() ||
    `You are ${input.name.trim()}. Trade ${symbol} on the ${input.timeframe} timeframe with a ${directionLabel.toLowerCase()} mandate, ${input.leveragePreference} leverage, and strict respect for invalidation before expansion.`;

  return {
    id: `${slugify(input.name)}-${stableHash(`${input.pairCode}:${input.name}`).toString(36).slice(0, 6)}`,
    name: input.name.trim(),
    shortName,
    style: `${directionLabel} ${input.timeframe} ${symbol} operator`,
    mode: "hell",
    status: "Submitted",
    pnl: 0,
    roi: 0,
    description: summarizeBrief(input.strategyBrief, 120),
    creator: input.creator.trim() || "Arena Submitter",
    followers: "private",
    blowups: 0,
    totalTrades: 0,
    winRate: "0.0%",
    discipline: disciplineFromLeverage(input.leveragePreference),
    riskNote: `${toTitleCase(input.leveragePreference)} leverage requested. Keep exposure inside ${leverageCapFromPreference(input.leveragePreference)} and revalidate on every new regime shift.`,
    symbol,
    persona,
    positions: [],
    curve: [0, 12, 18, 24, 28, 32, 36, 40],
    tags: [
      symbol.split("-")[0],
      input.timeframe.toUpperCase(),
      input.direction === "both" ? "Two-way" : input.direction === "long" ? "Long" : "Short",
      input.weeklyEvolution ? "Weekly evolve" : "Static rules",
    ],
    localOnly: true,
  };
}

export async function listStoredArenaAgents() {
  const store = await readStore();
  return store.agents;
}

export async function getStoredArenaAgent(agentId: string) {
  const store = await readStore();
  return store.agents.find((item) => item.agent.id === agentId) ?? null;
}

export async function createStoredArenaAgent(input: ArenaSubmissionInput) {
  const store = await readStore();
  const base = deriveBaseAgent(input);

  if (store.agents.some((item) => item.agent.id === base.id)) {
    throw new Error("An agent with the same generated id already exists. Change the name or pair code.");
  }

  const agent = enrichArenaAgent(base, "local");
  const now = new Date().toISOString();
  const stored: StoredArenaAgent = {
    agent,
    submission: {
      ...input,
      symbol: normalizeSymbol(input.symbol),
      name: input.name.trim(),
      creator: input.creator.trim(),
      strategyBrief: input.strategyBrief.trim(),
      persona: input.persona?.trim(),
    },
    runtime: {
      createdAt: now,
      updatedAt: now,
      reviewCount: 0,
      demoOrderCount: 0,
      events: [
        createRuntimeEvent({
          type: "registration",
          status: "success",
          title: "Agent submitted to Arena",
          note: `Pair code ${input.pairCode} was registered and the agent is now visible in Arena immediately.`,
        }),
      ],
    },
  };

  store.agents.unshift(stored);
  await writeStore(store);
  return stored;
}

export async function deleteStoredArenaAgent(agentId: string) {
  const store = await readStore();
  const nextAgents = store.agents.filter((item) => item.agent.id !== agentId);
  const deleted = nextAgents.length !== store.agents.length;
  if (deleted) {
    await writeStore({ agents: nextAgents });
    await deleteArenaRunnerRuntime(agentId);
  }
  return deleted;
}

export async function runStoredArenaReview(agentId: string) {
  const store = await readStore();
  const index = store.agents.findIndex((item) => item.agent.id === agentId);
  if (index === -1) {
    throw new Error("Stored arena agent not found.");
  }

  const current = store.agents[index];
  const seed = stableHash(
    `${current.submission.strategyBrief}:${current.submission.symbol}:${current.submission.timeframe}:${current.submission.direction}:${current.submission.leveragePreference}:${current.submission.weeklyEvolution}`,
  );
  const leveragePenalty =
    current.submission.leveragePreference === "aggressive"
      ? 9
      : current.submission.leveragePreference === "balanced"
        ? 4
        : 0;
  const evolutionBoost = current.submission.weeklyEvolution ? 5 : 0;
  const directionBoost = current.submission.direction === "both" ? 4 : 0;
  const roi = clamp(14 + (seed % 34) + evolutionBoost + directionBoost - leveragePenalty, 6, 58);
  const totalTrades = 72 + (seed % 160);
  const winRate = clamp(41 + (seed % 18) - Math.round(leveragePenalty * 0.4), 36, 68);
  const blowups =
    current.submission.leveragePreference === "aggressive"
      ? seed % 2
      : current.submission.leveragePreference === "balanced"
        ? 0
        : 0;
  const pnl = Number((roi * (88 + (seed % 42))).toFixed(2));
  const discipline =
    current.submission.leveragePreference === "aggressive"
      ? blowups > 0
        ? "C+"
        : "B"
      : current.submission.leveragePreference === "balanced"
        ? "B+"
        : "A";

  const nextCore: ArenaAgentCore = {
    ...deriveBaseAgent(current.submission),
    id: current.agent.id,
    status: "Reviewed",
    pnl,
    roi,
    totalTrades,
    blowups,
    winRate: `${winRate.toFixed(1)}%`,
    discipline,
    curve: buildCurve(pnl, seed),
  };

  const nextAgent = enrichArenaAgent(nextCore, "local");
  const reviewedAt = new Date().toISOString();
  const nextStored: StoredArenaAgent = {
    ...current,
    agent: nextAgent,
    runtime: {
      ...current.runtime,
      updatedAt: reviewedAt,
      lastReviewAt: reviewedAt,
      reviewCount: current.runtime.reviewCount + 1,
      events: [
        createRuntimeEvent({
          type: "review",
          status: "success",
          title: "Arena metrics refreshed",
          note: `${nextAgent.symbol} metrics were refreshed on ${current.submission.timeframe}. ROI ${nextAgent.roi.toFixed(2)}%, stability ${nextAgent.scorecard.stabilityScore}, risk-adjusted ${nextAgent.scorecard.riskAdjustedReturn.toFixed(2)}.`,
        }),
        ...current.runtime.events,
      ].slice(0, 20),
    },
  };

  store.agents[index] = nextStored;
  await writeStore(store);
  return nextStored;
}

export async function recordStoredArenaDemoOrder(
  agentId: string,
  result: {
    ok: boolean;
    note: string;
    orderId?: string;
  },
) {
  const store = await readStore();
  const index = store.agents.findIndex((item) => item.agent.id === agentId);
  if (index === -1) {
    throw new Error("Stored arena agent not found.");
  }

  const current = store.agents[index];
  const now = new Date().toISOString();
  const nextCore: ArenaAgentCore = {
    ...deriveBaseAgent(current.submission),
    id: current.agent.id,
    status: result.ok ? "Live" : current.agent.status,
    mode: result.ok ? "live" : current.agent.mode,
    pnl: current.agent.pnl,
    roi: current.agent.roi,
    description: current.agent.description,
    creator: current.agent.creator,
    followers: current.agent.followers,
    blowups: current.agent.blowups,
    totalTrades: current.agent.totalTrades + (result.ok ? 1 : 0),
    winRate: current.agent.winRate,
    discipline: current.agent.discipline,
    riskNote: current.agent.riskNote,
    symbol: current.agent.symbol,
    persona: current.agent.persona,
    positions: current.agent.positions,
    curve: current.agent.curve,
    tags: current.agent.tags,
    localOnly: true,
  };
  const nextAgent = enrichArenaAgent(nextCore, "local");

  const nextStored: StoredArenaAgent = {
    ...current,
    agent: nextAgent,
    runtime: {
      ...current.runtime,
      updatedAt: now,
      lastDemoOrderAt: result.ok ? now : current.runtime.lastDemoOrderAt,
      demoOrderCount: current.runtime.demoOrderCount + (result.ok ? 1 : 0),
      events: [
        createRuntimeEvent({
          type: "demo-order",
          status: result.ok ? "success" : "failed",
          title: result.ok ? "Order event recorded" : "Order submission failed",
          note: result.note,
          orderId: result.orderId,
        }),
        ...current.runtime.events,
      ].slice(0, 20),
    },
  };

  store.agents[index] = nextStored;
  await writeStore(store);
  return nextStored;
}
