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

export interface Taint {
  key: string;
  value: string;
  effect: string;
}

export interface Node {
  metadata: {
    labels: { [key: string]: string };
  };
  spec?: {
    taints?: Taint[];
  };
}

export interface Interface {
  getNode(): Promise<Node>;
  getNodeLabels(): Promise<{ [key: string]: string }>;
  nodeHasTaint(taint: Taint): Promise<boolean>;
  addNodeTaint(taint: Taint): Promise<void>;
  removeNodeTaint(taint: Taint): Promise<void>;
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
      logger.error(`${e.toString()}`);
      throw new Error(`node "${config.nodeName}" not found`);
    }
  }

  async nodeHasTaint(taint: Taint): Promise<boolean> {
    const node = await this.getNode();
    if (!node?.spec?.taints) {
      return false;
    }
    if (!Array.isArray(node.spec.taints)) {
      return false;
    }
    for (const nodeTaint of node.spec.taints) {
      if (taint.key !== nodeTaint.key) {
        continue;
      }
      if (taint.value !== nodeTaint.value) {
        continue;
      }
      if (taint.effect !== nodeTaint.effect) {
        continue;
      }
      return true;
    }
    return false;
  }

  async addNodeTaint(taint: Taint): Promise<void> {
    const { config, drivers, logger } = this.handlers;
    const command = `kubectl taint nodes ${config.nodeName} ${taint.key}=${taint.value}:${taint.effect}`;
    logger.debug(`addNodeTaint: exec '${command}'`);
    const result = await drivers.exec(command);
    logger.debug(`addNodeTaint: result '${result}'`);
  }

  async removeNodeTaint(taint: Taint): Promise<void> {
    const { config, drivers, logger } = this.handlers;
    const command = `kubectl taint nodes ${config.nodeName} ${taint.key}=${taint.value}:${taint.effect}-`;
    logger.debug(`removeNodeTaint: exec '${command}'`);
    const result = await drivers.exec(command);
    logger.debug(`removeNodeTaint: result '${result}'`);
  }

  isNode(data: any): data is Node {
    if (data?.metadata?.labels) {
      return true;
    }
    return false;
  }
}
