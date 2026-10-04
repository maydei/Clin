import { encodeProject, decodeProject } from "./project-codec";

self.onmessage = ({ data }) => {
  try {
    const value = data.operation === "encode" ? encodeProject(data.value) : decodeProject(data.value);
    self.postMessage({ value });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
