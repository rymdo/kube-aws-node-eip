import { config } from "./config";

export interface LoggerInterface {
  info: (message: string, ...meta: any[]) => void;
  warn: (message: string, ...meta: any[]) => void;
  error: (message: string, ...meta: any[]) => void;
  debug: (message: string, ...meta: any[]) => void;
}

export function createLogger(): LoggerInterface {
  const winston = require("winston");
  return winston.createLogger({
    level: config.log_level,
    format: winston.format.combine(
      winston.format.timestamp({
        format: "YYYY-MM-DD HH:mm:ss",
      }),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console({ format: winston.format.json() }),
    ],
  });
}
