import type { EditorKit } from "@tau/editor";
import type Board from "../Board";
import { BOARD_TO_CONTAINER } from "../constants";
import { createRoot } from "react-dom/client";

import { Editor } from "@tau/editor";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Descendant } from "slate";
import { TEXT_BOX, TextBoxPadding, toCssPadding } from "../constants/text-style";

/** 与 RichText 的 .richTextContainer 保持一致（静态 Tailwind 类），改那边要同步这里 */
const RICH_TEXT_BLOCK_DISTANCE = "10px";

/** 影响折行的可继承排版属性：在屏容器从白板祖先继承，克隆挂到 body 下会丢 */
const INHERITED_TYPOGRAPHY_PROPS = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "font-variation-settings",
  "font-feature-settings",
  "font-kerning",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "word-break",
  "line-break",
  "--block-distance",
];

/** 让测量 wrapper 复现 source 处的排版环境 */
const inheritTypography = (source: Element | null, target: HTMLElement) => {
  if (!source) return;
  const computed = getComputedStyle(source);
  for (const prop of INHERITED_TYPOGRAPHY_PROPS) {
    target.style.setProperty(prop, computed.getPropertyValue(prop));
  }
};

/** 离屏渲染没有在屏容器可参照：字号/行高取白板画布处的继承值，元素滚出视口时画布仍在 */
const inheritBoardTypography = (target: HTMLElement, source: Element | null) =>
  inheritTypography(source, target);

const DEFAULT_PADDING: TextBoxPadding = {
  top: TEXT_BOX.paddingY,
  right: TEXT_BOX.paddingX,
  bottom: TEXT_BOX.paddingY,
  left: TEXT_BOX.paddingX,
};

/**
 * 测量用的 kit：共享模式下必须与真实渲染（ContentEditor 经 useCollaborationKit 派生）一致，
 * 否则远端资源解析不出来、块尺寸与屏上不同，测出的高度偏小。
 */

/** 内容数组引用 → 稳定编号（引用不可变树语义，引用相同即内容相同），用于组成缓存键 */
const contentKeyIndex = new WeakMap<object, number>();
let nextContentKey = 0;
const contentKeyOf = (content: Descendant[]): number => {
  let key = contentKeyIndex.get(content);
  if (key === undefined) {
    key = ++nextContentKey;
    contentKeyIndex.set(content, key);
  }
  return key;
};

/**
 * 文本扩展的 DOM 尺寸测量
 * 在隐藏的 DOM 中渲染/克隆元素，测量其在指定宽度下的高度或文字自然宽度。
 *
 * 结果按「元素 id + 目标宽度 + 内容引用」缓存：克隆 DOM 要等两帧布局，
 * 离屏渲染更要挂一个完整 Slate Editor 的独立 root——元素随视口剔除反复进出时
 * （平移/缩放），无缓存的重复测量会在主线程制造连绵的长帧。
 */
export class DOMSizeMeasurer {
  constructor(
    private board: Board,
    private readonly kit: (contentId?: number) => EditorKit
  ) {}
  private container: HTMLDivElement | null = null;
  private static measurementId = 0;
  private readonly heightCache = new Map<string, number>();
  private readonly widthCache = new Map<string, number>();
  private static readonly CACHE_LIMIT = 2000;

  private cacheKey(
    elementId: string,
    targetWidth: number | null,
    content: Descendant[],
    contentId?: number,
    textClassName?: string
  ): string {
    return [
      elementId,
      targetWidth === null ? "natural" : Math.round(targetWidth),
      contentId ?? 0,
      contentKeyOf(content),
      textClassName ?? "",
    ].join("|");
  }

  private rememberHeight(key: string, height: number): void {
    if (this.heightCache.size >= DOMSizeMeasurer.CACHE_LIMIT) {
      this.heightCache.delete(this.heightCache.keys().next().value as string);
    }
    this.heightCache.set(key, height);
  }

  private rememberWidth(key: string, width: number): void {
    if (this.widthCache.size >= DOMSizeMeasurer.CACHE_LIMIT) {
      this.widthCache.delete(this.widthCache.keys().next().value as string);
    }
    this.widthCache.set(key, width);
  }

  /**
   * 获取或创建测量容器
   */
  private getContainer(): HTMLDivElement {
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "dom-size-measurer";
      this.container.style.cssText = `
        position: fixed;
        visibility: hidden;
        pointer-events: none;
        top: -99999px;
        left: -99999px;
        z-index: -1;
      `;
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  /**
   * 测量富文本在指定宽度下的高度
   *
   * 策略：
   * 1. 首先尝试查找并克隆已渲染的 DOM 元素
   * 2. 如果元素未渲染（视口外或简化渲染），创建新的 Editor 实例测量
   */
  async measureRichTextHeight(
    elementId: string,
    content: Descendant[],
    targetWidth: number,
    padding: TextBoxPadding = DEFAULT_PADDING,
    contentId?: number,
    /** 手绘字体等文字容器类名，仅离屏渲染用；克隆时直接继承在屏容器 */
    textClassName = ""
  ): Promise<number> {
    const key = this.cacheKey(elementId, targetWidth, content, contentId, textClassName);
    const cachedHeight = this.heightCache.get(key);
    if (cachedHeight !== undefined) return cachedHeight;

    // 策略1：尝试克隆已存在的 DOM 元素
    // 修复：使用正确的 ID 格式 rich-text-container-${elementId}
    const existingHeight = await this.measureByCloning(
      `rich-text-container-${elementId}`,
      targetWidth
    );
    if (existingHeight !== null) {
      this.rememberHeight(key, existingHeight);
      return existingHeight;
    }

    // 策略2：使用 Editor 渲染测量
    const renderedHeight = await this.measureByRendering(
      content,
      targetWidth,
      padding,
      contentId,
      textClassName
    );
    this.rememberHeight(key, renderedHeight);
    return renderedHeight;
  }

  /**
   * 测量富文本的自然宽度（文字不换行所需的最小盒子宽度）
   *
   * 与 measureRichTextHeight 对称，但测量方向为宽度。
   * 用于“适应宽度”功能：在离屏、无宽度约束的环境下测得文字真实自然宽度，
   * 避免在屏测量时被父容器/旧 maxWidth 封顶导致取到“换行后的宽度”。
   *
   * 策略：
   * 1. 首先尝试查找并克隆已渲染的 DOM 元素
   * 2. 如果元素未渲染（视口外或简化渲染），创建新的 Editor 实例测量
   */
  async measureRichTextWidth(
    elementId: string,
    content: Descendant[],
    padding: TextBoxPadding = DEFAULT_PADDING,
    contentId?: number,
    textClassName = ""
  ): Promise<number> {
    const key = this.cacheKey(elementId, null, content, contentId, textClassName);
    const cachedWidth = this.widthCache.get(key);
    if (cachedWidth !== undefined) return cachedWidth;

    // 策略1：尝试克隆已存在的 DOM 元素
    const existingWidth = await this.measureWidthByCloning(
      `rich-text-container-${elementId}`,
      padding
    );
    if (existingWidth !== null) {
      this.rememberWidth(key, existingWidth);
      return existingWidth;
    }

    // 策略2：使用 Editor 渲染测量
    const renderedWidth = await this.measureWidthByRendering(
      content,
      padding,
      contentId,
      textClassName
    );
    this.rememberWidth(key, renderedWidth);
    return renderedWidth;
  }

  /**
   * 通过克隆已存在的 DOM 元素测量
   */
  private async measureByCloning(containerId: string, targetWidth: number): Promise<number | null> {
    // 查找已渲染的元素
    const existingElement =
      BOARD_TO_CONTAINER.get(this.board)?.querySelector<HTMLElement>(
        "[id=" + JSON.stringify(containerId) + "]"
      ) ?? null;
    if (!existingElement) return null;

    // 查找 slate editor 元素
    const slateEditor = existingElement.querySelector("[data-slate-editor]");
    if (!slateEditor) return null;

    const container = this.getContainer();
    const measureId = `measure-${++DOMSizeMeasurer.measurementId}`;

    // 内边距由克隆的 slate 节点自带的 inline padding 提供，wrapper 不再重复加
    const wrapper = document.createElement("div");
    wrapper.id = measureId;
    wrapper.style.cssText = `
      width: ${targetWidth}px;
      box-sizing: border-box;
    `;
    inheritTypography(existingElement, wrapper);

    // 克隆 slate editor
    const clonedEditor = slateEditor.cloneNode(true) as HTMLElement;
    clonedEditor.style.width = "100%";
    clonedEditor.style.height = "auto";
    clonedEditor.style.maxHeight = "none";
    clonedEditor.style.overflow = "visible";

    wrapper.appendChild(clonedEditor);
    container.appendChild(wrapper);

    // 等待布局
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const height = wrapper.scrollHeight;
          container.removeChild(wrapper);
          resolve(height);
        });
      });
    });
  }

  /**
   * 通过克隆已存在的 DOM 元素测量自然宽度
   * 与 measureByCloning（高度）对称，但测量方向为宽度
   *
   * 测量策略：wrapper 明确大宽度（99999px）+ clonedEditor fit-content
   * - 复现“聚焦时 foreignObject=maxWidth 提供足够 available，fit-content 正确 shrink-to-fit”的环境
   * - wrapper 用明确像素值而非 max-content，避免父子 max-content/fit-content 循环依赖
   *   导致浏览器回退到 available（视口宽度）撑出异常大值
   * - white-space 保持 normal，多段落/硬换行按行展开，取最长行自然宽度
   * - getBoundingClientRect().width 提供浮点精度，ceil 避免亚像素换行
   */
  private async measureWidthByCloning(
    containerId: string,
    padding: TextBoxPadding
  ): Promise<number | null> {
    // 查找已渲染的元素
    const existingElement =
      BOARD_TO_CONTAINER.get(this.board)?.querySelector<HTMLElement>(
        "[id=" + JSON.stringify(containerId) + "]"
      ) ?? null;
    if (!existingElement) return null;

    // 查找 slate editor 元素
    const slateEditor = existingElement.querySelector("[data-slate-editor]");
    if (!slateEditor) return null;

    const container = this.getContainer();
    const measureId = `measure-width-${++DOMSizeMeasurer.measurementId}`;

    // wrapper 明确大宽度，为 clonedEditor 的 fit-content 提供充足 available
    const wrapper = document.createElement("div");
    wrapper.id = measureId;
    wrapper.style.cssText = `
      width: 99999px;
    `;
    inheritTypography(existingElement, wrapper);

    // 克隆 slate editor：fit-content shrink-to-fit 到文字自然宽度
    // 显式清除 inline width/maxWidth 封顶，保留 normal 换行取最长行
    const clonedEditor = slateEditor.cloneNode(true) as HTMLElement;
    clonedEditor.style.width = "fit-content";
    clonedEditor.style.maxWidth = "none";
    clonedEditor.style.height = "auto";
    clonedEditor.style.maxHeight = "none";
    clonedEditor.style.overflow = "visible";
    clonedEditor.style.paddingLeft = `${padding.left}px`;
    clonedEditor.style.paddingRight = `${padding.right}px`;

    wrapper.appendChild(clonedEditor);
    container.appendChild(wrapper);

    // 等待布局
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // getBoundingClientRect().width 浮点精度，含 padding，ceil 避免亚像素换行
          const width = Math.ceil(clonedEditor.getBoundingClientRect().width);
          container.removeChild(wrapper);
          resolve(width);
        });
      });
    });
  }

  /**
   * 通过渲染 Editor 组件测量
   * 用于元素未渲染的情况（视口外、侧边栏拖拽）
   * 使用 ResizeObserver 监听尺寸变化
   */
  private async measureByRendering(
    content: Descendant[],
    targetWidth: number,
    padding: TextBoxPadding,
    contentId: number | undefined,
    textClassName: string
  ): Promise<number> {
    const container = this.getContainer();
    const measureId = `measure-${++DOMSizeMeasurer.measurementId}`;

    // 创建测量包装器
    const wrapper = document.createElement("div");
    wrapper.id = measureId;
    wrapper.style.cssText = `
      width: ${targetWidth}px;
      box-sizing: border-box;
    `;
    inheritBoardTypography(wrapper, BOARD_TO_CONTAINER.get(this.board) ?? null);

    container.appendChild(wrapper);

    return new Promise(resolve => {
      // 创建 React root
      const root = createRoot(wrapper);

      // 用于存储 ResizeObserver
      let resizeObserver: ResizeObserver | null = null;
      let resolved = false;

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        resizeObserver?.disconnect();
        // 延迟卸载：测量可能紧跟主树渲染被清理，同步 unmount 独立 root 会废弃
        // 当帧渲染工作（React 警告 "unmount a root while React was already rendering"）
        queueMicrotask(() => root.unmount());
        if (wrapper.parentNode) {
          container.removeChild(wrapper);
        }
      };

      // 创建内部容器用于 ResizeObserver
      const innerContainerId = `${measureId}-inner`;

      // 渲染 Editor，使用必要的 Provider 包装
      root.render(
        <DndProvider backend={HTML5Backend}>
          <div
            id={innerContainerId}
            className={textClassName}
            style={{
              width: "100%",
              padding: toCssPadding(padding),
              boxSizing: "border-box",
              // 真实渲染容器（RichText 的 .richTextContainer）设了 10px；
              // 离屏 wrapper 挂在 body 下会继承全局的 1.25em，块间距偏大会把高度测多
              ["--block-distance" as string]: RICH_TEXT_BLOCK_DISTANCE,
            }}
          >
            <Editor kit={this.kit(contentId)} initValue={content} readonly={true} />
          </div>
        </DndProvider>
      );

      // 使用 ResizeObserver 监听尺寸变化
      requestAnimationFrame(() => {
        const innerContainer = document.getElementById(innerContainerId);
        if (!innerContainer) {
          // 如果内部容器还没准备好，再等一帧
          requestAnimationFrame(() => {
            const retryInner = document.getElementById(innerContainerId);
            if (retryInner) {
              setupResizeObserver(retryInner);
            } else {
              // 最终降级：直接测量 wrapper
              const height = wrapper.scrollHeight || 50;
              cleanup();
              resolve(height);
            }
          });
          return;
        }
        setupResizeObserver(innerContainer);
      });

      function setupResizeObserver(target: HTMLElement) {
        // 先检查一下当前高度
        const initialHeight = target.scrollHeight;

        // 修复：无论 initialHeight 是否为 0，都要设置 ResizeObserver
        // 因为 React 渲染可能还没完成，需要监听后续的尺寸变化
        let stableCount = 0;
        let lastHeight = initialHeight;
        let hasReceivedValidHeight = false;

        resizeObserver = new ResizeObserver(entries => {
          const entry = entries[0];
          if (!entry) return;

          const newHeight = entry.contentRect.height + padding.top + padding.bottom;

          // 如果高度从 0 变为有效值，或者连续两次高度稳定，返回结果
          if (newHeight > 0) {
            // 优化：如果是首次从 0 变为有效值，并且高度合理（>20px），立即返回
            // 这样可以加快首次拖拽的速度
            if (!hasReceivedValidHeight && newHeight > 20) {
              hasReceivedValidHeight = true;
              // 给一次机会等待稳定，避免过早返回
              lastHeight = newHeight;
            } else if (Math.abs(newHeight - lastHeight) < 1) {
              stableCount++;
              if (stableCount >= 1) {
                // 降低稳定次数要求，加快响应
                cleanup();
                resolve(newHeight);
              }
            } else {
              stableCount = 0;
              lastHeight = newHeight;
            }
          }
        });

        resizeObserver.observe(target);
      }

      // 超时保护
      // 增加超时时间到 1000ms，确保复杂内容也能完成渲染和测量
      // 特别是从侧边栏首次拖拽时，元素可能还没有在画布上渲染过
      setTimeout(() => {
        if (!resolved) {
          const height = wrapper.scrollHeight || 50;
          cleanup();
          resolve(height);
        }
      }, 1000);
    });
  }

  /**
   * 通过渲染 Editor 组件测量自然宽度
   * 用于元素未渲染的情况（视口外、侧边栏拖拽），与 measureByRendering（高度）对称
   *
   * 与 measureWidthByCloning 同策略：wrapper 明确大宽度（99999px）+ innerContainer fit-content，
   * 用 ResizeObserver 监听 innerContainer shrink-to-fit 后的宽度稳定。
   */
  private async measureWidthByRendering(
    content: Descendant[],
    padding: TextBoxPadding,
    contentId: number | undefined,
    textClassName: string
  ): Promise<number> {
    const container = this.getContainer();
    const measureId = `measure-width-${++DOMSizeMeasurer.measurementId}`;

    // wrapper 明确大宽度，为 innerContainer 的 fit-content 提供充足 available
    const wrapper = document.createElement("div");
    wrapper.id = measureId;
    wrapper.style.cssText = `
      width: 99999px;
    `;
    inheritBoardTypography(wrapper, BOARD_TO_CONTAINER.get(this.board) ?? null);

    container.appendChild(wrapper);

    return new Promise(resolve => {
      const root = createRoot(wrapper);
      let resizeObserver: ResizeObserver | null = null;
      let resolved = false;

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        resizeObserver?.disconnect();
        // 延迟卸载：测量可能紧跟主树渲染被清理，同步 unmount 独立 root 会废弃
        // 当帧渲染工作（React 警告 "unmount a root while React was already rendering"）
        queueMicrotask(() => root.unmount());
        if (wrapper.parentNode) {
          container.removeChild(wrapper);
        }
      };

      const innerContainerId = `${measureId}-inner`;

      // innerContainer：fit-content shrink-to-fit 到文字自然宽度
      root.render(
        <DndProvider backend={HTML5Backend}>
          <div
            id={innerContainerId}
            className={textClassName}
            style={{
              width: "fit-content",
              maxWidth: "none",
              padding: toCssPadding(padding),
              boxSizing: "border-box",
              // 真实渲染容器（RichText 的 .richTextContainer）设了 10px；
              // 离屏 wrapper 挂在 body 下会继承全局的 1.25em，块间距偏大会把高度测多
              ["--block-distance" as string]: RICH_TEXT_BLOCK_DISTANCE,
            }}
          >
            <Editor kit={this.kit(contentId)} initValue={content} readonly={true} />
          </div>
        </DndProvider>
      );

      // 使用 ResizeObserver 监听 innerContainer 尺寸稳定
      requestAnimationFrame(() => {
        const innerContainer = document.getElementById(innerContainerId);
        if (!innerContainer) {
          requestAnimationFrame(() => {
            const retryInner = document.getElementById(innerContainerId);
            if (retryInner) {
              setupResizeObserver(retryInner);
            } else {
              const width = wrapper.scrollWidth || 50;
              cleanup();
              resolve(width);
            }
          });
          return;
        }
        setupResizeObserver(innerContainer);
      });

      function setupResizeObserver(target: HTMLElement) {
        let stableCount = 0;
        let lastWidth = target.getBoundingClientRect().width;

        resizeObserver = new ResizeObserver(() => {
          if (resolved) return;
          // 直接读盒子宽度（含 padding），fit-content 下无溢出
          const newWidth = target.getBoundingClientRect().width;
          if (newWidth > 0 && Math.abs(newWidth - lastWidth) < 1) {
            stableCount++;
            if (stableCount >= 1) {
              cleanup();
              resolve(Math.ceil(newWidth));
            }
          } else {
            stableCount = 0;
            lastWidth = newWidth;
          }
        });

        resizeObserver.observe(target);
      }

      // 超时保护
      setTimeout(() => {
        if (!resolved) {
          const inner = document.getElementById(innerContainerId);
          const width = Math.ceil(inner?.getBoundingClientRect().width || 50);
          cleanup();
          resolve(width);
        }
      }, 1000);
    });
  }

  /**
   * 测量图片/视频在指定宽度下的高度（保持宽高比）
   */
  static measureMediaHeight(
    originalWidth: number,
    originalHeight: number,
    targetWidth: number
  ): number {
    if (originalWidth <= 0 || originalHeight <= 0) {
      return targetWidth * 0.75; // 默认 4:3 比例
    }
    const aspectRatio = originalWidth / originalHeight;
    return targetWidth / aspectRatio;
  }

  /**
   * 清理测量容器
   */
  cleanup(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}

export default DOMSizeMeasurer;
