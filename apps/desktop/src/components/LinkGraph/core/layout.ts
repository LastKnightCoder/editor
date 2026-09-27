/**
 * d3-force 封装。
 *
 * 与 G6 版的区别：坐标写在我们自己的 GraphNode 上（d3-force 就地改对象），
 * 渲染器每帧直接读，中间没有 data → graph → shape 的同步链路。
 * 力的参数按节点数自适应：小图松散好看，大图收紧不然会铺得太开。
 *
 * 批次 2 会把这个类整体搬进 Worker，届时对外只多一层 postMessage，
 * 接口（start/stop/reheat/dragTo）保持不变。
 */

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";
import { clusterForce } from "./clusterForce";
import type { GraphNode, GraphScene } from "./types";

/** d3-force 要求 link 的 source/target 能被替换成节点对象引用 */
interface SimLink {
  source: number | GraphNode;
  target: number | GraphNode;
}

export interface ForceLayoutOptions {
  /**
   * 簇数量；缺省取 scene.clusters.length。
   * Worker 侧重建的精简场景没有 ClusterInfo，只能按数量传进来。
   */
  clusterCount?: number;
  /** 每 tick 之后回调，宿主据此标记需要重绘 */
  onTick?: () => void;
  /** 模拟自然收敛后回调一次 */
  onSettle?: () => void;
}

export class ForceLayout {
  private simulation: Simulation<GraphNode, SimLink>;
  private settled = false;

  constructor(
    private scene: GraphScene,
    private options: ForceLayoutOptions = {}
  ) {
    const count = scene.nodes.length;
    const clusters = options.clusterCount ?? scene.clusters.length;
    // 节点越多，斥力与连线距离越收紧：否则 700 个点会铺到几万像素，缩放后全是小点
    const scale = 1 / Math.max(1, Math.log10(Math.max(10, count)));
    const links: SimLink[] = scene.edges.map(edge => ({
      source: edge.source,
      target: edge.target,
    }));

    this.simulation = forceSimulation<GraphNode, SimLink>(scene.nodes)
      .force(
        "link",
        forceLink<GraphNode, SimLink>(links)
          .id(node => node.id)
          .distance(70 * scale + 30)
          .strength(0.35)
      )
      .force(
        "charge",
        forceManyBody<GraphNode>()
          .strength(-260 * scale - 40)
          .distanceMax(600)
      )
      .force("collide", forceCollide<GraphNode>(node => node.radius + 6).iterations(2))
      .force("center", forceCenter<GraphNode>(0, 0).strength(0.02))
      // 主题簇的内聚与互斥：没跑出簇时（图太小、全是孤立卡片）这一项不加
      .force("cluster", clusters > 0 ? clusterForce(clusters) : null)
      .velocityDecay(0.35)
      .alphaDecay(0.02)
      .on("tick", () => this.options.onTick?.())
      .on("end", () => {
        this.settled = true;
        this.options.onSettle?.();
      });
  }

  /** 初始 alpha 跑满一轮 */
  start() {
    this.settled = false;
    this.simulation.alpha(1).restart();
  }

  /** 不跑动画、直接算到收敛：坐标已持久化或节点很少时用 */
  runToSettle(ticks = 300) {
    this.simulation.stop();
    this.simulation.alpha(1);
    this.simulation.tick(ticks);
    this.settled = true;
  }

  /** 局部扰动后小幅加热（拖拽、增删节点），不重排整张图 */
  reheat(alpha = 0.3) {
    this.settled = false;
    this.simulation.alpha(Math.max(this.simulation.alpha(), alpha)).restart();
  }

  get isSettled() {
    return this.settled;
  }

  /** 拖拽中：固定该节点并持续加热，松手前一直跟手 */
  dragTo(node: GraphNode, x: number, y: number) {
    node.fx = x;
    node.fy = y;
    node.x = x;
    node.y = y;
    this.simulation.alphaTarget(0.12).restart();
  }

  /** 松手：pin 为 true 时保留固定位置，否则放回自由态 */
  endDrag(node: GraphNode, pin: boolean) {
    if (!pin) {
      node.fx = null;
      node.fy = null;
    }
    this.simulation.alphaTarget(0);
  }

  stop() {
    this.simulation.stop();
  }

  destroy() {
    this.simulation.on("tick", null).on("end", null).stop();
  }

  /** 场景引用暴露给宿主做断言，避免测试里去翻私有字段 */
  get currentScene() {
    return this.scene;
  }
}
