export class SnapYTError extends Error {
  constructor(code, message, { status, stage } = {}) {
    super(message);
    this.name = 'SnapYTError';
    this.code = code;
    if (status !== undefined) this.status = status;
    if (stage !== undefined) this.stage = stage;
  }
}
