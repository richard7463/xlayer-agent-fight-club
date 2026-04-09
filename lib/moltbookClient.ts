import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const MOLTBOOK_API_BASE = process.env.MOLTBOOK_API_BASE || "https://www.moltbook.com/api/v1";
const MOLTBOOK_BASE = "https://www.moltbook.com";
const MOLTBOOK_TIMEOUT_SECONDS = Number(process.env.MOLTBOOK_TIMEOUT || "20");

type PythonHttpResponse = {
  status: number;
  text: string;
  headers: Record<string, string>;
};

type MoltbookVerification = {
  verification_code?: string;
  challenge_text?: string;
};

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/([+\-*/])/g, " $1 ")
    .replace(/[^a-z0-9\s+\-*/.]/g, " ");
}

const NUMBER_UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const NUMBER_TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const NUMBER_MULTIPLIERS: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
};

function parseNumberWords(tokens: string[], start: number) {
  let index = start;
  let current = 0;
  let total = 0;
  let seen = false;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "and") {
      index += 1;
      continue;
    }

    if (token in NUMBER_UNITS) {
      current += NUMBER_UNITS[token];
      seen = true;
      index += 1;
      continue;
    }

    if (token in NUMBER_TENS) {
      current += NUMBER_TENS[token];
      seen = true;
      index += 1;
      continue;
    }

    if (token in NUMBER_MULTIPLIERS) {
      current = Math.max(1, current) * NUMBER_MULTIPLIERS[token];
      if (token === "thousand") {
        total += current;
        current = 0;
      }
      seen = true;
      index += 1;
      continue;
    }

    break;
  }

  if (!seen) {
    return null;
  }

  return {
    value: total + current,
    consumed: index - start,
  };
}

function extractNumbers(challenge: string) {
  const matches = challenge.match(/-?\d+(?:\.\d+)?/g) ?? [];
  const numeric = matches.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  const tokens = normalizeText(challenge)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (let index = 0; index < tokens.length; ) {
    const parsed = parseNumberWords(tokens, index);
    if (!parsed) {
      index += 1;
      continue;
    }
    numeric.push(parsed.value);
    index += Math.max(parsed.consumed, 1);
  }

  return numeric;
}

function detectOperation(challenge: string) {
  const text = normalizeText(challenge);
  if (/(total|sum|combined|together|plus|add|increase)/.test(text)) return "+";
  if (/(minus|subtract|decrease|less)/.test(text)) return "-";
  if (/(multiplied|times)/.test(text)) return "*";
  if (/(divided|divide)/.test(text)) return "/";

  const symbol = challenge.match(/[+\-*/]/);
  return symbol?.[0] ?? null;
}

function solveChallenge(challenge: string) {
  const numbers = extractNumbers(challenge);
  const op = detectOperation(challenge);
  if (numbers.length < 2 || !op) {
    return null;
  }

  const [a, b] = numbers;
  let value = 0;
  if (op === "+") value = a + b;
  else if (op === "-") value = a - b;
  else if (op === "*") value = a * b;
  else if (op === "/") {
    if (b === 0) return null;
    value = a / b;
  } else {
    return null;
  }

  return value.toFixed(2);
}

async function pythonHttpRequest(args: {
  method: "GET" | "POST";
  path: string;
  headers?: Record<string, string>;
  jsonBody?: Record<string, unknown>;
  proxy?: string;
}) {
  const script = `
import json
import requests
import sys

base = sys.argv[1]
method = sys.argv[2]
path = sys.argv[3]
headers = json.loads(sys.argv[4])
body = json.loads(sys.argv[5]) if sys.argv[5] else None
timeout = int(sys.argv[6])
proxy = sys.argv[7]

kwargs = {
    "headers": headers,
    "timeout": timeout,
}
if body is not None:
    kwargs["json"] = body
if proxy:
    kwargs["proxies"] = {"http": proxy, "https": proxy}

response = requests.request(method, base + path, **kwargs)
sys.stdout.write(json.dumps({
    "status": response.status_code,
    "text": response.text,
    "headers": dict(response.headers),
}))
`;

  const { stdout } = await execFileAsync(
    "python3",
    [
      "-c",
      script,
      MOLTBOOK_API_BASE,
      args.method,
      args.path,
      JSON.stringify(args.headers || {}),
      args.jsonBody ? JSON.stringify(args.jsonBody) : "",
      `${MOLTBOOK_TIMEOUT_SECONDS}`,
      args.proxy || "",
    ],
    { maxBuffer: 1024 * 1024 * 4 },
  );

  return JSON.parse(stdout) as PythonHttpResponse;
}

function jsonOrRaw(response: PythonHttpResponse) {
  const contentType = response.headers["content-type"] || response.headers["Content-Type"] || "";
  if (contentType.includes("application/json")) {
    return JSON.parse(response.text);
  }
  return { raw: response.text };
}

export type MoltbookPostResult = {
  ok: boolean;
  note: string;
  postId?: string;
  verified?: boolean;
  response?: Record<string, unknown>;
};

export class MoltbookClient {
  readonly apiKey: string;
  readonly proxy: string;

  constructor(apiKey = process.env.MOLTBOOK_API_KEY || "", proxy = process.env.MOLTBOOK_PROXY || "") {
    this.apiKey = apiKey;
    this.proxy = proxy;
  }

  get isConfigured() {
    return Boolean(this.apiKey);
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "agent-fight-club/1.0",
    };
  }

  async checkClaimStatus() {
    if (!this.isConfigured) {
      return { ok: false, status: "missing_key", note: "MOLTBOOK_API_KEY is not configured." };
    }

    const response = await pythonHttpRequest({
      method: "GET",
      path: "/agents/status",
      headers: this.headers(),
      proxy: this.proxy,
    });
    const body = jsonOrRaw(response) as Record<string, unknown>;
    if (response.status !== 200) {
      return { ok: false, status: "request_failed", note: `Moltbook status returned ${response.status}.`, body };
    }

    return {
      ok: true,
      status: String(body.status || "unknown"),
      note: `Agent status is ${String(body.status || "unknown")}.`,
      body,
    };
  }

  async createPost(
    args: { title: string; content: string; submolt?: string },
    attempt = 0,
  ): Promise<MoltbookPostResult> {
    if (!this.isConfigured) {
      return { ok: false, note: "MOLTBOOK_API_KEY is not configured." };
    }

    const claim = await this.checkClaimStatus();
    if (!claim.ok || claim.status !== "claimed") {
      return {
        ok: false,
        note: claim.ok ? `Moltbook agent is not claimed yet: ${claim.status}.` : claim.note,
      };
    }

    const response = await pythonHttpRequest({
      method: "POST",
      path: "/posts",
      headers: this.headers(),
      jsonBody: {
        submolt_name: args.submolt || process.env.MOLTBOOK_SUBMOLT || "buildx",
        title: args.title.slice(0, 300),
        content: args.content.slice(0, 40000),
        type: "text",
      },
      proxy: this.proxy,
    });

    const body = jsonOrRaw(response) as Record<string, unknown>;
    if (response.status !== 200 && response.status !== 201) {
      if (response.status === 429 && attempt < 1) {
        const retryAfter = Number((body.retry_after_seconds as number | string | undefined) || "0");
        if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 10) {
          await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
          return this.createPost(args, attempt + 1);
        }
      }

      return { ok: false, note: `Moltbook post failed with ${response.status}.`, response: body };
    }

    const post = (body.post || body) as Record<string, unknown>;
    const postId = typeof post.id === "string" ? post.id : undefined;
    const verification =
      ((post.verification as MoltbookVerification | undefined) ||
        (body.verification as MoltbookVerification | undefined)) ??
      null;

    if (!verification?.verification_code || !verification.challenge_text) {
      return {
        ok: true,
        note: "Moltbook post created without verification.",
        postId,
        verified: false,
        response: body,
      };
    }

    const answer = solveChallenge(verification.challenge_text);
    if (!answer) {
      return {
        ok: false,
        note: `Unable to solve Moltbook verification challenge: ${verification.challenge_text}`,
        postId,
        response: body,
      };
    }

    const verifyResponse = await pythonHttpRequest({
      method: "POST",
      path: "/verify",
      headers: this.headers(),
      jsonBody: {
        verification_code: verification.verification_code,
        answer,
      },
      proxy: this.proxy,
    });
    const verifyBody = jsonOrRaw(verifyResponse) as Record<string, unknown>;
    if (verifyResponse.status !== 200 && verifyResponse.status !== 201) {
      return {
        ok: false,
        note: `Moltbook verification failed with ${verifyResponse.status}.`,
        postId,
        response: verifyBody,
      };
    }

    return {
      ok: true,
      note: "Moltbook post created and verified.",
      postId,
      verified: true,
      response: verifyBody,
    };
  }

  get profileUrl() {
    const username = process.env.MOLTBOOK_AGENT_USERNAME?.trim();
    return username ? `${MOLTBOOK_BASE}/u/${username}` : null;
  }
}
