import { createServiceId } from "@tau/shared/service-contract";

export interface TypstCompiler {
  /** 返回 Typst 渲染协议消费的 HTML。 */
  compile(code: string): Promise<string>;
}

export const ITypstCompiler = createServiceId<TypstCompiler>("tau.diagram.typst-compiler");
