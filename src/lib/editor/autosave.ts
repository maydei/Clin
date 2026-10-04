import { recordDuration } from "./performance-log";
import { del, get, set, setMany, keys, delMany } from "idb-keyval";
import type { EditorProject, DocumentSource } from "./types";

const AUTOSAVE_KEY = "limpio-pdf:autosave:v1";
const RECENT_KEY = "limpio-pdf:recent:v1";
const CURRENT_KEY = "clin:recovery:v2";
const RECENTS_KEY = "clin:recents:v2";
const SOURCE_PREFIX = "clin:source:v2:";
type Manifest = Omit<EditorProject, "sources"> & { sources: Array<Omit<DocumentSource, "bytes">> };
export type RecentProject = { id?: string; name: string; updatedAt: string; pageCount: number; storageKey: string };
let writes: Promise<unknown> = Promise.resolve();
const knownSources = new Set<string>();
let sourceKeysLoaded = false;

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = writes.then(operation, operation);
  writes = next.catch(() => undefined);
  return next;
}

export function mergeRecentProjects(current: EditorProject[], project: EditorProject, limit = 5): EditorProject[] {
  const identity = project.id ?? project.name;
  return [project, ...current.filter((item) => (item.id ?? item.name) !== identity)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

async function persist(key: string, project: EditorProject) {
  const entries: [IDBValidKey, unknown][] = [];
  if (!sourceKeysLoaded) {
    for (const key of await keys()) if (typeof key === "string" && key.startsWith(SOURCE_PREFIX)) knownSources.add(key.slice(SOURCE_PREFIX.length));
    sourceKeysLoaded = true;
  }
  for (const source of project.sources) if (!knownSources.has(source.id)) {
    entries.push([SOURCE_PREFIX + source.id, source.bytes]);
  }
  const manifest: Manifest = { ...project, sources: project.sources.map(({ bytes: _bytes, ...source }) => source) };
  entries.push([key, manifest]);
  await setMany(entries);
  project.sources.forEach((source) => knownSources.add(source.id));
}

async function hydrate(manifest: Manifest): Promise<EditorProject> {
  const sources = await Promise.all(manifest.sources.map(async (source) => {
    const bytes = await get<Uint8Array>(SOURCE_PREFIX + source.id);
    if (!bytes) throw new Error(`No se encuentra el original de ${source.name}.`);
    return { ...source, bytes };
  }));
  return { ...manifest, sources };
}

export function saveAutosave(project: EditorProject) {
  return enqueue(async () => { const startedAt = performance.now(); await persist(CURRENT_KEY, project); await del(AUTOSAVE_KEY); recordDuration("recovery-write", startedAt); });
}

export async function loadAutosave() {
  const manifest = await get<Manifest>(CURRENT_KEY);
  if (manifest) return hydrate(manifest);
  const legacy = await get<EditorProject>(AUTOSAVE_KEY);
  if (legacy) await saveAutosave(legacy);
  return legacy ?? null;
}

export function clearAutosave() {
  return enqueue(async () => { await delMany([CURRENT_KEY, AUTOSAVE_KEY]); await collectSources(); });
}

async function saveRecent(project: EditorProject) {
  const storageKey = `clin:recent:v2:${project.id ?? project.name}`;
  await persist(storageKey, project);
  const current = (await get<RecentProject[]>(RECENTS_KEY)) ?? [];
  const next = [{ id: project.id, name: project.name, updatedAt: project.updatedAt, pageCount: project.state.pages.length, storageKey }, ...current.filter((item) => item.storageKey !== storageKey)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  await set(RECENTS_KEY, next);
  const discarded = current.filter((item) => !next.some((recent) => recent.storageKey === item.storageKey)).map((item) => item.storageKey);
  if (discarded.length) await delMany(discarded);
}

export async function loadRecentProjects(): Promise<RecentProject[]> {
  return enqueue(async () => {
    const existing = (await get<RecentProject[]>(RECENTS_KEY)) ?? [];
    const legacy = (await get<EditorProject[]>(RECENT_KEY)) ?? [];
    if (!legacy.length) return existing;
    const next = [...existing];
    for (const project of legacy) {
      const storageKey = `clin:recent:v2:${project.id ?? project.name}`;
      if (next.some((item) => item.storageKey === storageKey)) continue;
      await persist(storageKey, project);
      next.push({ id: project.id, name: project.name, updatedAt: project.updatedAt, pageCount: project.state.pages.length, storageKey });
    }
    const recent = next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
    await set(RECENTS_KEY, recent);
    await del(RECENT_KEY);
    const discarded = next.filter((item) => !recent.includes(item)).map((item) => item.storageKey);
    if (discarded.length) await delMany(discarded);
    return recent;
  });
}

export async function loadRecentProject(recent: RecentProject) {
  const manifest = await get<Manifest>(recent.storageKey);
  if (!manifest) throw new Error("El proyecto reciente ya no está disponible.");
  return hydrate(manifest);
}

export function removeRecentProject(recent: RecentProject) {
  return enqueue(async () => {
    const current = (await get<RecentProject[]>(RECENTS_KEY)) ?? [];
    await set(RECENTS_KEY, current.filter((item) => item.storageKey !== recent.storageKey));
    await del(recent.storageKey);
    await collectSources();
  });
}

async function collectSources() {
  const referenced = new Set<string>();
  const recent = (await get<RecentProject[]>(RECENTS_KEY)) ?? [];
  for (const key of [CURRENT_KEY, ...recent.map((item) => item.storageKey)]) {
    const manifest = await get<Manifest>(key);
    manifest?.sources.forEach((source) => referenced.add(source.id));
  }
  const unused = (await keys()).filter((key) => typeof key === "string" && key.startsWith(SOURCE_PREFIX) && !referenced.has(key.slice(SOURCE_PREFIX.length)));
  if (unused.length) await delMany(unused);
  knownSources.clear(); sourceKeysLoaded = false;
}

export function saveRecentProject(project: EditorProject) {
  return enqueue(async () => { await saveRecent(project); await collectSources(); });
}

export function clearRecentProjects() {
  return enqueue(async () => {
    const recent = (await get<RecentProject[]>(RECENTS_KEY)) ?? [];
    await delMany([RECENTS_KEY, RECENT_KEY, ...recent.map((item) => item.storageKey)]);
    await collectSources();
  });
}
