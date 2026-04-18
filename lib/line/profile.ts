
export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

export async function getLineProfile(userId: string): Promise<LineProfile | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error("[LINE-PROFILE] Missing LINE_CHANNEL_ACCESS_TOKEN");
    return null;
  }

  try {
    const response = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error(`[LINE-PROFILE] Failed to fetch profile for ${userId}: ${response.status} ${response.statusText}`);
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
