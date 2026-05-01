const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Attempting to test update to 'active'...");
  const { data, error } = await supabase
    .from('knowledge_docs')
    .update({ status: 'active' })
    .match({ title: 'ช่องทางการติดต่อร้าน PAA Air Service และที่ตั้งสำนักงานใหญ่' })
    .select();
  
  if (error) {
    console.error("Error setting active:", error);
  } else {
    console.log("Success setting active!", data);
  }
}
run();
