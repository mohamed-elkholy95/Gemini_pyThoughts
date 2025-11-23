// Circuit Breaker Unit Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerConfig } from '../../src/services/circuitBreaker.service.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  const defaultConfig: Partial<CircuitBreakerConfig> = {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 1000,
    monitoringWindow: 10000,
    volumeThreshold: 5,
  };

  beforeEach(() => {
    breaker = new CircuitBreaker('test-breaker', defaultConfig);
  });

  describe('Initial State', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
      expect(breaker.isHealthy()).toBe(true);
    });

    it('should have empty stats initially', () => {
      const stats = breaker.getStats();
      expect(stats.state).toBe('closed');
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('Successful Executions', () => {
    it('should execute function and return result', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should track successful executions', async () => {
      await breaker.execute(async () => 'ok');
      await breaker.execute(async () => 'ok');

      const stats = breaker.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.consecutiveSuccesses).toBe(2);
    });

    it('should emit success event', async () => {
      const successHandler = vi.fn();
      breaker.on('success', successHandler);

      await breaker.execute(async () => 'ok');

      expect(successHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-breaker',
          duration: expect.any(Number),
        })
      );
    });
  });

  describe('Failed Executions', () => {
    it('should propagate errors', async () => {
      await expect(
        breaker.execute(async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');
    });

    it('should track failed executions', async () => {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }

      const stats = breaker.getStats();
      expect(stats.failures).toBe(1);
      expect(stats.consecutiveFailures).toBe(1);
    });

    it('should emit failure event', async () => {
      const failureHandler = vi.fn();
      breaker.on('failure', failureHandler);

      try {
        await breaker.execute(async () => {
          throw new Error('test error');
        });
      } catch {
        // Expected
      }

      expect(failureHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-breaker',
          error: expect.any(Error),
          duration: expect.any(Number),
        })
      );
    });
  });

  describe('Circuit Opening', () => {
    it('should open after reaching failure threshold', async () => {
      // Need to hit volume threshold first
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('open');
      expect(breaker.isHealthy()).toBe(false);
    });

    it('should reject requests when open', async () => {
      breaker.forceOpen();

      await expect(breaker.execute(async () => 'ok')).rejects.toThrow(
        "Circuit breaker 'test-breaker' is open"
      );
    });

    it('should emit stateChange event when opening', async () => {
      const stateHandler = vi.fn();
      breaker.on('stateChange', stateHandler);

      // Force failures
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      expect(stateHandler).toHaveBeenCalledWith({
        name: 'test-breaker',
        from: 'closed',
        to: 'open',
      });
    });

    it('should emit rejected event when request is blocked', async () => {
      const rejectedHandler = vi.fn();
      breaker.on('rejected', rejectedHandler);
      breaker.forceOpen();

      try {
        await breaker.execute(async () => 'ok');
      } catch {
        // Expected
      }

      expect(rejectedHandler).toHaveBeenCalledWith({
        name: 'test-breaker',
        state: 'open',
      });
    });
  });

  describe('Half-Open State', () => {
    it('should transition to half-open after timeout', async () => {
      breaker.forceOpen();
      expect(breaker.getState()).toBe('open');

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Attempt to execute - should work in half-open
      const result = await breaker.execute(async () => 'test');
      expect(result).toBe('test');
      expect(breaker.getState()).toBe('half-open');
    });

    it('should close after success threshold in half-open', async () => {
      breaker.forceOpen();

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Execute success threshold times
      await breaker.execute(async () => 'ok');
      await breaker.execute(async () => 'ok');

      expect(breaker.getState()).toBe('closed');
    });

    it('should re-open on failure in half-open', async () => {
      breaker.forceOpen();

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // First request puts it in half-open
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }

      expect(breaker.getState()).toBe('open');
    });
  });

  describe('Force State Changes', () => {
    it('should allow forcing open', () => {
      breaker.forceOpen();
      expect(breaker.getState()).toBe('open');
    });

    it('should allow forcing closed', () => {
      breaker.forceOpen();
      breaker.forceClose();
      expect(breaker.getState()).toBe('closed');
    });

    it('should reset breaker state', () => {
      // Add some history
      breaker.execute(async () => 'ok').catch(() => {});
      breaker.forceOpen();

      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('Stats Accuracy', () => {
    it('should track last failure time', async () => {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }

      const stats = breaker.getStats();
      expect(stats.lastFailureTime).toBeInstanceOf(Date);
    });

    it('should track last success time', async () => {
      await breaker.execute(async () => 'ok');

      const stats = breaker.getStats();
      expect(stats.lastSuccessTime).toBeInstanceOf(Date);
    });

    it('should track consecutive successes and failures', async () => {
      await breaker.execute(async () => 'ok');
      await breaker.execute(async () => 'ok');

      let stats = breaker.getStats();
      expect(stats.consecutiveSuccesses).toBe(2);
      expect(stats.consecutiveFailures).toBe(0);

      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }

      stats = breaker.getStats();
      expect(stats.consecutiveSuccesses).toBe(0);
      expect(stats.consecutiveFailures).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup on destroy', () => {
      const stateHandler = vi.fn();
      breaker.on('stateChange', stateHandler);

      breaker.destroy();

      // Event listeners should be removed
      breaker.emit('stateChange', {});
      expect(stateHandler).not.toHaveBeenCalled();
    });
  });
});
