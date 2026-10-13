import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { Request } from "express";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { TeamsService } from "./teams.service.js";
class TeamDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MaxLength(2000) description!: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  memberIds!: string[];
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @Matches(/^[1-9]\d{0,15}$/, { each: true })
  repositoryIds!: string[];
  @IsInt() @Min(0) expectedRevision!: number;
}
class RefDto {
  @IsString() @MaxLength(80) id!: string;
  @IsString() @MaxLength(32) version!: string;
}
class AssignmentDto {
  @IsString() @MaxLength(255) branchRef!: string;
  @IsIn(["DEFAULT", "RECOMMENDED", "STRICT"]) profile!:
    "DEFAULT" | "RECOMMENDED" | "STRICT";
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => RefDto)
  packs!: RefDto[];
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) expectedPreviewHash?: string;
  @IsOptional() @IsString() @MaxLength(100) replacesAssignmentId?: string;
}
class ChildScopeDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  childIds!: string[];
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) expectedPreviewHash?: string;
}
class DiscoveryDto {
  @IsString() @Matches(/^[1-9]\d{0,15}$/) installationId!: string;
}
class ImportDto {
  @IsString() @Matches(/^[1-9]\d{0,15}$/) teamId!: string;
  @IsString() @Matches(/^[1-9]\d{0,15}$/) installationId!: string;
}
type R = Request & { preflytSession: AuthenticatedSession };
@Controller("teams")
@UseGuards(SessionGuard)
export class TeamsController {
  constructor(
    @Inject(TeamsService) private readonly teams: TeamsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Header("Cache-Control", "no-store") @Get() list(
    @Req() r: R,
    @Query("page") page?: string,
    @Query("q") q?: string,
  ) {
    return this.teams.list(r.preflytSession, page, q);
  }
  @Header("Cache-Control", "no-store") @Get("options") options(@Req() r: R) {
    return this.teams.options(r.preflytSession);
  }
  @Header("Cache-Control", "no-store") @Post("github/discover") discover(
    @Req() r: R,
    @Body() body: DiscoveryDto,
  ) {
    this.auth.assertOrigin(r.headers.origin);
    return this.teams.discover(r.preflytSession, body.installationId);
  }
  @Header("Cache-Control", "no-store") @Post("github/import") import(
    @Req() r: R,
    @Body() b: ImportDto,
  ) {
    this.auth.assertOrigin(r.headers.origin);
    return this.teams.importTeam(r.preflytSession, b.installationId, b.teamId);
  }
  @Header("Cache-Control", "no-store") @Post("baseline") baseline(@Req() r: R) {
    this.auth.assertOrigin(r.headers.origin);
    return this.teams.baseline(r.preflytSession);
  }
  @Header("Cache-Control", "no-store") @Get(":id") detail(
    @Req() r: R,
    @Param("id") id: string,
  ) {
    return this.teams.detail(r.preflytSession, id);
  }
  @Header("Cache-Control", "no-store") @Post() create(
    @Req() r: R,
    @Body() b: TeamDto,
  ) {
    this.auth.assertOrigin(r.headers.origin);
    return this.teams.save(r.preflytSession, b);
  }
  @Header("Cache-Control", "no-store") @Post(":id/edit") edit(
    @Req() r: R,
    @Param("id") id: string,
    @Body() b: TeamDto,
  ) {
    this.auth.assertOrigin(r.headers.origin);
    return this.teams.save(r.preflytSession, b, id);
  }
  @Header("Cache-Control", "no-store") @Post(":id/sync") sync(
    @Req() r: R,
    @Param("id") id: string,
  ) {
    this.auth.assertOrigin(r.headers.origin);
    return this.teams.sync(r.preflytSession, id);
  }
  @Header("Cache-Control", "no-store")
  @Post(":id/child-scope/preview")
  previewChildren(
    @Req() r: R,
    @Param("id") id: string,
    @Body() b: ChildScopeDto,
  ) {
    this.auth.assertOrigin(r.headers.origin);
    return this.teams.previewChildScope(r.preflytSession, id, b.childIds);
  }
  @Header("Cache-Control", "no-store")
  @Post(":id/child-scope/approve")
  approveChildren(
    @Req() r: R,
    @Param("id") id: string,
    @Body() b: ChildScopeDto,
  ) {
    this.auth.assertOrigin(r.headers.origin);
    return this.teams.approveChildScope(
      r.preflytSession,
      id,
      b.childIds,
      b.expectedPreviewHash ?? "",
    );
  }
  @Header("Cache-Control", "no-store") @Post(":id/preview") preview(
    @Req() r: R,
    @Param("id") id: string,
    @Body() b: AssignmentDto,
  ) {
    this.auth.assertOrigin(r.headers.origin);
    return this.teams.preview(r.preflytSession, id, b);
  }
  @Header("Cache-Control", "no-store") @Post(":id/assign") assign(
    @Req() r: R,
    @Param("id") id: string,
    @Body() b: AssignmentDto,
  ) {
    this.auth.assertOrigin(r.headers.origin);
    return this.teams.assign(r.preflytSession, id, b);
  }
}
