import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { previewVersion } from "./android-preview.mjs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const config = JSON.parse(readFileSync(".github/android-preview.json", "utf8"));
const plan = previewVersion(pkg.version, config.versionCode);
assert(process.env.GITHUB_ENV && process.env.GITHUB_OUTPUT, "Run this metadata step in GitHub Actions");
appendFileSync(process.env.GITHUB_ENV, `APP_VERSION=${plan.version}\nVERSION_NAME=${plan.version}\nVERSION_CODE=${plan.versionCode}\n`);
appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(plan).map(([key, value]) => `${key}=${value}\n`).join(""));
console.log(`Preview ${plan.tag}, Android versionCode ${plan.versionCode}`);
