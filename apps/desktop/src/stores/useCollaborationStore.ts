import { create } from "zustand";
import { invoke, on } from "@/electron";
import { DEFAULT_COLLABORATION_URL, type CollaborationState } from "@tau/collaboration";

interface State extends CollaborationState {
  selectedId?: string;
  select: (id?: string) => void;
}
const useCollaborationStore = create<State>(set => ({
  serverUrl: DEFAULT_COLLABORATION_URL,
  nickname: "Tau 用户",
  sessions: [],
  requests: [],
  select: selectedId => set({ selectedId }),
}));

let initialized = false;
export function initializeCollaborationStore() {
  if (initialized) return;
  initialized = true;
  on("collaboration:state", (_event, state: CollaborationState) =>
    useCollaborationStore.setState(state)
  );
  on("collaboration:removed", (_event, { documentId }: { documentId: string }) => {
    useCollaborationStore.setState(state => ({
      sessions: state.sessions.filter(session => session.id !== documentId),
      selectedId: state.selectedId === documentId ? undefined : state.selectedId,
    }));
  });
  const load = (remaining: number) => {
    void invoke<CollaborationState>("collaboration:state")
      .then(state => useCollaborationStore.setState(state))
      .catch(() => {
        if (remaining > 0) setTimeout(() => load(remaining - 1), 1000);
      });
  };
  load(20);
}

export default useCollaborationStore;
