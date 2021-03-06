import { Handlers, Client, Eip } from ".";
import { Config } from "../config";
import { createMockLogger } from "../mocks/logger";

import {
  EC2Client,
  DescribeAddressesCommand,
  DescribeNetworkInterfacesCommand,
} from "@aws-sdk/client-ec2";
import { mockClient } from "aws-sdk-client-mock";

describe("aws", () => {
  const testInstanceIdWithEip = "i-123456789";
  const testInstanceIdWithoutEip = "i-987654321";
  const testEipId = "eipalloc-12431553";
  const testEip = "1.2.3.4";
  const testFreeEips = [
    {
      PublicIp: "1.1.1.1",
      AllocationId: "eipalloc-111111111",
    },
    {
      PublicIp: "2.2.2.2",
      AllocationId: "eipalloc-222222222",
    },
    {
      PublicIp: "3.3.3.3",
      AllocationId: "eipalloc-333333333",
      AssociationId: "eipassoc-123",
    },
  ];
  const testAWSTagName = "Name";
  const testAWSTagValue = "tf-test-service-1";
  const testGetFreeEIPDefault = {
    name: testAWSTagName,
    value: testAWSTagValue,
  };
  const testInstancePrimaryNetworkInterfaceId = "eni-e5aa89a3";
  const testInstancePrimaryNetworkInterfaceIp = "123.123.123.213";

  let ec2Mock: any;
  let handlers: Handlers;
  let client: Client;

  beforeEach(() => {
    handlers = createHandlers();
    client = new Client(handlers);
  });

  describe("on getInstanceId", () => {
    it("should http with correct url", async () => {
      const expectedUrl = "http://169.254.169.254/latest/meta-data/instance-id";
      let actualUrl = "";
      handlers.drivers.http.get = async (url: string) => {
        actualUrl = url;
        return testInstanceIdWithEip;
      };
      await client.getInstanceId();
      expect(actualUrl).toBe(expectedUrl);
    });

    it("should throw error on eg. timeout", async () => {
      handlers.drivers.http.get = async () => {
        throw new Error("timeout");
      };
      await expect(client.getInstanceId()).rejects.toThrowError(
        "failed to get instance id"
      );
    });

    it("should get instance id", async () => {
      await expect(client.getInstanceId()).resolves.toBe(testInstanceIdWithEip);
    });
  });

  describe("on getInstancePublicIp", () => {
    const testInstancePublicIp = "123.123.123.123";

    it("should http with correct url", async () => {
      const expectedUrl = "http://169.254.169.254/latest/meta-data/public-ipv4";
      let actualUrl = "";
      handlers.drivers.http.get = async (url: string) => {
        actualUrl = url;
        return testInstancePublicIp;
      };
      await client.getInstancePublicIp();
      expect(actualUrl).toBe(expectedUrl);
    });

    it("should throw error on eg. timeout", async () => {
      handlers.drivers.http.get = async () => {
        throw new Error("timeout");
      };
      await expect(client.getInstancePublicIp()).rejects.toThrowError(
        "failed to get instance public ip"
      );
    });

    it("should get instance id", async () => {
      handlers.drivers.http.get = async () => {
        return {
          data: testInstancePublicIp,
        };
      };
      await expect(client.getInstancePublicIp()).resolves.toBe(
        testInstancePublicIp
      );
    });
  });

  describe("on getInstanceEip", () => {
    it("should check for addressess with correct filters", async () => {
      const expectedFilters = [
        {
          Name: "instance-id",
          Values: [testInstanceIdWithEip],
        },
      ];
      await client.getInstanceEip();
      expect(ec2Mock.calls(0)[0].firstArg.input.Filters).toEqual(
        expectedFilters
      );
    });
    describe("given instance without eip", () => {
      beforeEach(() => {
        handlers.drivers.http.get = async () => {
          return {
            data: testInstanceIdWithoutEip,
          };
        };
      });

      it("should throw 'no eip found on instance'", async () => {
        await expect(client.getInstanceEip()).rejects.toThrowError(
          "no eips found on instance"
        );
      });
    });
    describe("given instance with eip", () => {
      it("should get correct eip id", async () => {
        const eip = await client.getInstanceEip();
        expect(eip.id).toBe(testEipId);
      });
      it("should get correct eip", async () => {
        const eip = await client.getInstanceEip();
        expect(eip.ip).toBe(testEip);
      });
    });
  });

  describe("on getInstancePrimaryNetworkInterface", () => {
    it("should use correct filters", async () => {
      const expectedFilters = [
        {
          Name: `attachment.instance-id`,
          Values: [testInstanceIdWithEip],
        },
      ];
      try {
        await client.getInstancePrimaryNetworkInterface();
      } catch (e) {}
      expect(ec2Mock.calls(0)[0].firstArg.input.Filters).toEqual(
        expectedFilters
      );
    });
    it("should get correct interface id", async () => {
      const networkInterface =
        await client.getInstancePrimaryNetworkInterface();
      expect(networkInterface.id).toBe(testInstancePrimaryNetworkInterfaceId);
    });
    it("should get correct interface ip", async () => {
      const networkInterface =
        await client.getInstancePrimaryNetworkInterface();
      expect(networkInterface.ip).toBe(testInstancePrimaryNetworkInterfaceIp);
    });
  });

  describe("on getFreeEips", () => {
    it("should check for eips with correct filters", async () => {
      const expectedFilters = [
        {
          Name: `tag:${testAWSTagName}`,
          Values: [testAWSTagValue],
        },
      ];
      try {
        await client.getFreeEips(testGetFreeEIPDefault);
      } catch (e) {}
      expect(ec2Mock.calls(0)[0].firstArg.input.Filters).toEqual(
        expectedFilters
      );
    });
    describe("given no free eips exists", () => {
      beforeEach(() => {
        handlers = createHandlers([]);
        client = new Client(handlers);
      });
      it("should throw 'no free eips found'", async () => {
        await expect(
          client.getFreeEips(testGetFreeEIPDefault)
        ).rejects.toThrowError("no free eips found");
      });
    });
    describe("given free eips exists", () => {
      it("should get all free eips", async () => {
        const eips = await client.getFreeEips(testGetFreeEIPDefault);
        const expectedEipsCount = testFreeEips.filter(
          (eip) => !eip.AssociationId
        );
        expect(Object.keys(eips).length).toBe(
          Object.keys(expectedEipsCount).length
        );
      });
    });
  });

  describe("on instanceHasEip", () => {
    describe("given instance without eip", () => {
      beforeEach(() => {
        handlers.drivers.http.get = async () => {
          return {
            data: testInstanceIdWithoutEip,
          };
        };
      });
      it("should return false", async () => {
        await expect(client.instanceHasEip()).resolves.toBeFalsy();
      });
    });
    describe("given instance with eip", () => {
      it("should return true", async () => {
        await expect(client.instanceHasEip()).resolves.toBeTruthy();
      });
    });
  });

  describe("on assignEiptoInstance", () => {
    const testEip: Eip = {
      id: "123",
      ip: "1.1.1.1",
    };
    it("should use correct AllocationId", async () => {
      try {
        await client.assignEiptoInstance(testEip);
      } catch (e) {}
      expect(ec2Mock.calls(0)[1].firstArg.input.AllocationId).toEqual(
        testEip.id
      );
    });
    it("should have AllowReassociation to false", async () => {
      try {
        await client.assignEiptoInstance(testEip);
      } catch (e) {}
      expect(
        ec2Mock.calls(0)[1].firstArg.input.AllowReassociation
      ).toBeDefined();
      expect(ec2Mock.calls(0)[1].firstArg.input.AllowReassociation).toBeFalsy();
    });
    it("should use correct NetworkInterfaceId", async () => {
      try {
        await client.assignEiptoInstance(testEip);
      } catch (e) {}
      expect(ec2Mock.calls(0)[1].firstArg.input.NetworkInterfaceId).toEqual(
        testInstancePrimaryNetworkInterfaceId
      );
    });
    it("should use correct PrivateIpAddress", async () => {
      try {
        await client.assignEiptoInstance(testEip);
      } catch (e) {}
      expect(ec2Mock.calls(0)[1].firstArg.input.PrivateIpAddress).toEqual(
        testInstancePrimaryNetworkInterfaceIp
      );
    });
  });

  function createHandlers(eips = testFreeEips): Handlers {
    ec2Mock = mockClient(new EC2Client({}));
    addDescribeAddressesCommand(
      ec2Mock,
      [
        {
          Name: "instance-id",
          Values: [testInstanceIdWithEip],
        },
      ],
      [{ AllocationId: testEipId, PublicIp: testEip }]
    );
    addDescribeAddressesCommand(
      ec2Mock,
      [
        {
          Name: "instance-id",
          Values: [testInstanceIdWithoutEip],
        },
      ],
      []
    );
    addDescribeAddressesCommand(
      ec2Mock,
      [
        {
          Name: `tag:${testAWSTagName}`,
          Values: [testAWSTagValue],
        },
      ],
      eips
    );
    addDescribeNetworkInterfacesCommand(
      ec2Mock,
      [
        {
          Name: `attachment.instance-id`,
          Values: [testInstanceIdWithEip],
        },
      ],
      testInstancePrimaryNetworkInterfaceId,
      testInstancePrimaryNetworkInterfaceIp
    );
    return {
      config: createMockConfig(),
      logger: createMockLogger(),
      drivers: {
        aws: {
          ec2: ec2Mock as unknown as EC2Client,
        },
        http: {
          get: async () => {
            return {
              data: testInstanceIdWithEip,
            };
          },
        },
      },
    };
  }

  function addDescribeAddressesCommand(
    mockClient: any,
    filters: any[],
    responseAddresses: any[]
  ) {
    mockClient
      .on(
        DescribeAddressesCommand,
        {
          Filters: filters,
        },
        true
      )
      .resolves({
        Addresses: responseAddresses,
      });
  }

  function addDescribeNetworkInterfacesCommand(
    mockClient: any,
    filters: any[],
    networkInterfaceId: string,
    networkInterfaceIp: string
  ) {
    mockClient
      .on(
        DescribeNetworkInterfacesCommand,
        {
          Filters: filters,
        },
        true
      )
      .resolves({
        NetworkInterfaces: [
          {
            NetworkInterfaceId: "i-12341343",
            PrivateIpAddress: "1.2.3.4",
          },
          {
            NetworkInterfaceId: networkInterfaceId,
            PrivateIpAddress: networkInterfaceIp,
            Association: {
              PublicIp: "13.421.41.1",
            },
          },
          {
            NetworkInterfaceId: "i-534643634",
            PrivateIpAddress: "4.5.6.7",
          },
        ],
      });
  }

  function createMockConfig(): Config {
    return {} as Config;
  }
});
