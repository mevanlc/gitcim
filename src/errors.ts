/** An error carrying the process exit code the CLI should use. */
export class GitcimError extends Error {
  readonly code: number;

  constructor(message: string, code = 1) {
    super(message);
    this.name = 'GitcimError';
    this.code = code;
  }
}
