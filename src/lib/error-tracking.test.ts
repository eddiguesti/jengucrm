import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  captureError,
  captureMessage,
  setUser,
  addBreadcrumb,
  withErrorTracking,
} from './error-tracking';

// Mock the logger
vi.mock('./logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Error Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('captureError', () => {
    it('should log error with context', async () => {
      const { logger } = await import('./logger');
      const error = new Error('Test error');

      captureError(error, { action: 'test', userId: '123' });

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('captureMessage', () => {
    it('should log info message by default', async () => {
      const { logger } = await import('./logger');

      captureMessage('Test message');

      expect(logger.info).toHaveBeenCalled();
    });

    it('should log warning when specified', async () => {
      const { logger } = await import('./logger');

      captureMessage('Warning message', 'warning');

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should log error when specified', async () => {
      const { logger } = await import('./logger');

      captureMessage('Error message', 'error');

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('setUser', () => {
    it('should log user context', async () => {
      const { logger } = await import('./logger');

      setUser('user-123');

      expect(logger.info).toHaveBeenCalledWith(
        { userId: 'user-123' },
        'User context set'
      );
    });

    it('should handle null user', async () => {
      const { logger } = await import('./logger');

      setUser(null);

      // Should not log when user is null
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('addBreadcrumb', () => {
    it('should log breadcrumb', async () => {
      const { logger } = await import('./logger');

      addBreadcrumb('User clicked button', 'ui', { button: 'submit' });

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('withErrorTracking', () => {
    it('should return result on success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const tracked = withErrorTracking(fn);

      const result = await tracked();

      expect(result).toBe('success');
    });

    it('should capture and rethrow errors', async () => {
      const { logger } = await import('./logger');
      const error = new Error('Function failed');
      const fn = vi.fn().mockRejectedValue(error);
      const tracked = withErrorTracking(fn, { action: 'test' });

      await expect(tracked()).rejects.toThrow('Function failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
