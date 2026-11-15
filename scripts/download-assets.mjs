import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = [
  { name: "Urban combat map", url: "https://cdn.3dassets.dev/assets/27595/v1/model.glb", path: "public/assets/maps/urban.glb" },
  { name: "Arctic retreat map", url: "https://cdn.3dassets.dev/assets/19851/v1/model.glb", path: "public/assets/maps/arctic.glb" },
  { name: "Desert canyon map", url: "https://cdn.3dassets.dev/assets/21034/v1/model.glb", path: "public/assets/maps/desert.glb" },
  { name: "Rigged animated military soldier (Three.js MIT)", url: "https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/Soldier.glb", path: "public/assets/characters/soldier.glb" }
];

function isValidGlb(bytes) {
  return bytes.length >= 20 &&
    bytes.toString("ascii", 0, 4) === "glTF" &&
    bytes.readUInt32LE(4) === 2 &&
    bytes.readUInt32LE(8) === bytes.length;
}

async function download(asset) {
  const destination = path.join(projectRoot, asset.path);
  const temporary = destination + ".download";
  await mkdir(path.dirname(destination), { recursive: true });

  try {
    const existing = await readFile(destination);
    if (isValidGlb(existing)) {
      console.log("Verified local asset:", asset.path, `(${(existing.length / 1048576).toFixed(2)} MB)`);
      return;
    }
    console.warn("Removing invalid or incomplete GLB:", asset.path);
    await rm(destination, { force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  console.log("Downloading:", asset.name);
  const response = await fetch(asset.url, { redirect: "follow", signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`${asset.name}: HTTP ${response.status} from ${asset.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!isValidGlb(bytes)) {
    throw new Error(`${asset.name}: server did not return a complete GLB v2 file (${bytes.length} bytes)`);
  }
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  console.log("Installed:", asset.path, `(${(bytes.length / 1048576).toFixed(2)} MB)`);
}

for (const asset of assets) await download(asset);
console.log("\nAll three maps and the rigged animated soldier are installed and GLB-validated.");
