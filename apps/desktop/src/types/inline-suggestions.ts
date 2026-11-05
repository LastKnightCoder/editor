export const INLINE_SUGGESTION_SLOT = "inlineSuggestion";

export interface InlineSuggestionRequest {
  requestId: string;
  providerId: string;
  modelId: string;
  shared: boolean;
  before: string;
  after: string;
  language?: string;
}
