import { Config } from "../config";
import { LoggerInterface } from "../logger";

import {
  EC2Client,
  DescribeAddressesCommand,
  AssociateAddressCommand,
  DescribeNetworkInterfacesCommand,
} from "@aws-sdk/client-ec2";

import * as EC2Types from "@aws-sdk/client-ec2";

export interface Eip {
  id: string;
  ip: string;
}

export interface NetworkInterface {
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
  getInstancePrimaryNetworkInterface(): Promise<NetworkInterface>;
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

  async getInstancePrimaryNetworkInterface(): Promise<NetworkInterface> {
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
    if (!data.NetworkInterfaces) {
      throw new Error("response invalid (data.NetworkInterfaces)");
    }
    const networkInterface = this.getNetworkInterfaceWithPublicIp(
      data.NetworkInterfaces
    );
    if (
      !networkInterface.NetworkInterfaceId ||
      !networkInterface.PrivateIpAddress
    ) {
      throw new Error(
        "response invalid (networkInterface.NetworkInterfaceId/networkInterface.PrivateIpAddress)"
      );
    }
    const id = networkInterface.NetworkInterfaceId;
    const ip = networkInterface.PrivateIpAddress;
    logger.debug(`instance network interface id '${id}' ip '${ip}'`);
    return {
      id,
      ip,
    };
  }

  getNetworkInterfaceWithPublicIp(
    networkInterfaces: EC2Types.NetworkInterface[]
  ): EC2Types.NetworkInterface {
    for (const networkInterface of networkInterfaces) {
      if (networkInterface.Association?.PublicIp) {
        return networkInterface;
      }
    }
    throw new Error("network interface with public ip not found");
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
    const networkInterface = await this.getInstancePrimaryNetworkInterface();
    logger.debug(
      `associating eip '${eip.ip}' [${eip.id}] to network interface '${networkInterface.id}' attached to instance '${instanceId}'`
    );
    try {
      await drivers.aws.ec2.send(
        new AssociateAddressCommand({
          AllocationId: eip.id,
          AllowReassociation: false,
          NetworkInterfaceId: networkInterface.id,
          PrivateIpAddress: networkInterface.ip,
        })
      );
    } catch (e) {
      logger.error(`${e.toString()}`);
      throw new Error("failed to assign eip");
    }
  }
}
