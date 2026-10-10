import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ConfigurationService } from "./configuration.service.js";
import { ConfigurationController } from "./configuration.controller.js";
@Module({
  imports: [AuthModule],
  providers: [ConfigurationService],
  controllers: [ConfigurationController],
})
export class ConfigurationModule {}
