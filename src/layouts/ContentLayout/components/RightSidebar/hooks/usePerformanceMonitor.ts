// Simple performance monitoring utility for debugging
const DEBUG_PERFORMANCE = false; // Set to true to enable logging

interface PerformanceMeasure {
  id: string;
  startTime: number;
  end: () => void;
}

/**
 * Measures the performance of a specific operation
 * @param id Identifier for this performance measurement
 * @returns Object with an end method to call when the operation completes
 */
export function measurePerformance(id: string): PerformanceMeasure {
  const startTime = performance.now();

  return {
    id,
    startTime,
    end: () => {
      if (!DEBUG_PERFORMANCE) return;

      const endTime = performance.now();
      const duration = endTime - startTime;
      console.log(`[Performance] ${id}: ${duration.toFixed(2)}ms`);
    },
  };
}

/**
 * Performance monitor hook that can be used to measure component render time
 * @param componentName Name of the component being measured
 */
export function usePerformanceMonitor(componentName: string) {
  if (!DEBUG_PERFORMANCE) return;

  // Log component render start
  const startTime = performance.now();

  // Return cleanup function that logs render duration
  return () => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    console.log(`[Render] ${componentName}: ${duration.toFixed(2)}ms`);
  };
}

/**
 * Enable detailed performance metrics for the chat component
 * @param enable Whether to enable performance monitoring
 */
export function enablePerformanceMonitoring(enable: boolean) {
  (window as any).__CHAT_PERFORMANCE_MONITORING__ = enable;
}

export function isPerformanceMonitoringEnabled(): boolean {
  return !!(window as any).__CHAT_PERFORMANCE_MONITORING__ || DEBUG_PERFORMANCE;
}
