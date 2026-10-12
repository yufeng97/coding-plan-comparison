"use strict";
const fs = require("node:fs");
const os = require("node:os");

/** Real path of the temp directory. Creating under os.tmpdir() fails the ownership check when that path is a symlink. */
function realTempRoot() {
  return fs.realpathSync(os.tmpdir());
}

module.exports = { realTempRoot };
