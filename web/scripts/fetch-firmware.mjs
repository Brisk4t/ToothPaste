// Downloads the firmware binaries attached to the latest GitHub release into
// public/firmware/<tag>/ and writes public/firmware/manifest.json, which the
// update overlay reads to build its board list.
//
// This runs at build time because GitHub's release download host sends no CORS
// headers, so the browser can list release assets but can't fetch their bytes.
// The tag is part of each file's path so the PWA's runtime cache can never serve
// an old binary under a new release's name.
//
// Set GITHUB_TOKEN to avoid the 60 requests/hour unauthenticated rate limit.
// Fails the build in CI (CI env var set); locally it keeps any existing manifest
// and warns, so `npm run dev` still works offline.

import { mkdir, rm, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "Brisk4t/ToothPaste";
const ASSET_PREFIX = "ToothPasteFirmware_";

const firmwareDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "firmware");
const manifestPath = join(firmwareDir, "manifest.json");

const headers = { Accept: "application/vnd.github+json", "User-Agent": "toothpaste-web-build" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

// "ToothPasteFirmware_4MB_MBEDTLS_LED10.bin" -> "4MB MBEDTLS LED10"
function labelFor(name) {
    return name.slice(ASSET_PREFIX.length).replace(/\.bin$/, "").replaceAll("_", " ");
}

// The release workflow merges each image with --flash_size NMB and puts that size in the name.
function flashSizeFor(name) {
    const match = name.match(/_(\d+MB)_/);
    if (!match) throw new Error(`Can't find a flash size in asset name "${name}"`);
    return match[1];
}

async function main() {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status} ${res.statusText}`);
    const release = await res.json();

    const assets = release.assets.filter((a) => a.name.startsWith(ASSET_PREFIX) && a.name.endsWith(".bin"));
    if (assets.length === 0) throw new Error(`Release ${release.tag_name} has no ${ASSET_PREFIX}*.bin assets`);

    // Download everything before touching disk, so a failed fetch leaves the old firmware intact.
    const downloads = [];
    for (const asset of assets) {
        const download = await fetch(asset.browser_download_url, { headers: { "User-Agent": headers["User-Agent"] } });
        if (!download.ok) throw new Error(`Downloading ${asset.name} failed: ${download.status}`);
        const bytes = Buffer.from(await download.arrayBuffer());
        if (bytes.length !== asset.size) throw new Error(`${asset.name}: got ${bytes.length} bytes, expected ${asset.size}`);
        downloads.push({ name: asset.name, bytes });
    }

    // Start clean so binaries from older releases don't pile up in dist/.
    await rm(firmwareDir, { recursive: true, force: true });
    const tagDir = join(firmwareDir, release.tag_name);
    await mkdir(tagDir, { recursive: true });

    const boards = [];
    for (const { name, bytes } of downloads) {
        await writeFile(join(tagDir, name), bytes);
        boards.push({
            label: labelFor(name),
            url: `/firmware/${release.tag_name}/${name}`,
            flashSize: flashSizeFor(name),
        });
        console.log(`[fetch-firmware] ${name} (${bytes.length} bytes)`);
    }

    boards.sort((a, b) => a.label.localeCompare(b.label));
    await writeFile(manifestPath, JSON.stringify({ tag: release.tag_name, boards }, null, 2) + "\n");
    console.log(`[fetch-firmware] Wrote manifest for ${release.tag_name} with ${boards.length} boards`);
}

main().catch(async (err) => {
    const hasManifest = await access(manifestPath).then(() => true, () => false);
    if (process.env.CI || !hasManifest) {
        console.error(`[fetch-firmware] ${err.message}`);
        process.exit(1);
    }
    console.warn(`[fetch-firmware] ${err.message} — keeping the existing firmware manifest`);
});
