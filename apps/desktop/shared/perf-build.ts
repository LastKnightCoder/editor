declare const __TAU_PERF_BUILD_ID__: string;

export const perfBuildId =
  typeof __TAU_PERF_BUILD_ID__ === "string" ? __TAU_PERF_BUILD_ID__ : "development";
