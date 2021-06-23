import { Handlers, Client } from ".";
import { Config } from "../config";
import { createMockLogger } from "../mocks/logger";

describe("aws", () => {
  const testInstanceId = "i-123456789";

  let handlers: Handlers;

  beforeEach(() => {
    handlers = createHandlers();
  });

  it("should be created", () => {
    new Client(handlers);
  });

  describe("on getInstanceId", () => {
    let client: Client;

    beforeEach(() => {
      client = new Client(handlers);
    });

    it("should http with correct url", async () => {
      const expectedUrl = "http://169.254.169.254/latest/meta-data/instance-id";
      let actualUrl = "";
      handlers.drivers.http.get = async (url: string) => {
        actualUrl = url;
        return testInstanceId;
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
      await expect(client.getInstanceId()).resolves.toBe(testInstanceId);
    });
  });

  function createHandlers(): Handlers {
    return {
      config: createMockConfig(),
      logger: createMockLogger(),
      drivers: {
        aws: {},
        http: {
          get: async () => {
            return {
              data: testInstanceId,
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
