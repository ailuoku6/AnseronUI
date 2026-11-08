import { homedir } from "node:os";
import { resolve } from "node:path";

/** Resolve the build cache without touching the filesystem. Exported from this
 * internal module so its platform and override behavior can be pinned directly. */
export function resolveBuildCacheRoot(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  userHome: string = homedir(),
): string | null {
  if (env["SCRIPTC_NO_CACHE"] === "1") return null;
  const configured = env["SCRIPTC_CACHE_DIR"];
  if (configured !== undefined) return configured === "" ? null : resolve(configured);

  const xdg = env["XDG_CACHE_HOME"];
  if (xdg !== undefined && xdg !== "") return resolve(xdg, "scriptc", "build");
  if (platform === "win32") {
    const local = env["LOCALAPPDATA"];
    if (local !== undefined && local !== "") return resolve(local, "scriptc", "cache", "build");
  }
  return platform === "darwin"
    ? resolve(userHome, "Library", "Caches", "scriptc", "build")
    : resolve(userHome, ".cache", "scriptc", "build");
}
