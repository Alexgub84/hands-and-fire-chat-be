import fastify from "fastify";
import formbody from "@fastify/formbody";
import { registerRoutes, type RoutesDependencies } from "./routes/index.js";

export type AppDependencies = RoutesDependencies;

export async function buildApp(dependencies: AppDependencies = {}) {
  const app = fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  await app.register(formbody);
  await app.register(async (instance) => {
    await registerRoutes(instance, dependencies);
  });

  return app;
}
