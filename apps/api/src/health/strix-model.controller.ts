import {
  Body,
  Controller,
  Header,
  Headers,
  Inject,
  Param,
  Post,
} from "@nestjs/common";
import { HealthStrixService } from "./strix.service.js";
/** Job-scoped bearer authorization is checked by the broker, not a browser session. */
@Controller("github/strix-model")
export class StrixModelController {
  constructor(
    @Inject(HealthStrixService) private readonly strix: HealthStrixService,
  ) {}
  @Post(":id/*operation")
  @Header("Cache-Control", "no-store")
  model(
    @Param("id") id: string,
    @Param("operation") operation: string | string[],
    @Headers("authorization") token: string | undefined,
    @Body() body: unknown,
  ) {
    return this.strix.model(
      id,
      token,
      "/" + (Array.isArray(operation) ? operation.join("/") : operation),
      body,
    );
  }
}
