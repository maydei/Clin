import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { DocumentSource, EditorProject } from "./types";
import { normalizeEditorState } from "./model";

type ProjectManifest = Omit<EditorProject, "sources"> & {
  sources: Array<Omit<DocumentSource, "bytes"> & { file: string }>;
};

export function encodeProject(project: EditorProject): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const sources = project.sources.map(({ bytes, ...source }) => {
    const file = `sources/${source.id}.pdf`;
    files[file] = bytes;
    return { ...source, file };
  });
  const manifest: ProjectManifest = { ...project, sources };
  files["project.json"] = strToU8(JSON.stringify(manifest));
  return zipSync(files, { level: 6 });
}

export function decodeProject(bytes: Uint8Array, expectedVersion = 1): EditorProject {
  const files = unzipSync(bytes);
  const manifestBytes = files["project.json"];
  if (!manifestBytes) throw new Error("El archivo de proyecto no es válido.");
  const manifest = JSON.parse(strFromU8(manifestBytes)) as ProjectManifest;
  if (manifest.version !== expectedVersion) {
    throw new Error(`Versión de proyecto no compatible: ${manifest.version}.`);
  }
  const sources: DocumentSource[] = manifest.sources.map(({ file, ...source }) => {
    const sourceBytes = files[file];
    if (!sourceBytes) throw new Error(`Falta el documento ${source.name}.`);
    return { ...source, bytes: sourceBytes };
  });
  return {
    ...manifest,
    state: normalizeEditorState(manifest.state),
    savedState: manifest.savedState ? normalizeEditorState(manifest.savedState) : undefined,
    originalState: manifest.originalState ? normalizeEditorState(manifest.originalState) : undefined,
    sources,
  };
}
