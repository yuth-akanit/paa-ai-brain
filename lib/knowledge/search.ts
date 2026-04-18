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

export async function searchKnowledge(query: string): Promise<KnowledgeSearchResult[]> {
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
