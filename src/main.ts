import { config } from "./config";
import { createLogger, LoggerInterface } from "./logger";
import { sleep } from "./sleep";
import * as k8s from "./k8s";
import * as aws from "./aws";

import * as ApiClient from "kubernetes-client";

function createK8SClient(logger: LoggerInterface): k8s.Interface {
  const Client = ApiClient.Client1_13;
  return new k8s.Client({
    config,
    logger,
    driver: new Client({ version: "1.13" }),
  });
}

function createAWSClient(logger: LoggerInterface): aws.Interface {
  const axios = require("axios").default;
  return new aws.Client({
    config,
    logger,
    drivers: {
      aws: {},
      http: axios,
    },
  });
}

async function run() {
  const logger = createLogger();
  logger.info("starting");
  logger.info(`config: ${JSON.stringify(config)}`);
  const k8s = createK8SClient(logger);
  const aws = createAWSClient(logger);
  console.log(await k8s.getNodeLabels());
  console.log(await aws.getInstanceId());
}

process.on("SIGINT", function () {
  console.log("Caught interrupt signal");
  process.exit();
});

console.log("starting");
run().catch((err) => {
  console.log(err);
});
