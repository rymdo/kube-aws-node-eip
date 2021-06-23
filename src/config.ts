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
  aws: {
    region: string;
  };
}

export const config: Config = {
  logLevel: getEnvOrDefault("LOG_LEVEL", "info"),
  nodeName: getEnvOrFail("NODE_NAME"),
  aws: {
    region: getEnvOrFail("AWS_REGION"),
  },
};
