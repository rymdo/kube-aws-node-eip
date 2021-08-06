import { Config } from "../config";
import { LoggerInterface } from "../logger";

import {
  EC2Client,
  DescribeAddressesCommand,
  AssociateAddressCommand,
  DescribeNetworkInterfacesCommand,
} from "@aws-sdk/client-ec2";

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
  getInstancePrimaryNetworkInterfaceId(): Promise<string>;
  getFreeEips(tag: { name: string; value: string }): Promise<Eip[]>;
  instanceHasEip(): Promise<boolean>;
  assignEiptoInstance(eip: Eip): Promise<void>;
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

  async getInstancePrimaryNetworkInterfaceId(): Promise<string> {
    const { logger, drivers } = this.handlers;
    const instanceId = await this.getInstanceId();
    logger.debug(
      `getting instance primary network interface id from instance '${instanceId}'`
    );
    const data = await drivers.aws.ec2.send(
      new DescribeNetworkInterfacesCommand({
        Filters: [
          {
            Name: `attachment.instance-id`,
            Values: [instanceId],
          },
        ],
      })
    );
    if (
      !data.NetworkInterfaces ||
      !data.NetworkInterfaces[0] ||
      !data.NetworkInterfaces[0].NetworkInterfaceId
    ) {
      throw new Error("response invalid");
    }
    const id = data.NetworkInterfaces[0].NetworkInterfaceId;
    logger.debug(`instance network interface id: "${id}"`);
    return id;
  }

  async getFreeEips(tag: { name: string; value: string }): Promise<Eip[]> {
    const { logger, drivers } = this.handlers;
    const data = await drivers.aws.ec2.send(
      new DescribeAddressesCommand({
        Filters: [
          {
            Name: `tag:${tag.name}`,
            Values: [tag.value],
          },
        ],
      })
    );
    logger.debug(`eips: "${JSON.stringify(data)}"`);
    if (!data.Addresses) {
      throw new Error("no free eips found");
    }
    const eips: Eip[] = [];
    for (const address of data.Addresses) {
      const { AssociationId, AllocationId, PublicIp } = address;
      if (AssociationId || !PublicIp || !AllocationId) {
        continue;
      }
      eips.push({
        id: AllocationId,
        ip: PublicIp,
      });
    }
    logger.debug(`free eips: "${JSON.stringify(eips)}"`);
    if (eips.length > 0) {
      return eips;
    }
    throw new Error("no free eips found");
  }

  async instanceHasEip(): Promise<boolean> {
    try {
      await this.getInstanceEip();
      return true;
    } catch (e) {}
    return false;
  }

  async assignEiptoInstance(eip: Eip): Promise<void> {
    const { logger, drivers } = this.handlers;
    const instanceId = await this.getInstanceId();
    const networkInterfaceId =
      await this.getInstancePrimaryNetworkInterfaceId();
    logger.debug(
      `associating eip '${eip.ip}' [${eip.id}] to network interface '${networkInterfaceId}' attached to instance '${instanceId}'`
    );
    try {
      await drivers.aws.ec2.send(
        new AssociateAddressCommand({
          AllocationId: eip.id,
          AllowReassociation: false,
          NetworkInterfaceId: networkInterfaceId,
        })
      );
    } catch (e) {
      logger.error(`${e.toString()}`);
      throw new Error("failed to assign eip");
    }
  }
}
