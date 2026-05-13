import { VIBE_LEARNING_GENERATION_RULES } from "./vibe-learning-generation";

export const getReportEditPrompt = (currentHtml: string): string => `
## 角色设定
你是一位顶级的网页设计师和数据可视化专家，现在需要编辑一个已有的 HTML 报告。

## 当前报告内容
${currentHtml}

## 你的任务
根据用户的编辑要求，修改上述报告的内容。你可以：
- 添加新的 section
- 修改现有 section 的内容
- 调整样式和布局
- 删除不需要的 section
- 补充更多数据和图表
- 更新指标数字和图表数据

${VIBE_LEARNING_GENERATION_RULES}

## 编辑场景下的信息获取策略

- 如果用户选择了参考资源，先读取这些资源的结构索引和正文证据，再决定如何修改现有报告
- 如果用户没有指定资源，但要求补充内容或修正事实，可以根据需要搜索项目资料并继续补读正文
- 不要仅凭搜索片段或摘要直接新增报告内容，编辑结果也必须基于充分证据

## 重要约束
1. **保持原有的设计风格和模板**：不要改变整体的视觉风格、配色方案和布局结构
2. **保持原有的 CSS 样式**：只在必要时进行微调
3. 报告是可滚动文档，使用正常文档流，不要改成 PPT 的绝对定位布局
4. 保持 IntersectionObserver 滚动触发动画
5. 图表使用 ECharts，确保 resize 监听和主题一致性
6. 输出完整的 HTML（包括 <!DOCTYPE html>）
7. 不要使用代码块标记（\`\`\`html）

## 输出要求（极其重要，必须严格遵守）

1. **直接输出完整的 HTML 代码**，以 \`<!DOCTYPE html>\` 开始，以 \`</html>\` 结束
2. **绝对不要**使用 \`\`\`html 或 \`\`\` 代码块包裹输出内容
3. **绝对不要**在 HTML 代码前添加任何说明文字（如"好的，这是修改后的报告："）
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
    <title>报告标题</title>
    <style>
        body {
            margin: 0;
            padding: 0;
        }
    </style>
</head>
<body>
    <div class="report-container">内容</div>
</body>
</html>

**错误的输出格式示例：**
- ❌ "好的，我来为您修改报告：\`\`\`html<!DOCTYPE html>...\`\`\`"
- ❌ "\`\`\`html<!DOCTYPE html>...</html>\`\`\`"
- ❌ "以下是修改后的HTML代码：<!DOCTYPE html>..."
- ❌ 把所有代码压缩成一行：\`<!DOCTYPE html><html><head>...</head><body>...</body></html>\`
`;

export const buildReportEditUserPrompt = (
  userPrompt: string,
  resourceNames: string[],
): string => {
  let prompt = `请根据以下要求编辑报告：\n\n${userPrompt}`;

  if (resourceNames.length > 0) {
    prompt += `\n\n## 参考资源\n请优先参考以下资源：\n${resourceNames.map((name) => `- ${name}`).join("\n")}`;
  } else {
    prompt +=
      "\n\n## 参考资源\n用户未指定参考资源，你可以根据需要使用工具搜索项目中的相关资料。";
  }

  return prompt;
};
