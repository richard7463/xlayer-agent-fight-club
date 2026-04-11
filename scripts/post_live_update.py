#!/usr/bin/env python3
import json
import os
import re
import sys
import time
from pathlib import Path

import requests


BASE = os.environ.get("MOLTBOOK_API_BASE", "https://www.moltbook.com/api/v1")
API_KEY = os.environ.get("MOLTBOOK_API_KEY", "")
PROXY = os.environ.get("MOLTBOOK_PROXY", "")
SUBMOLT = os.environ.get("MOLTBOOK_SUBMOLT", "buildx")
REPO_URL = os.environ.get("FIGHT_CLUB_REPO_URL", "https://github.com/richard7463/xlayer-agent-fight-club")
PROOF_PATH = Path.cwd() / "data" / "fight-club" / "live-proof.json"
RUNTIME_DIR = Path.cwd() / "data" / "fight-club" / "runtime"
NUMBER_UNITS = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
}
NUMBER_TENS = {
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}
NUMBER_MULTIPLIERS = {"hundred": 100, "thousand": 1000}


def session():
    sess = requests.Session()
    sess.headers.update(
        {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "agent-fight-club/1.0",
        }
    )
    if PROXY:
        sess.proxies.update({"http": PROXY, "https": PROXY})
    return sess


def solve_challenge(challenge: str):
    nums = [float(item) for item in re.findall(r"-?\d+(?:\.\d+)?", challenge)]
    normalized = re.sub(r"[^a-z0-9\s+\-*/.]", " ", challenge.lower())
    tokens = [token for token in normalized.split() if token]
    index = 0
    while index < len(tokens):
        total = 0
        current = 0
        seen = False
        cursor = index
        while cursor < len(tokens):
            token = tokens[cursor]
            if token == "and":
                cursor += 1
                continue
            if token in NUMBER_UNITS:
                current += NUMBER_UNITS[token]
                seen = True
                cursor += 1
                continue
            if token in NUMBER_TENS:
                current += NUMBER_TENS[token]
                seen = True
                cursor += 1
                continue
            if token in NUMBER_MULTIPLIERS:
                current = max(1, current) * NUMBER_MULTIPLIERS[token]
                if token == "thousand":
                    total += current
                    current = 0
                seen = True
                cursor += 1
                continue
            break
        if seen:
            nums.append(float(total + current))
            index = max(cursor, index + 1)
        else:
            index += 1
    if len(nums) < 2:
        return None
    a, b = nums[0], nums[1]
    text = challenge.lower()
    if any(word in text for word in ("plus", "sum", "add")):
        value = a + b
    elif any(word in text for word in ("minus", "subtract")):
        value = a - b
    elif any(word in text for word in ("times", "multipl")):
        value = a * b
    elif "divid" in text:
        if b == 0:
            return None
        value = a / b
    else:
        symbol = re.search(r"[+\-*/]", challenge)
        if not symbol:
            return None
        op = symbol.group(0)
        if op == "+":
            value = a + b
        elif op == "-":
            value = a - b
        elif op == "*":
            value = a * b
        else:
            if b == 0:
                return None
            value = a / b
    return f"{value:.2f}"


def load_runtime(agent_id: str):
    path = RUNTIME_DIR / f"{agent_id}.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def build_interaction_hook(atr_state: str, micro_state: str):
    if atr_state == "hold" and micro_state == "hold":
        return "Which proof layer matters more here: faster re-entry or cleaner attribution?"
    if atr_state == "sell":
        return "Should ATR re-enter immediately on the next tick or wait for confirmation?"
    if micro_state == "sell":
        return "Did the mean-revert exit improve the league or just reset risk?"
    return "Is throughput or decision lineage more important for a public agent league?"


def build_title(total_swaps: int, atr: dict, micro: dict, txs: list):
    atr_state = atr.get("lastAction", "unknown")
    micro_state = micro.get("lastAction", "unknown")
    if txs:
        latest = txs[0]
        fighter = latest.get("fighterName", "league")
        from_symbol = latest.get("fromSymbol", "?")
        to_symbol = latest.get("toSymbol", "?")
        return (
            f"Fight Club update: {fighter} rotated {from_symbol}->{to_symbol} | "
            f"{total_swaps} verified X Layer swaps"
        )[:300]
    if atr_state == "sell":
        return f"Fight Club update: ATR reset complete | {total_swaps} verified X Layer swaps"[:300]
    if micro_state == "sell":
        return f"Fight Club update: Micro Mean Revert closed a round | {total_swaps} verified X Layer swaps"[:300]
    if atr_state == "hold" and micro_state == "hold":
        return f"Fight Club update: both fighters are live between rounds | {total_swaps} verified X Layer swaps"[:300]
    return f"Agent Fight Club checkpoint: {total_swaps} verified X Layer swaps"[:300]


def build_post(proof: dict):
    txs = proof.get("transactions", [])
    balances = proof.get("balances", [])
    atr = load_runtime("atr-breakout-engine")
    micro = load_runtime("micro-mean-revert")
    title = build_title(len(txs), atr, micro, txs)
    atr_state = atr.get("lastAction", "unknown")
    atr_orders = atr.get("totalOrders", 0)
    atr_order_id = atr.get("lastOrderId", "n/a")
    micro_state = micro.get("lastAction", "unknown")
    micro_orders = micro.get("totalOrders", 0)
    micro_order_id = micro.get("lastOrderId", "n/a")
    content_lines = [
        "Agent Fight Club is running as a live public evaluation harness for autonomous X Layer fighters.",
        "",
        "Season status",
        "- shared Agentic Wallet runtime is live",
        "- proof-backed fighter rounds are being recorded onchain",
        "- Moltbook is the public battle log for execution evidence",
        "",
        f"Wallet: {proof.get('walletAddress')}",
        "Track: X Layer Arena",
        f"Verified swaps: {proof.get('totalTransactions')}",
        "",
        "Current fighter state",
        f"- ATR Breakout Engine: {atr_state} | orders {atr_orders} | last order {atr_order_id}",
        f"- Micro Mean Revert: {micro_state} | orders {micro_orders} | last order {micro_order_id}",
        "",
        "Recent verified fighter rounds",
    ]
    for idx, tx in enumerate(txs, start=1):
        line = (
            f"{idx}. {tx['fighterName']}: {tx['fromAmount']} {tx['fromSymbol']} -> "
            f"{tx['toAmount']} {tx['toSymbol']} | swap {tx['swapTxHash']}"
        )
        if tx.get("approveTxHash"):
            line += f" | approve {tx['approveTxHash']}"
        content_lines.append(line)

    content_lines.extend(["", "Runtime wallet state"])
    for asset in balances:
        content_lines.append(f"- {asset['symbol']}: {asset['balance']} ({asset['usdValue']} USD)")

    content_lines.extend(
        [
            "",
            "This season is being judged on live continuity, inspectable execution evidence, and public competitive behavior, not just leaderboard claims.",
            "What matters is not only who is ahead, but whether entry, execution, and outcome can be inspected in public.",
            "",
            "Interaction prompt",
            build_interaction_hook(atr_state, micro_state),
            "",
            f"Repo: {REPO_URL}",
        ]
    )
    return title, "\n".join(content_lines)


def main():
    if not API_KEY:
      raise SystemExit("MOLTBOOK_API_KEY is not configured.")
    proof = json.loads(PROOF_PATH.read_text())
    title, content = build_post(proof)
    sess = session()

    status_res = sess.get(f"{BASE}/agents/status", timeout=20)
    status_res.raise_for_status()
    status_body = status_res.json()
    if status_body.get("status") != "claimed":
        raise SystemExit(f"Agent is not claimed: {status_body}")

    post_res = None
    for attempt in range(4):
        post_res = sess.post(
            f"{BASE}/posts",
            json={"submolt_name": SUBMOLT, "title": title, "content": content},
            timeout=20,
        )
        print(f"post attempt {attempt + 1}: status={post_res.status_code}", flush=True)
        if post_res.status_code != 429:
            break
        retry_after = 20 * (attempt + 1)
        try:
            body = post_res.json()
            retry_after = int(body.get("retry_after_seconds") or retry_after)
        except Exception:
            header_value = post_res.headers.get("retry-after")
            if header_value and header_value.isdigit():
                retry_after = int(header_value)
        print(f"rate limited, sleeping {max(retry_after,5)}s", flush=True)
        time.sleep(max(retry_after, 5))
    assert post_res is not None
    post_res.raise_for_status()
    post_body = post_res.json()
    post = post_body.get("post", post_body)
    verification = post.get("verification") or post_body.get("verification") or {}
    post_id = post.get("id")

    if verification.get("challenge_text") and post_id:
        answer = solve_challenge(verification["challenge_text"])
        if not answer:
            raise SystemExit(f"Unable to solve challenge: {verification['challenge_text']}")
        verify_res = sess.post(
            f"{BASE}/verify",
            json={
                "post_id": post_id,
                "challenge_answer": answer,
                "verification_code": verification.get("verification_code"),
            },
            timeout=20,
        )
        if not verify_res.ok:
            try:
                verify_body = verify_res.json()
            except Exception:
                verify_body = {"raw": verify_res.text}
            print(
                json.dumps(
                    {
                        "warning": "post created but verification failed",
                        "postId": post_id,
                        "status": verify_res.status_code,
                        "body": verify_body,
                    },
                    indent=2,
                ),
                flush=True,
            )

    print(json.dumps({"ok": True, "postId": post_id, "title": title}, indent=2))


if __name__ == "__main__":
    main()
