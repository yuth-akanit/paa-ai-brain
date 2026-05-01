const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const checkEnum = async (val) => {
    const { error } = await supabase
      .from('knowledge_docs')
      .update({ status: val })
      .limit(1)
      .select();
    return error ? error.message : "Success";
  };
  
  console.log('published:', await checkEnum('published'));
  console.log('archived:', await checkEnum('archived'));
  console.log('draft:', await checkEnum('draft'));
  console.log('deleted:', await checkEnum('deleted'));
}
run();
