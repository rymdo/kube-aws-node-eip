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
  labelDomain = "aws.node.eip";
  taintNoEip: K8S.Taint = {
    key: `${this.labelDomain}/no-eip`,
    value: "no-eip",
    effect: "NoExecute",
  };
  noEipCounter = 0;
  noEipCounterLimit = 3;

  constructor(protected handlers: Handlers) {}

  async run(): Promise<void> {
    const { logger, config, sleep, aws, k8s } = this.handlers;
    logger.info("service/run: starting");
    let run = true;
    do {
      try {
        logger.debug("service/run: checking if service is enabled for node");
        const enabled = await this.isEnabled();
        if (!enabled) {
          run = false;
          logger.error(
            `service/run: service is not enabled for this node. required label: '${this.labelDomain}/enabled'='true'`
          );
          break;
        }

        logger.debug("service/run: checking if node is ready");
        const isReady = await this.isReady();
        const hasTaint = await k8s.nodeHasTaint(this.taintNoEip);
        if (isReady) {
          this.noEipCounter = 0;
          if (hasTaint) {
            logger.debug("service/run: removing node taint");
            await k8s.removeNodeTaint(this.taintNoEip);
          }
        } else {
          this.noEipCounter += 1;
          logger.info(
            `service/run: no eip. Counter '${this.noEipCounter}', limit '${this.noEipCounterLimit}'`
          );
          if (this.noEipCounter > this.noEipCounterLimit) {
            if (!hasTaint) {
              logger.debug("service/run: adding node taint");
              await k8s.addNodeTaint(this.taintNoEip);
            }
          }
        }

        logger.debug("service/run: checking if node has eip assigned");
        const hasEip = await aws.instanceHasEip();
        if (!hasEip) {
          logger.debug("service/run: assigning eip to node");
          await this.assignEip();
        } else {
          logger.debug("service/run: instance already has eip");
        }
      } catch (e) {
        logger.error(`service/run: ${e.toString()}`);
      }
      await sleep(config.checkInterval * 1000);
    } while (run);
  }

  async isEnabled(): Promise<boolean> {
    const { logger, k8s } = this.handlers;

    logger.debug("service/isEnabled: getting node labels");
    const labels = await k8s.getNodeLabels();

    for (const [key, value] of Object.entries(labels)) {
      logger.debug(`service/isEnabled: checking '${key}'='${value}'`);
      if (key !== `${this.labelDomain}/enabled`) {
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

  async assignEip(): Promise<void> {
    const { logger, aws, k8s } = this.handlers;

    logger.debug("service/assignEip: getting node labels");
    const labels = await k8s.getNodeLabels();
    const tag = {
      name: "",
      value: "",
    };
    for (const [key, value] of Object.entries(labels)) {
      logger.debug(`service/assignEip: checking '${key}'='${value}'`);
      if (key === `${this.labelDomain}/tag-name`) {
        tag.name = value;
      }
      if (key === `${this.labelDomain}/tag-value`) {
        tag.value = value;
      }
    }
    if (tag.name === "" || tag.value === "") {
      logger.error(
        `service/assignEip: tag not valid. tag '${JSON.stringify(tag)}'`
      );
      throw new Error("invalid tag");
    }
    logger.debug(`service/assignEip: tag '${JSON.stringify(tag)}'`);

    logger.debug("service/assignEip: getting free eips");
    const eips = await aws.getFreeEips(tag);

    logger.debug("service/assignEip: assigning eip to instance");
    await aws.assignEiptoInstance(eips[0]);

    logger.debug("service/assignEip: assigning eip to instance done");
  }

  async isReady(): Promise<boolean> {
    const { aws, logger } = this.handlers;
    const hasEip = await aws.instanceHasEip();
    if (!hasEip) {
      return false;
    }
    const assignedEip = await aws.getInstanceEip();
    const publicIp = await aws.getInstancePublicIp();
    logger.debug(
      "service/isReady: checking if assigned ip and public if from metedata match"
    );
    const result = assignedEip.ip === publicIp;
    logger.debug(
      `service/isReady: result '${result}' (${assignedEip.ip} === ${publicIp})`
    );
    return result;
  }
}
