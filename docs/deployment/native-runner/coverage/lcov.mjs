import path from "node:path";
// Union physical lines across packages. Percentages are calculated from counters, never averaged.
export function parseLcov(text, directory, sourceFiles) {
  if (Buffer.byteLength(text) > 8388608)
    throw new Error("Coverage report exceeds bounds");
  const files = new Map();
  let current = null,
    seen = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      if (current) throw new Error("Unterminated coverage record");
      let file = line.slice(3);
      if (file.startsWith("/project/")) file = file.slice("/project/".length);
      else if (path.posix.isAbsolute(file))
        throw new Error("Coverage outside assessed source");
      else file = path.posix.join(directory === "." ? "" : directory, file);
      if (
        file.split("/").some((p) => p === ".." || !p) ||
        !sourceFiles.has(file)
      )
        throw new Error("Coverage outside assessed source");
      current = { file, lines: new Map() };
      seen = true;
    } else if (line.startsWith("DA:")) {
      const match = /^DA:(\d+),(\d+)(?:,[^,\r\n]+)?$/.exec(line);
      if (!current || !match) throw new Error("Invalid coverage line");
      const number = Number(match[1]),
        count = Number(match[2]);
      if (
        !Number.isSafeInteger(number) ||
        number < 1 ||
        number > sourceFiles.get(current.file) ||
        !Number.isSafeInteger(count) ||
        count < 0
      )
        throw new Error("Invalid coverage counter");
      current.lines.set(
        number,
        (current.lines.get(number) ?? false) || count > 0,
      );
    } else if (line === "end_of_record") {
      if (!current) throw new Error("Invalid coverage record");
      const existing = files.get(current.file) ?? new Map();
      for (const [number, hit] of current.lines)
        existing.set(number, (existing.get(number) ?? false) || hit);
      files.set(current.file, existing);
      current = null;
    }
  }
  if (current || !seen) throw new Error("Incomplete coverage report");
  return files;
}
export function mergeCoverage(reports) {
  const files = new Map();
  for (const report of reports)
    for (const [file, lines] of report) {
      const result = files.get(file) ?? new Map();
      for (const [line, hit] of lines)
        result.set(line, (result.get(line) ?? false) || hit);
      files.set(file, result);
    }
  let analyzedLines = 0,
    coveredLines = 0,
    analyzedFiles = 0;
  for (const lines of files.values()) {
    if (lines.size) analyzedFiles++;
    analyzedLines += lines.size;
    for (const hit of lines.values()) if (hit) coveredLines++;
  }
  if (!analyzedLines || analyzedLines > 50000000)
    throw new Error("No bounded line measurement");
  return { analyzedFiles, analyzedLines, coveredLines };
}
