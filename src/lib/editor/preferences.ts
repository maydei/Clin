import { DEFAULT_ACCENT } from "./accent";
export type Preferences = {
  showStatusBar: boolean;
  revealMargin: number;
  startInZen: boolean;
  version: 1;
  accentColor: string;
  presentationTransition: "fade" | "slide" | "slide-vertical" | "none";
  theme: "system" | "light" | "dark";
  startup: "dashboard" | "canvas" | "reader";
  diagnostics: boolean;
  inkColor: string;
  highlightColor: string;
  inkSize: number;
  pressureEnabled: boolean;
  pressureSensitivity: number;
  strokeSmoothing: number;
};
const key = "clin:preferences:v1";
export const defaultPreferences: Preferences = { showStatusBar: false, revealMargin: 24, startInZen: false, version: 1, accentColor: DEFAULT_ACCENT, presentationTransition: "fade", theme: "system", startup: "dashboard", diagnostics: false, inkColor: "#e11d48", highlightColor: "#facc15", inkSize: 4, pressureEnabled: true, pressureSensitivity: 1, strokeSmoothing: 0.8 };
export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!value || (value.version !== undefined && value.version !== 1)) return { ...defaultPreferences };
    const bounded = (input: unknown, fallback: number, min: number, max: number) => typeof input === "number" && Number.isFinite(input) ? Math.max(min, Math.min(max, input)) : fallback;
    const color = (input: unknown, fallback: string) => typeof input === "string" && /^#[0-9a-f]{6}$/i.test(input) ? input : fallback;
    return { ...defaultPreferences,
      showStatusBar: value.showStatusBar === true, startInZen: value.startInZen === true, revealMargin: bounded(value.revealMargin, 24, 8, 96),
      theme: ["system", "light", "dark"].includes(value.theme) ? value.theme : "system",
      startup: ["dashboard", "canvas", "reader"].includes(value.startup) ? value.startup : "dashboard",
      presentationTransition: ["fade", "slide", "slide-vertical", "none"].includes(value.presentationTransition ?? "") ? value.presentationTransition! : "fade",
      accentColor: color(value.accentColor, DEFAULT_ACCENT),
      diagnostics: value.diagnostics === true,
      inkColor: color(value.inkColor, defaultPreferences.inkColor), highlightColor: color(value.highlightColor, defaultPreferences.highlightColor),
      inkSize: bounded(value.inkSize, 4, 1, 32), pressureEnabled: value.pressureEnabled !== false,
      pressureSensitivity: bounded(value.pressureSensitivity, 1, 0.1, 3), strokeSmoothing: bounded(value.strokeSmoothing, 0.8, 0, 1),
    };
  } catch { return { ...defaultPreferences }; }
}
export function writePreferences(value: Preferences) { localStorage.setItem(key, JSON.stringify(value)); }
