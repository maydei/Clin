type Stage = "import-first-page-ready" | "import-total" | "page-render" | "recovery-write" | "project-encode" | "project-decode" | "export";
let enabled = false;
export function setPerformanceEnabled(value: boolean) { enabled = value; if (!value) entries.length = 0; }
const entries: Array<{ stage: Stage; durationMs: number }> = [];

// Session-only timings from normal use. No benchmark, test, network or background probe.
export function recordDuration(stage: Stage, startedAt: number) {
  if (!enabled) return;
  entries.push({ stage, durationMs: Math.round((performance.now() - startedAt) * 10) / 10 });
  if (entries.length > 100) entries.shift();
}
export function performanceEntries() { return entries.map((entry) => ({ ...entry })); }
