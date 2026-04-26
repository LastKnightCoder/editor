export const yieldToEventLoop = async (): Promise<void> =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

export const yieldEvery = async (
  processedCount: number,
  step: number,
): Promise<void> => {
  if (step <= 0) {
    return;
  }
  if (processedCount > 0 && processedCount % step === 0) {
    await yieldToEventLoop();
  }
};
