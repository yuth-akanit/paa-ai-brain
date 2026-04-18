import { mockKnowledgeDocs } from "@/lib/data/mock-store";
import type { KnowledgeSearchResult } from "@/lib/types";

function score(content: string, query: string, tags: string[]) {
  const q = query.toLowerCase();
  let total = 0;

  if (content.toLowerCase().includes(q)) {
    total += 5;
  }

  for (const token of q.split(/\s+/)) {
    if (content.toLowerCase().includes(token)) {
      total += 2;
    }

    if (tags.some((tag) => tag.toLowerCase().includes(token))) {
      total += 3;
    }
  }

  return total;
}

export function searchMockKnowledge(query: string): KnowledgeSearchResult[] {
  return mockKnowledgeDocs
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      category: doc.category,
      tags: doc.tags,
      score: score(doc.content, query, doc.tags)
    }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
