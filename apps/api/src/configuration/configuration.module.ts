import { GitHubAppManifestService } from './github-app-manifest.service.js';
import { GitHubAppManifestController } from './github-app-manifest.controller.js';
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ConfigurationService } from "./configuration.service.js";
import { ConfigurationController } from "./configuration.controller.js";
@Module({
  imports: [AuthModule],
  providers: [ConfigurationService, GitHubAppManifestService],
  controllers: [ConfigurationController, GitHubAppManifestController],
})
export class ConfigurationModule {}
