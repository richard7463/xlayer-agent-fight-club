import { promises as fs } from "fs";
import path from "path";

export type FightClubLiveTransaction = {
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

export type FightClubLiveProof = {
  walletAddress: string;
  accountId: string;
  network: string;
  totalTransactions: number;
  balances: Array<{
    symbol: string;
    balance: string;
    usdValue: string;
  }>;
  transactions: FightClubLiveTransaction[];
  updatedAt: string;
};

const LIVE_PROOF_PATH = path.join(process.cwd(), "data", "fight-club", "live-proof.json");

export async function readFightClubLiveProof(): Promise<FightClubLiveProof | null> {
  try {
    const raw = await fs.readFile(LIVE_PROOF_PATH, "utf8");
    return JSON.parse(raw) as FightClubLiveProof;
  } catch {
    return null;
  }
}
