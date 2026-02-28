import pythonService from "../python-service";
import {
  ExpansionResult,
  ParsedQuery,
  QueryExpander,
  TypedExpansionQuery,
} from "./types";

export interface LocalQueryExpanderOptions {
  enabled?: boolean;
  modelDir?: string;
  modelName?: string;
  devicePolicy?: "auto" | "cpu" | "cuda";
  maxAlternatives?: number;
}

interface ExpandQueryResponse {
  available?: boolean;
  reason?: string;
  device?: string;
  fallbackUsed?: boolean;
  rawPreview?: string;
  expansions?: Array<{
    type?: string;
    text?: string;
  }>;
}

export class NoopExpander implements QueryExpander {
  readonly name = "noop-expander" as const;
  private readonly reason: string;

  constructor(reason = "expander disabled") {
    this.reason = reason;
  }

  async expand(): Promise<ExpansionResult> {
    return {
      available: false,
      used: false,
      queries: [],
      reason: this.reason,
    };
  }
}

export class LocalQueryExpander implements QueryExpander {
  readonly name = "local-query-expander" as const;
  private readonly options: LocalQueryExpanderOptions;

  constructor(options: LocalQueryExpanderOptions) {
    this.options = options;
  }

  async expand(query: ParsedQuery): Promise<ExpansionResult> {
    if (this.options.enabled === false) {
      return {
        available: false,
        used: false,
        queries: [],
        reason: "local query expander disabled",
        meta: {
          enabled: false,
          modelDir: this.options.modelDir,
          modelName: this.options.modelName,
        },
      };
    }

    if (!this.options.modelDir || !this.options.modelName) {
      return {
        available: false,
        used: false,
        queries: [],
        reason: "missing local query expansion model config",
        meta: {
          enabled: true,
          modelDir: this.options.modelDir,
          modelName: this.options.modelName,
        },
      };
    }

    try {
      const client = await pythonService.ensureStarted();
      const result = await client.request<ExpandQueryResponse>("expand_query", {
        query: query.normalized,
        modelDir: this.options.modelDir,
        modelName: this.options.modelName,
        devicePolicy: this.options.devicePolicy || "auto",
        maxAlternatives: this.options.maxAlternatives ?? 2,
      });

      const sanitized = sanitizeTypedQueries(
        result.expansions || [],
        query.normalized,
      );

      return {
        available: result.available !== false,
        used: sanitized.length > 0,
        queries: sanitized,
        reason: result.reason,
        meta: {
          modelDir: this.options.modelDir,
          modelName: this.options.modelName,
          device: result.device,
          fallbackUsed: result.fallbackUsed === true,
          rawPreview: result.rawPreview,
        },
      };
    } catch (error) {
      return {
        available: false,
        used: false,
        queries: [],
        reason: error instanceof Error ? error.message : String(error),
        meta: {
          modelDir: this.options.modelDir,
          modelName: this.options.modelName,
        },
      };
    }
  }
}

function sanitizeTypedQueries(
  queries: Array<{ type?: string; text?: string }>,
  originalQuery: string,
): TypedExpansionQuery[] {
  const results: TypedExpansionQuery[] = [];
  const seen = new Set<string>([originalQuery.trim().toLowerCase()]);
  for (const query of queries) {
    const type = query.type;
    const text = query.text?.trim();
    if (!text) continue;
    if (type !== "lex" && type !== "vec" && type !== "hyde") continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      type,
      text,
    });
  }
  return results;
}
