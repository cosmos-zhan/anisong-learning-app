import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function previewVersion(version, versionCode) {
  assert.equal(version, version.trim(), "Version whitespace is not allowed");
  assert.match(version, /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/, "Invalid preview version");
  assert(Number.isInteger(versionCode) && versionCode > 0 && versionCode <= 2100000000, "Invalid Android versionCode");
  const name = version.includes("-") ? version : `${version}-alpha.1`;
  return { version: name, tag: `v${name}`, versionCode, apkName: `anisong-${name}-debug.apk` };
}
export function publicBuild(config, version, sha) {
  assert(config.available === false && !config.audio && config.lyrics === null && config.score === null && config.bytes === 0 && config.src === "",
    "Public previews must not contain private bundled media");
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.equal(version.sha, sha.slice(0, 12), "APK frontend SHA does not match source");
}
export function releaseNotes(info) {
  const signing = info.signing === "repository-secret"
    ? "本包使用仓库配置的固定 debug 签名。同签名且版本码递增时可以覆盖更新。"
    : "本包使用临时 CI debug 签名，跨构建可能无法覆盖安装。请保留旧版及其练习记录，参阅签名配置指南。";
  return `## Android Alpha 测试版\n\n当前为开发中的预发布版本，不代表正式版或真机验收通过。\n\n下载下方 **${info.apkName}** 后直接打开安装，无需下载源码 ZIP。\n\n${signing}\n\n- 歌词片段循环与钢琴学谱，共享曲库、练习状态和反馈。\n- 仅包含 CC0 原创示例；私人歌曲、歌词和曲谱可在本机导入。\n- 完整 App 检查（前端、产物交互、Capacitor、原生单测与 debug APK）已通过。\n- APK 已校验签名、版本、源提交和公开素材边界，SHA256SUMS.txt 可校验下载。\n\n源码提交：${info.sha}\n\n构建：https://github.com/${info.repository}/actions/runs/${info.runId}\n\nAndroid 安装版本码：${info.versionCode}\n\n签名证书 SHA-256：\n\n\`${info.signerSha256}\`\n\n[发布与签名说明](https://github.com/${info.repository}/blob/${info.sha}/docs/android-previews.md) · [报告问题](https://github.com/${info.repository}/issues/new/choose)\n`;
}
export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
export async function publishPreview({ api, upload, info, files }) {
  assert.equal(info.repository, "cosmos-zhan/anisong-learning-app");
  const path = `/repos/${info.repository}/releases`;
  let release = await api("GET", `${path}/tags/${info.tag}`, undefined, true);
  if (release && !release.draft) return { skipped: true, url: release.html_url };
  if (release) assert.equal(release.target_commitish, info.sha, "Draft belongs to another source commit");
  else release = await api("POST", path, {
    tag_name: info.tag, target_commitish: info.sha, name: `${info.tag} · Android 测试版`,
    body: releaseNotes(info), draft: true, prerelease: true, make_latest: "false",
  });
  // A failed upload leaves a draft, never a public success without an APK.
  for (const file of files) {
    const existing = release.assets?.find(a => a.name === file.name);
    if (existing) {
      assert.equal(existing.digest, `sha256:${sha256(file.path)}`, "Draft asset differs; refusing overwrite");
      continue;
    }
    await upload(release.upload_url, file);
  }
  const published = await api("PATCH", `${path}/${release.id}`, { draft: false, prerelease: true, make_latest: "false" });
  assert.equal(published.draft, false);
  assert.equal(published.prerelease, true);
  return { skipped: false, url: published.html_url };
}
