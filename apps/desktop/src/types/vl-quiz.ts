import type { Descendant } from "slate";
import type {
  FlashcardType,
  FlashcardData,
  FlashcardDifficulty,
} from "./flashcard";

/**
 * 测验题类型（复用 FlashcardType）
 */
export type QuizItemType = FlashcardType;

/**
 * 测验题数据（复用 FlashcardData）
 */
export type QuizItemData = FlashcardData;

/**
 * 测验题难度（复用 FlashcardDifficulty）
 */
export type QuizItemDifficulty = FlashcardDifficulty;

/**
 * 测验集
 */
export interface VLQuizSet {
  id: number;
  projectId: number;
  name: string;
  description: string;
  emoji: string;
  /** 关联的资源 ID 列表 */
  resourceIds: number[];
  /** 用户输入的生成提示 */
  prompt: string | null;
  /** 测验题数量 */
  itemCount: number;
  createTime: number;
  updateTime: number;
}

/**
 * 创建测验集参数
 */
export interface CreateVLQuizSetInput {
  projectId: number;
  name: string;
  description?: string;
  emoji?: string;
  resourceIds?: number[];
  prompt?: string;
}

/**
 * 更新测验集参数
 */
export interface UpdateVLQuizSetInput {
  id: number;
  name?: string;
  description?: string;
  emoji?: string;
  resourceIds?: number[];
  prompt?: string;
}

/**
 * 测验题
 */
export interface VLQuizItem {
  id: number;
  quizSetId: number;
  type: QuizItemType;
  /** 题干（富文本） */
  prompt: Descendant[];
  /** 详细说明（富文本） */
  detail: Descendant[];
  /** 类型相关数据（选项、答案等） */
  data: QuizItemData;
  /** 标签 */
  tags: string[];
  /** 难度 */
  difficulty: QuizItemDifficulty;
  /** 排序 */
  sortOrder: number;
  createTime: number;
  updateTime: number;
}

/**
 * 创建测验题参数
 */
export interface CreateVLQuizItemInput {
  quizSetId: number;
  type: QuizItemType;
  prompt: Descendant[];
  detail?: Descendant[];
  data: QuizItemData;
  tags?: string[];
  difficulty?: QuizItemDifficulty;
  sortOrder?: number;
}

/**
 * 更新测验题参数
 */
export interface UpdateVLQuizItemInput {
  id: number;
  type?: QuizItemType;
  prompt?: Descendant[];
  detail?: Descendant[];
  data?: QuizItemData;
  tags?: string[];
  difficulty?: QuizItemDifficulty;
  sortOrder?: number;
}

/**
 * 单题答案记录
 */
export interface QuizAnswerRecord {
  itemId: number;
  /** 用户答案（根据题型不同结构不同） */
  userAnswer: unknown;
  /** 是否正确 */
  isCorrect: boolean;
  /** 得分（满分 1） */
  score: number;
  /** 用时（秒） */
  duration: number;
}

/**
 * 测验记录
 */
export interface VLQuizRecord {
  id: number;
  quizSetId: number;
  projectId: number;
  /** 得分（百分比 0-100） */
  score: number;
  /** 正确数 */
  correctCount: number;
  /** 总题数 */
  totalCount: number;
  /** 答题记录 */
  answers: QuizAnswerRecord[];
  /** 测验用时（秒） */
  duration: number;
  createTime: number;
}

/**
 * 创建测验记录参数
 */
export interface CreateVLQuizRecordInput {
  quizSetId: number;
  projectId: number;
  score: number;
  correctCount: number;
  totalCount: number;
  answers: QuizAnswerRecord[];
  duration: number;
}

/**
 * AI 生成的测验题（临时结构，用于生成流程）
 */
export interface GeneratedQuizItem {
  id: string;
  type: QuizItemType;
  prompt: Descendant[];
  detail: Descendant[];
  data: QuizItemData;
  tags: string[];
  difficulty: QuizItemDifficulty;
  /** 是否被选中 */
  selected: boolean;
}

/**
 * 测验状态
 */
export type QuizTestStatus = "idle" | "testing" | "submitted" | "reviewing";

/**
 * 测验会话（运行时状态）
 */
export interface QuizTestSession {
  quizSetId: number;
  items: VLQuizItem[];
  currentIndex: number;
  answers: Map<number, QuizAnswerRecord>;
  startTime: number;
  status: QuizTestStatus;
}
