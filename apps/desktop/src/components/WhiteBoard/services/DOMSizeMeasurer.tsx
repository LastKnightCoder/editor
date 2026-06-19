import { createRoot } from "react-dom/client";
import { Editor, EditorServicesProvider } from "@tau/editor";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Descendant } from "slate";
import { createEditorServices } from "@/services/editorServices";

// 缓存 EditorServices 实例，避免重复创建
let cachedEditorServices: ReturnType<typeof createEditorServices> | null = null;

const getEditorServices = () => {
  if (!cachedEditorServices) {
    cachedEditorServices = createEditorServices();
  }
  return cachedEditorServices;
};

/**
 * DOM 尺寸测量服务
 * 在隐藏的 DOM 中渲染/克隆元素，测量其在指定宽度下的高度或文字自然宽度
 */
export class DOMSizeMeasurer {
  private static container: HTMLDivElement | null = null;
  private static measurementId = 0;

  /**
   * 获取或创建测量容器
   */
  private static getContainer(): HTMLDivElement {
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
  static async measureRichTextHeight(
    elementId: string,
    content: Descendant[],
    targetWidth: number,
    paddingWidth = 16,
    paddingHeight = 16,
  ): Promise<number> {
    // 策略1：尝试克隆已存在的 DOM 元素
    // 修复：使用正确的 ID 格式 rich-text-container-${elementId}
    const existingHeight = await this.measureByCloning(
      `rich-text-container-${elementId}`,
      targetWidth,
      paddingWidth,
    );
    if (existingHeight !== null) {
      return existingHeight;
    }

    // 策略2：使用 Editor 渲染测量
    return this.measureByRendering(
      content,
      targetWidth,
      paddingWidth,
      paddingHeight,
    );
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
  static async measureRichTextWidth(
    elementId: string,
    content: Descendant[],
    paddingWidth = 16,
    paddingHeight = 16,
  ): Promise<number> {
    // 策略1：尝试克隆已存在的 DOM 元素
    const existingWidth = await this.measureWidthByCloning(
      `rich-text-container-${elementId}`,
      paddingWidth,
    );
    if (existingWidth !== null) {
      return existingWidth;
    }

    // 策略2：使用 Editor 渲染测量
    return this.measureWidthByRendering(content, paddingWidth, paddingHeight);
  }

  /**
   * 通过克隆已存在的 DOM 元素测量
   */
  private static async measureByCloning(
    containerId: string,
    targetWidth: number,
    paddingWidth: number,
  ): Promise<number | null> {
    // 查找已渲染的元素
    const existingElement = document.getElementById(containerId);
    if (!existingElement) return null;

    // 查找 slate editor 元素
    const slateEditor = existingElement.querySelector("[data-slate-editor]");
    if (!slateEditor) return null;

    const container = this.getContainer();
    const measureId = `measure-${++this.measurementId}`;

    // 创建测量包装器
    const wrapper = document.createElement("div");
    wrapper.id = measureId;
    wrapper.style.cssText = `
      width: ${targetWidth}px;
      padding: 0 ${paddingWidth}px;
      box-sizing: border-box;
    `;

    // 克隆 slate editor
    const clonedEditor = slateEditor.cloneNode(true) as HTMLElement;
    clonedEditor.style.width = "100%";
    clonedEditor.style.height = "auto";
    clonedEditor.style.maxHeight = "none";
    clonedEditor.style.overflow = "visible";

    wrapper.appendChild(clonedEditor);
    container.appendChild(wrapper);

    // 等待布局
    return new Promise((resolve) => {
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
  private static async measureWidthByCloning(
    containerId: string,
    paddingWidth: number,
  ): Promise<number | null> {
    // 查找已渲染的元素
    const existingElement = document.getElementById(containerId);
    if (!existingElement) return null;

    // 查找 slate editor 元素
    const slateEditor = existingElement.querySelector("[data-slate-editor]");
    if (!slateEditor) return null;

    const container = this.getContainer();
    const measureId = `measure-width-${++this.measurementId}`;

    // wrapper 明确大宽度，为 clonedEditor 的 fit-content 提供充足 available
    const wrapper = document.createElement("div");
    wrapper.id = measureId;
    wrapper.style.cssText = `
      width: 99999px;
    `;

    // 克隆 slate editor：fit-content shrink-to-fit 到文字自然宽度
    // 显式清除 inline width/maxWidth 封顶，保留 normal 换行取最长行
    const clonedEditor = slateEditor.cloneNode(true) as HTMLElement;
    clonedEditor.style.width = "fit-content";
    clonedEditor.style.maxWidth = "none";
    clonedEditor.style.height = "auto";
    clonedEditor.style.maxHeight = "none";
    clonedEditor.style.overflow = "visible";
    clonedEditor.style.paddingLeft = `${paddingWidth}px`;
    clonedEditor.style.paddingRight = `${paddingWidth}px`;

    wrapper.appendChild(clonedEditor);
    container.appendChild(wrapper);

    // 等待布局
    return new Promise((resolve) => {
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
  private static async measureByRendering(
    content: Descendant[],
    targetWidth: number,
    paddingWidth: number,
    paddingHeight: number,
  ): Promise<number> {
    const container = this.getContainer();
    const measureId = `measure-${++this.measurementId}`;

    // 创建测量包装器
    const wrapper = document.createElement("div");
    wrapper.id = measureId;
    wrapper.style.cssText = `
      width: ${targetWidth}px;
      box-sizing: border-box;
    `;

    container.appendChild(wrapper);

    return new Promise((resolve) => {
      // 创建 React root
      const root = createRoot(wrapper);

      // 用于存储 ResizeObserver
      let resizeObserver: ResizeObserver | null = null;
      let resolved = false;

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        resizeObserver?.disconnect();
        root.unmount();
        if (wrapper.parentNode) {
          container.removeChild(wrapper);
        }
      };

      // 创建内部容器用于 ResizeObserver
      const innerContainerId = `${measureId}-inner`;

      // 获取缓存的 EditorServices
      const services = getEditorServices();

      // 渲染 Editor，使用必要的 Provider 包装
      root.render(
        <DndProvider backend={HTML5Backend}>
          <EditorServicesProvider services={services}>
            <div
              id={innerContainerId}
              style={{
                width: "100%",
                padding: `${paddingHeight}px ${paddingWidth}px`,
                boxSizing: "border-box",
              }}
            >
              <Editor initValue={content} readonly={true} />
            </div>
          </EditorServicesProvider>
        </DndProvider>,
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

        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;

          const newHeight = entry.contentRect.height + paddingHeight * 2;

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
  private static async measureWidthByRendering(
    content: Descendant[],
    paddingWidth: number,
    paddingHeight: number,
  ): Promise<number> {
    const container = this.getContainer();
    const measureId = `measure-width-${++this.measurementId}`;

    // wrapper 明确大宽度，为 innerContainer 的 fit-content 提供充足 available
    const wrapper = document.createElement("div");
    wrapper.id = measureId;
    wrapper.style.cssText = `
      width: 99999px;
    `;

    container.appendChild(wrapper);

    return new Promise((resolve) => {
      const root = createRoot(wrapper);
      let resizeObserver: ResizeObserver | null = null;
      let resolved = false;

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        resizeObserver?.disconnect();
        root.unmount();
        if (wrapper.parentNode) {
          container.removeChild(wrapper);
        }
      };

      const innerContainerId = `${measureId}-inner`;
      const services = getEditorServices();

      // innerContainer：fit-content shrink-to-fit 到文字自然宽度
      root.render(
        <DndProvider backend={HTML5Backend}>
          <EditorServicesProvider services={services}>
            <div
              id={innerContainerId}
              style={{
                width: "fit-content",
                maxWidth: "none",
                padding: `${paddingHeight}px ${paddingWidth}px`,
                boxSizing: "border-box",
              }}
            >
              <Editor initValue={content} readonly={true} />
            </div>
          </EditorServicesProvider>
        </DndProvider>,
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
    targetWidth: number,
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
  static cleanup(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}

export default DOMSizeMeasurer;
