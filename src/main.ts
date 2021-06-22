import { config } from "./config";
import { createLogger, LoggerInterface } from "./logger";
import { sleep } from "./sleep";

import * as k8s from "./k8s";

import * as ApiClient from "kubernetes-client";

function createK8SClient(logger: LoggerInterface): k8s.Interface {
  const Client = ApiClient.Client1_13;
  return new k8s.Client({
    config,
    logger,
    driver: new Client({ version: "1.13" }),
  });
}

async function run() {
  const logger = createLogger();
  logger.info("starting");
  logger.info(`config: ${JSON.stringify(config)}`);
  if (config.development) {
    logger.warn("development mode");
  }
  const k8s = createK8SClient(logger);
  console.log(await k8s.getLabels());
}

process.on("SIGINT", function () {
  console.log("Caught interrupt signal");
  process.exit();
});

console.log("starting");
run().catch((err) => {
  console.log(err);
});
