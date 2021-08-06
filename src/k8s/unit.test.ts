import { Handlers, Client, Taint } from ".";
import { Config } from "../config";
import { createMockLogger } from "../mocks/logger";

describe("k8s", () => {
  const testNodeName = "node-1234";
  const testLabels = {
    "node-type": "abc",
    "kubernetes.io/arch": "amd64",
  };

  let handlers: Handlers;
  let client: Client;

  beforeEach(() => {
    handlers = createHandlers();
    client = new Client(handlers);
  });

  describe("on getLabels", () => {
    it("should use correct node name", async () => {
      let actualNodeName = "";
      handlers.drivers.k8s.api.v1.node = (name: string) => {
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
      await client.getNodeLabels();
      expect(actualNodeName).toBe(testNodeName);
    });

    it("should throw error on node not found", async () => {
      const name = "non-existing-node-123";
      handlers.config.nodeName = name;
      await expect(client.getNodeLabels()).rejects.toThrowError(
        `node "${name}" not found`
      );
    });

    it("should return labels on node found", async () => {
      await expect(client.getNodeLabels()).resolves.toBe(testLabels);
    });
  });

  describe("on nodeHasTaint", () => {
    const testTaint: Taint = {
      key: "testKey1",
      value: "testValue1",
      effect: "NoSchedule",
    };
    describe("given no taints", () => {
      it("should return false", async () => {
        await expect(client.nodeHasTaint(testTaint)).resolves.toBeFalsy();
      });
    });
    describe("given taint not added", () => {
      const taints: Taint[] = [
        {
          key: "testKeyEx1",
          value: "testValueEx1",
          effect: "NoSchedule",
        },
        {
          key: "testKeyEx2",
          value: "testValueEx2",
          effect: "NoSchedule",
        },
      ];
      it("should return false", async () => {
        handlers.drivers.k8s.api.v1.node = () => {
          return {
            get: async () => {
              return {
                body: {
                  metadata: {
                    labels: {},
                  },
                  spec: {
                    taints,
                  },
                },
              };
            },
          };
        };
        await expect(client.nodeHasTaint(testTaint)).resolves.toBeFalsy();
      });
    });
    describe("given taint added", () => {
      const taints: Taint[] = [
        {
          key: "testKeyIn1",
          value: "testValueIn1",
          effect: "NoSchedule",
        },
        {
          key: "testKeyIn2",
          value: "testValueIn2",
          effect: "NoSchedule",
        },
        testTaint,
      ];
      it("should return true", async () => {
        handlers.drivers.k8s.api.v1.node = () => {
          return {
            get: async () => {
              return {
                body: {
                  metadata: {
                    labels: {},
                  },
                  spec: {
                    taints,
                  },
                },
              };
            },
          };
        };
        await expect(client.nodeHasTaint(testTaint)).resolves.toBeTruthy();
      });
    });
  });

  describe("on addNodeTaint", () => {
    const testTaint: Taint = {
      key: "testKey1",
      value: "testValue1",
      effect: "NoSchedule",
    };
    it("should call exec with correct command", async () => {
      let actualCommand = "";
      handlers.drivers.exec = async (command) => {
        actualCommand = command;
        return "";
      };
      await client.addNodeTaint(testTaint);
      expect(actualCommand).toBe(
        `kubectl taint nodes ${testNodeName} ${testTaint.key}=${testTaint.value}:${testTaint.effect}`
      );
    });
  });

  describe("on removeNodeTaint", () => {
    const testTaint: Taint = {
      key: "testKey1",
      value: "testValue1",
      effect: "NoSchedule",
    };
    it("should call exec with correct command", async () => {
      let actualCommand = "";
      handlers.drivers.exec = async (command) => {
        actualCommand = command;
        return "";
      };
      await client.removeNodeTaint(testTaint);
      expect(actualCommand).toBe(
        `kubectl taint nodes ${testNodeName} ${testTaint.key}=${testTaint.value}:${testTaint.effect}-`
      );
    });
  });

  function createHandlers(): Handlers {
    return {
      config: createMockConfig(),
      logger: createMockLogger(),
      drivers: {
        k8s: {
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
        exec: async () => "",
      },
    };
  }

  function createMockConfig(): Config {
    return {
      nodeName: testNodeName,
    } as Config;
  }
});
