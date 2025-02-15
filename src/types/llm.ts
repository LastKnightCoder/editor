import { Role } from "@/constants";

export interface Message {
  role: Role;
  content: string;
  reasoning_content?: string;
}
