import { createServiceId } from "./service-contract.ts";

export interface RuntimeStyleRequest {
  source: string;
  language: "html" | "tsx";
}

export interface RuntimeStyleCompiler {
  /** 按源码语言扫描 Tailwind 类名，返回 CSS。 */
  compile(request: RuntimeStyleRequest): Promise<string>;
}

export const IRuntimeStyleCompiler = createServiceId<RuntimeStyleCompiler>(
  "tau.host.runtime-style-compiler"
);
