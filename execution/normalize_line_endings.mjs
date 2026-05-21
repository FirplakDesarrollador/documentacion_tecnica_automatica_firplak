import fs from "node:fs";

function normalizeFile(path) {
  const data = fs.readFileSync(path);
  const normalized = Buffer.from(data.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
  fs.writeFileSync(path, normalized);
  process.stdout.write(`Normalized: ${path}\n`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stderr.write("Usage: node execution/normalize_line_endings.mjs <file> [file...]\n");
  process.exit(2);
}

for (const path of args) {
  if (!fs.existsSync(path) || !fs.statSync(path).isFile()) {
    process.stdout.write(`Skip (not a file): ${path}\n`);
    continue;
  }
  normalizeFile(path);
}

