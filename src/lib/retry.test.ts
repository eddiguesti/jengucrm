import { describe, it, expect, vi } from 'vitest';
import { retry, RetryOptions, retryable } from './retry';

describe('retry', () => {
  it('should return result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await retry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await retry(fn, { attempts: 3, delay: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      retry(fn, { attempts: 3, delay: 10 })
    ).rejects.toThrow('always fails');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('not retryable'));

    const options: RetryOptions = {
      attempts: 3,
      delay: 10,
      isRetryable: (error) => !(error instanceof Error && error.message.includes('not retryable')),
    };

    await expect(retry(fn, options)).rejects.toThrow('not retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const onRetry = vi.fn();

    await retry(fn, { attempts: 2, delay: 10, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
  });
});

describe('retryable', () => {
  describe('networkErrors', () => {
    it('should return true for network errors', () => {
      expect(retryable.networkErrors(new Error('fetch failed'))).toBe(true);
      expect(retryable.networkErrors(new Error('ECONNRESET'))).toBe(true);
      expect(retryable.networkErrors(new Error('ETIMEDOUT'))).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(retryable.networkErrors(new Error('validation failed'))).toBe(false);
      expect(retryable.networkErrors('not an error')).toBe(false);
    });
  });

  describe('httpStatus', () => {
    it('should return true for rate limit', () => {
      expect(retryable.httpStatus(429)).toBe(true);
    });

    it('should return true for 5xx errors', () => {
      expect(retryable.httpStatus(500)).toBe(true);
      expect(retryable.httpStatus(502)).toBe(true);
      expect(retryable.httpStatus(503)).toBe(true);
    });

    it('should return false for success', () => {
      expect(retryable.httpStatus(200)).toBe(false);
      expect(retryable.httpStatus(201)).toBe(false);
    });

    it('should return false for 4xx (except 429)', () => {
      expect(retryable.httpStatus(400)).toBe(false);
      expect(retryable.httpStatus(404)).toBe(false);
    });
  });
});
