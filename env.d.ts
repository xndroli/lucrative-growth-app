/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

interface ImportMetaEnv {
  readonly TURN14_API_BASE_URL?: string;
  readonly TURN14_SANDBOX_URL?: string;
  readonly TURN14_DEFAULT_ENVIRONMENT?: 'production' | 'sandbox';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace NodeJS {
  interface ProcessEnv {
    readonly TURN14_API_BASE_URL?: string;
    readonly TURN14_SANDBOX_URL?: string;
    readonly TURN14_DEFAULT_ENVIRONMENT?: 'production' | 'sandbox';
  }
}
