/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional: when both are set, the sign-in screen offers a one-click demo account. */
  readonly VITE_DEMO_EMAIL?: string;
  readonly VITE_DEMO_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
