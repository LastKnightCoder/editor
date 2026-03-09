import type { TodoQueryItem } from "@/types";

export interface TodoRowCardProps {
  item: TodoQueryItem;
  isDark: boolean;
  onToggleComplete: (item: TodoQueryItem) => Promise<void>;
}
