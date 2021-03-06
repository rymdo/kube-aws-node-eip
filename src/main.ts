import { config } from "./config";
import { createLogger, LoggerInterface } from "./logger";
import { sleep } from "./sleep";

import * as K8S from "./k8s";
import * as AWS from "./aws";
import * as Metrics from "./metrics";
import * as Service from "./service";

import * as ApiClient from "kubernetes-client";

import { EC2Client } from "@aws-sdk/client-ec2";

function createK8SClient(logger: LoggerInterface): K8S.Interface {
  const Client = ApiClient.Client1_13;
  const util = require("util");
  const exec = util.promisify(require("child_process").exec);
  return new K8S.Client({
    config,
    logger,
    drivers: {
      k8s: new Client({ version: "1.13" }),
      exec: async (command) => {
        const result = await exec(command);
        return result.stdout.toString();
      },
    },
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

function createMetricsServer(
  logger: LoggerInterface,
  aws: AWS.Interface
): Metrics.Interface {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const http = require("express")();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const prometheus = require("prom-client");

  return new Metrics.Server({
    config,
    logger,
    drivers: {
      aws,
      http,
      prometheus,
    },
  });
}

function createService(logger: LoggerInterface): Service.Interface {
  const k8s = createK8SClient(logger);
  const aws = createAWSClient(logger);
  createMetricsServer(logger, aws);
  return new Service.Service({
    config,
    logger,
    aws,
    k8s,
    sleep,
  });
}

async function run() {
  const logger = createLogger();
  logger.info("starting");
  logger.info(`config: ${JSON.stringify(config)}`);
  const service = createService(logger);
  await service.run();
}

process.on("SIGINT", function () {
  console.log("Caught interrupt signal");
  process.exit();
});

console.log("starting");
run().catch((err) => {
  console.log(err);
});
