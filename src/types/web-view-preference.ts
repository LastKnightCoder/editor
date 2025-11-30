export interface WebViewPreference {
  projectItemId: number;
  preferredContentId: number | null;
}

export interface SetWebViewPreferencePayload {
  projectItemId: number;
  preferredContentId: number | null;
}
