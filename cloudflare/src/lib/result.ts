/**
 * Result Pattern
 *
 * A functional approach to error handling that makes failure states explicit.
 * Use this for operations that can fail in expected ways (recoverable errors).
 *
 * Benefits:
 * - Forces callers to handle both success and failure cases
 * - No exceptions for expected error conditions
 * - Better TypeScript inference for success/error types
 * - Composable with map, flatMap, etc.
 */

// ==================
// CORE TYPES
// ==================

/**
 * Success result containing data
 */
export interface Ok<T> {
  readonly success: true;
  readonly data: T;
}

/**
 * Failure result containing error
 */
export interface Err<E> {
  readonly success: false;
  readonly error: E;
}

/**
 * Result type - either success with data or failure with error
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

// ==================
// CONSTRUCTORS
// ==================

/**
 * Create a success result
 */
export function ok<T>(data: T): Ok<T> {
  return { success: true, data };
}

/**
 * Create a failure result
 */
export function err<E>(error: E): Err<E> {
  return { success: false, error };
}

// ==================
// TYPE GUARDS
// ==================

/**
 * Check if result is success
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.success === true;
}

/**
 * Check if result is failure
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.success === false;
}

// ==================
// TRANSFORMERS
// ==================

/**
 * Map over a success result
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U
): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.data));
  }
  return result;
}

/**
 * Map over a failure result
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chain results (flatMap)
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.data);
  }
  return result;
}

/**
 * Provide a default value for failure
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.data;
  }
  return defaultValue;
}

/**
 * Provide a default value using a function for failure
 */
export function unwrapOrElse<T, E>(
  result: Result<T, E>,
  fn: (error: E) => T
): T {
  if (isOk(result)) {
    return result.data;
  }
  return fn(result.error);
}

/**
 * Get value or throw error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.data;
  }
  throw result.error;
}

/**
 * Get error or throw if success
 */
export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (isErr(result)) {
    return result.error;
  }
  throw new Error('Called unwrapErr on Ok result');
}

// ==================
// ASYNC UTILITIES
// ==================

/**
 * Wrap a promise in a Result
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  errorMapper?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return ok(data);
  } catch (error) {
    if (errorMapper) {
      return err(errorMapper(error));
    }
    return err(error as E);
  }
}

/**
 * Wrap a synchronous function that might throw in a Result
 */
export function fromTry<T, E = Error>(
  fn: () => T,
  errorMapper?: (error: unknown) => E
): Result<T, E> {
  try {
    const data = fn();
    return ok(data);
  } catch (error) {
    if (errorMapper) {
      return err(errorMapper(error));
    }
    return err(error as E);
  }
}

/**
 * Async map over a success result
 */
export async function mapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Promise<U>
): Promise<Result<U, E>> {
  if (isOk(result)) {
    return ok(await fn(result.data));
  }
  return result;
}

/**
 * Async chain results
 */
export async function flatMapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> {
  if (isOk(result)) {
    return fn(result.data);
  }
  return result;
}

// ==================
// COLLECTION UTILITIES
// ==================

/**
 * Collect an array of results into a result of array
 * Returns first error if any result is a failure
 */
export function collect<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];

  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.data);
  }

  return ok(values);
}

/**
 * Partition results into successes and failures
 */
export function partition<T, E>(
  results: Result<T, E>[]
): { successes: T[]; failures: E[] } {
  const successes: T[] = [];
  const failures: E[] = [];

  for (const result of results) {
    if (isOk(result)) {
      successes.push(result.data);
    } else {
      failures.push(result.error);
    }
  }

  return { successes, failures };
}

/**
 * Get all successes, ignoring failures
 */
export function filterOk<T, E>(results: Result<T, E>[]): T[] {
  return results.filter(isOk).map((r) => r.data);
}

/**
 * Get all failures, ignoring successes
 */
export function filterErr<T, E>(results: Result<T, E>[]): E[] {
  return results.filter(isErr).map((r) => r.error);
}

// ==================
// MATCH UTILITY
// ==================

/**
 * Pattern match on a result
 */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (data: T) => U;
    err: (error: E) => U;
  }
): U {
  if (isOk(result)) {
    return handlers.ok(result.data);
  }
  return handlers.err(result.error);
}

/**
 * Async pattern match on a result
 */
export async function matchAsync<T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (data: T) => Promise<U>;
    err: (error: E) => Promise<U>;
  }
): Promise<U> {
  if (isOk(result)) {
    return handlers.ok(result.data);
  }
  return handlers.err(result.error);
}

// ==================
// VALIDATION HELPERS
// ==================

/**
 * Validate a value with a predicate
 */
export function validate<T, E>(
  value: T,
  predicate: (value: T) => boolean,
  error: E
): Result<T, E> {
  if (predicate(value)) {
    return ok(value);
  }
  return err(error);
}

/**
 * Combine validation results (all must pass)
 */
export function combineValidations<T, E>(
  validations: Result<T, E>[]
): Result<T[], E[]> {
  const { successes, failures } = partition(validations);

  if (failures.length > 0) {
    return err(failures);
  }

  return ok(successes);
}
