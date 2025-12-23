import type { ToolDefinition } from "@/types";

export interface MCPProviderDefinition {
  id: string;
  name: string;
  description: string;
  defaultEnabled?: boolean;
  tools: () => ToolDefinition[];
}
