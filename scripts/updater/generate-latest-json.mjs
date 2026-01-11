#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

async function collectJsonFiles(rootDir) {
  const results = [];
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        results.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return results;
}

function normalizeVersionFromTag(tag) {
  return tag.replace(/^refs\/tags\//, "").replace(/^[vV]/, "");
}

function buildGithubAssetUrl(repo, tag, assetName) {
  const safeTag = tag.replace(/^refs\/tags\//, "");
  const encodedAsset = encodeURIComponent(assetName);
  return `https://github.com/${repo}/releases/download/${safeTag}/${encodedAsset}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const repo = args.repo;
  const tag = args.tag;
  const entriesDir = args["entries-dir"];
  const outPath = args.out;

  if (!repo || !tag || !entriesDir || !outPath) {
    throw new Error(
      "Usage: generate-latest-json.mjs --repo <owner/repo> --tag <tag> --entries-dir <dir> --out <file>"
    );
  }

  const jsonFiles = await collectJsonFiles(entriesDir);
  if (jsonFiles.length === 0) {
    throw new Error(`No updater entry JSON files found under: ${entriesDir}`);
  }

  const platforms = {};
  for (const filePath of jsonFiles) {
    const raw = await fs.readFile(filePath, "utf8");
    const entry = JSON.parse(raw);
    const jsonTarget = entry.json_target;
    const assetName = entry.asset_name;
    const signature = entry.signature;

    if (!jsonTarget || !assetName || !signature) {
      throw new Error(`Invalid updater entry JSON: ${filePath}`);
    }
    if (platforms[jsonTarget]) {
      throw new Error(`Duplicate updater entry for platform: ${jsonTarget}`);
    }

    platforms[jsonTarget] = {
      url: buildGithubAssetUrl(repo, tag, assetName),
      signature,
    };
  }

  const latest = {
    version: normalizeVersionFromTag(tag),
    notes: "",
    pub_date: new Date().toISOString(),
    platforms,
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(latest, null, 2) + "\n", "utf8");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});

