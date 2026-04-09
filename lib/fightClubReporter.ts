import { promises as fs } from "fs";
import path from "path";
import type { ArenaAgent } from "./agentArena";
import type { ArenaRunnerRuntime } from "./agentArenaRuntimeStore";
import { getFightClubSeasonFighters, getFightClubSkillSurface } from "./fightClubSeason";
import { readFightClubLiveProof } from "./fightClubLiveProof";
import { MoltbookClient } from "./moltbookClient";

type ReporterEntry = {
  agent: ArenaAgent;
  runtime: ArenaRunnerRuntime;
};

type ReporterState = {
  totalPosts: number;
  lastPostedAt?: string;
  lastPostId?: string;
  lastReportedOrders: number;
  lastReportedFills: number;
};

const REPORT_STATE_PATH = path.join(process.cwd(), "data", "fight-club", "moltbook-reporting.json");

function defaultState(): ReporterState {
  return {
    totalPosts: 0,
    lastReportedOrders: 0,
    lastReportedFills: 0,
  };
}

async function readState() {
  try {
    const raw = await fs.readFile(REPORT_STATE_PATH, "utf8");
    return { ...defaultState(), ...(JSON.parse(raw) as Partial<ReporterState>) };
  } catch {
    return defaultState();
  }
}

async function writeState(state: ReporterState) {
  await fs.mkdir(path.dirname(REPORT_STATE_PATH), { recursive: true });
  await fs.writeFile(REPORT_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function asDollar(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function pct(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function buildTitle(entries: ReporterEntry[], totals: { orders: number; fills: number }, totalPosts: number) {
  if (totalPosts === 0) {
    return `Agent Fight Club Season 1 armed: ${entries.map((entry) => entry.agent.shortName).join(" vs ")}`;
  }

  const leader = [...entries].sort((left, right) => right.runtime.totalPnlUsd - left.runtime.totalPnlUsd)[0];
  return `Agent Fight Club live report: ${totals.fills} fills | leader ${leader.agent.name}`;
}

async function buildContent(entries: ReporterEntry[], totals: { orders: number; fills: number }) {
  const fighters = entries
    .map((entry, index) => {
      const lastNote = entry.runtime.lastActionNote || "waiting for the next signal";
      return [
        `${index + 1}. ${entry.agent.name} (${entry.agent.symbol})`,
        `   Strategy: ${entry.agent.style}`,
        `   Orders/Fills: ${entry.runtime.totalOrders}/${entry.runtime.totalFills}`,
        `   PnL: ${asDollar(entry.runtime.totalPnlUsd)} | ROI: ${pct(entry.agent.roi)} | Drawdown: ${entry.runtime.maxDrawdownPct.toFixed(2)}%`,
        `   Last action: ${entry.runtime.lastAction || "hold"} — ${lastNote}`,
      ].join("\n");
    })
    .join("\n\n");

  const skills = getFightClubSkillSurface().join(", ");
  const season = getFightClubSeasonFighters()
    .map((fighter) => `${fighter.label}=${fighter.strategy}`)
    .join(" | ");
  const liveProof = await readFightClubLiveProof();
  const liveProofLines = liveProof
    ? [
        "Live onchain proof",
        `- Wallet: ${liveProof.walletAddress}`,
        `- Network: ${liveProof.network}`,
        `- Real swaps recorded: ${liveProof.totalTransactions}`,
        ...liveProof.transactions.slice(0, 4).map((tx) => {
          const approve = tx.approveTxHash ? ` | approve ${tx.approveTxHash}` : "";
          return `- ${tx.fighterName}: ${tx.fromAmount} ${tx.fromSymbol} -> ${tx.toAmount} ${tx.toSymbol} | swap ${tx.swapTxHash}${approve}`;
        }),
        "",
      ]
    : [];

  return [
    "Agent Fight Club Season 1 runtime report",
    "",
    `Season format: ${season}`,
    `Total orders: ${totals.orders}`,
    `Total fills: ${totals.fills}`,
    "",
    "Current fighters",
    fighters,
    "",
    "Skill surface in production",
    `- ${skills}`,
    "",
    ...liveProofLines,
    "Why this matters",
    "- Agent Fight Club is using a shared runtime to compare two live fighter styles, not just a static board.",
    "- The current season now has direct Agentic Wallet execution on X Layer, not just simulated board updates.",
    "- Moltbook is being used as the public battle log for wallet state, fighter actions, and transaction proof.",
    "",
    `Repo: ${process.env.FIGHT_CLUB_REPO_URL || "https://github.com/richard7463/xlayer-agent-fight-club"}`,
  ].join("\n");
}

export async function maybePostFightClubSeasonUpdate(entries: ReporterEntry[]) {
  const client = new MoltbookClient();
  if (!client.isConfigured || process.env.FIGHT_CLUB_MOLTBOOK_REPORTS === "false") {
    return { ok: false, skipped: true, note: "Moltbook reporting is disabled or not configured." };
  }

  const state = await readState();
  const totals = entries.reduce(
    (acc, entry) => {
      acc.orders += entry.runtime.totalOrders;
      acc.fills += entry.runtime.totalFills;
      return acc;
    },
    { orders: 0, fills: 0 },
  );

  const intervalMs = Number(process.env.FIGHT_CLUB_MOLTBOOK_POST_INTERVAL_SEC || "600") * 1000;
  const lastPostedAt = state.lastPostedAt ? new Date(state.lastPostedAt).getTime() : 0;
  const hasNewActivity =
    totals.orders > state.lastReportedOrders || totals.fills > state.lastReportedFills;

  if (!hasNewActivity && state.totalPosts > 0) {
    return { ok: false, skipped: true, note: "No new orders or fills since the last Moltbook report." };
  }

  if (lastPostedAt && Date.now() - lastPostedAt < intervalMs) {
    return { ok: false, skipped: true, note: "Moltbook reporting cooldown is still active." };
  }

  const result = await client.createPost({
    title: buildTitle(entries, totals, state.totalPosts),
    content: await buildContent(entries, totals),
    submolt: process.env.MOLTBOOK_SUBMOLT || "buildx",
  });

  if (!result.ok) {
    return result;
  }

  const nextState: ReporterState = {
    totalPosts: state.totalPosts + 1,
    lastPostedAt: new Date().toISOString(),
    lastPostId: result.postId,
    lastReportedOrders: totals.orders,
    lastReportedFills: totals.fills,
  };
  await writeState(nextState);

  return {
    ...result,
    state: nextState,
  };
}
