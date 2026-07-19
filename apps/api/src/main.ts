import { parseEnv } from "./config/env";
import { buildComposition } from "./composition";
import { createServer } from "./server";

// Bootstrap застосунку (spike-2 §3): parseEnv → buildComposition → createServer → listen(API_PORT).
function main(): void {
  const config = parseEnv(process.env);
  const root = buildComposition(config);
  const app = createServer(root);

  const server = app.listen(config.API_PORT, () => {
    root.logger.info({ port: config.API_PORT, env: config.NODE_ENV }, "api listening");
  });

  // Graceful shutdown — закриваємо сервер і чергу (BullMQ конект) на сигнали оркестратора.
  const shutdown = (signal: NodeJS.Signals): void => {
    root.logger.info({ signal }, "shutting down api");
    server.close(() => {
      void root.close().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
