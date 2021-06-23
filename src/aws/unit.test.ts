import { Handlers, Client } from ".";
import { Config } from "../config";
import { createMockLogger } from "../mocks/logger";

import { EC2Client, DescribeAddressesCommand } from "@aws-sdk/client-ec2";
import { mockClient } from "aws-sdk-client-mock";

describe("aws", () => {
  const testInstanceIdWithEip = "i-123456789";
  const testInstanceIdWithoutEip = "i-987654321";
  const testEipId = "eipalloc-12431553";
  const testEip = "1.2.3.4";

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

  function createHandlers(): Handlers {
    ec2Mock = mockClient(new EC2Client({}));
    ec2Mock
      .on(
        DescribeAddressesCommand,
        {
          Filters: [
            {
              Name: "instance-id",
              Values: [testInstanceIdWithEip],
            },
          ],
        },
        true
      )
      .resolves({
        Addresses: [{ AllocationId: testEipId, PublicIp: testEip }],
      })
      .on(
        DescribeAddressesCommand,
        {
          Filters: [
            {
              Name: "instance-id",
              Values: [testInstanceIdWithoutEip],
            },
          ],
        },
        true
      )
      .resolves({
        Addresses: [],
      });
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

  function createMockConfig(): Config {
    return {} as Config;
  }
});
