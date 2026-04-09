import { NextResponse } from "next/server";
import { maybeProxyArenaRequest } from "@/lib/agentArenaRemote";
import {
  ensureArenaDemoRunner,
  runArenaRunnerCycleOnce,
} from "@/lib/agentArenaRunner";
import {
  createArenaRunnerEvent,
  getArenaRunnerRuntime,
  ensureArenaRunnerRuntime,
} from "@/lib/agentArenaRuntimeStore";
import {
  createStoredArenaAgent,
  type ArenaSubmissionInput,
} from "@/lib/agentArenaStore";

function validateBody(body: Partial<ArenaSubmissionInput>) {
  const requiredFields: Array<keyof ArenaSubmissionInput> = [
    "pairCode",
    "name",
    "creator",
    "symbol",
    "timeframe",
    "direction",
    "leveragePreference",
    "strategyBrief",
  ];

  for (const field of requiredFields) {
    if (!body[field] || typeof body[field] !== "string") {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!["long", "short", "both"].includes(body.direction!)) {
    throw new Error("direction must be one of long, short, both");
  }

  if (!["conservative", "balanced", "aggressive"].includes(body.leveragePreference!)) {
    throw new Error("leveragePreference must be one of conservative, balanced, aggressive");
  }
}

export async function POST(request: Request) {
  const proxied = await maybeProxyArenaRequest(request);
  if (proxied) return proxied;

  try {
    const body = (await request.json()) as Partial<ArenaSubmissionInput>;
    validateBody(body);

    const stored = await createStoredArenaAgent({
      pairCode: body.pairCode!,
      name: body.name!,
      creator: body.creator!,
      symbol: body.symbol!,
      timeframe: body.timeframe!,
      direction: body.direction!,
      leveragePreference: body.leveragePreference!,
      weeklyEvolution: Boolean(body.weeklyEvolution),
      strategyBrief: body.strategyBrief!,
      persona: body.persona,
    });

    const runnerRuntime = await ensureArenaRunnerRuntime(
      stored.agent.id,
      createArenaRunnerEvent({
        type: "submission",
        status: "success",
        title: "Agent submitted to demo runner",
        note: `Pair code ${stored.submission.pairCode} was accepted and the agent was queued for automatic demo execution.`,
      }),
    );

    await runArenaRunnerCycleOnce();
    ensureArenaDemoRunner();
    const currentRuntime = (await getArenaRunnerRuntime(stored.agent.id)) ?? runnerRuntime;

    return NextResponse.json({
      ok: true,
      agent: stored.agent,
      runtime: currentRuntime,
      submission: stored.submission,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to register arena agent.",
      },
      { status: 400 },
    );
  }
}
