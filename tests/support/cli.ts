import { main } from "../../src/command.ts";

/**
 * Runs the CLI in-process and captures both streams.
 *
 * `src/cli.ts` is only a process entry that calls `main`, so tests exercise
 * `main` directly rather than spawning tsx per assertion.
 */
export async function runCli(args: string[]): Promise<{
  status: number;
  stdout: string;
  stderr: string;
}> {
  const captured = { stdout: "", stderr: "" };
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  const tap =
    (store: "stdout" | "stderr"): typeof process.stdout.write =>
    (chunk, encoding, cb) => {
      captured[store] +=
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      const done = typeof encoding === "function" ? encoding : cb;
      done?.();
      return true;
    };
  process.stdout.write = tap("stdout");
  process.stderr.write = tap("stderr");
  try {
    const status = await main(["node", "skillcrit", ...args]);
    return { status, ...captured };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}
