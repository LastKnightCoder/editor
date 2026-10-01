import { useMemo, useRef } from "react";
import { useStore } from "zustand";
import { createQuizSession } from "../quizSession";
import { useQuizMutations } from "../quizQueries";

export function useQuizSession() {
  const { createRecord } = useQuizMutations();
  const owner = useRef<object | null>(null);
  const session = useMemo(() => {
    const identity = {};
    owner.current = identity;
    return createQuizSession(createRecord, () => owner.current === identity);
  }, [createRecord]);
  const state = useStore(session.store);
  return { ...session, ...state };
}
