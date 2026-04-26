import type {
  AgentRuntimeAPI,
  AgentRuntimeConfig,
  AgentRuntimeExtensionsAPI,
  AgentTelemetryAPI,
  AgentTraceSpan,
  AgentTracingAPI,
} from "../types";

const noopTelemetry: AgentTelemetryAPI = {
  async record() {
    // noop
  },
};

const noopSpan: AgentTraceSpan = {
  async end() {
    // noop
  },
};

const noopTracing: AgentTracingAPI = {
  async startSpan() {
    return noopSpan;
  },
};

export const createAgentRuntimeAPI = (
  config?: AgentRuntimeConfig,
): AgentRuntimeAPI => {
  const extensions = new Map(Object.entries(config?.extensions ?? {}));
  const extensionAPI: AgentRuntimeExtensionsAPI = {
    has(name) {
      return extensions.has(name);
    },
    get<T = unknown>(name: string) {
      return extensions.get(name) as T | undefined;
    },
    require<T = unknown>(name: string) {
      if (!extensions.has(name)) {
        throw new Error(`Agent runtime extension "${name}" is not registered`);
      }
      return extensions.get(name) as T;
    },
    list() {
      return Array.from(extensions.keys());
    },
  };

  return {
    telemetry: config?.telemetry ?? noopTelemetry,
    tracing: config?.tracing ?? noopTracing,
    extensions: extensionAPI,
  };
};
