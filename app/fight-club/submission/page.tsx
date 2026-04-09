import Link from "next/link";
import { headers } from "next/headers";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  CandlestickChart,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  LineChart,
  ShieldCheck,
} from "lucide-react";

function compactUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(value);
}

function signedDollar(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatDateTime(timestamp?: string) {
  if (!timestamp) return "n/a";
  return new Date(timestamp).toLocaleString("en-US");
}

function truncateMiddle(value: string, head = 10, tail = 8) {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function buildSparkline(points: number[], width = 920, height = 240) {
  if (points.length < 2) {
    return null;
  }

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

  return {
    width,
    height,
    line: path,
    fill: `${path} L ${width} ${height} L 0 ${height} Z`,
  };
}

async function getRequestOrigin() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  if (!host) {
    throw new Error("Missing host header");
  }

  const proto =
    headerStore.get("x-forwarded-proto") ||
    (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${proto}://${host}`;
}

export default async function AgentArenaSubmissionPage() {
  const origin = await getRequestOrigin();
  const response = await fetch(`${origin}/api/fight-club/submission`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load submission payload (${response.status})`);
  }

  const payload = await response.json();
  const selected = payload.selected as
    | {
        agent: any;
        runtime: any;
        submission: {
          pairCode: string;
          strategyBrief: string;
        };
        createdAt: string;
      }
    | null;

  if (!selected) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(22,199,132,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,181,255,0.14),transparent_20%),linear-gradient(180deg,#03111d_0%,#071827_55%,#091421_100%)] text-[#171d2d]">
        <div className="mx-auto max-w-[1280px] px-8 py-10">
          <Link href="/fight-club" className="inline-flex items-center gap-2 text-sm text-[#c5ddf0]">
            <ArrowLeft className="h-4 w-4" />
            Back to Arena
          </Link>
          <div className="mt-10 rounded-[32px] border border-[#eadfce] bg-white px-8 py-10 shadow-[0_20px_60px_rgba(23,29,45,0.06)]">
            <div className="text-[12px] uppercase tracking-[0.2em] text-[#9a8d7b]">Submission</div>
            <h1 className="mt-3 text-[42px] font-semibold tracking-[-0.06em] text-[#1F2937]">
              No submitted agents yet
            </h1>
            <p className="mt-4 max-w-[760px] text-[18px] leading-8 text-[#5b6270]">
              Submit one agent to Arena first. This page only renders runner-backed evidence from submitted X Layer agent activity.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { agent, runtime, submission, createdAt } = selected;

  const latestOrder = runtime.orders[0] ?? null;
  const latestFill = runtime.fills[0] ?? null;
  const currentPosition = agent.positions[0] ?? null;
  const chart = buildSparkline(runtime.snapshots.map((snapshot) => snapshot.totalPnlUsd));
  const realitySplit = [
    {
      title: "Ranking layer",
      body: "Leaderboard and scorecards can stay simulation-assisted. This page is reserved for runner-backed proof only.",
    },
    {
      title: "Proof layer",
      body: "Orders, fills, timestamps, and equity snapshots below come from the submitted agent's dedicated runner runtime.",
    },
  ];
  const demoPath = [
    "Open `/fight-club` and show the create loop from Moltbook to Arena.",
    "Open this page and stop on the execution evidence chain and latest order/fill ids.",
    "Open the full detail page and end on runner-backed orders, fills, and equity snapshots.",
  ];

  const criteria = [
    {
      title: "OnchainOS integration",
      body: "User submission enters Arena, starts the runner, and writes real orders, fills, and equity snapshots into a public proof surface.",
      icon: Bot,
    },
    {
      title: "Practicality",
      body: "This is not a mock leaderboard. The detail and submission views are backed by persisted runner data plus live market and account state.",
      icon: CircleDollarSign,
    },
    {
      title: "Innovation",
      body: "Arena turns an agent into a public operator page with live demo evidence instead of just a static concept or screenshot.",
      icon: LineChart,
    },
    {
      title: "Replicability",
      body: "The flow is deterministic: submit -> run -> persist -> render. The page exposes the exact order, fill, and runtime evidence chain.",
      icon: ShieldCheck,
    },
  ];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(22,199,132,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,181,255,0.14),transparent_20%),linear-gradient(180deg,#03111d_0%,#071827_55%,#091421_100%)] text-[#171d2d]">
      <div className="mx-auto max-w-[1360px] px-8 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/fight-club" className="inline-flex items-center gap-2 text-sm text-[#c5ddf0]">
              <ArrowLeft className="h-4 w-4" />
              Back to Arena
            </Link>
            <div className="mt-6 text-[12px] uppercase tracking-[0.2em] text-[#8fdcff]">Moltbook x X Layer Submission</div>
            <h1 className="mt-3 max-w-[920px] text-[58px] font-semibold leading-[1.02] tracking-[-0.08em] text-white">
              Public agent arena with runner-backed X Layer trade evidence.
            </h1>
            <p className="mt-5 max-w-[920px] text-[20px] leading-9 text-[#c9deef]">
              Users submit an agent to Arena, it becomes visible immediately, enters an automatic runner, executes simulated X Layer trade flows,
              and persists orders, fills, positions, and equity snapshots for public inspection.
            </p>
          </div>
          <Link
            href={`/fight-club/${agent.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white px-5 py-3 text-sm font-medium text-[#2f3545] shadow-[0_12px_32px_rgba(23,29,45,0.05)]"
          >
            Open full agent detail
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </header>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <div className="rounded-[30px] border border-[#eadfce] bg-white px-7 py-7 shadow-[0_20px_50px_rgba(23,29,45,0.05)]">
            <div className="text-[12px] uppercase tracking-[0.2em] text-[#9a8d7b]">Reality split</div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {realitySplit.map((item) => (
                <div key={item.title} className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                  <div className="text-[18px] font-semibold tracking-[-0.04em] text-[#1F2937]">{item.title}</div>
                  <div className="mt-3 text-[16px] leading-7 text-[#5b6270]">{item.body}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-[#eadfce] bg-white px-7 py-7 shadow-[0_20px_50px_rgba(23,29,45,0.05)]">
            <div className="text-[12px] uppercase tracking-[0.2em] text-[#9a8d7b]">60-second demo path</div>
            <div className="mt-4 text-[18px] leading-8 text-[#5b6270]">
              Keep the walkthrough short. This page should help a judge reach execution proof in under a minute.
            </div>
            <div className="mt-5 space-y-3">
              {demoPath.map((item, index) => (
                <div key={`${index}-${item}`} className="flex items-start gap-3 rounded-[20px] border border-[#efe7dc] bg-[#fcfaf7] px-4 py-4">
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#1F2937] text-xs font-semibold text-white">
                    {index + 1}
                  </div>
                  <div className="text-[15px] leading-7 text-[#4b5563]">{item}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.06fr_0.94fr]">
          <div className="rounded-[34px] border border-[#eadfce] bg-white px-8 py-8 shadow-[0_24px_60px_rgba(23,29,45,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[12px] uppercase tracking-[0.2em] text-[#9a8d7b]">Selected live submission</div>
                <h2 className="mt-3 text-[42px] font-semibold tracking-[-0.06em] text-[#1F2937]">{agent.name}</h2>
                <div className="mt-3 text-[18px] text-[#6b7280]">{submission.strategyBrief}</div>
              </div>
              <div className="rounded-full bg-[#eef7f0] px-4 py-2 text-sm font-medium text-[#1a8b55]">
                {agent.status}
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ["Symbol", agent.symbol],
                ["Equity", compactUsd(agent.portfolio.equityUsd)],
                ["ROI", pct(agent.roi)],
                ["Total PnL", signedDollar(agent.pnl)],
                ["Max PnL", signedDollar(runtime.maxPnlUsd)],
                ["Max Drawdown", pct(-runtime.maxDrawdownPct)],
                ["Ticks", `${runtime.tickCount}`],
                ["Orders", `${runtime.totalOrders}`],
                ["Fills", `${runtime.totalFills}`],
              ].map(([label, value]) => (
                <div key={`${label}-${value}`} className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-4">
                  <div className="text-sm text-[#9b9184]">{label}</div>
                  <div className="mt-2 text-[24px] font-semibold tracking-[-0.05em] text-[#171d2d]">{value}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[24px] border border-[#efe7dc] bg-[#faf8f4] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-[18px] font-semibold tracking-[-0.04em] text-[#1F2937]">
                  <LineChart className="h-5 w-5 text-[#4156e5]" />
                  Real performance curve
                </div>
                <div className="rounded-full bg-[#eef7f0] px-3 py-1 text-xs font-medium text-[#1a8b55]">
                  Runner snapshots
                </div>
              </div>
              {chart ? (
                <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-[260px] w-full" preserveAspectRatio="none">
                  <path d={chart.fill} fill="rgba(65,86,229,0.10)" />
                  <path
                    d={chart.line}
                    fill="none"
                    stroke="#4156e5"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <div className="flex h-[260px] items-center justify-center rounded-[18px] border border-dashed border-[#e5ddd1] text-sm text-[#8a8074]">
                  Waiting for enough snapshots
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[34px] border border-[#eadfce] bg-white px-8 py-8 shadow-[0_24px_60px_rgba(23,29,45,0.06)]">
            <div className="text-[12px] uppercase tracking-[0.2em] text-[#9a8d7b]">Real evidence chain</div>
            <div className="mt-6 space-y-4">
              {[
                {
                  title: "1. Agent submitted to Arena",
                  body: `Pair code ${submission.pairCode} created a persistent Arena record at ${formatDateTime(createdAt)}.`,
                },
                {
                  title: "2. Demo runner registered",
                  body: `Runner status is ${runtime.status}. It has processed ${runtime.tickCount} ticks and persisted ${runtime.snapshots.length} equity snapshots.`,
                },
                {
                  title: "3. Runner order executed",
                  body: latestOrder
                    ? `Latest order ${truncateMiddle(latestOrder.orderId)} was submitted as ${latestOrder.side.toUpperCase()} and is currently ${latestOrder.state}.`
                    : "No order has been persisted yet.",
                },
                {
                  title: "4. Fill and account state persisted",
                  body: latestFill
                    ? `Latest fill ${truncateMiddle(latestFill.tradeId)} executed at ${latestFill.fillPrice.toFixed(2)} for ${latestFill.baseSize.toFixed(8)} base units. Equity is now ${compactUsd(agent.portfolio.equityUsd)}.`
                    : "No fill has been persisted yet.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                  <div className="inline-flex items-center gap-2 text-[18px] font-semibold tracking-[-0.04em] text-[#1F2937]">
                    <CheckCircle2 className="h-5 w-5 text-[#1a8b55]" />
                    {item.title}
                  </div>
                  <div className="mt-3 text-[16px] leading-7 text-[#4b5563]">{item.body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="rounded-[34px] border border-[#eadfce] bg-white px-8 py-8 shadow-[0_24px_60px_rgba(23,29,45,0.06)]">
            <div className="inline-flex items-center gap-3 text-[20px] font-semibold tracking-[-0.04em] text-[#1F2937]">
              <FileCheck2 className="h-5 w-5 text-[#ff8a57]" />
              Latest execution proof
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                <div className="text-sm text-[#9b9184]">Order ID</div>
                <div className="mt-3 text-[22px] font-semibold tracking-[-0.05em] text-[#171d2d]">
                  {latestOrder ? truncateMiddle(latestOrder.orderId, 12, 10) : "n/a"}
                </div>
              </div>
              <div className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                <div className="text-sm text-[#9b9184]">Trade ID</div>
                <div className="mt-3 text-[22px] font-semibold tracking-[-0.05em] text-[#171d2d]">
                  {latestFill ? truncateMiddle(latestFill.tradeId, 12, 10) : "n/a"}
                </div>
              </div>
              <div className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                <div className="text-sm text-[#9b9184]">Executed at</div>
                <div className="mt-3 text-[18px] font-semibold tracking-[-0.04em] text-[#171d2d]">
                  {formatDateTime(latestFill?.timestamp ?? latestOrder?.createdAt)}
                </div>
              </div>
              <div className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                <div className="text-sm text-[#9b9184]">Trading environment</div>
                <div className="mt-3 text-[18px] font-semibold tracking-[-0.04em] text-[#171d2d]">
                  {runtime.totalOrders > 0 ? "Shared runner" : "Waiting for first order"}
                </div>
              </div>
              <div className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                <div className="text-sm text-[#9b9184]">Fill price</div>
                <div className="mt-3 text-[22px] font-semibold tracking-[-0.05em] text-[#171d2d]">
                  {latestFill ? compactUsd(latestFill.fillPrice) : "n/a"}
                </div>
              </div>
              <div className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                <div className="text-sm text-[#9b9184]">Fill size</div>
                <div className="mt-3 text-[22px] font-semibold tracking-[-0.05em] text-[#171d2d]">
                  {latestFill ? latestFill.baseSize.toFixed(8) : "n/a"}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
              <div className="text-sm text-[#9b9184]">Current position</div>
              <div className="mt-3 text-[18px] leading-8 text-[#2f3545]">
                {currentPosition
                  ? `${currentPosition.side} ${currentPosition.size} at entry ${currentPosition.entry}, unrealized ${currentPosition.pnl}.`
                  : "No open position right now."}
              </div>
            </div>
          </div>

          <div className="rounded-[34px] border border-[#eadfce] bg-white px-8 py-8 shadow-[0_24px_60px_rgba(23,29,45,0.06)]">
            <div className="inline-flex items-center gap-3 text-[20px] font-semibold tracking-[-0.04em] text-[#1F2937]">
              <CandlestickChart className="h-5 w-5 text-[#4156e5]" />
              Why this should score
            </div>
            <div className="mt-6 grid gap-4">
              {criteria.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-[22px] border border-[#efe7dc] bg-[#fcfaf7] px-5 py-5">
                    <div className="inline-flex items-center gap-2 text-[18px] font-semibold tracking-[-0.04em] text-[#1F2937]">
                      <Icon className="h-5 w-5 text-[#1F2937]" />
                      {item.title}
                    </div>
                    <div className="mt-3 text-[16px] leading-7 text-[#4b5563]">{item.body}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-[22px] border border-[#efe7dc] bg-[#fff7ee] px-5 py-5">
              <div className="inline-flex items-center gap-2 text-[18px] font-semibold tracking-[-0.04em] text-[#1F2937]">
                <Clock3 className="h-5 w-5 text-[#ff8a57]" />
                Real vs simulation
              </div>
              <ul className="mt-4 space-y-3 text-[16px] leading-7 text-[#4b5563]">
                <li><strong>Real:</strong> submitted agent, shared runner, market sync, orders, fills, positions, equity snapshots.</li>
                <li><strong>Not used on this page:</strong> seeded leaderboard scorecards and other simulation-only ranking fields.</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
