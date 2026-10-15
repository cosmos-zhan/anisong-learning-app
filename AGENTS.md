# Project instructions

Formal scope and acceptance: docs/requirements.md (lyrics) and docs/piano-requirements.md (piano P0). Only this project; never write cosmos-zhan/Aria.
Use feature/* or fix/* branches and PRs after initialization. Run npm run check before proposing merge. Android changes require a real Gradle build and native unit tests when toolchain is available. Label unavailable checks honestly.
Lyrics use original-track seconds outside the native clip adapter. Piano uses PPQ=480 musical ticks and an AudioContext-clock tempo map. Never simulate audio progress. Keep async operations cancel-safe. Never put tokens, private lyrics/audio, keystores, node_modules or generated dist in Git.
Read docs/delivery.md and docs/known-issues.md before continuing. Reuse the .openai/hosting.json Sites ID. Cloudflare Pages is preferred after authorization. No unrequested features and no unauthenticated assertions of successful deployment/CI/APK runs.
