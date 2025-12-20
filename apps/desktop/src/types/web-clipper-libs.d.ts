declare module "defuddle" {
  export interface DefuddleResult {
    content: string;
    title?: string;
    author?: string;
    published?: string;
    description?: string;
    site?: string;
    domain?: string;
    wordCount?: number;
    parseTime?: number;
    image?: string;
    favicon?: string;
    schemaOrgData?: unknown;
    metaTags?: Array<{
      name?: string | null;
      property?: string | null;
      content: string | null;
    }>;
  }

  export interface DefuddleOptions {
    url?: string;
  }

  export default class Defuddle {
    constructor(doc: Document, options?: DefuddleOptions);
    parse(): DefuddleResult;
  }
}

declare module "mathml-to-latex" {
  export const MathMLToLaTeX: {
    convert: (mathml: string) => string;
  };
}

declare module "turndown" {
  type TurndownRule = {
    filter: any;
    replacement: (content: string, node: Node, options?: any) => string;
  };

  export default class TurndownService {
    constructor(options?: Record<string, unknown>);
    addRule(name: string, rule: TurndownRule): void;
    remove(filter: string[] | ((node: Node, options?: any) => boolean)): void;
    keep(filter: string[] | ((node: Node, options?: any) => boolean)): void;
    turndown(input: string | Node): string;
    options: any;
  }
}
