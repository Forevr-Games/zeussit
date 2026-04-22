export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(ctx: Record<string, unknown>): Logger;
}
export const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
};
