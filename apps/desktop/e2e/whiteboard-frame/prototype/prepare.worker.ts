/// <reference lib="webworker" />
import * as Y from "yjs";
import { WhiteboardModel, type WhiteboardModelCommand } from "@tau/collaboration";
import { prepareCandidate } from "./transaction";

type Request =
  | { id: number; type: "init"; update: Uint8Array; roots: string[]; incremental?: boolean }
  | { type: "sync"; update: Uint8Array; roots: string[]; commands?: WhiteboardModelCommand[] }
  | {
      id: number;
      type: "prepare";
      commands: WhiteboardModelCommand[];
      roots: string[];
      incremental?: boolean;
    };

let model: WhiteboardModel | undefined;
let queue = Promise.resolve();
globalThis.onmessage = ({ data }: MessageEvent<Request>) => {
  queue = queue.then(async () => {
    try {
      if (data.type === "init") {
        model?.doc.destroy();
        model = new WhiteboardModel(new Y.Doc({ gc: false }));
      }
      if (!model) throw new Error("后台镜像尚未初始化");
      const current = model;
      if (data.type === "init" || data.type === "sync") {
        const handoff =
          data.type === "sync" && data.commands
            ? current.capturePreparedUpdate(data.commands)
            : undefined;
        if (handoff) handoff(() => Y.applyUpdate(current.doc, data.update), null);
        else Y.applyUpdate(current.doc, data.update);
        for (const name of data.roots) current.doc.getMap(name);
        if (data.type === "init") {
          await current.validate();
          if (data.incremental) current.prepareLocalTranslations();
          postMessage({ id: data.id, ok: true });
        }
      } else {
        for (const name of data.roots) current.doc.getMap(name);
        const candidate = await prepareCandidate(current, data.commands, data.incremental);
        postMessage({ id: data.id, ok: true, candidate }, [candidate.update.buffer]);
      }
    } catch (error) {
      postMessage({
        id: "id" in data ? data.id : null,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
