export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const missing = () => new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
