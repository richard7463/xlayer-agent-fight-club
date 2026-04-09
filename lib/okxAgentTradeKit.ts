import { createHmac } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import type { ArenaDataSource, MarketContext, PortfolioSnapshot, Position } from "@/lib/agentArena";

const OKX_BASE_URL = process.env.OKX_AGENT_TRADE_BASE || "https://www.okx.com";
const execFileAsync = promisify(execFile);
const OKX_FETCH_TIMEOUT_MS = 2500;
const OKX_PYTHON_TIMEOUT_SECONDS = 6;
const OKX_HTTP_PROXY =
  process.env.OKX_AGENT_PROXY ||
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  "";

export type OkxPrivateCredentials = {
  key: string;
  secret: string;
  passphrase: string;
  demoTrading?: boolean;
};

type IntegrationStage = "live" | "fallback" | "credentials-required";

export type ArenaMarketHistoryPoint = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeUsd: number;
};

export type ArenaIntegrationState = {
  market: {
    status: IntegrationStage;
    note: string;
    updatedAt?: string;
  };
  portfolio: {
    status: IntegrationStage;
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

type OkxEnvelope<T> = {
  code: string;
  msg: string;
  data: T[];
};

type TickerRow = {
  instId: string;
  last: string;
  bidPx: string;
  askPx: string;
  high24h: string;
  low24h: string;
  volCcy24h: string;
  ts: string;
  sodUtc0?: string;
  open24h?: string;
};

type FundingRow = {
  fundingRate: string;
  ts: string;
};

type OpenInterestRow = {
  oi?: string;
  oiCcy?: string;
  ts?: string;
};

type BalanceDetailRow = {
  ccy: string;
  cashBal?: string;
  eqUsd?: string;
  availEq?: string;
  frozenBal?: string;
};

type BalanceRow = {
  totalEq?: string;
  adjEq?: string;
  details?: BalanceDetailRow[];
  uTime?: string;
};

type PositionRow = {
  instId: string;
  pos?: string;
  posSide?: string;
  avgPx?: string;
  upl?: string;
  liqPx?: string;
  lever?: string;
  realizedPnl?: string;
  markPx?: string;
  notionalUsd?: string;
};

type OrderRow = {
  ordId: string;
};

type TradeOrderRow = {
  ordId: string;
  clOrdId?: string;
  instId: string;
  side?: string;
  ordType?: string;
  state?: string;
  px?: string;
  avgPx?: string;
  sz?: string;
  accFillSz?: string;
  cTime?: string;
};

type TradeFillRow = {
  tradeId?: string;
  ordId?: string;
  clOrdId?: string;
  instId?: string;
  side?: string;
  fillPx?: string;
  fillSz?: string;
  fee?: string;
  ts?: string;
};

export type ArenaOrderEvidence = {
  orderId: string;
  symbol: string;
  side: string;
  orderType: string;
  state: string;
  price: string;
  size: string;
  filledSize: string;
  createdAt: string;
};

export type ArenaFillEvidence = {
  tradeId: string;
  symbol: string;
  side: string;
  fillPrice: string;
  fillSize: string;
  fee: string;
  timestamp: string;
};

export type ArenaExecutionEvidence = {
  source: "okx-trade" | "fallback";
  demoMode: boolean;
  note: string;
  activeOrders: number;
  recentOrders: ArenaOrderEvidence[];
  recentFills: ArenaFillEvidence[];
};

export type ArenaTradeOrderFeed = {
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: "buy" | "sell";
  orderType: string;
  state: string;
  price: number | null;
  averagePrice: number | null;
  requestedBaseSize: number | null;
  filledBaseSize: number | null;
  createdAt: string;
};

export type ArenaTradeFillFeed = {
  tradeId: string;
  orderId?: string;
  clientOrderId?: string;
  symbol: string;
  side: "buy" | "sell";
  fillPrice: number;
  fillBaseSize: number;
  feeUsd: number;
  timestamp: string;
};

export type ArenaTradeExecutionFeed = {
  source: "okx-trade" | "fallback";
  demoMode: boolean;
  note: string;
  activeOrders: number;
  orders: ArenaTradeOrderFeed[];
  fills: ArenaTradeFillFeed[];
};

export type ArenaDemoOrderDraft = {
  symbol: string;
  side: "buy" | "sell";
  orderType: "market";
  tdMode: "cash" | "cross";
  size: string;
  referencePrice: number;
  leverageCap: string;
  rationale: string;
  blocked: boolean;
  blockedReason?: string;
  clientOrderId?: string;
  baseSizeOverride?: string;
};

function isSpotMarketBuyOrder(row: ArenaTradeOrderFeed) {
  return isSpotInstId(row.symbol) && row.side === "buy" && row.orderType === "market";
}

function asNumber(value: string | number | null | undefined, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMoney(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 1000 ? 2 : 4,
    maximumFractionDigits: value >= 1000 ? 2 : 4,
  })}`;
}

function normalizeSymbol(symbol: string) {
  const cleaned = symbol.trim().toUpperCase().replace("/", "-").replace("_", "-");
  if (cleaned.includes("-")) {
    return cleaned;
  }
  if (cleaned.endsWith("USDT")) {
    return `${cleaned.slice(0, -4)}-USDT`;
  }
  return `${cleaned}-USDT`;
}

function toSwapInstId(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  return normalized.endsWith("-SWAP") ? normalized : `${normalized}-SWAP`;
}

function isSpotInstId(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  return !normalized.endsWith("-SWAP") && !/\d{6,8}$/.test(normalized);
}

function formatSpotBaseSize(quoteBudget: string, referencePrice: number) {
  const baseSize = asNumber(quoteBudget) / Math.max(referencePrice, 1);
  return Math.max(baseSize, 0).toFixed(8);
}

function extractOkxEnvelopeError(payload: { msg?: string; data?: unknown[] }) {
  const firstRow =
    Array.isArray(payload.data) && payload.data.length > 0 && payload.data[0] && typeof payload.data[0] === "object"
      ? (payload.data[0] as { sCode?: string; sMsg?: string })
      : null;

  const rowError =
    firstRow?.sCode && firstRow.sCode !== "0"
      ? `${firstRow.sCode}${firstRow.sMsg ? `: ${firstRow.sMsg}` : ""}`
      : firstRow?.sMsg || "";

  return [payload.msg, rowError].filter(Boolean).join(" | ") || "OKX private request failed";
}

function getVolatilityTag(rangePct: number): MarketContext["volatilityTag"] {
  if (rangePct >= 6) return "hot";
  if (rangePct >= 2.2) return "balanced";
  return "calm";
}

function getEnvironmentTag(
  change24hPct: number,
  fundingRatePct: number | null,
  spreadBps: number,
): MarketContext["environmentTag"] {
  if (Math.abs(change24hPct) >= 5 || (fundingRatePct != null && Math.abs(fundingRatePct) >= 0.03)) {
    return "event";
  }
  if (spreadBps <= 2.5 && Math.abs(change24hPct) >= 2) {
    return "trend";
  }
  if (spreadBps >= 6) {
    return "crowded";
  }
  return "squeeze";
}

type PythonOkxResponse = {
  status: number;
  text: string;
};

async function okxPythonRequest(args: {
  path: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}): Promise<PythonOkxResponse> {
  const script = `
import json
import requests
import sys

base = sys.argv[1]
path = sys.argv[2]
method = sys.argv[3]
headers = json.loads(sys.argv[4])
body = sys.argv[5]
timeout = int(sys.argv[6])
proxy = sys.argv[7]

payload = None
if body:
    payload = body.encode("utf-8")

kwargs = {
    "headers": headers,
    "data": payload,
    "timeout": timeout,
}
if proxy:
    kwargs["proxies"] = {"http": proxy, "https": proxy}

response = requests.request(
    method,
    base + path,
    **kwargs,
)

sys.stdout.write(json.dumps({
    "status": response.status_code,
    "text": response.text,
}))
`;

  const { stdout } = await execFileAsync(
    "python3",
    [
      "-c",
      script,
      OKX_BASE_URL,
      args.path,
      args.method || "GET",
      JSON.stringify(args.headers || {}),
      args.body || "",
      `${OKX_PYTHON_TIMEOUT_SECONDS}`,
      OKX_HTTP_PROXY,
    ],
    {
      maxBuffer: 1024 * 1024 * 4,
    },
  );

  return JSON.parse(stdout) as PythonOkxResponse;
}

async function okxPublic<T>(path: string): Promise<T[]> {
  try {
    const pythonResponse = await okxPythonRequest({
      path,
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (pythonResponse.status >= 400) {
      throw new Error(`OKX public request failed: ${pythonResponse.status}`);
    }

    const payload = JSON.parse(pythonResponse.text) as OkxEnvelope<T>;
    if (payload.code !== "0") {
      throw new Error(payload.msg || "OKX public request failed");
    }

    return payload.data;
  } catch (pythonError) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OKX_FETCH_TIMEOUT_MS);
      const response = await fetch(`${OKX_BASE_URL}${path}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 XLayerAgentFightClub/1.0",
          "Accept-Language": "en-US,en;q=0.9",
        },
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`OKX public request failed: ${response.status}`);
      }

      const payload = (await response.json()) as OkxEnvelope<T>;
      if (payload.code !== "0") {
        throw new Error(payload.msg || "OKX public request failed");
      }

      return payload.data;
    } catch (fetchError) {
      const pythonMessage =
        pythonError instanceof Error ? pythonError.message : "python requests failed";
      const fetchMessage =
        fetchError instanceof Error ? fetchError.message : "fetch fallback failed";
      throw new Error(`${pythonMessage}; fetch fallback: ${fetchMessage}`);
    }
  }
}

export async function fetchMarketHistory(
  symbol: string,
  bar: "15m" | "1H" | "4H" | "1D" = "1D",
  limit = 30,
): Promise<{
  points: ArenaMarketHistoryPoint[];
  integration: ArenaIntegrationState["market"];
}> {
  const instId = normalizeSymbol(symbol);
  const okxBar = bar === "15m" ? "15m" : bar === "1H" ? "1H" : bar === "4H" ? "4H" : "1D";

  try {
    const rows = await okxPublic<string[]>(
      `/api/v5/market/history-candles?instId=${encodeURIComponent(instId)}&bar=${encodeURIComponent(okxBar)}&limit=${limit}`,
    );

    const points = rows
      .map((row) => ({
        timestamp: new Date(asNumber(row[0], Date.now())).toISOString(),
        open: asNumber(row[1]),
        high: asNumber(row[2]),
        low: asNumber(row[3]),
        close: asNumber(row[4]),
        volumeUsd: asNumber(row[6]),
      }))
      .filter((row) => row.close > 0)
      .reverse();

    if (!points.length) {
      throw new Error("Missing candle history");
    }

    return {
      points,
      integration: {
        status: "live",
        note: "Live market history loaded through OKX public candle endpoints.",
        updatedAt: points.at(-1)?.timestamp,
      },
    };
  } catch (error) {
    return {
      points: [],
      integration: {
        status: "fallback",
        note:
          error instanceof Error
            ? `Market history fallback active: ${error.message}`
            : "Market history fallback active.",
      },
    };
  }
}

function getOkxCredentials(): OkxPrivateCredentials | null {
  const key = process.env.OKX_API_KEY;
  const secret = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;

  if (!key || !secret || !passphrase) {
    return null;
  }

  return {
    key,
    secret,
    passphrase,
    demoTrading: process.env.OKX_DEMO_TRADING === "true",
  };
}

function isDemoTradingEnabled(credentials?: OkxPrivateCredentials | null) {
  return credentials?.demoTrading ?? process.env.OKX_DEMO_TRADING === "true";
}

function signOkxRequest(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body = "",
) {
  return createHmac("sha256", secret)
    .update(`${timestamp}${method.toUpperCase()}${path}${body}`)
    .digest("base64");
}

async function okxPrivate<T>(path: string, credentials?: OkxPrivateCredentials | null): Promise<T[]> {
  return okxPrivateRequest<T>("GET", path, undefined, credentials);
}

async function okxPrivateRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  credentialsOverride?: OkxPrivateCredentials | null,
): Promise<T[]> {
  const credentials = credentialsOverride ?? getOkxCredentials();
  if (!credentials) {
    throw new Error("OKX portfolio credentials are not configured");
  }

  const timestamp = new Date().toISOString();
  const rawBody = body ? JSON.stringify(body) : "";
  const signature = signOkxRequest(credentials.secret, timestamp, method, path, rawBody);
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": credentials.key,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": credentials.passphrase,
  });

  if (isDemoTradingEnabled(credentials)) {
    headers.set("x-simulated-trading", "1");
  }

  try {
    const pythonResponse = await okxPythonRequest({
      path,
      method,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      },
      body: rawBody,
    });

    if (pythonResponse.status >= 400) {
      let detail = `OKX private request failed: ${pythonResponse.status}`;
      try {
        const errorPayload = JSON.parse(pythonResponse.text) as { code?: string; msg?: string; detail?: string };
        detail = errorPayload.msg || errorPayload.detail || detail;
      } catch {
        // keep status detail
      }
      throw new Error(detail);
    }

    const payload = JSON.parse(pythonResponse.text) as OkxEnvelope<T>;
    if (payload.code !== "0") {
      throw new Error(extractOkxEnvelopeError(payload));
    }

    return payload.data;
  } catch (pythonError) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OKX_FETCH_TIMEOUT_MS);
      const response = await fetch(`${OKX_BASE_URL}${path}`, {
        method,
        headers,
        body: rawBody || undefined,
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`OKX private request failed: ${response.status}`);
      }

      const payload = (await response.json()) as OkxEnvelope<T>;
      if (payload.code !== "0") {
        throw new Error(extractOkxEnvelopeError(payload));
      }

      return payload.data;
    } catch (fetchError) {
      const pythonMessage =
        pythonError instanceof Error ? pythonError.message : "python requests failed";
      const fetchMessage =
        fetchError instanceof Error ? fetchError.message : "fetch fallback failed";
      throw new Error(`${pythonMessage}; fetch fallback: ${fetchMessage}`);
    }
  }
}

export async function fetchLiveMarketContext(
  symbol: string,
): Promise<{ market: MarketContext; integration: ArenaIntegrationState["market"] }> {
  const instId = normalizeSymbol(symbol);
  const swapInstId = toSwapInstId(instId);

  try {
    const [tickerRows, bookRows, fundingRows, oiRows] = await Promise.all([
      okxPublic<TickerRow>(`/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`),
      okxPublic<{ bids?: string[][]; asks?: string[][] }>(
        `/api/v5/market/books?instId=${encodeURIComponent(instId)}&sz=1`,
      ),
      okxPublic<FundingRow>(
        `/api/v5/public/funding-rate?instId=${encodeURIComponent(swapInstId)}`,
      ).catch(() => []),
      okxPublic<OpenInterestRow>(
        `/api/v5/public/open-interest?instType=SWAP&instId=${encodeURIComponent(swapInstId)}`,
      ).catch(() => []),
    ]);

    const ticker = tickerRows[0];
    if (!ticker) {
      throw new Error("Missing ticker");
    }

    const book = bookRows[0];
    const bid = asNumber(book?.bids?.[0]?.[0], asNumber(ticker.bidPx));
    const ask = asNumber(book?.asks?.[0]?.[0], asNumber(ticker.askPx));
    const mid = bid && ask ? (bid + ask) / 2 : asNumber(ticker.last);
    const spreadBps = mid > 0 ? ((ask - bid) / mid) * 10000 : 0;

    const lastPrice = asNumber(ticker.last);
    const high24h = asNumber(ticker.high24h);
    const low24h = asNumber(ticker.low24h);
    const openAnchor = asNumber(ticker.sodUtc0 || ticker.open24h, lastPrice);
    const change24hPct = openAnchor > 0 ? ((lastPrice - openAnchor) / openAnchor) * 100 : 0;
    const rangePct = low24h > 0 ? ((high24h - low24h) / low24h) * 100 : 0;
    const fundingRatePct = fundingRows[0] ? asNumber(fundingRows[0].fundingRate) * 100 : null;
    const openInterestUsd = oiRows[0]
      ? asNumber(oiRows[0].oi) * lastPrice || asNumber(oiRows[0].oiCcy)
      : null;

    return {
      market: {
        exchange: "OKX",
        symbol: instId,
        lastPrice,
        change24hPct: Number(change24hPct.toFixed(2)),
        high24h,
        low24h,
        volume24hUsd: asNumber(ticker.volCcy24h),
        spreadBps: Number(spreadBps.toFixed(2)),
        fundingRatePct: fundingRatePct == null ? null : Number(fundingRatePct.toFixed(4)),
        openInterestUsd:
          openInterestUsd == null ? null : Number(openInterestUsd.toFixed(2)),
        volatilityTag: getVolatilityTag(rangePct),
        environmentTag: getEnvironmentTag(change24hPct, fundingRatePct, spreadBps),
        source: "okx-market",
        updatedAt: new Date(asNumber(ticker.ts, Date.now())).toISOString(),
      },
      integration: {
        status: "live",
        note: "Live market context loaded through okx-cex-market style public endpoints.",
        updatedAt: new Date(asNumber(ticker.ts, Date.now())).toISOString(),
      },
    };
  } catch (error) {
    return {
      market: {
        exchange: "OKX",
        symbol: instId,
        lastPrice: 1,
        change24hPct: 0,
        high24h: 1.01,
        low24h: 0.99,
        volume24hUsd: 0,
        spreadBps: 0,
        fundingRatePct: null,
        openInterestUsd: null,
        volatilityTag: "balanced",
        environmentTag: "crowded",
        source: "seed",
        updatedAt: new Date().toISOString(),
      },
      integration: {
        status: "fallback",
        note:
          error instanceof Error
            ? `Market fallback active: ${error.message}`
            : "Market fallback active.",
      },
    };
  }
}

function baseAssetFromSymbol(symbol: string) {
  return normalizeSymbol(symbol).split("-")[0];
}

function deriveSpotPositionFromBalance(
  symbol: string,
  detail: BalanceDetailRow | undefined,
  lastPrice: number,
): Position[] {
  if (!detail) {
    return [];
  }

  const eqUsd = asNumber(detail.eqUsd);
  if (eqUsd <= 5) {
    return [];
  }

  const amount = asNumber(detail.cashBal);
  return [
    {
      symbol: normalizeSymbol(symbol),
      side: "LONG",
      size: toMoney(eqUsd),
      entry: toMoney(lastPrice),
      pnl: "$0.00",
      liqPrice: "n/a",
      leverage: "spot",
    },
  ];
}

export async function fetchLivePortfolioContext(
  symbol: string,
  market: MarketContext,
  fallback: { portfolio: PortfolioSnapshot; positions: Position[] },
  credentialsOverride?: OkxPrivateCredentials | null,
): Promise<{
  portfolio: PortfolioSnapshot;
  positions: Position[];
  integration: ArenaIntegrationState["portfolio"];
}> {
  const credentials = credentialsOverride ?? getOkxCredentials();
  if (!credentials) {
    return {
      portfolio: fallback.portfolio,
      positions: fallback.positions,
      integration: {
        status: "credentials-required",
        note:
          "Portfolio stays on fallback until OKX_API_KEY, OKX_SECRET_KEY, and OKX_PASSPHRASE are configured.",
      },
    };
  }

  const instId = normalizeSymbol(symbol);
  const swapInstId = toSwapInstId(instId);

  try {
    const [balanceRows, positionRows, pendingRows] = await Promise.all([
      okxPrivate<BalanceRow>("/api/v5/account/balance", credentials),
      okxPrivate<PositionRow>(
        `/api/v5/account/positions?instType=SWAP&instId=${encodeURIComponent(swapInstId)}`,
        credentials,
      ).catch(() => [] as PositionRow[]),
      okxPrivate<OrderRow>(
        `/api/v5/trade/orders-pending?instId=${encodeURIComponent(instId)}`,
        credentials,
      ).catch(() => [] as OrderRow[]),
    ]);

    const balance = balanceRows[0];
    const details = balance?.details ?? [];
    const usdtDetail =
      details.find((detail) => detail.ccy === "USDT") ??
      details.find((detail) => asNumber(detail.eqUsd) > 0);
    const baseDetail = details.find((detail) => detail.ccy === baseAssetFromSymbol(instId));

    const livePositions: Position[] = positionRows
      .filter((row) => asNumber(row.pos) !== 0)
      .map((row) => {
        const markPrice = asNumber(row.markPx, market.lastPrice);
        const sizeUsd =
          asNumber(row.notionalUsd) || asNumber(row.pos) * Math.max(markPrice, 0);

        return {
          symbol: row.instId,
          side: row.posSide === "short" ? "SHORT" : "LONG",
          size: toMoney(sizeUsd),
          entry: toMoney(asNumber(row.avgPx, markPrice)),
          pnl: toMoney(asNumber(row.upl)),
          liqPrice: row.liqPx ? toMoney(asNumber(row.liqPx)) : "n/a",
          leverage: row.lever ? `${asNumber(row.lever)}x` : "n/a",
        };
      });

    const mergedPositions =
      livePositions.length > 0
        ? livePositions
        : deriveSpotPositionFromBalance(instId, baseDetail, market.lastPrice).length > 0
          ? deriveSpotPositionFromBalance(instId, baseDetail, market.lastPrice)
          : fallback.positions;

    const totalEq = asNumber(balance?.totalEq);
    const adjEq = asNumber(balance?.adjEq, totalEq);
    const upl = positionRows.reduce((sum, row) => sum + asNumber(row.upl), 0);
    const realized = positionRows.reduce((sum, row) => sum + asNumber(row.realizedPnl), 0);

    return {
      portfolio: {
        equityUsd: totalEq || fallback.portfolio.equityUsd,
        availableBalanceUsd:
          asNumber(usdtDetail?.availEq) || asNumber(usdtDetail?.cashBal) || adjEq || fallback.portfolio.availableBalanceUsd,
        unrealizedPnlUsd: Number(upl.toFixed(2)),
        realizedPnlUsd: Number(realized.toFixed(2)),
        feesUsd: fallback.portfolio.feesUsd,
        maxDrawdownPct: fallback.portfolio.maxDrawdownPct,
        activeOrders: pendingRows.length,
        liquidationCount: fallback.portfolio.liquidationCount,
        source: "okx-portfolio",
        updatedAt: balance?.uTime ? new Date(asNumber(balance.uTime)).toISOString() : new Date().toISOString(),
      },
      positions: mergedPositions,
      integration: {
        status: "live",
        note:
          "Live portfolio snapshot loaded through okx-cex-portfolio style private account endpoints.",
        updatedAt: balance?.uTime ? new Date(asNumber(balance.uTime)).toISOString() : new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      portfolio: fallback.portfolio,
      positions: fallback.positions,
      integration: {
        status: "fallback",
        note:
          error instanceof Error
            ? `Portfolio fallback active: ${error.message}`
            : "Portfolio fallback active.",
      },
    };
  }
}

function toExecutionFallback(symbol: string): ArenaExecutionEvidence {
  return {
    source: "fallback",
    demoMode: process.env.OKX_DEMO_TRADING === "true",
    note:
      "Execution evidence stays on fallback until OKX private credentials are configured. Arena is still demo-first.",
    activeOrders: 0,
    recentOrders: [],
    recentFills: [],
  };
}

function toExecutionFeedFallback(symbol: string): ArenaTradeExecutionFeed {
  return {
    source: "fallback",
    demoMode: process.env.OKX_DEMO_TRADING === "true",
    note:
      "Execution feed stays on fallback until OKX private credentials are configured.",
    activeOrders: 0,
    orders: [],
    fills: [],
  };
}

function normalizeTradeOrderFeed(
  rows: TradeOrderRow[],
  fallbackSymbol: string,
): ArenaTradeOrderFeed[] {
  return rows.map((row) => ({
    orderId: row.ordId,
    clientOrderId: row.clOrdId,
    symbol: row.instId || fallbackSymbol,
    side: (row.side || "buy") as "buy" | "sell",
    orderType: row.ordType || "market",
    state: row.state || "live",
    price: row.px ? asNumber(row.px) : null,
    averagePrice: row.avgPx ? asNumber(row.avgPx) : null,
    requestedBaseSize: row.sz ? asNumber(row.sz) : null,
    filledBaseSize: row.accFillSz ? asNumber(row.accFillSz) : null,
    createdAt: row.cTime
      ? new Date(asNumber(row.cTime)).toISOString()
      : new Date().toISOString(),
  }));
}

function normalizeTradeFillFeed(
  rows: TradeFillRow[],
  fallbackSymbol: string,
): ArenaTradeFillFeed[] {
  return rows.map((row) => ({
    tradeId: row.tradeId || "n/a",
    orderId: row.ordId,
    clientOrderId: row.clOrdId,
    symbol: row.instId || fallbackSymbol,
    side: (row.side || "buy") as "buy" | "sell",
    fillPrice: asNumber(row.fillPx),
    fillBaseSize: asNumber(row.fillSz),
    feeUsd: Math.abs(asNumber(row.fee)),
    timestamp: row.ts ? new Date(asNumber(row.ts)).toISOString() : new Date().toISOString(),
  }));
}

export async function fetchTradeExecutionFeed(
  symbol: string,
  credentialsOverride?: OkxPrivateCredentials | null,
): Promise<ArenaTradeExecutionFeed> {
  const credentials = credentialsOverride ?? getOkxCredentials();
  if (!credentials) {
    return toExecutionFeedFallback(symbol);
  }

  const instId = normalizeSymbol(symbol);
  const swapInstId = toSwapInstId(instId);
  const spotMode = isSpotInstId(instId);
  const historyInstType = spotMode ? "SPOT" : "SWAP";
  const historyInstId = spotMode ? instId : swapInstId;

  try {
    const [pendingRows, historyRows, fillRows] = await Promise.all([
      okxPrivate<TradeOrderRow>(
        `/api/v5/trade/orders-pending?instId=${encodeURIComponent(instId)}`,
        credentials,
      ).catch(() => [] as TradeOrderRow[]),
      okxPrivate<TradeOrderRow>(
        `/api/v5/trade/orders-history?instType=${historyInstType}&instId=${encodeURIComponent(historyInstId)}&limit=20`,
        credentials,
      ).catch(() => [] as TradeOrderRow[]),
      okxPrivate<TradeFillRow>(
        `/api/v5/trade/fills?instType=${historyInstType}&instId=${encodeURIComponent(historyInstId)}&limit=40`,
        credentials,
      ).catch(() => [] as TradeFillRow[]),
    ]);

    return {
      source: "okx-trade",
      demoMode: isDemoTradingEnabled(credentials),
      note:
        isDemoTradingEnabled(credentials)
          ? "Raw execution feed loaded from OKX private demo trade endpoints."
          : "Raw execution feed loaded from OKX private trade endpoints.",
      activeOrders: pendingRows.length,
      orders: normalizeTradeOrderFeed([...pendingRows, ...historyRows], instId).slice(0, 40),
      fills: normalizeTradeFillFeed(fillRows, instId).slice(0, 60),
    };
  } catch (error) {
    return {
      ...toExecutionFeedFallback(symbol),
      note:
        error instanceof Error
          ? `Execution feed fallback active: ${error.message}`
          : "Execution feed fallback active.",
    };
  }
}

export async function fetchTradeExecutionEvidence(
  symbol: string,
  credentialsOverride?: OkxPrivateCredentials | null,
): Promise<ArenaExecutionEvidence> {
  const feed = await fetchTradeExecutionFeed(symbol, credentialsOverride);
  if (feed.source !== "okx-trade") {
    return {
      ...toExecutionFallback(symbol),
      note: feed.note,
    };
  }

  const recentOrders = feed.orders.slice(0, 8).map((row) => ({
    orderId: row.orderId,
    symbol: row.symbol,
    side: row.side.toUpperCase(),
    orderType: row.orderType,
    state: row.state,
    price:
      row.price != null
        ? toMoney(row.price)
        : row.averagePrice != null
          ? toMoney(row.averagePrice)
          : "market",
    size:
      row.requestedBaseSize != null
        ? isSpotMarketBuyOrder(row)
          ? toMoney(row.requestedBaseSize)
          : row.price != null || row.averagePrice != null
            ? toMoney(row.requestedBaseSize * Math.max(row.price ?? row.averagePrice ?? 1, 1))
            : toMoney(row.requestedBaseSize)
        : "n/a",
    filledSize:
      row.filledBaseSize != null && (row.averagePrice != null || row.price != null)
        ? toMoney(row.filledBaseSize * Math.max(row.averagePrice ?? row.price ?? 1, 1))
        : "$0.00",
    createdAt: row.createdAt,
  }));

  const recentFills = feed.fills.slice(0, 8).map((row) => ({
    tradeId: row.tradeId,
    symbol: row.symbol,
    side: row.side.toUpperCase(),
    fillPrice: toMoney(row.fillPrice),
    fillSize: toMoney(row.fillPrice * row.fillBaseSize),
    fee: toMoney(row.feeUsd),
    timestamp: row.timestamp,
  }));

  return {
    source: "okx-trade",
    demoMode: feed.demoMode,
    note:
      feed.demoMode
        ? "Execution evidence loaded from OKX private demo trade endpoints."
        : "Execution evidence loaded from OKX private trade endpoints.",
    activeOrders: feed.activeOrders,
    recentOrders,
    recentFills,
  };
}

export function buildArenaDemoOrderDraft(params: {
  symbol: string;
  lastPrice: number;
  promotionStage: "running";
  riskAdjustedReturn: number;
  promotionReadiness: number;
  runtimeGuardTrips: number;
}): ArenaDemoOrderDraft {
  const { symbol, lastPrice, riskAdjustedReturn, runtimeGuardTrips } = params;
  const blocked = !Number.isFinite(lastPrice) || lastPrice <= 0;

  const side: "buy" | "sell" = riskAdjustedReturn >= 0 ? "buy" : "sell";
  const notionals = Math.max(120, Math.min(480, Math.round(lastPrice * 0.006)));

  return {
    symbol: normalizeSymbol(symbol),
    side,
    orderType: "market",
    tdMode: isSpotInstId(symbol) ? "cash" : "cross",
    size: `${notionals}`,
    referencePrice: lastPrice,
    leverageCap: runtimeGuardTrips > 2 ? "3x" : runtimeGuardTrips > 0 ? "5x" : "8x",
    rationale:
      blocked
        ? "Reference price is invalid. Skip this tick and wait for the next market sync."
        : "Submitted agents run immediately. Route a capped OKX demo order and keep runtime monitoring enabled.",
    blocked,
    blockedReason: blocked
      ? "Reference price is invalid for demo routing."
      : undefined,
  };
}

export async function submitArenaDemoOrder(
  draft: ArenaDemoOrderDraft,
  credentialsOverride?: OkxPrivateCredentials | null,
): Promise<{
  ok: boolean;
  note: string;
  orderId?: string;
  payload?: Record<string, unknown>;
}> {
  if (draft.blocked) {
    return {
      ok: false,
      note: draft.blockedReason || "Demo routing is blocked by promotion policy.",
      payload: draft,
    };
  }

  const credentials = credentialsOverride ?? getOkxCredentials();
  if (!credentials) {
    return {
      ok: false,
      note: "OKX private credentials are not configured for demo order submission.",
      payload: draft,
    };
  }

  if (!isDemoTradingEnabled(credentials)) {
    return {
      ok: false,
      note:
        "Current API key is bound to live environment. Create a demo trading API key and set OKX_DEMO_TRADING=true before routing demo orders.",
      payload: draft,
    };
  }

  try {
    const payload: Record<string, unknown> = {
      instId: draft.symbol,
      tdMode: draft.tdMode,
      side: draft.side,
      ordType: draft.orderType,
    };

    if (draft.clientOrderId) {
      payload.clOrdId = draft.clientOrderId;
    }

    if (draft.tdMode === "cash") {
      if (draft.side === "buy") {
        payload.sz = draft.size;
        payload.tgtCcy = "quote_ccy";
      } else {
        payload.sz =
          draft.baseSizeOverride || formatSpotBaseSize(draft.size, draft.referencePrice);
        payload.tgtCcy = "base_ccy";
      }
    } else {
      payload.sz = draft.size;
    }

    const rows = await okxPrivateRequest<{ ordId?: string; sCode?: string; sMsg?: string }>(
      "POST",
      "/api/v5/trade/order",
      payload,
      credentials,
    );
    const firstRow = rows[0];

    if (firstRow?.sCode && firstRow.sCode !== "0") {
      throw new Error(
        `${firstRow.sCode}${firstRow.sMsg ? `: ${firstRow.sMsg}` : ""}`,
      );
    }

    return {
      ok: true,
      note: "Demo order submitted through okx-cex-trade.",
      orderId: firstRow?.ordId,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      note:
        error instanceof Error
          ? `Demo order submission failed: ${error.message}`
          : "Demo order submission failed.",
      payload: {
        ...draft,
        submittedSize:
          draft.tdMode === "cash" && draft.side === "sell"
            ? formatSpotBaseSize(draft.size, draft.referencePrice)
            : draft.size,
      },
    };
  }
}

export function buildArenaIntegrationState(
  market: ArenaIntegrationState["market"],
  portfolio: ArenaIntegrationState["portfolio"],
): ArenaIntegrationState {
  return {
    market,
    portfolio,
    trade: {
      status: "demo-ready",
      note:
        process.env.OKX_DEMO_TRADING === "true"
          ? "OKX demo trading is enabled for Arena execution."
          : "Live read-only data is connected. Add a demo trading API key and set OKX_DEMO_TRADING=true to enable Arena demo execution.",
    },
    bot: {
      status: "planned",
      note:
        "okx-cex-bot will turn grid and DCA templates into first-class Arena contestants after market and portfolio are live.",
    },
  };
}
