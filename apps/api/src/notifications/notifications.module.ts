import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationChannelsController } from "./notification-channels.controller.js";
import { NotificationChannelsService } from "./notification-channels.service.js";
import { NotificationsService } from "./notifications.service.js";
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [NotificationsController, NotificationChannelsController],
  providers: [NotificationsService, NotificationChannelsService],
})
export class NotificationsModule {}
