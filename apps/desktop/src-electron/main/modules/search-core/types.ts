export type QueryVariantType = "original" | "lex" | "vec" | "hyde";
export type ExpansionType = Exclude<QueryVariantType, "original">;
export type SearchSource = "fts" | "vec";

export interface ParsedQuery {
  raw: string;
  normalized: string;
  tokens: string[];
  isEmpty: boolean;
}

export interface TypedExpansionQuery {
  type: ExpansionType;
  text: string;
}

export interface SearchCandidate<TPayload extends object> {
  key?: string;
  dedupeKey: string;
  source: SearchSource;
  payload: TPayload;
  text: string;
  snippet?: string;
  retrievalScore?: number;
}

export interface StrongSignalProbeResult<TPayload extends object> {
  candidates: SearchCandidate<TPayload>[];
  topScore?: number;
  secondScore?: number;
  hasStrongSignal?: boolean;
}

export interface RrfCandidate<
  TPayload extends object,
> extends SearchCandidate<TPayload> {
  key: string;
  rrfScore: number;
  topRank: number;
}

export interface FinalCandidate<
  TPayload extends object,
> extends RrfCandidate<TPayload> {
  rank: number;
  selectedChunk: string;
  snippet: string;
  rerankScore?: number;
  finalScore: number;
}

export interface SearchAdapter<TPayload extends object, TContext> {
  name: string;
  canUseVector(context: TContext): boolean;
  probeStrongSignal(
    query: ParsedQuery,
    context: TContext,
    limit: number,
  ): Promise<StrongSignalProbeResult<TPayload>>;
  searchFTS(
    queryText: string,
    context: TContext,
    limit: number,
    variant: QueryVariantType,
  ): Promise<SearchCandidate<TPayload>[]>;
  searchVec(
    queryText: string,
    context: TContext,
    limit: number,
    variant: QueryVariantType,
  ): Promise<SearchCandidate<TPayload>[]>;
  finalize(
    result: FinalCandidate<TPayload>,
    context: TContext,
  ): Promise<TPayload> | TPayload;
}

export interface QueryExpander {
  name: "local-query-expander" | "noop-expander";
  expand(query: ParsedQuery): Promise<ExpansionResult>;
}

export interface ExpansionResult {
  available: boolean;
  used: boolean;
  queries: TypedExpansionQuery[];
  reason?: string;
  meta?: Record<string, unknown>;
}

export interface Reranker {
  name: "local-reranker" | "noop-reranker";
  rerank(query: ParsedQuery, texts: string[]): Promise<RerankResult>;
}

export interface RerankResult {
  available: boolean;
  used: boolean;
  scores: number[];
  reason?: string;
  meta?: Record<string, unknown>;
}

export interface SearchCoreConfig {
  rrfK: number;
  candidateLimit: number;
  perQueryLimit: number;
  topRankBonus: {
    top1: number;
    top2To3: number;
  };
  blendWeights: {
    top1To3: number;
    top4To10: number;
    top11Plus: number;
  };
  structureBonus: {
    section: number;
    chapter: number;
    summary: number;
  };
  strongSignal: {
    minScore: number;
    minGap: number;
  };
}

export const DEFAULT_SEARCH_CORE_CONFIG: SearchCoreConfig = {
  rrfK: 60,
  candidateLimit: 40,
  perQueryLimit: 20,
  topRankBonus: {
    top1: 0.05,
    top2To3: 0.02,
  },
  blendWeights: {
    top1To3: 0.75,
    top4To10: 0.6,
    top11Plus: 0.4,
  },
  structureBonus: {
    section: 0.04,
    chapter: 0.02,
    summary: -0.01,
  },
  strongSignal: {
    minScore: 0.85,
    minGap: 0.15,
  },
};

export interface SearchPipelineLog {
  queryId: string;
  expandUsed: boolean;
  rerankUsed: boolean;
  ftsCount: number;
  vecCount: number;
  candidateCount: number;
  latencyByStage: Record<string, number>;
  degradeReason: string;
}

export type SearchPipelineStage =
  | "parse"
  | "strongSignal"
  | "expand"
  | "retrieve"
  | "rrf"
  | "chunk"
  | "rerank"
  | "blend"
  | "finalize"
  | "summary";

export interface SearchPipelineStageLog {
  queryId: string;
  stage: SearchPipelineStage;
  latencyMs: number;
  detail: Record<string, unknown>;
}

export interface SearchPipelineResult<TPayload extends object> {
  results: TPayload[];
  log: SearchPipelineLog;
}

export interface SearchPipelineParams<TPayload extends object, TContext> {
  query: string;
  limit?: number;
  context: TContext;
  queryId?: string;
  adapter: SearchAdapter<TPayload, TContext>;
  expander: QueryExpander;
  reranker: Reranker;
  config?: Partial<SearchCoreConfig>;
  logger?: (log: SearchPipelineLog) => void;
  stageLogger?: (log: SearchPipelineStageLog) => void;
}
