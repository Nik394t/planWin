/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUSH_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
