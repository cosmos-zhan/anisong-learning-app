import { spawnSync } from "node:child_process";
// A UI/CSS edit still changes the embedded frontend: always build the whole App.
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const commands = [
  [npm, ["run", "check"]],
  [
    process.execPath,
    ["--experimental-vm-modules", "scripts/verify-built-app.mjs"],
  ],
  [process.execPath, ["scripts/verify-lyrics-build.mjs"]],
  [npx, ["cap", "sync", "android"]],
  process.platform === "win32"
    ? [
        "apps/android/gradlew.bat",
        [
          "-p",
          "apps/android",
          ":app:clean",
          ":app:testDebugUnitTest",
          ":app:assembleDebug",
          "--no-daemon",
          "--console=plain",
        ],
      ]
    : [
        "bash",
        [
          process.env.ANISONG_GRADLE || "apps/android/gradlew",
          "-p",
          "apps/android",
          ":app:clean",
          ":app:testDebugUnitTest",
          ":app:assembleDebug",
          "--no-daemon",
          "--console=plain",
          "--max-workers=2",
        ],
      ],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(
  "Complete App gate passed: web checks, production interactions, Capacitor sync, native unit tests and debug APK.",
);
