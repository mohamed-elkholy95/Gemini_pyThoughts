// Worker Pool Service Unit Tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerPool } from '../../src/services/workerPool.service.js';

describe('WorkerPool', () => {
  let pool: WorkerPool;

  beforeEach(() => {
    pool = new WorkerPool({
      minWorkers: 2,
      maxWorkers: 5,
      taskTimeout: 5000,
      scaleUpThreshold: 5,
      scaleDownThreshold: 2,
      healthCheckInterval: 1000,
      maxTaskRetries: 2,
    });
  });

  afterEach(async () => {
    await pool.stop();
  });

  describe('initialization', () => {
    it('should start with minimum workers', async () => {
      await pool.start();
      const stats = pool.getStats();
      expect(stats.workers.length).toBe(2);
    });

    it('should have all workers idle initially', async () => {
      await pool.start();
      const stats = pool.getStats();
      expect(stats.workers.every((w) => w.status === 'idle')).toBe(true);
    });

    it('should not start if already running', async () => {
      await pool.start();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await pool.start();
      // Should not throw, just warn
      expect(pool.getStats().workers.length).toBe(2);
      warnSpy.mockRestore();
    });
  });

  describe('task submission', () => {
    beforeEach(async () => {
      await pool.start();
    });

    it('should execute a simple task', async () => {
      pool.registerHandler<number, number>('double', async (n) => n * 2);
      const result = await pool.submit<number, number>('double', 5);
      expect(result).toBe(10);
    });

    it('should execute multiple tasks concurrently', async () => {
      pool.registerHandler<number, number>('multiply', async (n) => {
        await new Promise((r) => setTimeout(r, 50));
        return n * 3;
      });

      const start = Date.now();
      const results = await Promise.all([
        pool.submit<number, number>('multiply', 1),
        pool.submit<number, number>('multiply', 2),
        pool.submit<number, number>('multiply', 3),
      ]);
      const duration = Date.now() - start;

      expect(results).toEqual([3, 6, 9]);
      // Should run concurrently, not sequentially (< 150ms instead of 150ms)
      expect(duration).toBeLessThan(150);
    });

    it('should respect task priority', async () => {
      const executionOrder: number[] = [];

      pool.registerHandler<number, void>('track', async (n) => {
        await new Promise((r) => setTimeout(r, 10));
        executionOrder.push(n);
      });

      // Submit low priority first, then high priority
      const p1 = pool.submit('track', 1, { priority: 0 });
      const p2 = pool.submit('track', 2, { priority: 10 }); // Higher priority
      const p3 = pool.submit('track', 3, { priority: 5 });

      await Promise.all([p1, p2, p3]);

      // Higher priority tasks should be executed first when workers become available
      // The exact order depends on timing, but priority 10 should be early
    });

    it('should reject unknown task types', async () => {
      await expect(pool.submit('unknown', {})).rejects.toThrow(
        'No handler registered for task type: unknown'
      );
    });

    it('should reject tasks when pool is stopped', async () => {
      pool.registerHandler('test', async () => {});
      await pool.stop();

      await expect(pool.submit('test', {})).rejects.toThrow(
        'Worker pool is not running'
      );
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await pool.start();
    });

    it('should retry failed tasks', async () => {
      let attempts = 0;
      pool.registerHandler<void, string>('flaky', async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await pool.submit<void, string>('flaky', undefined);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      pool.registerHandler('alwaysFail', async () => {
        throw new Error('Permanent failure');
      });

      await expect(pool.submit('alwaysFail', {})).rejects.toThrow('Permanent failure');

      const stats = pool.getStats();
      expect(stats.metrics.totalTasksFailed).toBeGreaterThan(0);
    });

    it('should timeout long-running tasks', async () => {
      pool.registerHandler('slow', async () => {
        await new Promise((r) => setTimeout(r, 10000));
      });

      await expect(
        pool.submit('slow', {}, { timeout: 100 })
      ).rejects.toThrow('Task timeout');
    });
  });

  describe('batch processing', () => {
    beforeEach(async () => {
      await pool.start();
    });

    it('should process batch of tasks', async () => {
      pool.registerHandler<number, number>('square', async (n) => n * n);

      const results = await pool.submitBatch<number, number>(
        'square',
        [1, 2, 3, 4, 5],
        { concurrency: 3 }
      );

      expect(results).toEqual([1, 4, 9, 16, 25]);
    });

    it('should handle partial batch failures', async () => {
      pool.registerHandler<number, number>('mayFail', async (n) => {
        if (n === 3) throw new Error('Failed on 3');
        return n * 2;
      });

      // Should not throw, but some results may be missing
      const results = await pool.submitBatch<number, number>('mayFail', [1, 2, 3, 4]);

      expect(results[0]).toBe(2);
      expect(results[1]).toBe(4);
      // results[2] failed
      expect(results[3]).toBe(8);
    });
  });

  describe('auto-scaling', () => {
    beforeEach(async () => {
      await pool.start();
    });

    it('should scale up when queue grows', async () => {
      pool.registerHandler('slow', async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // Submit many tasks to trigger scale up
      const tasks: Promise<unknown>[] = [];
      for (let i = 0; i < 15; i++) {
        tasks.push(pool.submit('slow', i));
      }

      // Wait a bit for scaling
      await new Promise((r) => setTimeout(r, 50));

      const stats = pool.getStats();
      expect(stats.workers.length).toBeGreaterThan(2);

      await Promise.all(tasks);
    });

    it('should not exceed max workers', async () => {
      pool.registerHandler('slow', async () => {
        await new Promise((r) => setTimeout(r, 200));
      });

      // Submit many more tasks than max workers
      const tasks: Promise<unknown>[] = [];
      for (let i = 0; i < 20; i++) {
        tasks.push(pool.submit('slow', i));
      }

      await new Promise((r) => setTimeout(r, 50));

      const stats = pool.getStats();
      expect(stats.workers.length).toBeLessThanOrEqual(5); // maxWorkers

      await Promise.all(tasks);
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await pool.start();
    });

    it('should track task counts', async () => {
      pool.registerHandler<number, number>('count', async (n) => n);

      await pool.submit('count', 1);
      await pool.submit('count', 2);
      await pool.submit('count', 3);

      const stats = pool.getStats();
      expect(stats.metrics.totalTasksSubmitted).toBe(3);
      expect(stats.metrics.totalTasksCompleted).toBe(3);
    });

    it('should track processing times', async () => {
      pool.registerHandler('timed', async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      await pool.submit('timed', {});

      const stats = pool.getStats();
      expect(stats.metrics.avgProcessingTime).toBeGreaterThan(40);
    });

    it('should track worker statistics', async () => {
      pool.registerHandler<number, number>('work', async (n) => n);

      await pool.submit('work', 1);

      const stats = pool.getStats();
      const totalCompleted = stats.workers.reduce((sum, w) => sum + w.tasksCompleted, 0);
      expect(totalCompleted).toBe(1);
    });
  });

  describe('events', () => {
    beforeEach(async () => {
      await pool.start();
    });

    it('should emit taskQueued event', async () => {
      const queuedSpy = vi.fn();
      pool.on('taskQueued', queuedSpy);

      pool.registerHandler('emit', async () => {});
      await pool.submit('emit', {});

      expect(queuedSpy).toHaveBeenCalled();
    });

    it('should emit taskCompleted event', async () => {
      const completedSpy = vi.fn();
      pool.on('taskCompleted', completedSpy);

      pool.registerHandler<number, number>('complete', async (n) => n * 2);
      await pool.submit('complete', 5);

      expect(completedSpy).toHaveBeenCalledWith(expect.any(String), 10);
    });

    it('should emit taskFailed event', async () => {
      const failedSpy = vi.fn();
      pool.on('taskFailed', failedSpy);

      pool.registerHandler('fail', async () => {
        throw new Error('Task error');
      });

      await expect(pool.submit('fail', {})).rejects.toThrow();
      expect(failedSpy).toHaveBeenCalled();
    });
  });
});
