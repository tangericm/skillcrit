import fs from "node:fs";

/** Bound allocation even if a regular file grows after inspection. */
export function readInventoryText(file: string, maxBytes = 1024 * 1024): string {
  if (!fs.statSync(file).isFile()) throw new Error(`not a regular file: ${file}`);
  // Nonblocking open also handles replacement with a FIFO between stat/open
  // on POSIX. The descriptor check remains authoritative after opening.
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error(`not a regular file: ${file}`);
    if (stat.size > maxBytes) throw new Error(`file exceeds ${maxBytes} bytes: ${file}`);
    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const n = fs.readSync(fd, buffer, length, buffer.length - length, length);
      if (!n) break;
      length += n;
    }
    if (length > maxBytes) throw new Error(`file exceeds ${maxBytes} bytes: ${file}`);
    return buffer.toString("utf8", 0, length);
  } finally {
    fs.closeSync(fd);
  }
}
