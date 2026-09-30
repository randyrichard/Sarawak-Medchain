/**
 * The one shape every service uses to refuse a request.
 *
 * Each module still names its own error (IncidentError, PermitError, ...), so a stack trace
 * and an `instanceof` check in a test say where a refusal came from. What they share is
 * this base, and the central error handler in app.ts answers any DomainError with its
 * status and code. Before this, the handler listed all twenty-three classes by hand, and a
 * service added without also being added there would have had every 403 and 404 it raised
 * reported to the caller as a 500.
 *
 * Not for internal faults - a mail provider rejecting a message, a secret failing to
 * decrypt. Those are not the caller's to see and stay plain Errors.
 */
export abstract class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}
