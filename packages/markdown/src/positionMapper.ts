import { Path } from "slate";

/**
 * Markdown 位置（CodeMirror 格式）
 */
export interface MarkdownPosition {
  line: number; // 行号 (0-based)
  ch: number; // 字符偏移 (0-based)
}

/**
 * Slate 位置
 */
export interface SlatePosition {
  path: number[]; // Slate Path
  offset: number; // 文本内偏移
}

/**
 * 文本级别的映射条目
 * 用于普通文本节点，支持字符级精确映射
 */
export interface TextMapping {
  type: "text";

  // Slate 文本节点信息
  slateTextPath: number[]; // 指向 FormattedText 的完整路径，如 [0, 0]
  slateOffset: number; // 该文本节点内的起始偏移（通常为 0）
  slateLength: number; // 文本内容长度（不含格式标记）

  // Markdown 位置信息
  mdLine: number; // 起始行号
  mdCh: number; // 起始字符偏移
  mdLength: number; // Markdown 中的总长度（含格式标记）

  // 格式标记长度
  prefixLength: number; // 前缀长度，如 "**" 为 2
  suffixLength: number; // 后缀长度，如 "**" 为 2
}

/**
 * 元素级别的映射条目
 * 用于 void 元素（code-block, image 等）
 */
export interface ElementMapping {
  type: "element";

  // Slate 元素信息
  slateElementPath: number[]; // 元素路径，如 [1]
  elementType: string; // 元素类型，如 "code-block"
  isVoid: true;

  // Markdown 位置信息
  mdStartLine: number;
  mdStartCh: number;
  mdEndLine: number;
  mdEndCh: number;

  // void 元素的可编辑属性映射
  propertyMappings?: {
    [propName: string]: {
      mdStartLine: number;
      mdStartCh: number;
      mdEndLine: number;
      mdEndCh: number;
    };
  };
}

export type PositionMapping = TextMapping | ElementMapping;

/**
 * 位置映射器类（重新设计版本）
 *
 * 核心改进：
 * 1. 文本节点级别映射（而非元素级别）
 * 2. 支持格式标记的偏移处理
 * 3. 双向映射都基于相同的数据结构
 */
export class PositionMapper {
  private mappings: PositionMapping[] = [];

  /**
   * 添加文本映射
   */
  addTextMapping(mapping: TextMapping): void {
    this.mappings.push(mapping);
  }

  /**
   * 添加元素映射（void 元素）
   */
  addElementMapping(mapping: ElementMapping): void {
    this.mappings.push(mapping);
  }

  /**
   * 清空映射表
   */
  clear(): void {
    this.mappings = [];
  }

  /**
   * Slate 位置 → Markdown 位置
   *
   * @param pos Slate position {path: [0, 0], offset: 5}
   * @returns Markdown position {line: 2, ch: 15} 或 null
   */
  slateToMarkdown(pos: SlatePosition): MarkdownPosition | null {
    // 1. 查找匹配的映射条目
    const mapping = this.findMappingBySlate(pos.path);
    if (!mapping) {
      console.warn("未找到 Slate 位置的映射:", pos);
      return null;
    }

    // 2. 元素映射（void 元素）：返回起始位置
    if (mapping.type === "element") {
      return {
        line: mapping.mdStartLine,
        ch: mapping.mdStartCh,
      };
    }

    // 3. 文本映射：计算精确位置
    const textMapping = mapping as TextMapping;

    // 3.1 计算相对偏移
    const relativeOffset = pos.offset - textMapping.slateOffset;

    // 3.2 限制在有效范围内
    const clampedOffset = Math.max(0, Math.min(relativeOffset, textMapping.slateLength));

    // 3.3 计算 Markdown 位置（跳过前缀）
    const mdOffset = textMapping.prefixLength + clampedOffset;

    // 3.4 处理单行情况（简化版，TODO: 多行支持）
    return {
      line: textMapping.mdLine,
      ch: textMapping.mdCh + mdOffset,
    };
  }

  /**
   * Markdown 位置 → Slate 位置
   *
   * @param pos Markdown position {line: 2, ch: 15}
   * @returns Slate position {path: [0, 0], offset: 5} 或 null
   */
  markdownToSlate(pos: MarkdownPosition): SlatePosition | null {
    // 1. 查找覆盖该位置的映射条目
    const mapping = this.findMappingByMarkdown(pos);
    if (!mapping) {
      console.warn("未找到 Markdown 位置的映射:", pos);
      return null;
    }

    // 2. 元素映射（void 元素）：返回元素后的位置
    if (mapping.type === "element") {
      if (mapping.propertyMappings) {
        for (const range of Object.values(mapping.propertyMappings)) {
          if (this.isWithinRange(pos, range)) {
            return {
              path: [...mapping.slateElementPath],
              offset: 0,
            };
          }
        }
      }

      // 返回元素后的位置（Slate 约定）
      return {
        path: [...mapping.slateElementPath],
        offset: 0,
      };
    }

    // 3. 文本映射：计算精确位置
    const textMapping = mapping as TextMapping;

    if (pos.line < textMapping.mdLine) {
      return {
        path: [...textMapping.slateTextPath],
        offset: textMapping.slateOffset,
      };
    }

    if (pos.line > textMapping.mdLine) {
      return {
        path: [...textMapping.slateTextPath],
        offset: textMapping.slateOffset + textMapping.slateLength,
      };
    }

    // 3.1 计算相对偏移（在当前行内）
    const mdRelativeOffset = pos.ch - textMapping.mdCh;

    // 3.2 判断位置
    if (mdRelativeOffset < textMapping.prefixLength) {
      // 在前缀内 → 映射到文本开头
      return {
        path: [...textMapping.slateTextPath],
        offset: textMapping.slateOffset,
      };
    }

    const contentEnd = textMapping.prefixLength + textMapping.slateLength;
    if (mdRelativeOffset >= contentEnd) {
      // 在后缀内或之后 → 映射到文本末尾
      return {
        path: [...textMapping.slateTextPath],
        offset: textMapping.slateOffset + textMapping.slateLength,
      };
    }

    // 在内容内 → 精确映射
    const slateOffset = textMapping.slateOffset + (mdRelativeOffset - textMapping.prefixLength);

    return {
      path: [...textMapping.slateTextPath],
      offset: slateOffset,
    };
  }

  /**
   * 获取所有映射（调试用）
   */
  getMappings(): PositionMapping[] {
    return [...this.mappings];
  }

  /**
   * 根据 Slate 元素路径查找元素映射
   */
  getElementMappingBySlatePath(path: number[]): ElementMapping | null {
    for (const mapping of this.mappings) {
      if (mapping.type !== "element") {
        continue;
      }
      if (Path.equals(path, mapping.slateElementPath)) {
        return mapping;
      }
    }
    return null;
  }

  /**
   * 根据 Markdown 位置查找元素映射与属性信息
   */
  getElementPropertyByMarkdown(pos: MarkdownPosition): {
    mapping: ElementMapping;
    propertyName?: string;
    relativePos?: MarkdownPosition;
  } | null {
    for (const mapping of this.mappings) {
      if (mapping.type !== "element") {
        continue;
      }
      if (mapping.propertyMappings) {
        for (const [propertyName, range] of Object.entries(mapping.propertyMappings)) {
          if (!this.isWithinRange(pos, range) && !this.isAtRangeInclusiveEnd(pos, range)) {
            continue;
          }
          const relativeLine = pos.line - range.mdStartLine;
          const prefixCh = range.mdStartCh || 0;
          const relativeCh = pos.ch - prefixCh;
          return {
            mapping,
            propertyName,
            relativePos: {
              line: Math.max(0, relativeLine),
              ch: Math.max(0, relativeCh),
            },
          };
        }
      }
      if (this.isWithinElementRange(pos, mapping)) {
        return { mapping };
      }
    }
    return null;
  }

  /**
   * 清理无效路径的映射
   */
  pruneInvalidPaths(isValidPath: (path: number[]) => boolean): void {
    this.mappings = this.mappings.filter(mapping => {
      const path = mapping.type === "text" ? mapping.slateTextPath : mapping.slateElementPath;
      return isValidPath(path);
    });
  }

  /**
   * 打印映射表（调试用）
   */
  debug(): void {
    console.log("=== Position Mappings ===");
    this.mappings.forEach((m, i) => {
      if (m.type === "text") {
        console.log(
          `[${i}] Text: Slate[${m.slateTextPath.join(",")}]@${m.slateOffset}:${m.slateLength} ` +
            `→ Md(${m.mdLine},${m.mdCh}) len=${m.mdLength} prefix=${m.prefixLength} suffix=${m.suffixLength}`
        );
      } else {
        console.log(
          `[${i}] Element: Slate[${m.slateElementPath.join(",")}] ${m.elementType} ` +
            `→ Md(${m.mdStartLine},${m.mdStartCh})-(${m.mdEndLine},${m.mdEndCh})`
        );
      }
    });
  }

  /**
   * 调整子元素映射的位置（用于处理 childrenStart 和 perLineOffset）
   *
   * @param parentPath 父元素路径，如 [0]
   * @param childrenStart 子元素内容在父输出中的起始位置
   * @param perLineOffset 每行的额外偏移（用于 blockquote "> ", list "- " 等）
   */
  adjustChildMappings(
    parentPath: number[],
    childrenStart: { line: number; ch: number },
    perLineOffset?: number,
    baseLine?: number
  ): void {
    const baseLineNumber = baseLine ?? 0;
    // 找到所有子元素的映射
    const childMappings = this.mappings.filter(m => {
      const targetPath = m.type === "text" ? m.slateTextPath : m.slateElementPath;
      return this.isChildPath(parentPath, targetPath);
    });

    // 调整每个子映射
    childMappings.forEach(mapping => {
      if (mapping.type === "text") {
        // 文本映射：调整起始位置
        const originalLine = mapping.mdLine;
        const relativeLine = originalLine - baseLineNumber;

        // 调整行号
        mapping.mdLine += childrenStart.line;

        // 调整字符偏移
        if (relativeLine === 0) {
          // 第一行：加上 childrenStart.ch
          mapping.mdCh += childrenStart.ch;
        } else if (perLineOffset) {
          // 后续行：加上 perLineOffset
          mapping.mdCh += perLineOffset;
        }
      } else {
        // 元素映射：调整起始和结束位置
        const startLineOriginal = mapping.mdStartLine;
        const endLineOriginal = mapping.mdEndLine;
        const startLineRelative = startLineOriginal - baseLineNumber;
        const endLineRelative = endLineOriginal - baseLineNumber;

        // 调整起始位置
        mapping.mdStartLine += childrenStart.line;
        if (startLineRelative === 0) {
          mapping.mdStartCh += childrenStart.ch;
        } else if (perLineOffset) {
          mapping.mdStartCh += perLineOffset;
        }

        // 调整结束位置
        mapping.mdEndLine += childrenStart.line;
        if (endLineRelative === 0) {
          mapping.mdEndCh += childrenStart.ch;
        } else if (perLineOffset) {
          mapping.mdEndCh += perLineOffset;
        }

        if (mapping.propertyMappings) {
          for (const propertyMapping of Object.values(mapping.propertyMappings)) {
            const propStartLineOriginal = propertyMapping.mdStartLine;
            const propEndLineOriginal = propertyMapping.mdEndLine;
            const propStartLineRelative = propStartLineOriginal - baseLineNumber;
            const propEndLineRelative = propEndLineOriginal - baseLineNumber;

            propertyMapping.mdStartLine += childrenStart.line;
            if (propStartLineRelative === 0) {
              propertyMapping.mdStartCh += childrenStart.ch;
            } else if (perLineOffset) {
              propertyMapping.mdStartCh += perLineOffset;
            }

            propertyMapping.mdEndLine += childrenStart.line;
            if (propEndLineRelative === 0) {
              propertyMapping.mdEndCh += childrenStart.ch;
            } else if (perLineOffset) {
              propertyMapping.mdEndCh += perLineOffset;
            }
          }
        }
      }
    });
  }

  /**
   * 对指定子元素索引之后的映射进行行号偏移
   */
  shiftLinesForChildren(parentPath: number[], startIndex: number, lineDelta: number): void {
    if (lineDelta === 0) return;
    this.mappings.forEach(mapping => {
      const targetPath = mapping.type === "text" ? mapping.slateTextPath : mapping.slateElementPath;
      if (!this.isChildPath(parentPath, targetPath)) {
        return;
      }
      const childIndex = targetPath[parentPath.length];
      if (typeof childIndex !== "number" || childIndex < startIndex) {
        return;
      }
      if (mapping.type === "text") {
        mapping.mdLine += lineDelta;
      } else {
        mapping.mdStartLine += lineDelta;
        mapping.mdEndLine += lineDelta;
        if (mapping.propertyMappings) {
          for (const prop of Object.values(mapping.propertyMappings)) {
            prop.mdStartLine += lineDelta;
            prop.mdEndLine += lineDelta;
          }
        }
      }
    });
  }

  /**
   * 调整内联包装元素（如 link）的子文本映射
   */
  adjustChildMappingsForInlineWrapper(
    parentPath: number[],
    wrapperPrefixLength: number,
    wrapperSuffixLength: number
  ): void {
    if (wrapperPrefixLength <= 0 && wrapperSuffixLength <= 0) {
      return;
    }

    const childTextMappings = this.mappings.filter(
      (m): m is TextMapping => m.type === "text" && this.isChildPath(parentPath, m.slateTextPath)
    );

    if (childTextMappings.length === 0) {
      return;
    }

    const sorted = [...childTextMappings].sort((a, b) =>
      Path.compare(a.slateTextPath, b.slateTextPath)
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    if (wrapperPrefixLength > 0) {
      first.mdCh = Math.max(0, first.mdCh - wrapperPrefixLength);
      first.mdLength += wrapperPrefixLength;
      first.prefixLength += wrapperPrefixLength;
    }

    if (wrapperSuffixLength > 0) {
      last.mdLength += wrapperSuffixLength;
      last.suffixLength += wrapperSuffixLength;
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 判断 childPath 是否是 parentPath 的子路径
   * 例如：[0, 1, 2] 是 [0, 1] 的子路径
   */
  private isChildPath(parentPath: number[], childPath: number[]): boolean {
    // 子路径必须更长
    if (childPath.length <= parentPath.length) {
      return false;
    }

    // 检查前缀是否匹配
    for (let i = 0; i < parentPath.length; i++) {
      if (parentPath[i] !== childPath[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * 根据 Slate path 查找映射
   */
  private findMappingBySlate(path: number[]): PositionMapping | null {
    for (const mapping of this.mappings) {
      if (mapping.type === "text") {
        if (Path.equals(path, mapping.slateTextPath)) {
          return mapping;
        }
      } else {
        if (
          Path.equals(path, mapping.slateElementPath) ||
          Path.isAncestor(mapping.slateElementPath, path)
        ) {
          return mapping;
        }
      }
    }
    return null;
  }

  /**
   * 根据 Markdown 位置查找映射（二分查找）
   */
  private findMappingByMarkdown(pos: MarkdownPosition): PositionMapping | null {
    // 简化版：线性查找
    // TODO: 优化为二分查找（需要先按行号排序）
    let nearestBefore: TextMapping | null = null;
    let nearestAfter: TextMapping | null = null;
    let nearestBeforeEndLine = -1;
    let nearestBeforeEndCh = -1;
    let nearestAfterStartLine = Number.POSITIVE_INFINITY;
    let nearestAfterStartCh = Number.POSITIVE_INFINITY;

    const isBefore = (aLine: number, aCh: number, bLine: number, bCh: number) =>
      aLine < bLine || (aLine === bLine && aCh < bCh);

    for (const mapping of this.mappings) {
      if (mapping.type === "text") {
        if (mapping.mdLength === 0) {
          continue;
        }
        // 单行文本映射
        const startLine = mapping.mdLine;
        const startCh = mapping.mdCh;
        const endLine = mapping.mdLine;
        const endCh = mapping.mdCh + mapping.mdLength;

        if (pos.line === startLine) {
          if (pos.ch >= startCh && pos.ch < endCh) {
            return mapping;
          }
          if (pos.ch === endCh) {
            return mapping;
          }
        }

        const isBeforePos = isBefore(endLine, endCh, pos.line, pos.ch);
        if (isBeforePos || (endLine === pos.line && endCh === pos.ch)) {
          if (
            nearestBefore === null ||
            isBefore(nearestBeforeEndLine, nearestBeforeEndCh, endLine, endCh)
          ) {
            nearestBefore = mapping;
            nearestBeforeEndLine = endLine;
            nearestBeforeEndCh = endCh;
          }
          continue;
        }

        if (isBefore(pos.line, pos.ch, startLine, startCh)) {
          if (
            nearestAfter === null ||
            isBefore(startLine, startCh, nearestAfterStartLine, nearestAfterStartCh)
          ) {
            nearestAfter = mapping;
            nearestAfterStartLine = startLine;
            nearestAfterStartCh = startCh;
          }
        }
      } else {
        // 元素映射（可能跨行）
        if (this.isWithinElementRange(pos, mapping)) {
          return mapping;
        }
      }
    }
    return nearestBefore ?? nearestAfter ?? null;
  }

  /**
   * 判断 Markdown 位置是否在元素范围内
   */
  private isWithinElementRange(pos: MarkdownPosition, mapping: ElementMapping): boolean {
    return this.isWithinRange(pos, {
      mdStartLine: mapping.mdStartLine,
      mdStartCh: mapping.mdStartCh,
      mdEndLine: mapping.mdEndLine,
      mdEndCh: mapping.mdEndCh,
    });
  }

  /**
   * 判断 Markdown 位置是否在范围内（end 为排他）
   */
  private isWithinRange(
    pos: MarkdownPosition,
    range: {
      mdStartLine: number;
      mdStartCh: number;
      mdEndLine: number;
      mdEndCh: number;
    }
  ): boolean {
    if (pos.line < range.mdStartLine) {
      return false;
    }
    if (pos.line > range.mdEndLine) {
      return false;
    }
    if (pos.line === range.mdStartLine) {
      if (pos.ch < range.mdStartCh) return false;
    }
    if (pos.line === range.mdEndLine) {
      if (pos.ch >= range.mdEndCh) return false;
    }
    return true;
  }

  /**
   * 判断位置是否落在区间结束边界（end inclusive，仅用于光标映射）
   */
  private isAtRangeInclusiveEnd(
    pos: MarkdownPosition,
    range: {
      mdStartLine: number;
      mdStartCh: number;
      mdEndLine: number;
      mdEndCh: number;
    }
  ): boolean {
    return pos.line === range.mdEndLine && pos.ch === range.mdEndCh;
  }
}
