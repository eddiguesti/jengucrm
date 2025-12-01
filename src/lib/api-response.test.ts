import { describe, it, expect } from 'vitest';
import { success, errors, ApiResponse } from './api-response';

describe('API Response Helpers', () => {
  describe('success', () => {
    it('should return 200 by default', () => {
      const response = success({ test: 'data' });
      expect(response.status).toBe(200);
    });

    it('should allow custom status code', () => {
      const response = success({ created: true }, 201);
      expect(response.status).toBe(201);
    });

    it('should wrap data in success response', async () => {
      const response = success({ foo: 'bar' });
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.foo).toBe('bar');
    });

    it('should set content-type header', () => {
      const response = success({});
      expect(response.headers.get('content-type')).toContain('application/json');
    });
  });

  describe('errors', () => {
    describe('badRequest', () => {
      it('should return 400', () => {
        const response = errors.badRequest('Invalid input');
        expect(response.status).toBe(400);
      });

      it('should include error message', async () => {
        const response = errors.badRequest('Missing field');
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error).toBe('Missing field');
      });
    });

    describe('unauthorized', () => {
      it('should return 401', () => {
        const response = errors.unauthorized();
        expect(response.status).toBe(401);
      });

      it('should have default message', async () => {
        const response = errors.unauthorized();
        const body = await response.json();
        expect(body.error).toBe('Unauthorized');
      });
    });

    describe('notFound', () => {
      it('should return 404', () => {
        const response = errors.notFound('Resource not found');
        expect(response.status).toBe(404);
      });

      it('should include custom message', async () => {
        const response = errors.notFound('Campaign not found');
        const body = await response.json();
        expect(body.error).toBe('Campaign not found');
      });
    });

    describe('internal', () => {
      it('should return 500', () => {
        const response = errors.internal('Database error');
        expect(response.status).toBe(500);
      });

      it('should include errorId for tracking', async () => {
        const response = errors.internal('Server error');
        const body = await response.json();
        expect(body.errorId).toBeDefined();
        expect(typeof body.errorId).toBe('string');
      });
    });

    describe('tooManyRequests', () => {
      it('should return 429', () => {
        const response = errors.tooManyRequests();
        expect(response.status).toBe(429);
      });

      it('should have default message', async () => {
        const response = errors.tooManyRequests();
        const body = await response.json();
        expect(body.error).toBe('Too many requests');
      });
    });

    describe('forbidden', () => {
      it('should return 403', () => {
        const response = errors.forbidden();
        expect(response.status).toBe(403);
      });
    });
  });
});

describe('ApiResponse type', () => {
  it('should type check success response', () => {
    const response: ApiResponse<{ id: string }> = {
      success: true,
      data: { id: '123' },
    };
    expect(response.success).toBe(true);
  });

  it('should type check error response', () => {
    const response: ApiResponse<never> = {
      success: false,
      error: 'Something went wrong',
    };
    expect(response.success).toBe(false);
  });
});
