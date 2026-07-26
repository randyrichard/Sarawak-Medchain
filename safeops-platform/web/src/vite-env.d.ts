/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the SafeOps API. Empty/unset keeps the app in mock mode. */
  readonly VITE_API_BASE_URL?: string
  readonly PROD: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
