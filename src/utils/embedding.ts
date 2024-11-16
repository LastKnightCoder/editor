import { splitMarkdown, embeddingOpenAI, createVecDocument } from '@/commands';
import { VecDocument } from "@/types";

export const embeddingCard = async (
  apiKey: string,
  baseUrl: string,
  model: string,
  input: string,
  cardId: number,
  cardUpdateTime: number,
): Promise<VecDocument[]> => {
  const chunks = await splitMarkdown(input);
  const embeddings = await Promise.all(chunks.map(chunk => embeddingOpenAI(apiKey, baseUrl, model, chunk)));
  return Promise.all(chunks.map((chunk, i) => createVecDocument({
    contentsEmbedding: embeddings[i],
    contents: chunk,
    refId: cardId,
    refType: 'card',
    refUpdateTime: cardUpdateTime,
  })));
};
