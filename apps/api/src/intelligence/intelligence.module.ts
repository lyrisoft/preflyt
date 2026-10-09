import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AiConfigurationController } from "./ai-configuration.controller.js";
import { AiConfigurationService } from "./ai-configuration.service.js";
@Module({
  imports: [AuthModule],
  controllers: [AiConfigurationController],
  providers: [AiConfigurationService],
})
export class IntelligenceModule {}
