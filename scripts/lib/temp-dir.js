"use strict";
const fs = require("node:fs");
const os = require("node:os");

/** Match Vite's canonical path, including symlinks and Windows runner 8.3 short names. */
function realTempRoot() {
  return fs.realpathSync.native(os.tmpdir());
}

module.exports = { realTempRoot };
