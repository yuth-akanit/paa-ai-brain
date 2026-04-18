import { createServiceClient } from "../lib/db/supabase";

async function run() {
  const supabase = createServiceClient();
  
  const content = `สำนักงานใหญ่ของร้าน PAA Air Service / P&A AIR SERVICE
หจก.พีเอเอ แอร์ เซอร์วิส
ที่ตั้งสำนักงานใหญ่: 14/255 หมู่ 8 ตำบลบางโฉลง อำเภอบางพลี จ.สมุทรปราการ 10540
โทรติดต่อ: 084-282-4465 หรือ 02-102-0513
Line ID: @paairservice (สามารถกดลิงก์นี้เพื่อแชทได้เลย: https://line.me/R/ti/p/@paairservice )
Email: admin@paaair.com`;

  // delete old contact info if exists
  await supabase.from("knowledge_docs").delete().like("title", "%ช่องทางการติดต่อร้าน%");

  const { error } = await supabase.from("knowledge_docs").insert({
    title: "ช่องทางการติดต่อร้าน PAA Air Service และที่ตั้งสำนักงานใหญ่",
    category: "faq",
    content: content,
    tags: ["contact", "ช่องทางติดต่อ", "ติดต่อ", "faq", "line", "ที่อยู่", "สำนักงานใหญ่", "ร้านอยู่ไหน", "เบอร์โทร"],
    status: "published"
  });

  if (error) {
    console.error("Failed to insert contact doc:", error);
  } else {
    console.log("Contact info inserted successfully!");
  }
}

run().catch(console.error);
