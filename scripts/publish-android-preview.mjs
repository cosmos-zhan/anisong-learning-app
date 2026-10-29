import assert from "node:assert/strict";
import { requireReleaseSigner } from "./android-signing.mjs";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { publicBuild, publishPreview, sha256 } from "./android-preview.mjs";

const directory = resolve("preview-dist");
const info = JSON.parse(readFileSync(resolve(directory, "build-info.json"), "utf8"));
assert.equal(info.sha, process.env.GITHUB_SHA);
assert.equal(info.repository, process.env.GITHUB_REPOSITORY);
assert.equal(info.publicMediaOnly, true);
publicBuild(info.mediaConfig, info.frontendVersion, info.sha);
assert.equal(info.frontendVersion.appVersion, info.version);
const previewConfig = JSON.parse(readFileSync('.github/android-preview.json', 'utf8'));
requireReleaseSigner(info, previewConfig);
assert(Array.isArray(previewConfig.changes) && previewConfig.changes.length > 0, 'Missing version-specific release notes');
const files = [info.apkName, "build-info.json", "SHA256SUMS.txt"].map(name => {
  assert(!name.includes("/") && !name.includes("\\"));
  return { name, path: resolve(directory, name) };
});
assert.equal(sha256(files[0].path), info.apkSha256);
const headers = { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
assert(process.env.GH_TOKEN, "Missing GitHub Actions token");
async function api(method, path, body, allowMissing = false) {
  const response = await fetch("https://api.github.com" + path, {
    method, headers: { ...headers, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status} ${(await response.text()).slice(0, 800)}`);
  return response.json();
}
async function upload(template, file) {
  const url = new URL(template.split("{")[0]);
  assert.equal(url.origin, "https://uploads.github.com");
  url.searchParams.set("name", file.name);
  const response = await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: readFileSync(file.path) });
  if (!response.ok) throw new Error(`Asset upload ${file.name}: ${response.status}`);
  const asset = await response.json();
  assert.equal(asset.state, "uploaded");
  assert.equal(asset.digest, `sha256:${sha256(file.path)}`);
}
const result = await publishPreview({ api, upload, info, files, changes: previewConfig.changes });
console.log(JSON.stringify(result));
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result.skipped ? "已存在，保留原版" : "已发布预发布测试包"}: ${result.url}\n`);
