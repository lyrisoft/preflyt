```bash title=".env"
# Preflyt settings. Keep this file private: chmod 600 .env
#
# Image tag matching the selected documentation version (0.1.6).
PREFLYT_VERSION=v0.1.6

# Optional installation reporting (enabled by default). Set false before startup to opt out.
# No data is sent until a reporting receiver is configured.
PREFLYT_INSTALLATION_REPORTING_ENABLED=true
# Country reporting requires a separate administrator opt-in. Set false to enforce off.
PREFLYT_INSTALLATION_COUNTRY_REPORTING_ENABLED=
PREFLYT_INSTALLATION_REPORTING_URL=

# REQUIRED. Your public HTTPS address: no trailing slash, no path.
WEB_ORIGIN=https://preflyt.example.com

# Super Admin sign-in. The password must be 24 to 128 characters.
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=REPLACE_WITH_24_TO_128_CHARACTERS

# REQUIRED. Two different random values. Create each with: openssl rand -hex 24
POSTGRES_PASSWORD=REPLACE_WITH_RANDOM_HEX
DATABASE_APP_PASSWORD=REPLACE_WITH_A_DIFFERENT_RANDOM_HEX

# REQUIRED. Keep copies outside the server. Generate a separate value for each key.
# Create each with: openssl rand -base64 32
CONFIGURATION_ENCRYPTION_KEY=REPLACE_WITH_RANDOM_BASE64
GITHUB_USER_TOKEN_ENCRYPTION_KEY=REPLACE_WITH_A_DIFFERENT_RANDOM_BASE64
AI_PROVIDER_ENCRYPTION_KEY=REPLACE_WITH_A_THIRD_RANDOM_BASE64
```
