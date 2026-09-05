# PDF 导出功能

## 功能概述

PDF 导出功能允许用户将文档、卡片、文章等内容导出为高质量的 PDF 文件。

### 核心特性

- ✅ **文本可检索** - 导出的 PDF 支持全文搜索和文字复制
- ✅ **合理分页** - 由 Chromium 排版引擎处理，避免内容截断
- ✅ **样式保留** - 完整保留代码高亮、表格、数学公式等样式
- ✅ **零依赖** - 复用 Electron 内置 Chromium，无需额外依赖
- ✅ **灵活配置** - 支持纸张大小、页边距、章节换页等选项

## 技术架构

### 导出流程

```
用户触发导出
    ↓
前端收集内容 (Slate 节点)
    ↓
使用 htmlSerializerRegistry 序列化为 HTML
    ↓
收集 Tailwind 样式
    ↓
通过 IPC 发送到主进程
    ↓
主进程创建隐藏 BrowserWindow
    ↓
加载 HTML 并等待渲染完成
    ↓
调用 webContents.printToPDF
    ↓
保存 PDF 文件
```

### 核心文件

#### 类型定义

- `apps/desktop/src/types/pdf-export.ts` - TypeScript 类型定义

#### 主进程

- `apps/desktop/src-electron/main/modules/pdf-exporter.ts` - PDF 导出核心逻辑
- `apps/desktop/src-electron/main/modules/extra.ts` - IPC 注册

#### 前端

- `apps/desktop/src/commands/pdf-export.ts` - IPC 调用封装
- `apps/desktop/src/utils/pdf-html-builder.ts` - HTML 构建工具
- `apps/desktop/src/components/PdfExportModal/index.tsx` - 导出配置 Modal

#### 页面接入

- `apps/desktop/src/pages/ArticleListView/ArticleCard/index.tsx`
- `apps/desktop/src/pages/CardDetailView/EditCard.tsx`

## 使用方法

### 用户操作

1. 打开文档/卡片/文章
2. 点击右上角菜单
3. 选择"导出" → "PDF"
4. 配置导出选项：
   - 纸张大小（A4 / Letter）
   - 横向/纵向
   - 页边距
   - 是否打印背景色
   - H1 标题是否换页
5. 点击"导出"按钮
6. 选择保存位置
7. 等待导出完成

### 开发者接入

在新页面中添加 PDF 导出功能：

```typescript
import { PdfExportModal } from "@/components/PdfExportModal";
import { useState } from "react";

function YourComponent() {
  const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);

  return (
    <>
      {/* 触发按钮 */}
      <Button onClick={() => setPdfExportModalOpen(true)}>
        导出为 PDF
      </Button>

      {/* PDF 导出 Modal */}
      <PdfExportModal
        visible={pdfExportModalOpen}
        onClose={() => setPdfExportModalOpen(false)}
        content={yourSlateContent}  // Slate 节点数组
        title="文档标题"
        author="作者名称"  // 可选
      />
    </>
  );
}
```

## 分页控制

### CSS 分页属性

PDF 导出使用 CSS `@media print` 控制分页：

```css
/* 避免元素内部分页 */
h1,
h2,
h3,
h4,
h5,
h6 {
  page-break-inside: avoid;
  page-break-after: avoid;
}

/* 代码块避免分页 */
pre,
.code-block {
  page-break-inside: avoid;
}

/* 长代码块允许分页 */
pre.allow-break {
  page-break-inside: auto;
}

/* 表格避免分页 */
table {
  page-break-inside: avoid;
}

/* 表头跨页重复 */
thead {
  display: table-header-group;
}

/* H1 章节换页 */
.chapter-break h1 {
  page-break-before: always;
}
```

### 孤行/寡行控制

```css
p {
  orphans: 3; /* 页底最少 3 行 */
  widows: 3; /* 页顶最少 3 行 */
}
```

### 页边距单位

- 前端表单输入单位为 **毫米（mm）**。
- Electron `printToPDF` 需要 **英寸（inch）**。
- 导出时会执行自动换算：`inch = mm / 25.4`。

## 性能优化

### 渲染等待机制

导出前会等待以下内容加载完成：

1. **DOM 加载** - `document.readyState === 'complete'`
2. **字体加载** - `document.fonts.ready`
3. **MathJax 渲染** - `window.MathJax.typesetPromise()`
4. **额外缓冲** - 300ms 确保所有内容渲染完成

### 代码块分页处理

当前使用**自适应分页**，由“当前页剩余可用空间 + 代码块长度”共同决定是否允许跨页：

```typescript
const processCodeBlocks = (html: string): string => {
  return html.replace(
    /<pre([^>]*)>([\s\S]*?)<\/pre>/g,
    (match, attrs, content) => {
      const lines = content.split("\n").length;
      return `<pre${attrs} data-lines="${lines}" data-break="adaptive">${content}</pre>`;
    },
  );
};
```

## 故障排查

### 常见问题

#### 1. 导出的 PDF 缺少图片

**原因**: 远程图片加载失败或超时

**解决方案**:

- 确保网络连接正常
- 图片会自动转换为 Data URI（未来版本）

#### 2. 数学公式显示异常

**原因**: MathJax 渲染未完成

**解决方案**:

- 已内置 MathJax 渲染等待机制
- 如果仍有问题，增加等待时间（修改 `waitForPageReady` 函数）

#### 3. 代码块被截断

**原因**: 代码块跨页规则与当前页面剩余空间不匹配

**解决方案**:

- 已采用自适应策略：优先减少大面积空白，再决定是否跨页
- 如需更激进/保守，可调整主进程 `applyAdaptiveCodeBlockBreaks` 的判定条件

#### 4. 字体显示异常

**原因**: 字体未加载完成

**解决方案**:

- 已内置字体加载等待机制
- 确保系统安装了所需字体

## 测试

运行单元测试（在 `apps/desktop` 下，无 `test` 脚本，直接通过 vitest 运行）：

```bash
npx vitest run src-electron/main/modules/__tests__/pdf-exporter.test.ts
```

测试覆盖：

- 用户取消导出
- 文件名扩展名处理
- HTML 转义
- 分页控制

## 未来优化方向

1. **目录书签** - 使用 pdf-lib 添加 PDF 书签（基于 H1/H2）
2. **水印支持** - 添加文字或图片水印
3. **模板系统** - 预设多种导出模板（学术论文、技术文档等）
4. **云端导出** - 支持导出后直接上传到云存储
5. **图片优化** - 自动将远程图片转换为 Data URI
6. **进度显示** - 显示详细的导出进度（渲染中、生成中等）

> 批量导出（多文档合并导出为单个 PDF）已实现，见 `src/components/BatchExportModal` 与 `src/utils/batch-export` 的 `buildBatchPdfPayload`。

## 相关资源

- [Electron webContents.printToPDF 文档](https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions)
- [CSS Paged Media 规范](https://www.w3.org/TR/css-page-3/)
- [EPUB 导出实现](./epub-exporter.ts)

## 贡献

如果你发现问题或有改进建议，欢迎提交 Issue 或 Pull Request。
