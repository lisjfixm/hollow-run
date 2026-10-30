// Offline stub: asset URL resolver bridge.
// In the Sekai platform, this maps logical paths to CDN hash URLs.
// Offline: logical paths already match local file paths.
export function resolveAssetUrl(logicalPath) {
  // Pass through - logical paths like "assets/foo/bar.pk" are already local
  return logicalPath;
}
export function getAssetUrl(logicalPath) {
  return logicalPath;
}
export default { resolveAssetUrl, getAssetUrl };
