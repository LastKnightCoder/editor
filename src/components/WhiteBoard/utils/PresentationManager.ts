import { v4 as uuidv4 } from "uuid";
import EventEmitter from "eventemitter3";
import { BoardElement, ViewPort, Board } from "../types";
import { produce } from "immer";
import { ViewPortTransforms } from "../transforms/ViewPortTransforms";
import { BOARD_TO_CONTAINER } from "../constants";

export interface PresentationFrame {
  id: string;
  viewPort: ViewPort;
  elements: string[]; // 存储元素的ID
}

export interface PresentationSequence {
  id: string;
  name: string;
  frames: PresentationFrame[];
  createTime: number;
  updateTime: number;
}

export class PresentationManager {
  private board: Board;
  private _sequences: PresentationSequence[] = [];
  private _currentSequence: PresentationSequence | null = null;
  private _currentFrameIndex = 0;
  private _isPresentationMode = false;
  private _isCreatingSequence = false;
  private originalReadonly = false;
  private eventEmitter: EventEmitter;

  constructor(board: Board, initialSequences: PresentationSequence[] = []) {
    this.board = board;
    this._sequences = initialSequences;
    this.eventEmitter = new EventEmitter();
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.eventEmitter.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void) {
    this.eventEmitter.off(event, listener);
  }

  emit(event: string, ...args: any[]) {
    this.eventEmitter.emit(event, ...args);
  }

  once(event: string, listener: (...args: any[]) => void) {
    this.eventEmitter.once(event, listener);
  }

  // 演示模式相关属性和方法
  get isPresentationMode(): boolean {
    return this._isPresentationMode;
  }

  set isPresentationMode(value: boolean) {
    this._isPresentationMode = value;
    console.log("isPresentationMode", value);
    this.emit("presentationModeChange", value);
  }

  // 获取是否处于创建序列模式
  get isCreatingSequence(): boolean {
    return this._isCreatingSequence;
  }

  set isCreatingSequence(value: boolean) {
    this._isCreatingSequence = value;
    console.log("isCreatingSequence", value);
    this.emit("presentationCreatorChange", value);
  }

  get sequences(): PresentationSequence[] {
    return this._sequences;
  }

  set sequences(value: PresentationSequence[]) {
    this._sequences = value;
    console.log("sequences", value);
    this.emit("presentationSequencesChange", value);
    this.board.emit("change");
  }

  get currentSequence(): PresentationSequence | null {
    return this._currentSequence;
  }

  set currentSequence(value: PresentationSequence | null) {
    this._currentSequence = value;
    console.log("currentSequence", value);
    this.emit("presentationCurrentSequenceChange", value);
  }

  get currentFrameIndex(): number | null {
    if (!this.currentSequence) return null;
    return this._currentFrameIndex;
  }

  set currentFrameIndex(value: number) {
    this._currentFrameIndex = value;
    console.log("currentFrameIndex", value);
    this.emit("presentationCurrentFrameIndexChange", value);
  }

  // 开始创建演示序列
  startCreatingSequence() {
    if (this.isPresentationMode) return;
    this.isCreatingSequence = true;
  }

  // 停止创建演示序列
  stopCreatingSequence() {
    this.isCreatingSequence = false;
  }

  // 获取当前序列的帧，用于编辑模式
  getCurrentSequenceFrames(): {
    frames: PresentationFrame[];
    name: string;
    id?: string;
  } | null {
    if (!this.currentSequence) return null;
    return {
      frames: [...this.currentSequence.frames],
      name: this.currentSequence.name,
      id: this.currentSequence.id,
    };
  }

  // 保存演示序列
  saveSequence(
    name: string,
    frames: PresentationFrame[],
    sequenceId?: string,
  ): PresentationSequence {
    // 如果提供了序列ID，尝试更新现有序列
    if (sequenceId) {
      const existingSequence = this.sequences.find((s) => s.id === sequenceId);
      if (existingSequence) {
        const updatedSequence = {
          ...existingSequence,
          name,
          frames,
          updateTime: Date.now(),
        };
        return this.updateSequence(updatedSequence);
      }
    }

    // 如果没有提供ID或找不到序列，创建新序列
    return this.addSequence(name, frames);
  }

  // 开始演示模式
  startPresentationMode(sequenceId: string) {
    if (this.isCreatingSequence) return;

    const success = this.setCurrentSequence(sequenceId);
    if (!success) return;

    this.isPresentationMode = true;

    // 设置白板为只读模式
    this.originalReadonly = this.board.readonly;
    this.board.readonly = true;

    // 确保当前帧索引为0
    this.currentFrameIndex = 0;

    // 显示第一帧
    this.showCurrentFrame();
  }

  // 停止演示模式
  stopPresentationMode() {
    // 恢复白板的可编辑状态
    this.board.readonly = this.originalReadonly;
    this.isPresentationMode = false;
  }

  // 显示当前帧
  async showCurrentFrame(animate = true): Promise<void> {
    if (!this.currentSequence || this.currentFrameIndex === null) return;
    const frame = this.currentSequence.frames[this.currentFrameIndex];
    if (!frame) return;

    // 更新视口，使用动画过渡
    if (animate) {
      await ViewPortTransforms.animateToViewport(
        this.board,
        this.board.viewPort,
        frame.viewPort,
        500,
      );
    } else {
      this.board.apply({
        type: "set_viewport",
        properties: this.board.viewPort,
        newProperties: frame.viewPort,
      });
    }
  }

  // 下一帧
  async nextFrame(animate = true): Promise<boolean> {
    if (!this.isPresentationMode) return false;

    const success = this.goToNextFrame();
    if (success) {
      await this.showCurrentFrame(animate);
    }

    return success;
  }

  // 上一帧
  async prevFrame(animate = true): Promise<boolean> {
    if (!this.isPresentationMode) return false;

    const success = this.goToPrevFrame();
    if (success) {
      await this.showCurrentFrame(animate);
    }

    return success;
  }

  // 添加新的演示序列
  addSequence(name: string, frames: PresentationFrame[]): PresentationSequence {
    const newSequence: PresentationSequence = {
      id: uuidv4(),
      name,
      frames,
      createTime: Date.now(),
      updateTime: Date.now(),
    };

    this.sequences = produce(this.sequences, (draft) => {
      draft.push(newSequence);
    });

    return newSequence;
  }

  // 更新演示序列
  updateSequence(sequence: PresentationSequence): PresentationSequence {
    const index = this.sequences.findIndex((s) => s.id === sequence.id);
    if (index === -1) {
      throw new Error(`Sequence with id ${sequence.id} not found`);
    }

    const updatedSequence = {
      ...sequence,
      updateTime: Date.now(),
    };

    this.sequences = produce(this.sequences, (draft) => {
      draft[index] = updatedSequence;
    });

    // 如果更新的是当前序列，也更新当前序列
    if (this.currentSequence?.id === sequence.id) {
      this.currentSequence = updatedSequence;
    }

    return updatedSequence;
  }

  // 删除演示序列
  deleteSequence(id: string): boolean {
    const index = this.sequences.findIndex((s) => s.id === id);
    if (index === -1) return false;

    this.sequences = produce(this.sequences, (draft) => {
      draft.splice(index, 1);
    });

    // 如果删除的是当前序列，重置当前序列
    if (this.currentSequence?.id === id) {
      this.currentSequence = null;
      this.currentFrameIndex = 0;
    }

    return true;
  }

  // 设置当前演示序列
  setCurrentSequence(id: string): boolean {
    console.log("尝试设置当前序列:", id);
    console.log(
      "可用序列:",
      this.sequences.map((s) => ({ id: s.id, name: s.name })),
    );

    const sequence = this.sequences.find((s) => s.id === id);
    if (!sequence) {
      console.error(`未找到ID为 ${id} 的序列`);
      return false;
    }

    console.log("找到序列:", sequence.name, "帧数:", sequence.frames.length);

    // 检查序列中的帧是否有效
    if (!sequence.frames || sequence.frames.length === 0) {
      console.error("序列中没有帧");
      return false;
    }

    // 检查第一帧是否有效
    const firstFrame = sequence.frames[0];
    if (!firstFrame || !firstFrame.viewPort) {
      console.error("第一帧无效或缺少视口信息");
      return false;
    }

    this.currentSequence = sequence;
    this.currentFrameIndex = 0;
    console.log("成功设置当前序列:", sequence.name);
    return true;
  }

  // 移动到下一帧
  goToNextFrame(): boolean {
    if (!this.currentSequence || this.currentFrameIndex === null) return false;
    if (this.currentFrameIndex >= this.currentSequence.frames.length - 1)
      return false;

    this.currentFrameIndex = this.currentFrameIndex + 1;
    return true;
  }

  // 移动到上一帧
  goToPrevFrame(): boolean {
    if (!this.currentSequence || this.currentFrameIndex === null) return false;
    if (this.currentFrameIndex <= 0) return false;

    this.currentFrameIndex = this.currentFrameIndex - 1;
    return true;
  }

  // 移动到指定帧
  goToFrame(index: number): boolean {
    if (!this.currentSequence) return false;
    if (index < 0 || index >= this.currentSequence.frames.length) return false;

    this.currentFrameIndex = index;
    return true;
  }

  // 创建新的帧
  createFrame(viewPort: ViewPort, elements: BoardElement[]): PresentationFrame {
    return {
      id: uuidv4(),
      viewPort: { ...viewPort },
      elements: elements.map((el) => el.id),
    };
  }

  // 从选中元素创建帧
  createFrameFromSelectedElements(board: Board): PresentationFrame | null {
    const selectedElements = board.selection.selectedElements;
    if (selectedElements.length === 0) return null;

    // 计算选中元素的边界框
    const viewPort = this.fitElementsInViewport(selectedElements);
    if (!viewPort) return null;

    return {
      id: uuidv4(),
      viewPort,
      elements: selectedElements.map((el) => el.id),
    };
  }

  // 检查元素是否在视口中
  isElementInViewport(element: BoardElement, viewPort: ViewPort): boolean {
    if (element.type === "arrow") {
      // 对于箭头，检查起点和终点是否在视口中
      const { x1, y1, x2, y2 } = element;
      return (
        this.isPointInViewport(x1, y1, viewPort) ||
        this.isPointInViewport(x2, y2, viewPort)
      );
    }

    // 对于其他元素，检查元素的边界框是否与视口相交
    const { x, y, width, height } = element;
    const { minX, minY, width: vpWidth, height: vpHeight } = viewPort;

    return (
      x + width >= minX &&
      x <= minX + vpWidth &&
      y + height >= minY &&
      y <= minY + vpHeight
    );
  }

  // 检查点是否在视口中
  isPointInViewport(x: number, y: number, viewPort: ViewPort): boolean {
    const { minX, minY, width, height } = viewPort;
    return x >= minX && x <= minX + width && y >= minY && y <= minY + height;
  }

  // 获取视口中的元素
  getElementsInViewport(
    elements: BoardElement[],
    viewPort: ViewPort,
  ): BoardElement[] {
    return elements.filter((element) =>
      this.isElementInViewport(element, viewPort),
    );
  }

  // 计算元素的边界框，并调整视口以适应这些元素
  fitElementsInViewport(
    elements: BoardElement[],
    padding = 50,
  ): ViewPort | null {
    if (elements.length === 0) return null;

    const board = this.board;
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) {
      console.error("无法获取容器元素");
      return null;
    }

    // 计算所有元素的边界框
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((element) => {
      if (
        "x" in element &&
        "y" in element &&
        "width" in element &&
        "height" in element
      ) {
        const { x, y, width, height } = element;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
        console.log(
          `元素 ${element.id} 的边界: x=${x}, y=${y}, width=${width}, height=${height}`,
        );
      } else if (element.type === "arrow" && element.points) {
        // 对于箭头，考虑所有点
        element.points.forEach((point: { x: number; y: number }) => {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        });
      } else if (element.type === "arrow") {
        // 兼容旧版箭头格式
        const { x1, y1, x2, y2 } = element;
        if (
          x1 !== undefined &&
          y1 !== undefined &&
          x2 !== undefined &&
          y2 !== undefined
        ) {
          minX = Math.min(minX, x1, x2);
          minY = Math.min(minY, y1, y2);
          maxX = Math.max(maxX, x1, x2);
          maxY = Math.max(maxY, y1, y2);
        }
      }
    });

    if (
      minX === Infinity ||
      minY === Infinity ||
      maxX === -Infinity ||
      maxY === -Infinity
    ) {
      console.error("无法计算元素边界");
      return null;
    }

    // 添加内边距
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const elementsWidth = maxX - minX;
    const elementsHeight = maxY - minY;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    console.log(
      `容器尺寸: ${containerWidth}x${containerHeight}, 元素区域: ${elementsWidth}x${elementsHeight}`,
    );

    const scaleX = containerWidth / elementsWidth;
    const scaleY = containerHeight / elementsHeight;
    const zoom = Math.min(scaleX, scaleY);

    const viewPort = {
      minX: minX - (containerWidth / zoom - elementsWidth) / 2,
      minY: minY - (containerHeight / zoom - elementsHeight) / 2,
      width: containerWidth / zoom,
      height: containerHeight / zoom,
      zoom,
    };

    console.log("计算得到的视口:", viewPort);
    return viewPort;
  }
}
