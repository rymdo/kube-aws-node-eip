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
  labelEnabledKey = `${this.labelDomain}/enabled`;
  labelEipKey = `${this.labelDomain}/current-eip`;
  labelEipSetKey = `${this.labelDomain}/current-eip-set`;

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
            `service/run: service is not enabled for this node. required label: '${this.labelEnabledKey}'='true'`
          );
          break;
        }

        logger.debug("service/run: checking if node has label assigned");
        const hasLabel = await this.hasLabel();
        if (!hasLabel) {
          logger.info(
            `service/run: node does not have label '${this.labelEipSetKey}' set`
          );

          logger.info(`service/run: checking if node has eip assigned`);
          const hasEip = await aws.instanceHasEip();
          if (!hasEip) {
            logger.info(`service/run: node does not have eip assigned`);
            logger.info("service/run: assigning eip to node");
            await this.assignEip();
          }

          logger.info("service/run: assigning labels to node");
          const eip = await aws.getInstanceEip();
          const labelEip: K8S.Label = {
            key: this.labelEipKey,
            value: eip.ip,
          };
          logger.info(`service/run: ${labelEip.key}=${labelEip.value}`);
          await k8s.addNodeLabel(labelEip);
          const labelEipSet: K8S.Label = {
            key: this.labelEipSetKey,
            value: "true",
          };
          logger.info(`service/run: ${labelEipSet.key}=${labelEipSet.value}`);
          await k8s.addNodeLabel(labelEipSet);
        }
      } catch (e) {
        logger.error(`service/run: ${(e as Error).toString()}`);
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
      if (key !== `${this.labelEnabledKey}`) {
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
    const { logger, aws, k8s, sleep } = this.handlers;

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
    await sleep(1000);
  }

  async hasLabel(): Promise<boolean> {
    const { k8s } = this.handlers;
    return await k8s.nodeHasLabelWithKey(this.labelEipSetKey);
  }
}
