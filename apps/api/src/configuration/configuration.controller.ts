import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsObject,
  IsString,
  Min,
} from "class-validator";
import type { Request } from "express";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { ConfigurationService } from "./configuration.service.js";
class ConfigurationDto {
  @IsInt() @Min(1) expectedRevision!: number;
  @IsObject() values!: Record<string, unknown>;
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  clearSecrets!: string[];
}
@Controller("configuration")
@UseGuards(SessionGuard)
export class ConfigurationController {
  constructor(
    @Inject(ConfigurationService)
    private readonly configuration: ConfigurationService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() @Header("Cache-Control", "no-store") get(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    return this.configuration.get(req.preflytSession);
  }
  @Patch() @Header("Cache-Control", "no-store") save(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
    @Body() body: ConfigurationDto,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.configuration.save(
      req.preflytSession,
      body.expectedRevision,
      body.values,
      body.clearSecrets,
    );
  }
}
