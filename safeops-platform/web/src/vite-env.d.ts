/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the SafeChain API. Empty/unset keeps the app in mock mode. */
  readonly VITE_API_BASE_URL?: string
  /** 'true' only in the public offline demo build (scripts/build-demo.mjs). */
  readonly VITE_OFFLINE_DEMO?: string
  /** 'true' to compile in the demo accounts and sign-in shortcuts. */
  readonly VITE_DEMO_LOGINS?: string
  /** The demo accounts' password in a non-development demo build. */
  readonly VITE_DEMO_PASSWORD?: string
  readonly PROD: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
