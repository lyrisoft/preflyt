import { ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  initializeConfiguration,
  unpackConfiguration,
} from "./configuration-store.js";
import { applyConfiguration } from "./runtime-configuration.js";
export async function loadDeploymentConfiguration(importEnvironment = true) {
  const db = new PrismaService();
  try {
    await db.waitUntilWritable();
    // Only the API imports legacy settings. A worker has a smaller environment and
    // must never win the first-start race by seeding an incomplete configuration.
    let row = importEnvironment
      ? await initializeConfiguration(db)
      : await db.deploymentConfiguration.findUnique({
          where: { id: "primary" },
        });
    for (let attempt = 0; !row && attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      row = await db.deploymentConfiguration.findUnique({
        where: { id: "primary" },
      });
    }
    if (!row)
      throw new ServiceUnavailableException(
        "Start the API first to initialize deployment configuration",
      );
    applyConfiguration(unpackConfiguration(row), true);
  } finally {
    await db.$disconnect();
  }
}
