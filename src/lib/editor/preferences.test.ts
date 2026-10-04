import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ACCENT, accentForeground } from "./accent";
import { defaultPreferences, readPreferences, writePreferences } from "./preferences";

// Keep preference serialization tests independent of Node's experimental storage.
const stored = new Map<string, string>();
beforeAll(() => { vi.stubGlobal("localStorage", {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
  clear: () => stored.clear(),
}); });
afterEach(() => localStorage.clear());
afterAll(() => vi.unstubAllGlobals());
describe("accent preferences", () => {
  it("keeps Clin yellow for old preferences and invalid colors", () => {
    localStorage.setItem("clin:preferences:v1", JSON.stringify({ version: 1, theme: "dark" }));
    expect(readPreferences().accentColor).toBe(DEFAULT_ACCENT);
    localStorage.setItem("clin:preferences:v1", JSON.stringify({ version: 1, accentColor: "invalid" }));
    expect(readPreferences().accentColor).toBe(DEFAULT_ACCENT);
  });
  it("persists a custom color", () => {
    writePreferences({ ...defaultPreferences, accentColor: "#2563eb" });
    expect(readPreferences().accentColor).toBe("#2563eb");
  });
  it("chooses contrasting foregrounds for light and dark accents", () => {
    expect(accentForeground(DEFAULT_ACCENT)).toBe("#171717");
    expect(accentForeground("#2563eb")).toBe("#ffffff");
  });
});

it.each(["dashboard", "canvas", "reader"] as const)("persists the %s startup environment", (startup) => {
  writePreferences({ ...defaultPreferences, startup });
  expect(readPreferences().startup).toBe(startup);
});

it('restores view defaults and bounds the reveal margin for older installations', () => {
  expect(readPreferences()).toMatchObject({ showStatusBar: false, revealMargin: 24, startInZen: false });
  localStorage.setItem('clin:preferences:v1', JSON.stringify({ revealMargin: 10000, startInZen: true, showStatusBar: true }));
  expect(readPreferences()).toMatchObject({ revealMargin: 96, startInZen: true, showStatusBar: true });
});
