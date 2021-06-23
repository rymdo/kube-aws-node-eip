import { Config } from "../config";
import { LoggerInterface } from "../logger";

import { EC2Client, DescribeAddressesCommand } from "@aws-sdk/client-ec2";

export interface Eip {
  id: string;
  ip: string;
}
export interface Handlers {
  config: Config;
  logger: LoggerInterface;
  drivers: {
    aws: {
      ec2: EC2Client;
    };
    http: {
      get: (url: string) => Promise<any>;
    };
  };
}

export interface Interface {
  getInstanceEip(): Promise<Eip>;
  getInstanceId(): Promise<string>;
  getFreeEips(): Promise<Eip[]>;
}

export class Client implements Interface {
  constructor(protected handlers: Handlers) {}

  async getInstanceEip(): Promise<Eip> {
    const { logger, drivers } = this.handlers;

    const data = await drivers.aws.ec2.send(
      new DescribeAddressesCommand({
        Filters: [
          {
            Name: "instance-id",
            Values: [await this.getInstanceId()],
          },
        ],
      })
    );
    logger.debug(`instance addresses: "${JSON.stringify(data)}"`);
    if (!data.Addresses || data.Addresses.length < 1) {
      throw new Error("no eips found on instance");
    }
    const { PublicIp, AllocationId } = data.Addresses[0];
    if (!PublicIp || !AllocationId) {
      throw new Error("no eips found on instance");
    }
    return {
      id: AllocationId,
      ip: PublicIp,
    };
  }

  async getInstanceId(): Promise<string> {
    const { logger, drivers } = this.handlers;
    const url = "http://169.254.169.254/latest/meta-data/instance-id";
    logger.debug(`getting instance id from url "${url}"`);
    try {
      const result = await drivers.http.get(url);
      const id = result.data;
      logger.debug(`instance id: "${id}"`);
      return id;
    } catch (e) {
      logger.error(`${e.toString()}`);
      throw new Error("failed to get instance id");
    }
  }

  async getFreeEips(): Promise<Eip[]> {
    return [];
  }
}
