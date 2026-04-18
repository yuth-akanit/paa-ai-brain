import { createServiceClient } from "../lib/db/supabase";

async function run() {
  const supabase = createServiceClient();
  
  // 1. Update repair leak price
  const { error: err1 } = await supabase.from("pricing_rules").update({
    price_label: "ซ่อมแอร์รั่วพร้อมเติมน้ำยา (รวมค่าแรง) เริ่มต้น 3,500-6,500 บาท",
    details: "ราคารวมค่าแรงและน้ำยา ขึ้นกับจุดรั่วและสภาพเครื่อง ต้องตรวจหน้างานก่อนยืนยัน",
    amount_min: 3500,
    amount_max: 6500
  }).eq("service_code", "repair").like("price_label", "%ซ่อมรอยรั่วพร้อมทำ Vacuum%");

  if (err1) {
    console.error("Failed to update leak price", err1);
  } else {
    console.log("Updated leak price to 3,500-6,500");
  }

  // 2. Update capacitor price
  const { error: err2 } = await supabase.from("pricing_rules").update({
    price_label: "เปลี่ยนคาปาซิเตอร์ (Capacitor) เริ่มต้น 1,500-3,500 บาท",
    details: "ราคาขึ้นกับขนาดและรุ่นของ Capacitor",
    amount_min: 1500,
    amount_max: 3500
  }).eq("service_code", "repair").like("price_label", "%เปลี่ยน Capacitor%");

  if (err2) {
    console.error("Failed to update capacitor price", err2);
  } else {
    console.log("Updated capacitor price to 1,500-3,500");
  }
}

run().catch(console.error);
