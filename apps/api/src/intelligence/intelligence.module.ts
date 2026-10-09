import { AssessmentService } from '../assessments/assessment.service.js';
import { ReviewSkillsService } from './review-skills.service.js';
import { SkillReviewService } from './skill-review.service.js';
import { ReviewSkillsController, SkillReviewController } from './review-skills.controller.js';
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AiConfigurationController } from "./ai-configuration.controller.js";
import { AiConfigurationService } from "./ai-configuration.service.js";
@Module({
  imports: [AuthModule],
  controllers: [AiConfigurationController, ReviewSkillsController, SkillReviewController],
  providers: [AiConfigurationService, ReviewSkillsService, SkillReviewService, AssessmentService],
})
export class IntelligenceModule {}
