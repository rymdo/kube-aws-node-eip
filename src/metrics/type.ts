export interface HttpInterface {
  get: (
    path: string,
    callback?: (req: HttpReq, res: HttpRes) => Promise<void>
  ) => void;
  listen: (port: number, callback?: (...args: any[]) => void) => void;
}

export interface Gauge {
  set: (labels: { [label: string]: string }, value: number) => void;
  reset: () => void;
}

export interface GaugeInterface {
  new (config: { name: string; help: string; labelNames?: string[] }): Gauge;
}

export interface PrometheusInterface {
  register: {
    contentType: any;
    metrics: () => any;
    resetMetrics: () => void;
  };
  Gauge: GaugeInterface;
}

export interface HttpReq {}
export interface HttpRes {
  set: (field: any, value?: string | string[]) => void;
  end: (chunk: any) => void;
}
