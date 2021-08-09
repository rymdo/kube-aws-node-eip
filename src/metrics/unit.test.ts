import { Config } from "../config";
import { createMockLogger } from "../mocks/logger";
import { Handlers, Server } from ".";

import * as AWS from "../aws";

class MockGauge {
  public mockCurrentLabels = {};
  public mockCurrentValue = 0;
  constructor(
    public config: { name: string; help: string; labelNames?: string[] }
  ) {}
  set(labels: { [label: string]: string }, value: number) {
    this.mockCurrentLabels = labels;
    this.mockCurrentValue = value;
  }
  reset() {}
}

describe("metrics", () => {
  const testConfigPort = 9100;
  const testEip = "123.0.1.3";

  let handlers: Handlers;
  let server: Server;

  beforeEach(() => {
    handlers = createHandlers();
    server = new Server(handlers);
  });

  it("should setup get route on '/metrics'", () => {
    let acutalPath = "";
    handlers.drivers.http.get = (path: string) => {
      acutalPath = path;
    };
    new Server(handlers);
    expect(acutalPath).toBe("/metrics");
  });

  it("should listen on configured port", () => {
    let acutalPort = 0;
    handlers.drivers.http.listen = (port: number) => {
      acutalPort = port;
    };
    new Server(handlers);
    expect(acutalPort).toBe(testConfigPort);
  });

  it("should create hasEip gauge with correct name", () => {
    const metricBridgedCallsCount = server.gaugeHasEip as MockGauge;
    expect(metricBridgedCallsCount.config.name).toEqual("node_has_eip");
  });

  it("should create hasEip gauge with correct help test", () => {
    const metricBridgedCallsCount = server.gaugeHasEip as MockGauge;
    expect(metricBridgedCallsCount.config.help).toEqual(
      "indicates if node has assigned eip"
    );
  });

  it("should create hasEip gauge with correct labels", () => {
    const metricBridgedCallsCount = server.gaugeHasEip as MockGauge;
    expect(
      metricBridgedCallsCount.config.labelNames.includes("eip")
    ).toBeTruthy();
  });

  describe("on getMetrics call", () => {
    it("should set Content-Header with correct value", async () => {
      const expectedSetFieldName = "Content-Header";
      const expectedSetFieldValue = "test-contentType";
      let actualSetFieldName;
      let actualSetFieldValue;
      handlers.drivers.prometheus.register.contentType = expectedSetFieldValue;
      const res = {
        set: (field, value) => {
          actualSetFieldName = field;
          actualSetFieldValue = value;
        },
        end: () => {},
      };
      await server.getMetrics({}, res);
      expect(actualSetFieldName).toEqual(expectedSetFieldName);
      expect(actualSetFieldValue).toEqual(expectedSetFieldValue);
    });

    it("should call end with correct callback data", async () => {
      const expectedEndChunk = { data: "somedata" };
      let actualEndChunk;
      handlers.drivers.prometheus.register.metrics = () => expectedEndChunk;
      const res = {
        set: () => {},
        end: (chunk) => {
          actualEndChunk = chunk;
        },
      };
      await server.getMetrics({}, res);
      expect(actualEndChunk).toEqual(expectedEndChunk);
    });

    it("should reset metrics", async () => {
      let resetMetricsCalled = false;
      handlers.drivers.prometheus.register.resetMetrics = () => {
        resetMetricsCalled = true;
      };
      const res = {
        set: () => {},
        end: () => {},
      };
      await server.getMetrics({}, res);
      expect(resetMetricsCalled).toBeTruthy();
    });

    describe("given node has eip", () => {
      it("should set correct labels for hasEip gauge", async () => {
        const res = {
          set: () => {},
          end: () => {},
        };
        await server.getMetrics({}, res);
        const gauge = server.gaugeHasEip as MockGauge;
        expect(gauge.mockCurrentLabels["eip"]).toEqual(testEip);
      });
      it("should set correct status for hasEip gauge", async () => {
        const res = {
          set: () => {},
          end: () => {},
        };
        await server.getMetrics({}, res);
        const gauge = server.gaugeHasEip as MockGauge;
        expect(gauge.mockCurrentValue).toEqual(1);
      });
    });

    describe("given node has no eip", () => {
      beforeEach(() => {
        handlers.drivers.aws.getInstanceEip = async () => {
          throw new Error("no eip");
        };
      });

      it("should set correct labels for hasEip gauge", async () => {
        const res = {
          set: () => {},
          end: () => {},
        };
        await server.getMetrics({}, res);
        const gauge = server.gaugeHasEip as MockGauge;
        expect(gauge.mockCurrentLabels["eip"]).toEqual("no-eip");
      });
      it("should set correct status for hasEip gauge", async () => {
        const res = {
          set: () => {},
          end: () => {},
        };
        await server.getMetrics({}, res);
        const gauge = server.gaugeHasEip as MockGauge;
        expect(gauge.mockCurrentValue).toEqual(0);
      });
    });
  });

  function createHandlers(): Handlers {
    return {
      config: createMockConfig(),
      logger: createMockLogger(),
      drivers: {
        http: {
          get: () => {},
          listen: () => {},
        },
        prometheus: {
          register: {
            contentType: "test-type",
            metrics: () => {},
            resetMetrics: () => {},
          },
          Gauge: MockGauge,
        },
        aws: {
          getInstanceEip: async () => {
            return {
              id: "",
              ip: testEip,
            };
          },
        } as AWS.Interface,
      },
    };
  }

  function createMockConfig(): Config {
    return {
      metrics: {
        port: testConfigPort,
      },
    } as Config;
  }
});
