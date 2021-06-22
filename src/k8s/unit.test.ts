import { Handlers, Client } from ".";
import { Config } from "../config";

describe("k8s", () => {
  const testNodeName = "node-1234";
  const testLabels = {
    "node-type": "abc",
    "kubernetes.io/arch": "amd64",
  };

  let handlers: Handlers;

  beforeEach(() => {
    handlers = createHandlers();
  });

  it("should be created", () => {
    new Client(handlers);
  });

  describe("on getLabels", () => {
    let client: Client;

    beforeEach(() => {
      client = new Client(handlers);
    });

    it("should use correct node name", async () => {
      let actualNodeName = "";
      handlers.driver.api.v1.node = (name: string) => {
        actualNodeName = name;
        return {
          get: async () => {
            return {
              body: {
                metadata: {
                  labels: {},
                },
              },
            };
          },
        };
      };
      await client.getLabels();
      expect(actualNodeName).toBe(testNodeName);
    });

    it("should throw error on node not found", async () => {
      const name = "non-existing-node-123";
      handlers.config.node_name = name;
      await expect(client.getLabels()).rejects.toThrowError(
        `node "${name}" not found`
      );
    });

    it("should return labels on node found", async () => {
      await expect(client.getLabels()).resolves.toBe(testLabels);
    });
  });

  function createHandlers(): Handlers {
    return {
      config: createMockConfig(),
      logger: createMockLogger(),
      driver: {
        api: {
          v1: {
            node: (name: string) => {
              if (name !== testNodeName) {
                throw new Error(`nodes "${name}" not found`);
              }
              return {
                get: async () => {
                  return {
                    body: {
                      metadata: {
                        labels: testLabels,
                      },
                    },
                  };
                },
              };
            },
          },
        },
      },
    };
  }

  function createMockConfig(): Config {
    return {
      development: false,
      log_level: "info",
      node_name: testNodeName,
    };
  }

  function createMockLogger() {
    return {
      info: (message: string, ...meta: any[]) => {},
      warn: (message: string, ...meta: any[]) => {},
      error: (message: string, ...meta: any[]) => {},
      debug: (message: string, ...meta: any[]) => {},
    };
  }
});
