import type { Descendant } from "slate";
import type { DesktopPluginPackage as DevelopmentPluginPackage } from "./plugin-package";
import type { IndexContentInput } from "../src-electron/main/modules/index-content-protocol";
import type { BuildPublishSearchIndexInput } from "../src-electron/main/modules/publish-search-index";

export type ContentExecutionRequest =
  | { operation: "validate" }
  | { operation: "publish-search"; input: BuildPublishSearchIndexInput }
  | { operation: "markdown"; nodes: Descendant[] }
  | { operation: "parse"; markdown: string }
  | { operation: "markdown-sections"; markdown: string; title: string; whole: boolean }
  | { operation: "sections"; nodes: Descendant[]; title: string; whole: boolean }
  | { operation: "index"; input: IndexContentInput };
export interface ContentExecutionEnvelope {
  hash: string;
  artifacts?: DevelopmentPluginPackage[];
  portableArtifacts?: import("./portable-development").PortableDevelopmentArtifact[];
  request: ContentExecutionRequest;
}
