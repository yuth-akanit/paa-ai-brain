export type ChannelDescriptorInput = {
  channelPlatformId?: string | null;
  accountKey?: string | null;
  provider?: string | null;
};

export type LineChannelDescriptor = {
  provider: string;
  accountKey: string | null;
  channelPlatformId: string | null;
  label: string;
  shortLabel: string;
};

export type SourceChannel = {
  provider: "line";
  channelPlatformId: string | null;
  accountKey: string | null;
  displayName: string;
};

function clean(value?: string | null) {
  const trimmed = (value || "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeKey(value?: string | null) {
  return clean(value)?.toLowerCase().replace(/\s+/g, " ") || null;
}

export function getLineChannelDescriptor(input: ChannelDescriptorInput): LineChannelDescriptor {
  const provider = clean(input.provider) || "line";
  const accountKey = clean(input.accountKey);
  const channelPlatformId = clean(input.channelPlatformId);
  const normalizedAccountKey = normalizeKey(accountKey);

  if (channelPlatformId === "2007958198" || normalizedAccountKey === "paa air") {
    return {
      provider,
      accountKey: accountKey || "PAA Air",
      channelPlatformId: channelPlatformId || "2007958198",
      label: "LINE OA / PAA Air Service Ltd.",
      shortLabel: "PAA Air Service Ltd."
    };
  }

  if (channelPlatformId === "2007779665" || normalizedAccountKey === "p&a air") {
    return {
      provider,
      accountKey: accountKey || "P&A Air",
      channelPlatformId: channelPlatformId || "2007779665",
      label: "LINE OA / P&A Air Service",
      shortLabel: "P&A Air Service"
    };
  }

  if (channelPlatformId === "2008387791" || normalizedAccountKey === "pa cooling" || normalizedAccountKey === "pa-cooling") {
    return {
      provider,
      accountKey: accountKey || "PA Cooling",
      channelPlatformId: channelPlatformId || "2008387791",
      label: "LINE OA / PA Cooling",
      shortLabel: "PA Cooling"
    };
  }

  if (accountKey) {
    return {
      provider,
      accountKey,
      channelPlatformId,
      label: `LINE OA / ${accountKey}`,
      shortLabel: accountKey
    };
  }

  if (channelPlatformId) {
    return {
      provider,
      accountKey,
      channelPlatformId,
      label: `LINE OA / ${channelPlatformId}`,
      shortLabel: channelPlatformId
    };
  }

  return {
    provider,
    accountKey,
    channelPlatformId,
    label: provider === "line" ? "LINE OA" : provider,
    shortLabel: provider === "line" ? "LINE OA" : provider
  };
}

export function describeChannel(input: ChannelDescriptorInput): SourceChannel {
  const descriptor = getLineChannelDescriptor({
    provider: input.provider || "line",
    accountKey: input.accountKey,
    channelPlatformId: input.channelPlatformId
  });

  return {
    provider: "line",
    channelPlatformId: descriptor.channelPlatformId,
    accountKey: descriptor.accountKey,
    displayName: descriptor.shortLabel
  };
}

export function readSourceChannelDisplay(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const sourceChannel = (metadata as Record<string, unknown>).source_channel;
  if (!sourceChannel || typeof sourceChannel !== "object") {
    return null;
  }

  const source = sourceChannel as Record<string, unknown>;
  const displayName = source.displayName;
  if (typeof displayName === "string" && displayName.trim()) {
    return displayName.trim();
  }

  const label = source.label;
  if (typeof label === "string" && label.trim()) {
    return label.trim();
  }

  const shortLabel = source.short_label;
  if (typeof shortLabel === "string" && shortLabel.trim()) {
    return shortLabel.trim();
  }

  return null;
}
