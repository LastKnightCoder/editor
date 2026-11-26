import { useRef, useState } from "react";
import type { QueryDefinition } from "@tau/shared/query-database";
import type { EditorTextField } from "@tau/editor/source-contracts";
import { useQueryDatabaseAssist } from "./useQueryDatabaseAssist";

export type QueryAssistState =
  | { status: "idle" }
  | { status: "busy"; request: string }
  | { status: "done"; request: string; previous: QueryDefinition }
  | { status: "conflict"; request: string; candidate: QueryDefinition }
  | { status: "error"; request: string; message: string };

/**
 * AI 编写查询：写完直接生效并可撤销；生成期间源码被改过时不覆盖，留作候选。
 * 只发送字段目录、当前查询、参数和错误，不发送结果行。
 */
export function useQueryAssist(input: {
  definition: QueryDefinition;
  error?: string;
  codeBinding?: EditorTextField | null;
  onDefinitionChange?(definition: QueryDefinition): void;
}) {
  const assist = useQueryDatabaseAssist();
  const [state, setState] = useState<QueryAssistState>({ status: "idle" });
  const latest = useRef(input);
  latest.current = input;
  const generation = useRef(0);

  const generate = async (request: string) => {
    const { definition, codeBinding, error, onDefinitionChange } = latest.current;
    if (!assist || !request.trim() || !onDefinitionChange) return;
    const token = ++generation.current;
    codeBinding?.flushInputs?.();
    const snapshot = codeBinding?.getSnapshot();
    const original = snapshot ? { ...definition, code: snapshot.value } : definition;
    setState({ status: "busy", request });
    try {
      const response = await assist({ definition: original, request, error });
      if (token !== generation.current) return;
      const code = response
        .trim()
        .replace(/^```[^\n]*\n/, "")
        .replace(/\n```\s*$/, "");
      const next = { ...original, code };
      const current = latest.current;
      let unchanged = JSON.stringify(current.definition) === JSON.stringify(original);
      if (codeBinding) {
        try {
          unchanged =
            unchanged &&
            current.codeBinding === codeBinding &&
            codeBinding.getSnapshot().revision === snapshot?.revision;
        } catch {
          unchanged = false;
        }
      }
      if (unchanged) {
        current.onDefinitionChange?.(next);
        setState({ status: "done", request, previous: original });
      } else setState({ status: "conflict", request, candidate: next });
    } catch (reason) {
      if (token !== generation.current) return;
      setState({
        status: "error",
        request,
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  };

  return {
    available: Boolean(assist && input.onDefinitionChange),
    state,
    generate,
    stop() {
      generation.current++;
      setState({ status: "idle" });
    },
    dismiss() {
      setState({ status: "idle" });
    },
    undo() {
      if (state.status === "done") latest.current.onDefinitionChange?.(state.previous);
      setState({ status: "idle" });
    },
    accept() {
      if (state.status === "conflict") latest.current.onDefinitionChange?.(state.candidate);
      setState({ status: "idle" });
    },
  };
}
