#!/usr/bin/env node
import { main } from "./command.js";

// Always run. Do not gate on import.meta.url vs argv[1] — that comparison
// fails on Windows (`C:\\…` vs `file:///C:/…`) and exits 0 with no output.
main(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(String(err) + "\n");
    process.exit(1);
  }
);
