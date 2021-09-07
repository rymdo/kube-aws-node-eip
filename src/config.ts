function getEnvOrDefault(env: string, defaultValue: string): string {
  return process.env[`${env}`] || defaultValue;
}

function getEnvOrFail(env: string): string {
  const result = process.env[`${env}`];
  if (!result) {
    throw new Error(`environment variable '${env}' not set`);
  }
  return result;
}

export interface Config {
  logLevel: string;
  nodeName: string;
  checkInterval: number;
  aws: {
    region: string;
  };
  metrics: {
    port: number;
  };
}

export const config: Config = {
  logLevel: getEnvOrDefault("LOG_LEVEL", "info"),
  nodeName: getEnvOrFail("NODE_NAME"),
  checkInterval: Number(getEnvOrDefault("CHECK_INTERVAL", "60")),
  aws: {
    region: getEnvOrFail("AWS_REGION"),
  },
  metrics: {
    port: Number(getEnvOrDefault("METRICS_PORT", "9100")),
  },
};
