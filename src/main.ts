import { config } from "./config";
import { createLogger, LoggerInterface } from "./logger";
import { sleep } from "./sleep";
import * as K8S from "./k8s";
import * as AWS from "./aws";

import * as ApiClient from "kubernetes-client";

import { EC2Client } from "@aws-sdk/client-ec2";

function createK8SClient(logger: LoggerInterface): K8S.Interface {
  const Client = ApiClient.Client1_13;
  return new K8S.Client({
    config,
    logger,
    driver: new Client({ version: "1.13" }),
  });
}

function createAWSClient(logger: LoggerInterface): AWS.Interface {
  const axios = require("axios").default;
  return new AWS.Client({
    config,
    logger,
    drivers: {
      aws: {
        ec2: new EC2Client({ region: config.aws.region }),
      },
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

  logger.info(JSON.stringify(await k8s.getNodeLabels()));
  logger.info(JSON.stringify(await aws.getInstanceId()));
  if (await aws.instanceHasEip()) {
    logger.info(JSON.stringify(await aws.getInstanceEip()));
  } else {
    logger.info("instance has no eip");
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
