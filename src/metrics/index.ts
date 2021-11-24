import { Config } from "../config";
import { LoggerInterface } from "../logger";
import {
  Gauge,
  HttpInterface,
  HttpReq,
  HttpRes,
  PrometheusInterface,
} from "./type";

import * as AWS from "../aws";

export interface Handlers {
  config: Config;
  logger: LoggerInterface;
  drivers: {
    http: HttpInterface;
    prometheus: PrometheusInterface;
    aws: AWS.Interface;
  };
}

export interface Interface {}

export class Server implements Interface {
  public gaugeHasEip: Gauge;
  public path = "/metrics";

  instanceId = "";
  instanceEip = "";

  constructor(protected handlers: Handlers) {
    const { logger, config, drivers } = handlers;

    logger.info(
      `metrics: starting server on '${this.path}' with port '${config.metrics.port}'`
    );

    this.gaugeHasEip = new drivers.prometheus.Gauge({
      name: "node_has_eip",
      help: "indicates if node has assigned eip",
      labelNames: ["eip", "instance_id"],
    });

    drivers.http.get(this.path, this.getMetrics);
    drivers.http.listen(config.metrics.port);
  }

  getMetrics = async (req: HttpReq, res: HttpRes): Promise<void> => {
    await this.resetMetrics();
    await this.updateMetrics();
    await this.setResponse(res);
  };

  private async resetMetrics(): Promise<void> {
    const { drivers } = this.handlers;
    drivers.prometheus.register.resetMetrics();
  }

  private async updateMetrics(): Promise<void> {
    const { drivers } = this.handlers;
    if (this.instanceId === "") {
      this.instanceId = await drivers.aws.getInstanceId();
    }
    try {
      if (this.instanceEip === "") {
        const eip = await drivers.aws.getInstanceEip();
        this.instanceEip = eip.ip;
      }
      this.gaugeHasEip.set(
        { instance_id: this.instanceId, eip: this.instanceEip },
        1
      );
    } catch (e) {
      this.gaugeHasEip.set({ instance_id: this.instanceId, eip: "no-eip" }, 0);
    }
  }

  private async setResponse(res: HttpRes) {
    const { drivers, logger } = this.handlers;
    res.set("Content-Header", drivers.prometheus.register.contentType);
    const metrics = await drivers.prometheus.register.metrics();
    logger.debug(`metrics: setResponse '${JSON.stringify(metrics)}'`);
    res.end(metrics);
  }
}
