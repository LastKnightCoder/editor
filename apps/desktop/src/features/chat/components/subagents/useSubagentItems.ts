import { useMemo } from "react";
import { usePiInteractionStore } from "@/services/piInteractions";
import type { PiSessionInteractionSnapshot } from "@/types/pi-session";
import type { SubagentParentRef, SubagentRun, SubagentView } from "@/types/subagent";
import { useSubagents } from "../../subagentQueries";
import { currentRun, displayStatus, type SubagentDisplayStatus } from "./model";

export interface SubagentItem {
  view: SubagentView;
  run?: SubagentRun;
  status: SubagentDisplayStatus;
  interactions?: PiSessionInteractionSnapshot;
}

/** 列表视图 + 交互快照合成界面条目；parent 缺省时为本窗口活跃父会话的全部子 Agent */
export function useSubagentItems(parent?: SubagentParentRef) {
  const parentScope = parent?.scope;
  const query = useSubagents(parent);
  const sessions = usePiInteractionStore(state => state.sessions);
  const items = useMemo<SubagentItem[]>(
    () =>
      (query.data?.agents ?? [])
        .filter(view => !parentScope || view.parentScope === parentScope)
        .map(view => {
          const interactions = view.hostId ? sessions[view.hostId] : undefined;
          return {
            view,
            run: currentRun(view),
            status: displayStatus(view, interactions),
            interactions,
          };
        }),
    [query.data, sessions, parentScope]
  );
  return { items, query };
}
