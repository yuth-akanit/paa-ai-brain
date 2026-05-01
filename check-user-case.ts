
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createServiceClient } from "./lib/db/supabase";

async function checkUserCase() {
  const supabase = createServiceClient();
  const externalUserId = "U7b203671da08f9d1d1bd1cbbaf6961c0";

  const { data: channel } = await supabase
    .from("customer_channels")
    .select("customer_id")
    .eq("external_user_id", externalUserId)
    .maybeSingle();

  if (!channel) {
    console.log("No channel found");
    return;
  }

  const { data: cases } = await supabase
    .from("service_cases")
    .select("*")
    .eq("customer_id", channel.customer_id)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (cases && cases.length > 0) {
    console.dir(cases[0], { depth: null });
  } else {
    console.log("No cases found");
  }
}

checkUserCase();
