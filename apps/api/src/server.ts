import { loadEnvironment } from "./config/env.js";
import { createMongoClient, pingDatabase } from "./repositories/mongodb.js";
import { MongoEventRepository } from "./repositories/events.js";
import { createApp } from "./app.js";

async function main() {
  const env = loadEnvironment();
  const client = await createMongoClient(env);
  await pingDatabase(client);
  console.log(`Connected to MongoDB database "${env.MONGODB_DATABASE}".`);

  const repository = new MongoEventRepository(client, env.MONGODB_DATABASE);
  const app = createApp(env, client, repository);

  const server = app.listen(env.PORT, () => {
    console.log(`Pathlens API listening on port ${env.PORT} (env: ${env.NODE_ENV}).`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down...`);
    server.close(async () => {
      await client.close();
      console.log("MongoDB connection closed.");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("Failed to start API:", error);
  process.exit(1);
});
