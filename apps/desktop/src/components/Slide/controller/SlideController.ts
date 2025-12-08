/**
 * SlideController - 统一的演示状态控制器
 *
 * 功能：
 * 1. 管理演示状态（当前页、动画步骤、全屏状态等）
 * 2. 通过 BroadcastChannel 在多窗口间同步状态
 * 3. 支持指针位置同步
 * 4. 提供统一的导航 API
 */

export interface SlideControllerState {
  /** 当前幻灯片文档 ID */
  deckId: number;
  /** 当前页面索引 */
  currentPageIndex: number;
  /** 当前动画步骤（每页独立） */
  animationStep: number;
  /** 是否全屏 */
  isFullscreen: boolean;
  /** 指针位置（相对于幻灯片的百分比坐标） */
  pointerPosition: { x: number; y: number } | null;
  /** 是否显示指针 */
  showPointer: boolean;
  /** 演示开始时间 */
  startTime: number;
  /** 是否暂停计时 */
  isPaused: boolean;
}

export type SlideControllerRole = "presenter" | "audience";

export interface SlideControllerMessage {
  type:
    | "state-update"
    | "navigate"
    | "pointer-move"
    | "pointer-toggle"
    | "sync-request"
    | "sync-response";
  payload: Partial<SlideControllerState> | NavigatePayload | PointerPayload | null;
  source: SlideControllerRole;
  timestamp: number;
}

interface NavigatePayload {
  direction: "next" | "prev" | "goto";
  pageIndex?: number;
}

interface PointerPayload {
  position: { x: number; y: number } | null;
  show: boolean;
}

type StateListener = (state: SlideControllerState) => void;

const CHANNEL_PREFIX = "slide-controller-";

export class SlideController {
  private state: SlideControllerState;
  private channel: BroadcastChannel | null = null;
  private listeners: Set<StateListener> = new Set();
  private role: SlideControllerRole;
  private totalPages: number;
  private animationCounts: number[]; // 每页的动画步骤数

  constructor(
    deckId: number,
    totalPages: number,
    animationCounts: number[],
    role: SlideControllerRole = "presenter"
  ) {
    this.role = role;
    this.totalPages = totalPages;
    this.animationCounts = animationCounts;

    this.state = {
      deckId,
      currentPageIndex: 0,
      animationStep: 0,
      isFullscreen: false,
      pointerPosition: null,
      showPointer: false,
      startTime: Date.now(),
      isPaused: false,
    };

    this.initChannel(deckId);
  }

  private initChannel(deckId: number) {
    if (typeof BroadcastChannel === "undefined") {
      console.warn("BroadcastChannel not supported");
      return;
    }

    this.channel = new BroadcastChannel(`${CHANNEL_PREFIX}${deckId}`);
    this.channel.onmessage = (event: MessageEvent<SlideControllerMessage>) => {
      this.handleMessage(event.data);
    };

    // 如果是观众端，请求同步状态
    if (this.role === "audience") {
      this.requestSync();
    }
  }

  private handleMessage(message: SlideControllerMessage) {
    // 忽略自己发送的消息
    if (message.source === this.role) return;

    switch (message.type) {
      case "state-update":
        if (message.payload) {
          this.setState(message.payload as Partial<SlideControllerState>, false);
        }
        break;

      case "navigate":
        if (this.role === "audience" && message.payload) {
          const payload = message.payload as NavigatePayload;
          if (payload.direction === "next") {
            this.next(false);
          } else if (payload.direction === "prev") {
            this.prev(false);
          } else if (payload.direction === "goto" && payload.pageIndex !== undefined) {
            this.goToPage(payload.pageIndex, false);
          }
        }
        break;

      case "pointer-move":
        if (this.role === "audience" && message.payload) {
          const payload = message.payload as PointerPayload;
          this.setState(
            {
              pointerPosition: payload.position,
              showPointer: payload.show,
            },
            false
          );
        }
        break;

      case "sync-request":
        if (this.role === "presenter") {
          this.broadcastSync();
        }
        break;

      case "sync-response":
        if (this.role === "audience" && message.payload) {
          this.setState(message.payload as Partial<SlideControllerState>, false);
        }
        break;
    }
  }

  private broadcast(message: Omit<SlideControllerMessage, "source" | "timestamp">) {
    if (!this.channel) return;

    this.channel.postMessage({
      ...message,
      source: this.role,
      timestamp: Date.now(),
    } as SlideControllerMessage);
  }

  private requestSync() {
    this.broadcast({ type: "sync-request", payload: null });
  }

  private broadcastSync() {
    this.broadcast({ type: "sync-response", payload: this.state });
  }

  private setState(updates: Partial<SlideControllerState>, broadcast = true) {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();

    if (broadcast && this.role === "presenter") {
      this.broadcast({ type: "state-update", payload: updates });
    }
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.state));
  }

  // 公开 API

  /** 获取当前状态 */
  getState(): SlideControllerState {
    return { ...this.state };
  }

  /** 订阅状态变化 */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 下一步（动画或页面） */
  next(broadcast = true) {
    const { currentPageIndex, animationStep } = this.state;
    const currentAnimationCount = this.animationCounts[currentPageIndex] ?? 0;

    // 如果当前页还有未播放的动画
    if (animationStep < currentAnimationCount) {
      this.setState({ animationStep: animationStep + 1 }, broadcast);
      return;
    }

    // 如果不是最后一页，切换到下一页
    if (currentPageIndex < this.totalPages - 1) {
      this.setState(
        {
          currentPageIndex: currentPageIndex + 1,
          animationStep: 0,
        },
        broadcast
      );
    }
  }

  /** 上一步（动画或页面） */
  prev(broadcast = true) {
    const { currentPageIndex, animationStep } = this.state;

    // 如果当前页有已播放的动画
    if (animationStep > 0) {
      this.setState({ animationStep: animationStep - 1 }, broadcast);
      return;
    }

    // 如果不是第一页，切换到上一页并显示所有动画
    if (currentPageIndex > 0) {
      const prevIndex = currentPageIndex - 1;
      const prevAnimationCount = this.animationCounts[prevIndex] ?? 0;
      this.setState(
        {
          currentPageIndex: prevIndex,
          animationStep: prevAnimationCount,
        },
        broadcast
      );
    }
  }

  /** 跳转到指定页面 */
  goToPage(pageIndex: number, broadcast = true) {
    if (pageIndex < 0 || pageIndex >= this.totalPages) return;

    this.setState(
      {
        currentPageIndex: pageIndex,
        animationStep: 0,
      },
      broadcast
    );
  }

  /** 切换全屏状态 */
  toggleFullscreen() {
    const isFullscreen = !this.state.isFullscreen;
    this.setState({ isFullscreen });

    if (isFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  /** 更新指针位置 */
  updatePointer(position: { x: number; y: number } | null) {
    this.setState({ pointerPosition: position }, false);
    this.broadcast({
      type: "pointer-move",
      payload: { position, show: this.state.showPointer },
    });
  }

  /** 切换指针显示 */
  togglePointer() {
    const showPointer = !this.state.showPointer;
    this.setState({ showPointer }, false);
    this.broadcast({
      type: "pointer-toggle",
      payload: { position: this.state.pointerPosition, show: showPointer },
    });
  }

  /** 暂停/继续计时 */
  togglePause() {
    this.setState({ isPaused: !this.state.isPaused });
  }

  /** 重置计时器 */
  resetTimer() {
    this.setState({ startTime: Date.now(), isPaused: false });
  }

  /** 获取已过去的时间（秒） */
  getElapsedTime(): number {
    if (this.state.isPaused) {
      return 0; // 简化处理，实际应记录暂停时的时间
    }
    return Math.floor((Date.now() - this.state.startTime) / 1000);
  }

  /** 销毁控制器 */
  destroy() {
    this.channel?.close();
    this.channel = null;
    this.listeners.clear();
  }
}

export default SlideController;
