import { configurationValue } from "../configuration/runtime-configuration.js";
import {
  ServiceUnavailableException,
  ForbiddenException,
} from "@nestjs/common";
import { governanceAppMode } from "../configuration/configuration-catalogue.js";

/** Reuse the repository connection unless a separate governance App is selected. */
export function governanceConfiguration(repositoryInstallationId?: bigint) {
  const values = Object.fromEntries(
    [
      "GITHUB_APP_ID",
      "GITHUB_APP_PRIVATE_KEY",
      "GITHUB_GOVERNANCE_SEPARATE_APP_ENABLED",
      "GITHUB_GOVERNANCE_APP_ID",
      "GITHUB_GOVERNANCE_PRIVATE_KEY",
      "GITHUB_GOVERNANCE_INSTALLATION_ID",
    ].map((key) => [key, configurationValue(key) ?? ""]),
  );
  const separate = governanceAppMode(values) === "true";
  const appId = values[separate ? "GITHUB_GOVERNANCE_APP_ID" : "GITHUB_APP_ID"];
  const privateKey =
    values[
      separate ? "GITHUB_GOVERNANCE_PRIVATE_KEY" : "GITHUB_APP_PRIVATE_KEY"
    ];
  const installationId = separate
    ? values.GITHUB_GOVERNANCE_INSTALLATION_ID
    : repositoryInstallationId?.toString();
  if (
    !appId ||
    !/^[1-9]\d*$/.test(appId) ||
    !privateKey ||
    !installationId ||
    !/^[1-9]\d*$/.test(installationId)
  )
    throw new ServiceUnavailableException(
      separate
        ? "Configure the separate governance App and its organization installation before changing rulesets"
        : "Connect the GitHub App to this repository before changing rulesets",
    );
  if (separate && appId === values.GITHUB_APP_ID)
    throw new ForbiddenException(
      "Use a different App ID for the optional separate governance App",
    );
  return {
    appId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    installationId: BigInt(installationId),
    separateApp: separate,
  };
}
