import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public", "ocr");
const packageRoot = (name) => dirname(require.resolve(`${name}/package.json`));

await Promise.all([
  mkdir(join(output, "core"), { recursive: true }),
  mkdir(join(output, "lang"), { recursive: true }),
]);

await copyFile(
  join(packageRoot("tesseract.js"), "dist", "worker.min.js"),
  join(output, "worker.min.js"),
);

const coreRoot = packageRoot("tesseract.js-core");
const coreFiles = (await readdir(coreRoot)).filter((name) => name.endsWith(".wasm.js"));
await Promise.all(coreFiles.map((name) => copyFile(join(coreRoot, name), join(output, "core", name))));

await Promise.all(["spa", "eng"].map((language) => copyFile(
  join(packageRoot(`@tesseract.js-data/${language}`), "4.0.0", `${language}.traineddata.gz`),
  join(output, "lang", `${language}.traineddata.gz`),
)));
