export interface ExportFormatResult {
  format: string;
  success: boolean;
  filePath?: string;
  canceled?: boolean;
  warnings?: string[];
}

export type ExportSummaryStatus =
  | "all-success"
  | "partial-success"
  | "all-failed"
  | "all-canceled"
  | "none";

export interface ExportResultSummary {
  status: ExportSummaryStatus;
  successResults: ExportFormatResult[];
  failedResults: ExportFormatResult[];
  canceledResults: ExportFormatResult[];
}

export const summarizeExportResults = (
  results: ExportFormatResult[],
): ExportResultSummary => {
  const successResults = results.filter((item) => item.success);
  const failedResults = results.filter(
    (item) => !item.success && !item.canceled,
  );
  const canceledResults = results.filter((item) => item.canceled);

  if (results.length === 0) {
    return {
      status: "none",
      successResults,
      failedResults,
      canceledResults,
    };
  }

  if (failedResults.length > 0) {
    return {
      status: successResults.length > 0 ? "partial-success" : "all-failed",
      successResults,
      failedResults,
      canceledResults,
    };
  }

  if (successResults.length > 0) {
    return {
      status: canceledResults.length > 0 ? "partial-success" : "all-success",
      successResults,
      failedResults,
      canceledResults,
    };
  }

  if (canceledResults.length === results.length) {
    return {
      status: "all-canceled",
      successResults,
      failedResults,
      canceledResults,
    };
  }

  return {
    status: "none",
    successResults,
    failedResults,
    canceledResults,
  };
};
