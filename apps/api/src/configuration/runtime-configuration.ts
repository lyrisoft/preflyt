import { configurationFields } from "./configuration-catalogue.js";
let active: Readonly<Record<string, string>> | undefined;
let started: Readonly<Record<string, string>> | undefined;
/** Startup compatibility only: after provisioning, database values replace environment settings. */
export function configurationValue(key: string): string | undefined {
  return active ? active[key] || undefined : process.env[key];
}
export function applyConfiguration(
  values: Record<string, string>,
  initial = false,
) {
  if (initial || !started) started = Object.freeze({ ...values });
  active = Object.freeze(
    Object.fromEntries(
      configurationFields.map((field) => [
        field.key,
        field.restart
          ? (started![field.key] ?? field.defaultValue)
          : (values[field.key] ?? field.defaultValue),
      ]),
    ),
  );
}
export function configurationNeedsRestart(values: Record<string, string>) {
  return started
    ? configurationFields.some(
        (field) =>
          field.restart &&
          (values[field.key] ?? field.defaultValue) !==
            (started![field.key] ?? field.defaultValue),
      )
    : false;
}

/** Keep the encrypted connection snapshot, but suspend live capabilities until storage recovers. */
export function suspendConfigurationCapabilities() {
  const values = { ...active };
  for (const field of configurationFields) if (!field.restart && field.kind === 'boolean') values[field.key] = 'false';
  applyConfiguration(values);
}
