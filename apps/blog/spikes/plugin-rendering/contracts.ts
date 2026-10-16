import type { InitData } from "../../src/types";

export interface RenderDependency {
  id: string;
  version: string;
  entry: string;
  css: string;
  sha256: string;
  nodeTypes: string[];
}

export interface SpikeData {
  mode: "desktop" | "blog";
  page: InitData;
  plugins: RenderDependency[];
}
