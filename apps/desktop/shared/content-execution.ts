import type { Descendant } from "slate";
import type { DesktopPluginPackage as DevelopmentPluginPackage } from "./plugin-package";
import type { IndexContentInput } from "../src-electron/main/modules/index-content-protocol";
import type { BuildPublishSearchIndexInput } from "../src-electron/main/modules/publish-search-index";

export type ContentExecutionRequest =
  | { operation: "validate" }
  | { operation: "inspect"; id: string }
  | { operation: "publish-search"; input: BuildPublishSearchIndexInput }
  | {
      operation: "markdown";
      nodes: Descendant[];
      contracts?: import("@tau/db-schema/content-contracts").ContentContractDictionary;
    }
  | { operation: "parse"; markdown: string }
  | {
      operation: "prepare-content";
      input:
        | { markdown: string }
        | {
            nodes: Descendant[];
            contracts?: import("@tau/db-schema/content-contracts").ContentContractDictionary;
          };
    }
  | { operation: "markdown-sections"; markdown: string; title: string; whole: boolean }
  | { operation: "sections"; nodes: Descendant[]; title: string; whole: boolean }
  | {
      operation: "index";
      input: IndexContentInput;
      contracts?: import("@tau/db-schema/content-contracts").ContentContractDictionary;
    };
export interface ContentExecutionEnvelope {
  hash: string;
  artifacts?: DevelopmentPluginPackage[];
  portableArtifacts?: import("./portable-development").PortableDevelopmentArtifact[];
  request: ContentExecutionRequest;
}
