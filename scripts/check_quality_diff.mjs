import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const useStagedDiff = args.includes("--staged");
const diffArgs = [
  "diff",
  ...(useStagedDiff ? ["--cached"] : ["HEAD"]),
  "--unified=0",
  "--no-color",
  "--relative",
  "--",
];
const nameOnlyArgs = [
  "diff",
  ...(useStagedDiff ? ["--cached"] : ["HEAD"]),
  "--name-only",
  "--diff-filter=ACMRTUXB",
  "--relative",
  "--",
];

const diffText = runGit(diffArgs).trim();
const changedFiles = runGit(nameOnlyArgs)
  .split(/\r?\n/)
  .map(file => file.trim())
  .filter(Boolean);

const blockedMatches = [];
const warningMatches = [];
let currentFile = "";

for (const rawLine of diffText.split(/\r?\n/)) {
  if (rawLine.startsWith("+++ b/")) {
    currentFile = rawLine.slice("+++ b/".length);
    continue;
  }

  if (!currentFile || !rawLine.startsWith("+") || rawLine.startsWith("+++")) {
    continue;
  }

  if (/(eslint-disable|@ts-ignore|@ts-nocheck)/.test(rawLine)) {
    blockedMatches.push({ file: currentFile, line: rawLine.slice(1).trim() });
    continue;
  }

  if (
    currentFile.startsWith("src/") &&
    !currentFile.startsWith("src/generated/") &&
    /from\s+["']@prisma\/client["']/.test(rawLine)
  ) {
    blockedMatches.push({
      file: currentFile,
      line: `${rawLine.slice(1).trim()} (use @/generated/prisma/client for types or @/lib/prisma for DB access)`,
    });
    continue;
  }

  if (
    currentFile.startsWith("src/") &&
    /(\bas any\b|:\s*any\b|<any>|any\[\])/.test(rawLine)
  ) {
    warningMatches.push({ file: currentFile, line: rawLine.slice(1).trim() });
  }
}

const touchedSuppressionDebt = changedFiles
  .filter(file => existsSync(file))
  .map(file => {
    const content = readFileSync(file, "utf8");
    const eslintDisableCount = countMatches(content, /eslint-disable/g);
    const tsIgnoreCount = countMatches(content, /@ts-ignore/g);
    const tsNoCheckCount = countMatches(content, /@ts-nocheck/g);
    const tsExpectErrorCount = countMatches(content, /@ts-expect-error/g);
    const total =
      eslintDisableCount +
      tsIgnoreCount +
      tsNoCheckCount +
      tsExpectErrorCount;

    return {
      file,
      total,
      eslintDisableCount,
      tsIgnoreCount,
      tsNoCheckCount,
      tsExpectErrorCount,
    };
  })
  .filter(entry => entry.total > 0);

if (
  blockedMatches.length === 0 &&
  warningMatches.length === 0 &&
  touchedSuppressionDebt.length === 0
) {
  console.log("Quality diff guard: OK");
  process.exit(0);
}

console.log("Quality diff guard:");

if (blockedMatches.length > 0) {
  console.log("\nBlocked additions:");
  for (const match of blockedMatches) {
    console.log(`- ${match.file}: ${match.line}`);
  }
}

if (warningMatches.length > 0) {
  console.log("\nWarnings for new app-level `any` usage:");
  for (const match of warningMatches) {
    console.log(`- ${match.file}: ${match.line}`);
  }
}

if (touchedSuppressionDebt.length > 0) {
  console.log("\nTouched files with existing suppression debt:");
  for (const entry of touchedSuppressionDebt) {
    const parts = [];
    if (entry.eslintDisableCount > 0) parts.push(`eslint-disable: ${entry.eslintDisableCount}`);
    if (entry.tsIgnoreCount > 0) parts.push(`@ts-ignore: ${entry.tsIgnoreCount}`);
    if (entry.tsNoCheckCount > 0) parts.push(`@ts-nocheck: ${entry.tsNoCheckCount}`);
    if (entry.tsExpectErrorCount > 0) parts.push(`@ts-expect-error: ${entry.tsExpectErrorCount}`);
    console.log(`- ${entry.file} (${parts.join(", ")})`);
  }
}

process.exit(blockedMatches.length > 0 ? 1 : 0);

function runGit(gitArgs) {
  return execFileSync("git", gitArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function countMatches(content, pattern) {
  return content.match(pattern)?.length ?? 0;
}
