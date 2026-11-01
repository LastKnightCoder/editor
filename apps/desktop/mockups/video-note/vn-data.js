/* 视频笔记样板间 · 演示数据（字段对应 VideoNote / TranscriptSegment / VideoNoteItem） */

export const VIDEO = {
  title: "3Blue1Brown｜反向传播到底在做什么",
  source: "B 站",
  dur: 1153, // 19:13
  now: 462, // 当前播放到 07:42
};

export const fmt = s =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/* AI 章节（待决：是否新增「AI 分章节」能力；不做时按停顿自动分段、没有标题） */
export const CHAPTERS = [
  { t: 0, title: "回顾：网络、代价函数与梯度下降" },
  { t: 180, title: "梯度的每一项意味着什么" },
  { t: 395, title: "单个样本：想让输出层怎么变" },
  { t: 565, title: "把期望一层层往回传" },
  { t: 760, title: "链式法则：把直觉写成公式" },
  { t: 1010, title: "小批量随机梯度下降" },
];

export const SUMMARY = {
  2: "以数字 2 的一张图片为例：输出层要让「2」变亮、其他变暗，而让一个神经元变亮只有三条路——加偏置、加权重、改上一层的激活值。",
};

export const SEGMENTS = [
  { t: 12, text: "上一期我们讲了神经网络是怎么通过梯度下降来学习的。" },
  { t: 19, text: "这里的核心是代价函数：它衡量网络在所有训练样本上表现得有多差。" },
  { t: 28, text: "而学习，就是找到让代价函数尽可能小的那组权重和偏置。" },
  { t: 268, text: "梯度告诉我们，往哪个方向调整参数，代价下降得最快。" },
  { t: 276, text: "它的每一项的大小，反映的是代价函数对这个参数有多敏感。" },
  { t: 431, text: "现在我们把注意力放在一个训练样本上，比如这张手写的数字 2。" },
  { t: 440, text: "我们希望最后一层里代表「2」的那个神经元变亮，其他九个都变暗。" },
  {
    t: 462,
    text: "要让一个神经元的激活值变大，只有三条路：增大偏置、增大权重，或者改变上一层的激活值。",
  },
  { t: 476, text: "增大权重的效果，取决于它连接的那个神经元有多亮。" },
  { t: 488, text: "越亮的神经元，它连接的权重对结果的影响就越大。" },
  { t: 504, text: "把所有输出神经元的期望加在一起，就得到了我们对倒数第二层的「期望改变」。" },
  { t: 521, text: "这就像是在说：一起放电的神经元，会连接在一起。" },
  { t: 565, text: "然后对倒数第二层重复同样的过程，一层一层往回传。" },
  { t: 574, text: "这就是反向传播这个名字的由来。" },
];
SEGMENTS.forEach(s => (s.ch = CHAPTERS.filter(c => c.t <= s.t).length - 1));
export const NOW_INDEX = 7;
export const QUOTED_INDEX = 10;

/* 笔记里的时间戳 / 截帧：同时作为进度条上的刻度 */
export const MARKS = [
  { t: 268, kind: "ts", label: "梯度下降 = 沿负梯度走" },
  { t: 462, kind: "ts", label: "让神经元变亮只有三条路" },
  { t: 504, kind: "quote", label: "摘录：把所有输出神经元的期望加在一起" },
  { t: 772, kind: "shot", label: "截帧：链式法则展开" },
];

export const NOTES = [
  { id: 1, title: "反向传播笔记" },
  { id: 2, title: "疑问整理" },
];

export const TREE = [
  { lv: 0, ic: "chevron-down", t: "深度学习入门", folder: true },
  { lv: 1, ic: "file-text", t: "课程大纲" },
  { lv: 1, ic: "clapperboard", t: "神经网络是什么" },
  { lv: 1, ic: "clapperboard", t: "梯度下降怎么学习" },
  { lv: 1, ic: "clapperboard", t: "反向传播到底在做什么", on: true },
  { lv: 1, ic: "clapperboard", t: "反向传播的微积分" },
  { lv: 1, ic: "file-text", t: "第 3 章 概率与信息论.pdf" },
  { lv: 0, ic: "chevron-right", t: "练习", folder: true },
];
