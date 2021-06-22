import { Config } from "../config";
import { LoggerInterface } from "../logger";

export interface Handlers {
  config: Config;
  logger: LoggerInterface;
  drivers: {
    aws: {};
    http: {
      get: (url: string) => Promise<any>;
    };
  };
}

export interface Interface {}

export class Client implements Interface {
  constructor(protected handlers: Handlers) {}

  async getEIPIDs(): Promise<string[]> {
    return [];
  }

  async getInstanceId(): Promise<string> {
    const { logger, drivers } = this.handlers;
    const url = "http://169.254.169.254/latest/meta-data/instance-id";
    logger.debug(`getting instance id from url "${url}"`);
    try {
      const id = await drivers.http.get(url);
      logger.debug(`instance id: "${id}"`);
      return id;
    } catch (e) {
      logger.error(`${e.toString()}`);
      throw new Error("failed to get instance id");
    }
  }
}
