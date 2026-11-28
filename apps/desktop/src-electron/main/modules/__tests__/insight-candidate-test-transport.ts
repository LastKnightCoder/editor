import type Database from "better-sqlite3";
import { computeInsightCandidates } from "../topic-insights-candidate-core";
import type {
  CandidateInput,
  CandidateKind,
  CandidateResults,
  CandidateSource,
  CandidateTransport,
} from "../topic-insights-candidate-protocol";

export function candidateTestTransport(database: () => Database.Database): CandidateTransport {
  return async <K extends CandidateKind>(
    _source: CandidateSource,
    task: CandidateInput<K>,
    signal?: AbortSignal
  ): Promise<CandidateResults[K]> => {
    const check = () => signal?.throwIfAborted();
    const result = await computeInsightCandidates(database(), task, check);
    check();
    return result as CandidateResults[K];
  };
}
