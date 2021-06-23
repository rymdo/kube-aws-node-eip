import { Config } from "../config";
import { LoggerInterface } from "../logger";

import * as K8S from "../k8s";
import * as AWS from "../aws";

export interface Handlers {
  config: Config;
  logger: LoggerInterface;
  k8s: K8S.Interface;
  aws: AWS.Interface;
  sleep: (ms: number) => Promise<void>;
}

export interface Interface {
  run(): Promise<void>;
}

export class Service implements Interface {
  labelDomain = "eip.aws.kubernetes.io";

  constructor(protected handlers: Handlers) {}

  async run(): Promise<void> {
    const { logger, sleep } = this.handlers;
    logger.info("service/run: starting");
    let run = true;
    do {
      try {
        const enabled = await this.isEnabled();
        if (!enabled) {
          run = false;
          logger.error(
            "service/run: service is not enabled for this node. Please verify that the correct labels are set."
          );
          logger.error(
            `service/run: required label: "${this.labelDomain}/enabled" = "true"`
          );
        }
      } catch (e) {
        logger.error(`service/run: ${e.toString()}`);
      }
      await sleep(10000);
    } while (run);
  }

  async isEnabled(): Promise<boolean> {
    const { logger, k8s } = this.handlers;
    logger.debug("service/isEnabled: getting node labels");
    const labels = await k8s.getNodeLabels();
    for (const [key, value] of Object.entries(labels)) {
      if (key !== this.labelDomain) {
        continue;
      }
      if (value !== "true") {
        continue;
      }
      logger.debug("service/isEnabled: service enabled");
      return true;
    }
    logger.debug("service/isEnabled: service disabled");
    return false;
  }
}
