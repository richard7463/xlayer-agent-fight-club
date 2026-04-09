import type { OkxPrivateCredentials } from "@/lib/okxAgentTradeKit";

export type OkxFollowerProfile = {
  id: string;
  label: string;
  credentials: OkxPrivateCredentials;
};

export type OkxFollowerProfileView = {
  id: string;
  label: string;
};

type RawFollowerProfile = {
  id?: string;
  label?: string;
  apiKey?: string;
  secretKey?: string;
  passphrase?: string;
  demoTrading?: boolean;
};

function parseProfiles(): OkxFollowerProfile[] {
  const raw = process.env.OKX_DEMO_FOLLOWER_PROFILES_JSON;
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as RawFollowerProfile[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.reduce<OkxFollowerProfile[]>((profiles, profile, index) => {
      if (!profile.apiKey || !profile.secretKey || !profile.passphrase) {
        return profiles;
      }

      profiles.push({
        id: profile.id?.trim() || `follower-${index + 1}`,
        label: profile.label?.trim() || `Follower ${index + 1}`,
        credentials: {
          key: profile.apiKey.trim(),
          secret: profile.secretKey.trim(),
          passphrase: profile.passphrase.trim(),
          demoTrading: profile.demoTrading ?? true,
        },
      });

      return profiles;
    }, []);
  } catch {
    return [];
  }
}

export function listOkxFollowerProfiles(): OkxFollowerProfile[] {
  return parseProfiles();
}

export function listOkxFollowerProfileViews(): OkxFollowerProfileView[] {
  return parseProfiles().map(({ id, label }) => ({ id, label }));
}

export function getOkxFollowerProfile(profileId: string): OkxFollowerProfile | null {
  return parseProfiles().find((profile) => profile.id === profileId) ?? null;
}
