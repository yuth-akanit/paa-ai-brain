import { createKnowledgeDoc, listKnowledgeDocs, deleteKnowledgeDoc } from "@/lib/db/queries";
import { isMockMode } from "@/lib/config/app-mode";
import { mockKnowledgeDocs, mockPricingFacts } from "@/lib/data/mock-store";

export async function listKnowledgeFromProvider() {
  if (isMockMode()) {
    return mockKnowledgeDocs;
  }

  return listKnowledgeDocs();
}

export async function createKnowledgeFromProvider(payload: {
  title: string;
  category: string;
  content: string;
  tags: string[];
  status: "draft" | "published";
}) {
  if (isMockMode()) {
    return {
      id: "mock-created-knowledge-" + Math.random().toString(36).slice(2, 9),
      ...payload,
      updated_at: new Date().toISOString(),
      _mock: true
    };
  }

  return createKnowledgeDoc(payload);
}

export async function deleteKnowledgeFromProvider(id: string) {
  if (isMockMode()) {
    return;
  }

  return deleteKnowledgeDoc(id);
}

export function listPricingFactsFromMock() {
  return mockPricingFacts;
}
