import ContentLinkExtension from "./content-link";
import DocumentCardListExtension from "./document-card-list";
import FileAttachmentExtension from "./file-attachment";
import ProjectCardListExtension from "./project-card-list";
import QuestionCardExtension from "./question-card";
import ChatReferenceExtension from "./chat-reference";
import InlineAIAssistantExtension from "./inline-ai-assistant";

export const createDocumentCardListExtension = (documentId?: number) =>
  new DocumentCardListExtension(documentId);

export const createProjectCardListExtension = (projectId?: number) =>
  new ProjectCardListExtension(projectId);

export const contentLinkExtension = new ContentLinkExtension();
export const fileAttachmentExtension = new FileAttachmentExtension();
export const questionCardExtension = new QuestionCardExtension();
export const chatReferenceExtension = new ChatReferenceExtension();
export const inlineAIAssistantExtension = new InlineAIAssistantExtension();
