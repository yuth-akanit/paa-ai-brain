export type ChannelDescriptorInput = {
  channelPlatformId?: string | null;
  accountKey?: string | null;
};

export type SourceChannel = {
  provider: "line";
  channelPlatformId: string | null;
  accountKey: string | null;
  displayName: string;
};

function normalizeKey(value?: string | null) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function describeChannel(input: ChannelDescriptorInput): SourceChannel {
  const channelPlatformId = String(input.channelPlatformId || "").trim() || null;
  const accountKey = normalizeKey(input.accountKey) || null;

  let displayName = "LINE OA";

  if (channelPlatformId === "2007958198" || accountKey === "paa air") {
    displayName = "PAA Air Service Ltd.";
  } else if (channelPlatformId === "2007779665" || accountKey === "p&a air") {
    displayName = "P&A Air Service";
  } else if (accountKey === "pa cooling" || accountKey === "pa-cooling") {
    displayName = "PA Cooling";
  }

  return {
    provider: "line",
    channelPlatformId,
    accountKey,
    displayName
  };
}

export function readSourceChannelDisplay(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const sc = (metadata as Record<string, unknown>).source_channel;
  if (!sc || typeof sc !== "object") return null;
  const name = (sc as Record<string, unknown>).displayName;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}
