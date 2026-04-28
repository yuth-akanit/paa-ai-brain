import { createServiceClient } from "../db/supabase";
import type { KnowledgeSearchResult } from "../types";

function scoreDocument(content: string, query: string, tags: string[]) {
  const normalizedQuery = query.toLowerCase();
  let score = 0;

  if (content.toLowerCase().includes(normalizedQuery)) {
    score += 5;
  }

  for (const token of normalizedQuery.split(/\s+/)) {
    if (content.toLowerCase().includes(token)) {
      score += 2;
    }

    if (tags.some((tag) => tag.toLowerCase().includes(token))) {
      score += 3;
    }
  }

  return score;
}

export function resolveCanonicalTopic(userText: string): string | null {
  const text = userText.trim();

  if (/(ว่างวันไหน|มีคิววันไหน|วันไหนว่าง|เปิดกี่โมง|เวลาทำการ|เปิดวันไหน|เปิดให้บริการวัน|เปิดบริการวัน|วันทำการ)/i.test(text)) {
    return "operating_hours";
  }

  if (/(ราคาล้าง|ล้างแอร์.*เท่าไหร่|ค่าล้างแอร์|ล้างแอร์ราคา)/i.test(text)) {
    return "cleaning_pricing";
  }

  if (/(อุปกรณ์ส่วนเกิน.*ติดตั้ง|ติดตั้ง.*อุปกรณ์ส่วนเกิน|ค่าอุปกรณ์เพิ่ม.*ติดตั้ง|ราคาเดินท่อเพิ่ม|ราคาท่อเพิ่ม|ราคารางครอบท่อ|ราคาอุปกรณ์ติดตั้งเพิ่ม)/i.test(text)) {
    return "installation_extra_pricing";
  }

  if (/(ราคาติดตั้ง|ติดตั้งแอร์.*เท่าไหร่|ค่าติดตั้งแอร์|ติดตั้งแอร์ราคา|ค่าบริการ.*ติดตั้ง)/i.test(text)) {
    return "installation_pricing";
  }

  if (/(ค่าอะไหล่.*ค่าตรวจ|ค่าตรวจ.*ค่าอะไหล่|ค่าอะไหล่.*ตรวจเช็ก|ตรวจเช็ก.*ค่าอะไหล่)/i.test(text)) {
    return "parts_and_inspection_pricing";
  }

  if (/(ค่าตรวจเช็ก|ค่าตรวจเช็ค|ประเมินหน้างาน|ราคาตรวจ)/i.test(text)) {
    return "inspection_policy";
  }

  if (/(ค่าย้ายแอร์|ราคาย้ายแอร์|ย้ายแอร์ราคา|ค่าถอดแอร์|ถอดย้ายแอร์|ค่าถอดและย้าย|ย้าย.*แอร์.*เท่าไหร่|ค่าถอด.*แอร์)/i.test(text)) {
    return "relocation_pricing";
  }

  if (/(ค่าซ่อมรั่ว|ซ่อมรั่วแอร์|แอร์รั่ว.*ราคา|ราคา.*ซ่อมรั่ว|ค่าเติมน้ำยา|เติมน้ำยา.*ราคา|ราคาเติมน้ำยา)/i.test(text)) {
    return "repair_leak_pricing";
  }

  if (/(ค่าอะไหล่|ราคาอะไหล่)/i.test(text)) {
    return "parts_pricing";
  }

  if (/(แอร์ไม่เย็น|มีลมแต่ไม่เย็น|ลมออกแต่ไม่เย็น)/i.test(text)) {
    return "repair_not_cold_guidance";
  }

  if (/(เสียงดัง|แอร์ดัง|สั่น|มอเตอร์ดัง|ดังผิดปกติ)/i.test(text)) {
    return "repair_noise_guidance";
  }

  if (/(เบอร์ติดต่อ|โทร|ติดต่อร้าน|เบอร์โทร|เบอร์ไหน)/i.test(text)) {
    return "contact_info";
  }

  if (/(paa air service.*คือ.*ร้านอะไร|ร้านอะไร|ทำเกี่ยวกับอะไร|ให้บริการอะไรบ้าง|มีบริการอะไรบ้าง)/i.test(text)) {
    return "business_overview";
  }

  if (/(ร้านอยู่ที่ไหน|ที่อยู่ร้าน|พิกัดร้าน|แมพ|แผนที่|อยู่แถวไหน)/i.test(text)) {
    return "location";
  }

  return null;
}

export async function getCanonicalKnowledgeByTopic(topic: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("knowledge_docs_canonical_published_v1")
    .select("id, title, content, category, topic, tags, doc_code, version")
    .eq("topic", topic)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`getCanonicalKnowledgeByTopic failed: ${error.message}`);
    return null;
  }

  return data;
}

export async function loadCanonicalKnowledgeForTurn(userText: string) {
  const topic = resolveCanonicalTopic(userText);
  if (!topic) return null;

  const doc = await getCanonicalKnowledgeByTopic(topic);
  if (!doc) return null;

  return {
    topic: doc.topic,
    title: doc.title,
    content: doc.content ?? "",
    docCode: doc.doc_code,
    version: doc.version,
    category: doc.category,
  };
}

export async function searchKnowledge(query: string): Promise<KnowledgeSearchResult[]> {
  const canonical = await loadCanonicalKnowledgeForTurn(query);

  if (canonical) {
    return [{
      id: canonical.topic || "canonical",
      title: canonical.title,
      content: canonical.content,
      category: canonical.category || "general",
      tags: [],
      score: 100
    }];
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("knowledge_docs")
    .select("id, title, content, category, tags")
    .eq("status", "published");

  if (error) {
    throw new Error(`Failed to search knowledge: ${error.message}`);
  }

  const scoredDocs = (data ?? []).map((item: any) => ({
    ...item,
    tags: (item.tags as string[]) ?? [],
    score: scoreDocument(item.content, query, (item.tags as string[]) ?? [])
  }));

  return scoredDocs
    .filter((item: any) => item.score > 0)
    .sort((left: any, right: any) => right.score - left.score)
    .slice(0, 5);
}
