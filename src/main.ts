import { config } from "./config";
import { createLogger } from "./logger";
import { sleep } from "./sleep";

async function run() {
  const logger = createLogger();
  logger.info("starting");
  logger.info(`config: ${JSON.stringify(config)}`);
  if (config.development) {
    logger.warn("development mode");
  }
}

process.on("SIGINT", function () {
  console.log("Caught interrupt signal");
  process.exit();
});

console.log("starting");
run().catch((err) => {
  console.log(err);
});
