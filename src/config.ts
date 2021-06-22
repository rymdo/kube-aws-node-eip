const developmentNodeName = "node-development-1";

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

function isDevelopment(): boolean {
  const development = getEnvOrDefault("DEVELOPMENT", "false");
  if (development === "true") {
    return true;
  }
  return false;
}

export interface Config {
  development: boolean;
  log_level: string;
  node_name: string;
}

export const config: Config = {
  development: isDevelopment(),
  log_level: getEnvOrDefault("LOG_LEVEL", "info"),
  node_name: !isDevelopment() ? getEnvOrFail("NODE_NAME") : developmentNodeName,
};
