import { readFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.MOLTBOOK_API_BASE || "https://www.moltbook.com/api/v1";
const apiKey = process.env.MOLTBOOK_API_KEY || "";
const proxy = process.env.MOLTBOOK_PROXY || "";
const submolt = process.env.MOLTBOOK_SUBMOLT || "buildx";
const proofPath = path.join(process.cwd(), "data", "fight-club", "live-proof.json");

function extractNumbers(challenge) {
  return (challenge.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
}

function detectOperation(challenge) {
  const text = challenge.toLowerCase();
  if (text.includes("plus") || text.includes("sum") || text.includes("add")) return "+";
  if (text.includes("minus") || text.includes("subtract")) return "-";
  if (text.includes("times") || text.includes("multipl")) return "*";
  if (text.includes("divid")) return "/";
  const symbol = challenge.match(/[+\-*/]/);
  return symbol?.[0] || null;
}

function solveChallenge(challenge) {
  const nums = extractNumbers(challenge);
  const op = detectOperation(challenge);
  if (nums.length < 2 || !op) return null;
  const [a, b] = nums;
  const value = op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : b === 0 ? null : a / b;
  return value == null ? null : Number(value).toFixed(2);
}

async function request(method, route, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const opts = {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "agent-fight-club/1.0",
      },
      signal: controller.signal,
    };
    if (body) opts.body = JSON.stringify(body);
    if (proxy) {
      process.env.HTTPS_PROXY = proxy;
      process.env.HTTP_PROXY = proxy;
    }
    const res = await fetch(`${base}${route}`, opts);
    return {
      status: res.status,
      json: await res.json().catch(async () => ({ raw: await res.text() })),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (!apiKey) throw new Error("MOLTBOOK_API_KEY is not configured.");
  const proof = JSON.parse(await readFile(proofPath, "utf8"));
  const txs = proof.transactions || [];
  const title = `Agent Fight Club live onchain proof: ${txs.length} real X Layer swaps`;
  const content = [
    "Agent Fight Club now has direct Agentic Wallet execution on X Layer.",
    "",
    `Wallet: ${proof.walletAddress}`,
    `Track: X Layer Arena`,
    `Real swaps: ${proof.totalTransactions}`,
    "",
    "Current fighter ledger",
    ...txs.map((tx, index) => `${index + 1}. ${tx.fighterName}: ${tx.fromAmount} ${tx.fromSymbol} -> ${tx.toAmount} ${tx.toSymbol} | swap ${tx.swapTxHash}${tx.approveTxHash ? ` | approve ${tx.approveTxHash}` : ""}`),
    "",
    "Current balances",
    ...proof.balances.map((asset) => `- ${asset.symbol}: ${asset.balance} (${asset.usdValue} USD)`),
    "",
    "This season is no longer just a board. It now has direct onchain battle evidence, wallet state, and fighter-linked swaps.",
    "",
    `Repo: ${process.env.FIGHT_CLUB_REPO_URL || "https://github.com/richard7463/xlayer-agent-fight-club"}`,
  ].join("\n");

  const status = await request("GET", "/agents/status");
  if (status.status !== 200 || !status.json?.claimed) {
    throw new Error(`Moltbook agent is not claimed: ${JSON.stringify(status.json)}`);
  }

  const post = await request("POST", "/posts", {
    submolt_name: submolt,
    title,
    content,
  });
  if (post.status !== 200 && post.status !== 201) {
    throw new Error(`Post failed: ${post.status} ${JSON.stringify(post.json)}`);
  }

  const postId = post.json?.post?.id || post.json?.id;
  const verification = post.json?.post?.verification || post.json?.verification;
  if (verification?.challenge_text && postId) {
    const answer = solveChallenge(verification.challenge_text);
    if (!answer) throw new Error(`Unable to solve verification challenge: ${verification.challenge_text}`);
    const verify = await request("POST", "/verify", {
      post_id: postId,
      challenge_answer: answer,
      verification_code: verification.verification_code,
    });
    if (verify.status !== 200) {
      throw new Error(`Verification failed: ${verify.status} ${JSON.stringify(verify.json)}`);
    }
  }

  process.stdout.write(`${JSON.stringify({ ok: true, postId, title }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
