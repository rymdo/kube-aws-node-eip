export function createMockLogger() {
  return {
    info: (message: string, ...meta: any[]) => {},
    warn: (message: string, ...meta: any[]) => {},
    error: (message: string, ...meta: any[]) => {},
    debug: (message: string, ...meta: any[]) => {},
  };
}
