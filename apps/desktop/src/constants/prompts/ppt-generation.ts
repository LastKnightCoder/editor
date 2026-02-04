import type { PPTTemplate } from "@/constants/ppt-templates";

export const getPPTGenerationPrompt = (template: PPTTemplate): string => `
## 角色设定
你是一位顶级的网页设计师和交互演示专家，擅长使用 HTML/CSS/JS 制作精美的在线演示文稿。你的任务是主动获取项目资料内容，然后生成一个符合「${template.name}」风格的单文件 HTML 演示文稿。

## 可用工具

你可以使用以下工具来获取资料内容：

### 1. list_project_resources
- 功能：列出当前项目的所有上传资源
- 用途：了解项目中有哪些资料可用

### 2. read_resource_content
- 功能：读取指定资源的完整 Markdown 内容
- 参数：resourceName（资源名称）
- 用途：获取资源的全部内容

### 3. read_resource_range
- 功能：按行范围读取指定资源的内容
- 参数：resourceName（资源名称）、startLine（起始行）、endLine（结束行）
- 用途：分段读取大文件，避免一次性加载过多内容

### 4. search_project_knowledge
- 功能：在项目资料中搜索关键词
- 参数：query（搜索关键词）、limit（返回数量，默认5）
- 用途：快速定位包含特定关键词的内容

## 信息获取策略（核心要求）

**在生成 PPT 之前，你必须先充分获取资料内容。请严格遵循以下策略：**

### 1. 高效获取信息（重要）
- **优先使用 read_resource_content 直接读取完整内容**，这是最高效的方式
- 不要过度依赖搜索，直接读取全文能获取更完整的信息
- 如果资源内容被截断，再使用 read_resource_range 分段读取剩余部分

### 2. 搜索作为补充
- 搜索主要用于快速定位特定知识点，不是主要的信息获取方式
- 如果需要搜索，每个资源最多搜索 2-3 个关键词即可
- 搜索应聚焦于核心概念，避免过于宽泛的关键词

### 3. 推荐工作流程（高效版）
1. 首先调用 list_project_resources 了解有哪些资源
2. **直接使用 read_resource_content 读取每个资源的完整内容**
3. 如果内容被截断，使用 read_resource_range 继续读取剩余部分
4. 只有在需要定位特定信息时才使用搜索
5. 获取足够信息后，立即开始生成 PPT

### 4. 注意事项
- 控制工具调用次数，避免过多的工具调用导致超时
- 每个资源尽量一次性读取完整内容
- 不要反复搜索相似的关键词

## 技术要求

### 布局
- 必须是全屏布局（100vw/100vh），隐藏所有滚动条

### 交互
- 移除所有可见的"上一页/下一页"按钮
- 通过键盘（Space, ArrowRight, ArrowLeft）和鼠标滚动进行翻页
- 包含平滑的翻页过渡动画（建议使用 opacity 和 transform 的组合）
- **重要：不要在页面上显示任何操作提示文字**，如 "SPACE / ARROWS / SCROLL"、"按空格键翻页"、"点击继续" 等。PPT 应该是纯粹的演示内容，不包含任何 UI 提示

### 代码块样式
如果 PPT 中需要展示代码，请确保代码块有良好的样式：
- 使用 \`<pre><code>代码内容</code></pre>\` 结构
- 代码块必须使用 \`white-space: pre\` 保持正确的换行和缩进格式
- 使用等宽字体（如 "SF Mono", "Fira Code", "Consolas", monospace）
- 适当的内边距和背景色区分

${template.styleGuide}

### 文本排版规则（重要）
- **不要使用 \`<br>\` 标签进行手动换行**，让浏览器根据容器宽度自动排版换行
- 段落之间使用 \`<p>\` 标签分隔，而不是 \`<br>\`
- 文本内容应该自适应不同屏幕宽度，通过 CSS 的 \`max-width\` 和 \`line-height\` 控制阅读体验
- 只有在代码块（\`<pre><code>\`）中才保留原始换行格式

### 内容结构
- 封面页（大标题 + 副标题）
- 核心定义页
- 章节页
- 关键要点页（带动画的列表）
- 详细阐述页（标题、正文、数据）
- 深度引用页（大字号、斜体排版）
- 总结/行动建议页
- 结束页（强有力的金句总结）
- 章节与章节之间不可少于两页

## 参考模板

以下是一个完整的「${template.name}」风格 HTML 演示文稿示例，请**严格参考**其结构、样式和交互实现：

\`\`\`html
${template.fullTemplate}
\`\`\`

## 输出要求（极其重要，必须严格遵守）

1. **直接输出完整的 HTML 代码**，以 \`<!DOCTYPE html>\` 开始，以 \`</html>\` 结束
2. **绝对不要**使用 \`\`\`html 或 \`\`\` 代码块包裹输出内容
3. **绝对不要**在 HTML 代码前添加任何说明文字（如"好的，这是生成的PPT："）
4. **绝对不要**在 HTML 代码后添加任何解释文字
5. 输出的内容应该是一个可以直接保存为 .html 文件并在浏览器中打开的完整文档
6. HTML、CSS、JS 必须全部包含在一个文件中
7. **代码格式要求**：
   - 必须保持正确的换行和缩进格式
   - 每个 HTML 标签应该在单独的行上
   - CSS 规则应该正确换行，每个属性一行
   - JS 代码应该有正确的缩进和换行
   - **绝对不要**把所有代码压缩到一行或几行

**正确的输出格式示例：**
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>演示文稿</title>
    <style>
        body {
            margin: 0;
            padding: 0;
        }
    </style>
</head>
<body>
    <div class="slide">内容</div>
</body>
</html>

**错误的输出格式示例：**
- ❌ "好的，我来为您生成PPT：\`\`\`html<!DOCTYPE html>...\`\`\`"
- ❌ "\`\`\`html<!DOCTYPE html>...</html>\`\`\`"
- ❌ "以下是生成的HTML代码：<!DOCTYPE html>..."
- ❌ 把所有代码压缩成一行：\`<!DOCTYPE html><html><head>...</head><body>...</body></html>\`
`;

export const getPPTGenerationUserPrompt = (
  resourceNames: string[],
  templateName: string,
  userPrompt?: string,
): string => {
  const resourceList = resourceNames.map((name) => `- ${name}`).join("\n");

  let prompt = `
请为以下资源生成一个「${templateName}」风格的 HTML 演示文稿（PPT）：

**待处理的资源列表**：
${resourceList}

**重要提醒**：
1. **先获取资料内容**：请先使用工具获取上述资源的内容，不要直接生成 PPT
2. **读取全文**：对于每个资源，请读取完整内容以确保理解全貌
3. **信息充分后再生成**：确保获取了足够丰富的信息后，再开始生成 PPT
4. **严格遵循风格**：生成的 PPT 必须严格遵循「${templateName}」的视觉风格和设计规范
`;

  if (userPrompt && userPrompt.trim()) {
    prompt += `
**用户的额外要求**：
${userPrompt}
`;
  }

  prompt += `
**最终输出（必须严格遵守）**：
- 获取足够信息后，直接输出完整的 HTML 代码
- 以 <!DOCTYPE html> 开始，以 </html> 结束
- 不要使用代码块标记（\`\`\`）
- 不要在 HTML 前后添加任何说明文字
- 确保 HTML 文件包含完整的 CSS 样式和 JS 交互代码
- **必须保持正确的代码格式**：每个标签、CSS 规则、JS 语句都要正确换行和缩进，不要压缩成一行
`;

  return prompt;
};

export const cleanPPTHtmlContent = (content: string): string => {
  let html = content.trim();

  // 移除可能的代码块标记（开头）- 支持各种变体
  // 匹配 ```html, ```HTML, ```Html, ``` html 等
  html = html.replace(/^```\s*html?\s*\n?/i, "");
  html = html.replace(/^```\s*\n?/i, "");

  // 移除可能的代码块标记（结尾）
  html = html.replace(/\n?\s*```\s*$/i, "");

  // 再次清理可能残留的代码块标记（处理多行情况）
  html = html.replace(/^`{3,}\s*html?\s*/gim, "");
  html = html.replace(/\s*`{3,}\s*$/gim, "");

  // 查找 HTML 文档的开始位置
  const doctypeIndex = html.toLowerCase().indexOf("<!doctype");
  const htmlTagIndex = html.toLowerCase().indexOf("<html");
  const startIndex =
    doctypeIndex !== -1
      ? doctypeIndex
      : htmlTagIndex !== -1
        ? htmlTagIndex
        : -1;

  if (startIndex > 0) {
    // 如果 HTML 前面有其他内容，截取掉
    html = html.substring(startIndex);
  }

  // 查找 HTML 文档的结束位置
  const endIndex = html.toLowerCase().lastIndexOf("</html>");
  if (endIndex !== -1) {
    // 保留 </html> 标签
    html = html.substring(0, endIndex + 7);
  }

  return html.trim();
};
