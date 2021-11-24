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
  drivers: {
    k8s: DriverK8S;
    exec: (cmd: string) => Promise<string>;
  };
}

export interface Label {
  key: string;
  value: string;
}

export interface Node {
  metadata: {
    labels: { [key: string]: string };
  };
}

export interface Interface {
  getNode(): Promise<Node>;
  getNodeLabels(): Promise<{ [key: string]: string }>;
  nodeHasLabelWithKey(labelKey: string): Promise<boolean>;
  addNodeLabel(label: Label): Promise<void>;
  removeNodeLabel(label: Label): Promise<void>;
}

export class Client implements Interface {
  constructor(protected handlers: Handlers) {}

  async getNode(): Promise<Node> {
    const { config, drivers, logger } = this.handlers;
    logger.debug(`getNode: getting node "${config.nodeName}"`);
    const result = await drivers.k8s.api.v1.node(config.nodeName).get();
    if (!this.isNode(result.body)) {
      throw new Error(
        `getNode: get node malformed result '${JSON.stringify(result.body)}'`
      );
    }
    return result.body;
  }

  async getNodeLabels(): Promise<{ [key: string]: string }> {
    const { config, logger } = this.handlers;
    logger.debug(`getting node labels from "${config.nodeName}"`);
    try {
      const { metadata } = await this.getNode();
      logger.debug(`labels: "${JSON.stringify(metadata.labels)}"`);
      return metadata.labels;
    } catch (e) {
      logger.error(`${(e as Error).toString()}`);
      throw new Error(`node "${config.nodeName}" not found`);
    }
  }

  async nodeHasLabelWithKey(labelKey: string): Promise<boolean> {
    const labels = await this.getNodeLabels();
    for (const [key, value] of Object.entries(labels)) {
      if (key === labelKey) {
        return true;
      }
    }
    return false;
  }

  async addNodeLabel(label: Label): Promise<void> {
    const { config, drivers, logger } = this.handlers;
    const command = `kubectl label nodes ${config.nodeName} ${label.key}=${label.value} --overwrite=true`;
    logger.debug(`addNodeLabel: exec '${command}'`);
    const result = await drivers.exec(command);
    logger.debug(`addNodeLabel: result '${result}'`);
  }

  async removeNodeLabel(label: Label): Promise<void> {
    const { config, drivers, logger } = this.handlers;
    const command = `kubectl label nodes ${config.nodeName} ${label.key}=${label.value}-`;
    logger.debug(`removeNodeLabel: exec '${command}'`);
    const result = await drivers.exec(command);
    logger.debug(`removeNodeLabel: result '${result}'`);
  }

  isNode(data: any): data is Node {
    if (data?.metadata?.labels) {
      return true;
    }
    return false;
  }
}
