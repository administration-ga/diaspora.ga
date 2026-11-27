const { getDefaultConfig } = require("expo/metro-config")
const fs = require("node:fs")
const path = require("node:path")
const config = getDefaultConfig(__dirname)
// The engine installs shared packages alongside the product checkout.
const engineModules = path.resolve(__dirname, "../../../ANTSIA/node_modules")
if (fs.existsSync(engineModules)) config.watchFolders = [...new Set([...config.watchFolders, engineModules])]
module.exports = config
