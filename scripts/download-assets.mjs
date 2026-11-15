import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = [
  { name: "Urban combat map", url: "https://cdn.3dassets.dev/assets/27595/v1/model.glb", path: "public/assets/maps/urban.glb" },
  { name: "Arctic retreat map", url: "https://cdn.3dassets.dev/assets/19851/v1/model.glb", path: "public/assets/maps/arctic.glb" },
  { name: "Desert canyon map", url: "https://cdn.3dassets.dev/assets/21034/v1/model.glb", path: "public/assets/maps/desert.glb" },
];

async function download(asset) {
  const destination = path.join(projectRoot, asset.path);
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    const existing = await stat(destination);
    if (existing.size > 1024) {
      console.log("Already present:", asset.path, `(${(existing.size / 1048576).toFixed(2)} MB)`);
      return;
    }
  } catch {}

  console.log("Downloading:", asset.name);
  const response = await fetch(asset.url, { redirect: "follow", signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`${asset.name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024 || bytes.toString("ascii", 0, 4) !== "glTF") {
    throw new Error(`${asset.name}: response is not a valid binary GLB file`);
  }
  await writeFile(destination, bytes);
  console.log("Saved:", asset.path, `(${(bytes.length / 1048576).toFixed(2)} MB)`);
}

for (const asset of assets) await download(asset);
console.log("\nAll game assets are installed locally. The game maps and character no longer need internet access.");
