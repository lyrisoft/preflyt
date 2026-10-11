export type ConfigurationField = {
  key: string;
  label: string;
  group: string;
  kind: "boolean" | "text" | "secret" | "number" | "url";
  defaultValue: string;
  restart: boolean;
  example?: string;
};
const field = (
  key: string,
  label: string,
  group: string,
  kind: ConfigurationField["kind"],
  defaultValue = "",
  restart = true,
  example?: string,
): ConfigurationField => ({
  key,
  label,
  group,
  kind,
  defaultValue: kind === "boolean" ? defaultValue || "false" : defaultValue,
  restart: key.startsWith("GITHUB_") ? false : restart,
  example,
});
/** Preserve existing separate connections when upgrading; new installations default to one App. */
export function governanceAppMode(values: Record<string, string>): string {
  if (values.GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED)
    return values.GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED;
  return values.GITHUB_GOVERNANCE_APP_ID === values.GITHUB_APP_ID
    ? "false"
    : ["GITHUB_GOVERNANCE_APP_ID", "GITHUB_GOVERNANCE_PRIVATE_KEY"].some(
          (key) => Boolean(values[key]),
        )
      ? "true"
      : "false";
}
export const configurationFields: ConfigurationField[] = [
  field(
    "PREFLYT_PUBLIC_API_URL",
    "Public Preflyt API URL",
    "GitHub",
    "url",
    "",
    false,
    "https://api.preflyt.example.com",
  ),
  field("GITHUB_APP_ID", "App ID", "GitHub", "number", "", true, "4585551"),
  field(
    "GITHUB_APP_CLIENT_ID",
    "Client ID",
    "GitHub",
    "text",
    "",
    true,
    "Iv1.example",
  ),
  field("GITHUB_APP_CLIENT_SECRET", "Client secret", "GitHub", "secret"),
  field(
    "GITHUB_APP_PRIVATE_KEY",
    "Private key",
    "GitHub",
    "secret",
    "",
    true,
    "-----BEGIN RSA PRIVATE KEY-----",
  ),
  field("GITHUB_WEBHOOK_SECRET", "Webhook secret", "GitHub", "secret"),
  field(
    "GITHUB_APP_OAUTH_CALLBACK_URL",
    "Installation callback URL",
    "GitHub",
    "url",
    "",
    true,
    "https://preflyt.example.com/github/oauth/callback",
  ),
  field(
    "GITHUB_LOGIN_CALLBACK_URL",
    "Login callback URL",
    "GitHub",
    "url",
    "",
    true,
    "https://preflyt.example.com/auth/github/callback",
  ),
  field("GITHUB_LOGIN_ENABLED", "GitHub sign-in", "GitHub", "boolean"),
  field(
    "GITHUB_EVENTS_ENABLED",
    "GitHub event ingestion",
    "GitHub",
    "boolean",
    "false",
    false,
  ),
  field(
    "GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED",
    "Use a separate governance App",
    "Governance",
    "boolean",
  ),
  field(
    "GITHUB_GOVERNANCE_APP_ID",
    "Governance App ID",
    "Governance",
    "number",
  ),
  field(
    "GITHUB_GOVERNANCE_PRIVATE_KEY",
    "Governance private key",
    "Governance",
    "secret",
  ),
  field(
    "GITHUB_GOVERNANCE_INSTALLATION_ID",
    "Governance installation ID",
    "Governance",
    "number",
  ),
  field(
    "GITHUB_CHECK_PUBLICATION_ENABLED",
    "Publish PR checks",
    "Governance",
    "boolean",
    "false",
    false,
  ),
  field(
    "AUTOMATIC_CHECK_PUBLICATION_ENABLED",
    "Automatic PR checks",
    "Governance",
    "boolean",
    "false",
    false,
  ),
  field(
    "GITHUB_RULESET_ACTIVATION_ENABLED",
    "Ruleset activation",
    "Governance",
    "boolean",
    "false",
    false,
  ),
  field(
    "RULESET_INSIGHTS_SYNC_ENABLED",
    "Ruleset history import",
    "Governance",
    "boolean",
    "false",
    false,
  ),
  field(
    "RULESET_INSIGHTS_RETENTION_DAYS",
    "History retention (days)",
    "Governance",
    "number",
    "90",
    false,
    "90",
  ),
  field(
    "OIDC_ISSUER",
    "Issuer URL",
    "Single sign-on",
    "url",
    "",
    true,
    "https://id.example.com/realms/preflyt",
  ),
  field(
    "OIDC_CLIENT_ID",
    "Client ID",
    "Single sign-on",
    "text",
    "",
    true,
    "preflyt",
  ),
  field("OIDC_CLIENT_SECRET", "Client secret", "Single sign-on", "secret"),
  field(
    "OIDC_REDIRECT_URI",
    "Callback URL",
    "Single sign-on",
    "url",
    "",
    true,
    "https://preflyt.example.com/auth/callback",
  ),
  field(
    "NOTIFICATIONS_ENABLED",
    "Workspace notifications",
    "Notifications",
    "boolean",
    "false",
    false,
  ),
  field(
    "NOTIFICATION_EMAIL_ENABLED",
    "Email notifications",
    "Notifications",
    "boolean",
    "false",
    false,
  ),
  field(
    "SMTP_HOST",
    "SMTP host",
    "Notifications",
    "text",
    "",
    true,
    "smtp.example.com",
  ),
  field(
    "SMTP_PORT",
    "SMTP port",
    "Notifications",
    "number",
    "587",
    true,
    "587",
  ),
  field(
    "SMTP_FROM",
    "Sender email",
    "Notifications",
    "text",
    "",
    true,
    "notifications@example.com",
  ),
  field(
    "SMTP_USER",
    "SMTP username",
    "Notifications",
    "text",
    "",
    true,
    "notifications@example.com",
  ),
  field("SMTP_PASSWORD", "SMTP password", "Notifications", "secret"),
  field(
    "AI_CONFIGURATION_ENABLED",
    "AI model configuration",
    "Intelligence",
    "boolean",
    "false",
    false,
  ),
  field(
    "AI_REVIEWS_ENABLED",
    "Advisory AI reviews",
    "Intelligence",
    "boolean",
    "false",
    false,
  ),
  field(
    "NATIVE_PREFLIGHT_ENABLED",
    "Native runtime preflight",
    "Native execution",
    "boolean",
    "false",
    false,
  ),
  field(
    "NATIVE_EXECUTION_ENABLED",
    "Native execution",
    "Native execution",
    "boolean",
    "false",
    false,
  ),
];
export const configurationKeys = new Set(
  configurationFields.map((field) => field.key),
);
