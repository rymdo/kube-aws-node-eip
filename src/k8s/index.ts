import { Config } from "../config";
import { LoggerInterface } from "../logger";

export interface DriverK8S {
  api: {
    v1: {
      node(name: string): {
        get(): Promise<{
          body: {
            metadata: {
              labels: {
                [key: string]: string;
              };
            };
          };
        }>;
      };
    };
  };
}

export interface Handlers {
  config: Config;
  logger: LoggerInterface;
  driver: DriverK8S;
}

export interface Interface {
  getNodeLabels(): Promise<{ [key: string]: string }>;
}

export class Client implements Interface {
  constructor(protected handlers: Handlers) {}

  async getNodeLabels(): Promise<{ [key: string]: string }> {
    const { config, driver, logger } = this.handlers;
    logger.debug(`getting node labels from "${config.nodeName}"`);
    try {
      const result = await driver.api.v1.node(config.nodeName).get();
      const labels = result.body.metadata.labels;
      logger.debug(`labels: "${JSON.stringify(labels)}"`);
      return labels;
    } catch (e) {
      logger.error(`${e.toString()}`);
      throw new Error(`node "${config.nodeName}" not found`);
    }
  }
}
