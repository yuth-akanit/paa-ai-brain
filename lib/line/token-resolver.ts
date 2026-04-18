import { getEnv } from "@/lib/env";

export type LineChannelContext = {
  channelPlatformId?: string | null;
  accountKey?: string | null;
};

type ResolvedLineToken = {
  token: string | null;
  source: string;
};

function normalizeAccountKey(accountKey?: string | null) {
  return String(accountKey || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function resolveLineAccessToken(context: LineChannelContext = {}): ResolvedLineToken {
  const env = getEnv();
  const channelPlatformId = String(context.channelPlatformId || "").trim();
  const accountKey = normalizeAccountKey(context.accountKey);

  if (channelPlatformId === "2007958198" || accountKey === "paa air") {
    return {
      token: env.LINE_CHANNEL_ACCESS_TOKEN_PAA_AIR || env.LINE_CHANNEL_ACCESS_TOKEN || null,
      source: env.LINE_CHANNEL_ACCESS_TOKEN_PAA_AIR ? "LINE_CHANNEL_ACCESS_TOKEN_PAA_AIR" : "LINE_CHANNEL_ACCESS_TOKEN"
    };
  }

  if (channelPlatformId === "2007779665" || accountKey === "p&a air") {
    return {
      token: env.LINE_CHANNEL_ACCESS_TOKEN_P_AND_A_AIR || env.LINE_CHANNEL_ACCESS_TOKEN || null,
      source: env.LINE_CHANNEL_ACCESS_TOKEN_P_AND_A_AIR ? "LINE_CHANNEL_ACCESS_TOKEN_P_AND_A_AIR" : "LINE_CHANNEL_ACCESS_TOKEN"
    };
  }

  return {
    token: env.LINE_CHANNEL_ACCESS_TOKEN || null,
    source: "LINE_CHANNEL_ACCESS_TOKEN"
  };
}
