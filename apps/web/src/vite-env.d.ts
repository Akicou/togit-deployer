/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly GITHUB_APP_CLIENT_ID: string;
  readonly LOCALTONET_AUTH_TOKEN: string;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
