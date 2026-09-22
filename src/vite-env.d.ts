/// <reference types="vite/client" />

/** 빌드 식별 `probe-<semver>+<git short hash>` — vite.config.ts define. 없으면 'probe-dev' */
declare const __BUILD__: string
