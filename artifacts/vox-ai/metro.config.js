const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Block Metro's file watcher from scanning Replit-internal directories.
// Without this, Metro crashes with ENOENT when Replit's skill/agent system
// creates and immediately deletes temp files inside .local/skills/ during
// its normal operation (race between Metro's scandir and file deletion).
// Also excludes .git and .cache to reduce watcher overhead significantly.
config.resolver.blockList = [
  // Replit agent/skills system — temp files appear and disappear here
  new RegExp(`${escapeRegex(workspaceRoot)}/\\.local/.*`),
  // Git internals — Metro has no reason to watch these
  new RegExp(`${escapeRegex(workspaceRoot)}/\\.git/.*`),
  // Build/pnpm caches — not source files
  new RegExp(`${escapeRegex(workspaceRoot)}/\\.cache/.*`),
];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = config;
