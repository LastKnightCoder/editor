import ContentLinkExtension from "./content-link";
import DocumentCardListExtension from "./document-card-list";
import FileAttachmentExtension from "./file-attachment";
import DailySummaryExtension from "./daily-summary";
import ProjectCardListExtension from "./project-card-list";
import QuestionCardExtension from "./question-card";
import ChatReferenceExtension from "./chat-reference";

export const contentLinkExtension = new ContentLinkExtension();

export const createDocumentCardListExtension = (documentId?: number) =>
  new DocumentCardListExtension(documentId);

export const createProjectCardListExtension = (projectId?: number) =>
  new ProjectCardListExtension(projectId);

export const fileAttachmentExtension = new FileAttachmentExtension();
export const dailySummaryExtension = new DailySummaryExtension();
export const questionCardExtension = new QuestionCardExtension();
export const chatReferenceExtension = new ChatReferenceExtension();
