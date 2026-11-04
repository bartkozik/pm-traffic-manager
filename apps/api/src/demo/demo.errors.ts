export class DemoError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); }
}
