export class PersistenceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}

export class PersistenceValidationError extends PersistenceError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "PersistenceValidationError";
  }
}

export class UnsupportedBackupVersionError extends PersistenceValidationError {
  constructor(schemaVersion: number) {
    super(`Unsupported backup schema version: ${schemaVersion}`);
    this.name = "UnsupportedBackupVersionError";
  }
}
