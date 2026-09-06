#!/usr/bin/env node
import { main } from "./command.js";

// Always run. Do not gate on import.meta.url vs argv[1] — that comparison
// fails on Windows (`C:\\…` vs `file:///C:/…`) and exits 0 with no output.
main(process.argv).then(
  // Let queued stdout/stderr writes finish, including reports larger than a pipe buffer.
  (code) => { process.exitCode = code; },
  (err) => {
    process.stderr.write(String(err) + "\n");
    process.exitCode = 3;
  }
);
