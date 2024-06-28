import { CreateProject } from "@/types";

export const DEFAULT_CREATE_PROJECT: CreateProject = {
  title: '',
  children: [],
  desc: [{
    type: 'paragraph',
    children: [{ type: 'formatted', text: '' }],
  }],
  archived: false,
}
