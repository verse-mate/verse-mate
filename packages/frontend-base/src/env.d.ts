interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // TODO: review this
  readonly API_URL: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
