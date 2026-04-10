import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cwd = process.cwd();
const ledgerPath = path.join(cwd, "data", "fight-club", "live-transactions.json");
const outPath = path.join(cwd, "data", "fight-club", "live-proof.json");

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

async function readLedger() {
  try {
    return JSON.parse(await readFile(ledgerPath, "utf8"));
  } catch {
    return {
      walletAddress: "",
      accountId: "",
      transactions: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

async function main() {
  const [status, balance, ledger] = await Promise.all([
    ensureOk(await runOnchainos(["wallet", "status"]), "wallet status"),
    ensureOk(await runOnchainos(["wallet", "balance", "--chain", "196", "--force"]), "wallet balance"),
    readLedger(),
  ]);

  const assets = balance.details?.[0]?.tokenAssets || [];
  const walletAddress = ledger.walletAddress || assets.find((asset) => asset.address)?.address || "";
  const proof = {
    walletAddress,
    accountId: ledger.accountId || status.currentAccountId || "",
    network: "X Layer",
    totalTransactions: ledger.transactions.length,
    balances: assets.map((asset) => ({
      symbol: asset.symbol,
      balance: asset.balance,
      usdValue: asset.usdValue,
    })),
    transactions: ledger.transactions,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
