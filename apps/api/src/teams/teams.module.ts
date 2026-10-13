import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { GitHubProviderModule } from "../github/github-provider.module.js";
import { TeamsController } from "./teams.controller.js";
import { TeamsService } from "./teams.service.js";
@Module({
  imports: [AuthModule, PrismaModule, GitHubProviderModule],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
