import { UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
const keys = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
  { timeoutDuration: 10000, cooldownDuration: 30000 },
);
export async function pipelineIdentity(authorization: string | undefined) {
  if (!authorization?.startsWith("Bearer ") || authorization.length > 20000)
    throw new UnauthorizedException(
      "A GitHub Actions identity token is required",
    );
  try {
    return (
      await jwtVerify(authorization.slice(7), keys, {
        issuer: "https://token.actions.githubusercontent.com",
        audience: "preflyt:policy",
        algorithms: ["RS256"],
        maxTokenAge: "5m",
        clockTolerance: 5,
      })
    ).payload;
  } catch {
    throw new UnauthorizedException(
      "GitHub Actions identity could not be verified",
    );
  }
}
