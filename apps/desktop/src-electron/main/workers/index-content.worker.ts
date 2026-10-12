import { parentPort } from "node:worker_threads";
import { getMarkdown } from "@/utils/markdown";
import { splitSections } from "@/entity/sections";
import type { IndexContentInput, IndexContentReply } from "../modules/index-content-protocol";

parentPort!.on("message", (input: IndexContentInput) => {
  let reply: IndexContentReply;
  try {
    const value = JSON.parse(input.raw);
    const nodes = Array.isArray(value) ? value : [];
    const content = getMarkdown(nodes).trim();
    reply = {
      ok: true,
      result: {
        content,
        sections:
          input.sections && content ? splitSections(nodes, input.title, input.whole) : undefined,
      },
    };
  } catch (error) {
    reply = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  parentPort!.postMessage(reply);
});
