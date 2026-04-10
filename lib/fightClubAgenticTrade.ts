import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

const XLAYER_CHAIN = "196";
const XLAYER_NAME = "xlayer";
const NATIVE_OKB_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const BASE_TOKEN = {
  symbol: "USD₮0",
  address: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
  decimals: 6,
};
const LEDGER_PATH = path.join(process.cwd(), "data", "fight-club", "live-transactions.json");
const LIVE_PROOF_PATH = path.join(process.cwd(), "data", "fight-club", "live-proof.json");

type OnchainosWalletStatus = {
  currentAccountId?: string;
  loggedIn?: boolean;
};

type OnchainosWalletBalanceAsset = {
  address?: string;
  balance?: string;
  symbol?: string;
  tokenAddress?: string;
  usdValue?: string;
};

type OnchainosWalletBalance = {
  details?: Array<{
    tokenAssets?: OnchainosWalletBalanceAsset[];
  }>;
};

type OnchainosSwapResult = {
  approveTxHash?: string;
  swapTxHash: string;
  fromAmount: string;
  toAmount: string;
};

export type FightClubRecordedTransaction = {
  fighterId: string;
  fighterName: string;
  direction: "buy" | "sell";
  fromSymbol: string;
  fromAmount: string;
  toSymbol: string;
  toAmount: string;
  approveTxHash?: string;
  swapTxHash: string;
  txStatus: string;
  timestamp: string;
  note: string;
};

type FightClubTradeableFighter = {
  id: string;
  label: string;
  tradeTokenSymbol: string;
  tradeTokenAddress: string;
  tradeTokenDecimals: number;
};

export type FightClubLiveLedger = {
  walletAddress: string;
  accountId: string;
  transactions: FightClubRecordedTransaction[];
  updatedAt: string;
};

function isLiveTradingEnabled() {
  return process.env.FIGHT_CLUB_LIVE_TRADING !== "false";
}

function cliEnv() {
  const env = { ...process.env };
  env.PATH = `${process.env.HOME}/.local/bin:${env.PATH || ""}`;
  const proxy =
    process.env.OKX_AGENT_PROXY ||
    process.env.ONCHAINOS_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    "";
  if (proxy) {
    env.HTTPS_PROXY = proxy;
    env.HTTP_PROXY = proxy;
  }
  return env;
}

async function runOnchainos<T>(args: string[]): Promise<T> {
  try {
    const { stdout } = await execFileAsync("onchainos", args, {
      env: cliEnv(),
      maxBuffer: 1024 * 1024 * 4,
    });
    return JSON.parse(stdout) as T;
  } catch (error) {
    const detail =
      error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr
        : error instanceof Error
          ? error.message
          : "unknown onchainos error";
    throw new Error(detail.trim() || "onchainos command failed");
  }
}

async function fetchWalletStatus() {
  const result = await runOnchainos<{ ok: boolean; data?: OnchainosWalletStatus }>(["wallet", "status"]);
  if (!result.ok || !result.data?.loggedIn) {
    throw new Error("Agentic Wallet is not logged in.");
  }
  return result.data;
}

async function fetchWalletBalance() {
  const result = await runOnchainos<{ ok: boolean; data?: OnchainosWalletBalance }>([
    "wallet",
    "balance",
    "--chain",
    XLAYER_CHAIN,
    "--force",
  ]);
  if (!result.ok || !result.data) {
    throw new Error("Unable to load Agentic Wallet balance.");
  }
  return result.data;
}

function tokenAssets(balance: OnchainosWalletBalance) {
  return balance.details?.[0]?.tokenAssets || [];
}

function inferWalletAddress(balance: OnchainosWalletBalance) {
  return tokenAssets(balance).find((asset) => asset.address)?.address || "";
}

function findAsset(balance: OnchainosWalletBalance, symbol: string, tokenAddress?: string) {
  const normalizedSymbol = symbol.toUpperCase();
  const normalizedAddress = tokenAddress?.toLowerCase() || "";
  return tokenAssets(balance).find((asset) => {
    const assetSymbol = (asset.symbol || "").toUpperCase();
    const assetTokenAddress = (asset.tokenAddress || "").toLowerCase();
    return assetSymbol === normalizedSymbol || (!!normalizedAddress && assetTokenAddress === normalizedAddress);
  });
}

function asNumber(value: string | undefined) {
  const parsed = Number(value || "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readLedger(): Promise<FightClubLiveLedger> {
  try {
    const raw = await fs.readFile(LEDGER_PATH, "utf8");
    return JSON.parse(raw) as FightClubLiveLedger;
  } catch {
    try {
      const rawProof = await fs.readFile(LIVE_PROOF_PATH, "utf8");
      const proof = JSON.parse(rawProof) as Partial<FightClubLiveLedger> & {
        transactions?: FightClubRecordedTransaction[];
      };
      return {
        walletAddress: proof.walletAddress || "",
        accountId: proof.accountId || "",
        transactions: proof.transactions || [],
        updatedAt: new Date().toISOString(),
      };
    } catch {
      return {
        walletAddress: "",
        accountId: "",
        transactions: [],
        updatedAt: new Date().toISOString(),
      };
    }
  }
}

async function writeLedger(ledger: FightClubLiveLedger) {
  await fs.mkdir(path.dirname(LEDGER_PATH), { recursive: true });
  await fs.writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

async function writeLiveProofFromLedger(ledger: FightClubLiveLedger) {
  const [status, balance] = await Promise.all([fetchWalletStatus(), fetchWalletBalance()]);
  const proof = {
    walletAddress: ledger.walletAddress || inferWalletAddress(balance),
    accountId: ledger.accountId || status.currentAccountId || "",
    network: "X Layer",
    totalTransactions: ledger.transactions.length,
    balances: tokenAssets(balance).map((asset) => ({
      symbol: asset.symbol || "",
      balance: asset.balance || "0",
      usdValue: asset.usdValue || "0",
    })),
    transactions: ledger.transactions,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(LIVE_PROOF_PATH), { recursive: true });
  await fs.writeFile(LIVE_PROOF_PATH, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
}

async function appendRecordedTransaction(transaction: FightClubRecordedTransaction) {
  const [status, balance, ledger] = await Promise.all([fetchWalletStatus(), fetchWalletBalance(), readLedger()]);
  if (ledger.transactions.some((item) => item.swapTxHash === transaction.swapTxHash)) {
    return;
  }
  ledger.walletAddress = inferWalletAddress(balance) || ledger.walletAddress;
  ledger.accountId = status.currentAccountId || ledger.accountId;
  ledger.transactions = [...ledger.transactions, transaction].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  ledger.updatedAt = new Date().toISOString();
  await writeLedger(ledger);
  await writeLiveProofFromLedger(ledger);
}

export async function getFightClubLiveLedger() {
  return readLedger();
}

export async function recordFightClubLiveTransaction(transaction: FightClubRecordedTransaction) {
  await appendRecordedTransaction(transaction);
}

async function executeSwap(args: {
  fromAddress: string;
  toAddress: string;
  readableAmount: string;
  walletAddress: string;
}) {
  const result = await runOnchainos<{ ok: boolean; data?: OnchainosSwapResult }>([
    "swap",
    "execute",
    "--from",
    args.fromAddress,
    "--to",
    args.toAddress,
    "--chain",
    XLAYER_NAME,
    "--wallet",
    args.walletAddress,
    "--slippage",
    process.env.FIGHT_CLUB_SWAP_SLIPPAGE || "0.50",
    "--readable-amount",
    args.readableAmount,
  ]);
  if (!result.ok || !result.data?.swapTxHash) {
    throw new Error("Swap execution failed.");
  }
  return result.data;
}

function toReadableAmount(rawAmount: string, decimals: number) {
  const value = BigInt(rawAmount || "0");
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  if (fraction === BigInt(0)) {
    return whole.toString();
  }
  const padded = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${padded}`;
}

export async function getFightClubLiveQuoteBalanceUsd() {
  const balance = await fetchWalletBalance();
  return asNumber(findAsset(balance, BASE_TOKEN.symbol, BASE_TOKEN.address)?.balance);
}

export async function getFightClubLiveBaseBalance(symbol: string, address: string) {
  const balance = await fetchWalletBalance();
  return asNumber(findAsset(balance, symbol, address)?.balance);
}

export async function submitFightClubLiveTrade(params: {
  fighter: FightClubTradeableFighter;
  side: "buy" | "sell";
  readableAmount: number;
}) {
  if (!isLiveTradingEnabled()) {
    return {
      ok: false,
      note: "Fight Club live trading is disabled by configuration.",
    };
  }

  const status = await fetchWalletStatus();
  const balance = await fetchWalletBalance();
  const walletAddress = inferWalletAddress(balance);
  if (!walletAddress) {
    return { ok: false, note: "Unable to resolve Agentic Wallet address." };
  }

  const readableAmount = Number(params.readableAmount);
  if (!Number.isFinite(readableAmount) || readableAmount <= 0) {
    return { ok: false, note: "Readable amount must be positive." };
  }

  const fromAddress = params.side === "buy" ? BASE_TOKEN.address : params.fighter.tradeTokenAddress;
  const toAddress = params.side === "buy" ? params.fighter.tradeTokenAddress : BASE_TOKEN.address;
  const fromSymbol = params.side === "buy" ? BASE_TOKEN.symbol : params.fighter.tradeTokenSymbol;
  const toSymbol = params.side === "buy" ? params.fighter.tradeTokenSymbol : BASE_TOKEN.symbol;

  const swap = await executeSwap({
    fromAddress,
    toAddress,
    readableAmount: readableAmount.toFixed(params.side === "buy" ? 2 : 8).replace(/0+$/, "").replace(/\.$/, ""),
    walletAddress,
  });

  const fromDecimals = params.side === "buy" ? BASE_TOKEN.decimals : params.fighter.tradeTokenDecimals;
  const toDecimals = params.side === "buy" ? params.fighter.tradeTokenDecimals : BASE_TOKEN.decimals;
  const transaction: FightClubRecordedTransaction = {
    fighterId: params.fighter.id,
    fighterName: params.fighter.label,
    direction: params.side,
    fromSymbol,
    fromAmount: toReadableAmount(swap.fromAmount, fromDecimals),
    toSymbol,
    toAmount: toReadableAmount(swap.toAmount, toDecimals),
    approveTxHash: swap.approveTxHash,
    swapTxHash: swap.swapTxHash,
    txStatus: "SUCCESS",
    timestamp: new Date().toISOString(),
    note:
      params.side === "buy"
        ? `Live breakout/reversion entry executed through Agentic Wallet on X Layer.`
        : `Live breakout/reversion exit executed through Agentic Wallet on X Layer.`,
  };

  await appendRecordedTransaction(transaction);

  return {
    ok: true,
    accountId: status.currentAccountId || "",
    walletAddress,
    transaction,
  };
}

export async function syncFightClubLiveProofFromLedger() {
  const ledger = await readLedger();
  await writeLiveProofFromLedger(ledger);
  return ledger;
}

export function getFightClubBaseToken() {
  return BASE_TOKEN;
}

export function getFightClubNativeOkbAddress() {
  return NATIVE_OKB_ADDRESS;
}
