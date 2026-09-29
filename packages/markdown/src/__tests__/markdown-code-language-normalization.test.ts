import { describe, expect, it } from "vitest";

import { bareProcessor } from "./fixtures.ts";

const importFromMarkdown = bareProcessor.importFromMarkdown;

describe("markdown code block language normalization", () => {
  it("将 js 和 javascript 规范化为 JavaScript", () => {
    const jsContent = importFromMarkdown("```js\nconsole.log(1)\n```");
    const javascriptContent = importFromMarkdown("```javascript\nconsole.log(1)\n```");

    expect((jsContent[0] as any)?.type).toBe("code-block");
    expect((jsContent[0] as any)?.language).toBe("JavaScript");
    expect((javascriptContent[0] as any)?.type).toBe("code-block");
    expect((javascriptContent[0] as any)?.language).toBe("JavaScript");
  });

  it("将 html 规范化为 HTML", () => {
    const content = importFromMarkdown("```html\n<div></div>\n```");

    expect((content[0] as any)?.type).toBe("code-block");
    expect((content[0] as any)?.language).toBe("HTML");
  });

  it("支持更多常见语言映射", () => {
    const tsxContent = importFromMarkdown("```tsx\nconst App = () => null\n```");
    const graphqlContent = importFromMarkdown("```graphql\ntype Query { hello: String }\n```");
    const dockerfileContent = importFromMarkdown("```dockerfile\nFROM node:20\n```");
    const plainTextContent = importFromMarkdown("```plaintext\nhello\n```");

    expect((tsxContent[0] as any)?.language).toBe("TSX");
    expect((graphqlContent[0] as any)?.language).toBe("GraphQL");
    expect((dockerfileContent[0] as any)?.language).toBe("Dockerfile");
    expect((plainTextContent[0] as any)?.language).toBe("Plain Text");
  });

  it("未命中字典时保留原始语言", () => {
    const content = importFromMarkdown("```MyCustomLang\nhello\n```");

    expect((content[0] as any)?.type).toBe("code-block");
    expect((content[0] as any)?.language).toBe("MyCustomLang");
  });
});
