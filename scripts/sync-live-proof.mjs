import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cwd = process.cwd();
const outPath = path.join(cwd, "data", "fight-club", "live-proof.json");
const runtimeDir = path.join(cwd, "data", "fight-club", "runtime");

function parseJson(stdout) {
  return JSON.parse(stdout);
}

function ensureOk(result, label) {
  if (!result?.ok) {
    throw new Error(`${label} failed`);
  }
  return result.data;
}

async function runOnchainos(args) {
  const { stdout } = await execFileAsync("onchainos", args, {
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
    },
    maxBuffer: 1024 * 1024 * 4,
  });
  return parseJson(stdout);
}

function buildTxMap() {
  return [
    {
      fighterId: "atr-breakout-engine",
      fighterName: "ATR Breakout Engine",
      swapTxHash: "0xd192e73fbdb9575b63fb9d7f780eeb89f0258dad2a71c914603d35cf132b6919",
      approveTxHash: undefined,
      direction: "buy",
      fromSymbol: "OKB",
      fromAmount: "0.008",
      toSymbol: "USDC",
      toAmount: "0.664215",
      note: "Season fighter seed swap executed through Agentic Wallet on X Layer.",
    },
    {
      fighterId: "micro-mean-revert",
      fighterName: "Micro Mean Revert",
      swapTxHash: "0x0cbff36e0d8d7254c4afd927f4b734fe34220c187297aef4337cacee8a02880b",
      approveTxHash: "0x1bfa27686a223cac5753ed33ebe7ee726a46b53b50db64f269680a229cb2d4cb",
      direction: "sell",
      fromSymbol: "USDC",
      fromAmount: "0.3",
      toSymbol: "OKB",
      toAmount: "0.003596677619317886",
      note: "Second fighter reversal swap executed through Agentic Wallet on X Layer.",
    },
  ];
}

async function appendRuntimeEvents(txs) {
  for (const tx of txs) {
    const runtimePath = path.join(runtimeDir, `${tx.fighterId}.json`);
    const raw = JSON.parse(await readFile(runtimePath, "utf8"));
    const exists = (raw.events || []).some((event) => event?.note?.includes?.(tx.swapTxHash));
    if (exists) continue;
    raw.updatedAt = new Date().toISOString();
    raw.events = [
      {
        id: `live_${Date.now().toString(36)}_${tx.fighterId}`,
        timestamp: new Date().toISOString(),
        type: "fill",
        status: "success",
        title: "Agentic Wallet swap recorded",
        note: `${tx.fromAmount} ${tx.fromSymbol} -> ${tx.toAmount} ${tx.toSymbol} | swap ${tx.swapTxHash}${tx.approveTxHash ? ` | approve ${tx.approveTxHash}` : ""}`,
      },
      ...(raw.events || []),
    ];
    await writeFile(runtimePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  }
}

async function main() {
  const balance = ensureOk(await runOnchainos(["wallet", "balance", "--force"]), "wallet balance");
  const history = ensureOk(await runOnchainos(["wallet", "history", "--limit", "10"]), "wallet history");
  const historyOrders = history?.[0]?.orderList || [];
  const txLookup = new Map(historyOrders.map((item) => [item.txHash, item]));
  const txs = buildTxMap().map((tx) => {
    const historyItem = txLookup.get(tx.swapTxHash);
    return {
      ...tx,
      txStatus: historyItem?.txStatus || "UNKNOWN",
      timestamp: historyItem?.txTime ? new Date(Number(historyItem.txTime)).toISOString() : new Date().toISOString(),
    };
  });

  const proof = {
    walletAddress: balance.evmAddress,
    accountId: balance.accountId,
    network: "X Layer",
    totalTransactions: txs.length,
    balances: (balance.details?.[0]?.tokenAssets || []).map((asset) => ({
      symbol: asset.symbol,
      balance: asset.balance,
      usdValue: asset.usdValue,
    })),
    transactions: txs,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  await appendRuntimeEvents(txs);
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
