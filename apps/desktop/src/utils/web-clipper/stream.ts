import { ClipStreamChunk } from "./types";

export function createSingleChunkStream(
  markdown: string,
  signal?: AbortSignal,
): AsyncIterable<ClipStreamChunk> {
  async function* generator(): AsyncIterable<ClipStreamChunk> {
    if (signal?.aborted) {
      throw new Error("aborted");
    }
    if (markdown) {
      yield markdown;
    }
    if (signal?.aborted) {
      throw new Error("aborted");
    }
  }
  return generator();
}

export async function collectClipStream(
  stream: AsyncIterable<ClipStreamChunk>,
): Promise<string> {
  let markdown = "";
  for await (const chunk of stream) {
    markdown += chunk;
  }
  return markdown;
}
