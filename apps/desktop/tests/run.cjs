const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const testsDir = __dirname;
const files = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith(".test.cjs"))
  .map((f) => path.join(testsDir, f));

const res = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(res.status ?? 0);
