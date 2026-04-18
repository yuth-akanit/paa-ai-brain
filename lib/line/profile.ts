
import { resolveLineAccessToken, type LineChannelContext } from "@/lib/line/token-resolver";

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

export async function getLineProfile(userId: string, context: LineChannelContext = {}): Promise<LineProfile | null> {
  const resolved = resolveLineAccessToken(context);
  const token = resolved.token;
  if (!token) {
    console.error("[LINE-PROFILE] Missing LINE access token", context);
    return null;
  }

  try {
    console.log(
      `[LINE-PROFILE] Fetching profile userId=${userId} channel_platform_id=${context.channelPlatformId ?? "-"} account_key=${context.accountKey ?? "-"} token_source=${resolved.source}`
    );
    const response = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error(
        `[LINE-PROFILE] Failed to fetch profile for ${userId}: ${response.status} ${response.statusText} channel_platform_id=${context.channelPlatformId ?? "-"} account_key=${context.accountKey ?? "-"} token_source=${resolved.source}`
      );
      return null;
    }

    const data = await response.json();
    return {
      userId: data.userId,
      displayName: data.displayName,
      pictureUrl: data.pictureUrl,
      statusMessage: data.statusMessage,
    };
  } catch (error) {
    console.error(`[LINE-PROFILE] Error fetching profile for ${userId}:`, error);
    return null;
  }
}
