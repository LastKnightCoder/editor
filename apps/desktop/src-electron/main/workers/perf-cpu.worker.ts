import { Session } from "node:inspector/promises";
import { parentPort, workerData } from "node:worker_threads";
import { CPU_DURATION_MS, CPU_INTERVAL_US, type CpuProfile } from "../../../shared/perf-cpu";
import { prepareCpuProfile } from "../services/perf-cpu-profile";

interface Input {
  appRoot: string;
  profile?: CpuProfile;
}
const input: Input = workerData;

async function run() {
  if (input.profile) return prepareCpuProfile(input.profile, input.appRoot);
  const session = new Session();
  const cancel = () => {
    void session
      .post("Profiler.stop")
      .catch(() => undefined)
      .finally(() => session.disconnect());
  };
  const deadline = setTimeout(cancel, 10_000);
  parentPort?.once("message", cancel);
  try {
    session.connectToMainThread();
    await session.post("Profiler.enable");
    await session.post("Profiler.setSamplingInterval", { interval: CPU_INTERVAL_US });
    await session.post("Profiler.start");
    parentPort?.postMessage({ type: "started" });
    await new Promise(resolve => setTimeout(resolve, CPU_DURATION_MS));
    const { profile } = await session.post("Profiler.stop");
    return prepareCpuProfile(profile, input.appRoot);
  } finally {
    clearTimeout(deadline);
    parentPort?.removeListener("message", cancel);
    session.disconnect();
  }
}

void run().then(
  result => parentPort?.postMessage({ type: "complete", result }),
  () => parentPort?.postMessage({ type: "failed" })
);
