import { promises as fs } from "fs";
import path from "path";
import type { ArenaAgent } from "@/lib/agentArena";

type ArenaFollowStore = {
  followingAgentIds: string[];
};

const STORE_DIR = path.join(process.cwd(), "data", "fight-club");
const STORE_FILE = path.join(STORE_DIR, "follows.json");

function parseFollowerCount(label: string) {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return 0;

  const numberMatch = normalized.match(/([\d.]+)/);
  if (!numberMatch) return 0;
  const value = Number(numberMatch[1]);
  if (!Number.isFinite(value)) return 0;

  if (normalized.includes("k")) return Math.round(value * 1000);
  if (normalized.includes("m")) return Math.round(value * 1000000);
  return Math.round(value);
}

function formatFollowerLabel(count: number) {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1).replace(/\.0$/, "")}m followers`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k followers`;
  }
  return `${count} follower${count === 1 ? "" : "s"}`;
}

async function ensureStore() {
  await fs.mkdir(STORE_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    const initial: ArenaFollowStore = { followingAgentIds: [] };
    await fs.writeFile(STORE_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<ArenaFollowStore> {
  await ensureStore();
  const raw = await fs.readFile(STORE_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<ArenaFollowStore>;
    return {
      followingAgentIds: Array.isArray(parsed.followingAgentIds)
        ? parsed.followingAgentIds.filter((value): value is string => typeof value === "string")
        : [],
    };
  } catch {
    return { followingAgentIds: [] };
  }
}

async function writeStore(store: ArenaFollowStore) {
  await ensureStore();
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

export async function listFollowedAgentIds() {
  const store = await readStore();
  return store.followingAgentIds;
}

export async function isFollowingAgent(agentId: string) {
  const store = await readStore();
  return store.followingAgentIds.includes(agentId);
}

export async function followAgent(agentId: string) {
  const store = await readStore();
  if (!store.followingAgentIds.includes(agentId)) {
    store.followingAgentIds.unshift(agentId);
    await writeStore(store);
  }
  return true;
}

export async function unfollowAgent(agentId: string) {
  const store = await readStore();
  const next = store.followingAgentIds.filter((id) => id !== agentId);
  const changed = next.length !== store.followingAgentIds.length;
  if (changed) {
    await writeStore({
      followingAgentIds: next,
    });
  }
  return changed;
}

export function applyFollowState(agent: ArenaAgent, followingIds: string[]): ArenaAgent {
  const isFollowing = followingIds.includes(agent.id);
  const baseCount = parseFollowerCount(agent.followers);
  const nextCount = agent.localOnly ? Number(isFollowing) : baseCount + Number(isFollowing);

  return {
    ...agent,
    followers: formatFollowerLabel(nextCount),
    followerCount: nextCount,
    following: isFollowing,
  };
}
