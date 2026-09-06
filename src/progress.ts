export type Progress = {
  phase(name: string): void;
  tick(name: string, n: number, total?: number): void;
  done(message: string): void;
};

export function createProgress(
  enabled: boolean,
  stream: NodeJS.WritableStream = process.stderr
): Progress {
  let last = 0;
  const write = (text: string) => {
    if (!enabled) return;
    const line = `\r${text}`;
    const pad = last > text.length ? " ".repeat(last - text.length) : "";
    stream.write(line + pad);
    last = text.length;
  };
  const clear = () => {
    if (!enabled || last === 0) return;
    stream.write("\r" + " ".repeat(last) + "\r");
    last = 0;
  };
  return {
    phase(name) {
      write(`[skillcrit] ${name}`);
    },
    tick(name, n, total) {
      const bar = total && total > 0 ? ` ${meter(n, total)} ${n}/${total}` : ` ${n}`;
      write(`[skillcrit] ${name}${bar}`);
    },
    done(message) {
      clear();
      if (!enabled) return;
      stream.write(`[skillcrit] ${message}\n`);
    }
  };
}

function meter(n: number, total: number): string {
  const width = 16;
  const filled = Math.min(width, Math.round((n / total) * width));
  return `[${"=".repeat(filled)}${" ".repeat(width - filled)}]`;
}
