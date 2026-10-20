import { test } from "node:test";
import assert from "node:assert/strict";
import { previewVersion, publicBuild, publishPreview } from "./android-preview.mjs";

test("regular and explicit prerelease versions become preview downloads", () => {
  assert.equal(previewVersion("0.3.6", 2026102001).tag, "v0.3.6-alpha.1");
  assert.equal(previewVersion("0.3.7-beta.2", 2).version, "0.3.7-beta.2");
  for (const version of ["latest", "../bad", "1.2", "1.2.3\n", "1.2.3\nunsafe"])
    assert.throws(() => previewVersion(version, 1));
  assert.throws(() => previewVersion("0.3.6", 0));
  assert.throws(() => previewVersion("0.3.6", 2100000001));
});
test("private media or wrong frontend SHA cannot be published", () => {
  const sha = "a".repeat(40), version = { sha: sha.slice(0, 12) };
  publicBuild({ available: false, bytes: 0, src: "", lyrics: null, score: null }, version, sha);
  for (const config of [{ available: true }, { score: {} }, { lyrics: {} }, { src: "song.mp3" }])
    assert.throws(() => publicBuild(config, version, sha));
  assert.throws(() => publicBuild({}, { sha: "wrong" }, sha));
});
const info = { ...previewVersion("0.3.6", 2026102001), repository: "cosmos-zhan/anisong-learning-app", sha: "a".repeat(40), signing: "ephemeral-debug", runId: "1", signerSha256: "b".repeat(64) };
test("published versions are immutable and same-version rebuilds skip", async () => {
  const result = await publishPreview({ info, files: [], api: async method => {
    assert.equal(method, "GET"); return { draft: false, html_url: "https://github.com/test" };
  }, upload: () => assert.fail("must not overwrite") });
  assert.equal(result.skipped, true);
});
test("publication happens only after all asset uploads succeed", async () => {
  const order = [];
  const result = await publishPreview({ info, files: [{ name: "app.apk" }, { name: "SHA256SUMS.txt" }],
    api: async (method, _path, body) => {
      order.push(method);
      if (method === "GET") return null;
      if (method === "POST") { assert.equal(body.draft, true); assert.equal(body.prerelease, true); return { id: 1, upload_url: "upload" }; }
      return { draft: false, prerelease: true, html_url: "https://github.com/test" };
    }, upload: async (_url, file) => order.push(file.name) });
  assert.deepEqual(order, ["GET", "POST", "app.apk", "SHA256SUMS.txt", "PATCH"]);
  assert.equal(result.skipped, false);
});
test("failed attachment leaves the release as a draft", async () => {
  const methods = [];
  await assert.rejects(publishPreview({ info, files: [{ name: "app.apk" }],
    api: async method => { methods.push(method); return method === "GET" ? null : { id: 1 }; },
    upload: async () => { throw new Error("upload failed"); } }), /upload failed/);
  assert.deepEqual(methods, ["GET", "POST"]);
});
test("permission errors cannot become a successful publication", async () => {
  await assert.rejects(publishPreview({ info, files: [], api: async () => { throw new Error("403"); } }), /403/);
});
test("an unrelated existing draft is not replaced", async () => {
  await assert.rejects(publishPreview({ info, files: [], api: async () => ({ draft: true, target_commitish: "b".repeat(40) }) }), /another source/);
});
