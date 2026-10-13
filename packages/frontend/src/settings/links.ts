/** Project links used by About, Cloud Sync and AI onboarding. */
export const PROJECT_URL = "https://github.com/SergeSerb2/opencast";
export const LINKS = {
  website: PROJECT_URL,
  issues: `${PROJECT_URL}/issues`,
  releases: `${PROJECT_URL}/releases`,
  license: `${PROJECT_URL}/blob/main/LICENSE`,
  syncGuide: `${PROJECT_URL}/blob/main/docs/SYNC.md`,
  syncWorker: `${PROJECT_URL}/blob/main/packages/sync-worker/README.md`,
  syncDeploy: `${PROJECT_URL}/blob/main/scripts/deploy-sync.sh`,
  extensionsGuide: `${PROJECT_URL}/blob/main/docs/EXTENSIONS.md`,
  cliProxyApi: "https://github.com/router-for-me/CLIProxyAPI",
} as const;
