import type { ToolDefinition } from "@/types";

export interface MCPProviderDefinition {
  id: string;
  name: string;
  description: string;
  defaultEnabled?: boolean;
  isAvailable?: () => boolean;
  tools: () => ToolDefinition[];
}
