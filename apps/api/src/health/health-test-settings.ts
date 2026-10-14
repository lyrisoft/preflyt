export type HealthTestSettings = {
  command: string;
  directory: string;
  framework: "auto" | "vitest" | "jest" | "node";
};
export const defaultHealthTestSettings: HealthTestSettings = {
  command: "",
  directory: ".",
  framework: "auto",
};
export function validateHealthTestSettings(value: unknown): HealthTestSettings {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) => !["command", "directory", "framework"].includes(k),
    )
  )
    throw new Error("Invalid test settings");
  const v = { ...defaultHealthTestSettings, ...value } as HealthTestSettings;
  if (
    typeof v.command !== "string" ||
    v.command.length > 2000 ||
    /[\x00-\x08\x0b-\x1f\x7f]/.test(v.command) ||
    typeof v.directory !== "string" ||
    v.directory.length > 244 ||
    (v.directory !== "." &&
      (!/^[\w./-]+$/.test(v.directory) ||
        v.directory.split("/").some((p) => !p || p === ".." || p === "."))) ||
    !["auto", "vitest", "jest", "node"].includes(v.framework) ||
    (!!v.command.trim() && v.framework === "auto")
  )
    throw new Error(
      "Choose a test framework and a repository-relative directory for an override",
    );
  return { ...v, command: v.command.trim() };
}
