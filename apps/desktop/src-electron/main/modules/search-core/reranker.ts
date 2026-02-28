import pythonService from "../python-service";
import { ParsedQuery, RerankResult, Reranker } from "./types";

export interface LocalRerankerOptions {
  enabled?: boolean;
  modelDir?: string;
  modelName?: string;
  batchSize?: number;
  devicePolicy?: "auto" | "cpu" | "cuda";
}

interface RerankTextsResponse {
  available?: boolean;
  reason?: string;
  device?: string;
  modelName?: string;
  scores?: number[];
}

export class NoopReranker implements Reranker {
  readonly name = "noop-reranker" as const;
  private readonly reason: string;

  constructor(reason = "reranker disabled") {
    this.reason = reason;
  }

  async rerank(): Promise<RerankResult> {
    return {
      available: false,
      used: false,
      scores: [],
      reason: this.reason,
    };
  }
}

export class LocalReranker implements Reranker {
  readonly name = "local-reranker" as const;
  private readonly options: LocalRerankerOptions;

  constructor(options: LocalRerankerOptions) {
    this.options = options;
  }

  async rerank(query: ParsedQuery, texts: string[]): Promise<RerankResult> {
    if (this.options.enabled === false) {
      return {
        available: false,
        used: false,
        scores: [],
        reason: "local reranker disabled",
        meta: {
          enabled: false,
          modelDir: this.options.modelDir,
          modelName: this.options.modelName,
        },
      };
    }

    if (texts.length === 0) {
      return {
        available: true,
        used: false,
        scores: [],
        meta: {
          enabled: true,
          modelDir: this.options.modelDir,
          modelName: this.options.modelName,
          reason: "empty-texts",
        },
      };
    }

    if (!this.options.modelDir || !this.options.modelName) {
      return {
        available: false,
        used: false,
        scores: [],
        reason: "missing local reranker model config",
        meta: {
          enabled: true,
          modelDir: this.options.modelDir,
          modelName: this.options.modelName,
        },
      };
    }

    try {
      const client = await pythonService.ensureStarted();
      const result = await client.request<RerankTextsResponse>("rerank_texts", {
        query: query.normalized,
        texts,
        modelDir: this.options.modelDir,
        modelName: this.options.modelName,
        batchSize: this.options.batchSize || 8,
        devicePolicy: this.options.devicePolicy || "auto",
      });

      const scores = sanitizeScores(result.scores || [], texts.length);
      return {
        available: result.available !== false,
        used: result.available !== false && scores.length > 0,
        scores,
        reason: result.reason,
        meta: {
          modelDir: this.options.modelDir,
          modelName: this.options.modelName,
          runtimeModelName: result.modelName,
          device: result.device,
        },
      };
    } catch (error) {
      return {
        available: false,
        used: false,
        scores: [],
        reason: error instanceof Error ? error.message : String(error),
        meta: {
          modelDir: this.options.modelDir,
          modelName: this.options.modelName,
        },
      };
    }
  }
}

function sanitizeScores(scores: number[], expectedLength: number): number[] {
  const safeScores = new Array<number>(expectedLength).fill(0);
  for (let index = 0; index < expectedLength; index += 1) {
    const score = scores[index];
    if (typeof score === "number" && Number.isFinite(score)) {
      safeScores[index] = score;
    }
  }
  return safeScores;
}
