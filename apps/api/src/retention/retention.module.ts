import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RetentionController } from "./retention.controller.js";
import { RetentionService } from "./retention.service.js";
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [RetentionController],
  providers: [RetentionService],
})
export class RetentionModule {}
