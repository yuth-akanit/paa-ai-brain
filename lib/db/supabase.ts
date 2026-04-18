import { createClient } from "@supabase/supabase-js";

import { getEnv } from "../env";

export function createServiceClient() {
  const env = getEnv();

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      fetch: (url, init) => {
        return fetch(url, {
          ...init,
          cache: "no-store", // Force no caching for Supabase
        });
      },
    },
  });
}
