import type { AskedGroup, NotePair } from "./topic-insights-candidates";
import type { RelatedThreshold } from "./entity-context/related-threshold";

export interface CandidateSource {
  file: string;
  fingerprint: string;
  schemaVersion: number;
}

export interface CandidateSection {
  heading: string;
  blockStart: number;
  text: string;
}

export interface CandidatePair extends NotePair {
  sections: Array<[string, CandidateSection]>;
}

type Links = Array<[string, string[]]>;

export type CandidateTask =
  | { kind: "threshold"; now: number }
  | {
      kind: "subtopic";
      keys: string[];
      links: Links;
      threshold: number;
      limit: number;
      involving?: string[];
      longDocs: string[];
    }
  | {
      kind: "global";
      topics: Array<{ topicId: number; members: Array<{ key: string; updateTime: number }> }>;
      links: Links;
      concepts: Array<[string, string[]]>;
      threshold: number;
      longDocs: string[];
    }
  | {
      kind: "project";
      review: "growth" | "final";
      items: Array<{ key: string; root: number }>;
      outside: string[];
      knownKeys: string[];
      links: Links;
      threshold: number | null;
      others: Array<{ projectId: number; title: string; keys: string[] }>;
    };

export interface CandidateResults {
  threshold: { threshold: RelatedThreshold | null; sampled: boolean };
  subtopic: { pairs: CandidatePair[] };
  global: { pairs: CandidatePair[]; asked: AskedGroup[] };
  project: {
    candidates: Array<{ key: string; root: number; similarity: number }>;
    homes: Array<{ projectId: number; title: string; similarity: number }>;
  };
}

export type CandidateKind = CandidateTask["kind"];
export type CandidateInput<K extends CandidateKind> = Extract<CandidateTask, { kind: K }>;
export type CandidateTransport = <K extends CandidateKind>(
  source: CandidateSource,
  task: CandidateInput<K>,
  signal?: AbortSignal
) => Promise<CandidateResults[K]>;

export interface CandidateWorkerInput {
  source: CandidateSource;
  task: CandidateTask;
  cancel: SharedArrayBuffer;
  extensionPath: string;
  sqliteModulePath: string;
}

export type CandidateWorkerResult =
  | {
      ok: true;
      kind: CandidateKind;
      result: CandidateResults[CandidateKind];
      stages: Array<{ label: string; ms: number }>;
    }
  | { ok: false; message: string; cancelled: boolean };

export type CandidateWorkerMessage =
  | CandidateWorkerResult
  | { phase: "opened"; kind: CandidateKind };
