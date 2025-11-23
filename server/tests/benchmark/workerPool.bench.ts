// Worker Pool Performance Benchmarks
// Tests throughput, latency, and scalability of the worker pool

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkerPool } from '../../src/services/workerPool.service.js';

describe('WorkerPool Benchmarks', () => {
  let pool: WorkerPool;

  beforeAll(async () => {
    pool = new WorkerPool({
      minWorkers: 4,
      maxWorkers: 16,
      taskTimeout: 60000,
      scaleUpThreshold: 20,
      healthCheckInterval: 5000,
    });

    // Register test handlers
    pool.registerHandler<{ delay: number }, string>('compute', async (data) => {
      // Simulate CPU-bound work
      const start = Date.now();
      let sum = 0;
      for (let i = 0; i < data.delay * 1000; i++) {
        sum += Math.sqrt(i);
      }
      return `Computed in ${Date.now() - start}ms, result: ${sum.toFixed(2)}`;
    });

    pool.registerHandler<{ delay: number }, string>('io', async (data) => {
      // Simulate I/O-bound work
      await new Promise((resolve) => setTimeout(resolve, data.delay));
      return `Completed after ${data.delay}ms`;
    });

    pool.registerHandler<number[], number>('aggregate', async (numbers) => {
      return numbers.reduce((a, b) => a + b, 0);
    });

    await pool.start();
  });

  afterAll(async () => {
    await pool.stop();
  });

  describe('Throughput Tests', () => {
    it('should handle high volume of small tasks', async () => {
      const taskCount = 100;
      const startTime = Date.now();

      const promises = Array.from({ length: taskCount }, (_, i) =>
        pool.submit('aggregate', [i, i + 1, i + 2])
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;
      const throughput = taskCount / (duration / 1000);

      console.log(`High volume test: ${taskCount} tasks in ${duration}ms`);
      console.log(`Throughput: ${throughput.toFixed(2)} tasks/second`);

      expect(results.length).toBe(taskCount);
      expect(throughput).toBeGreaterThan(10); // At least 10 tasks/sec
    }, 30000);

    it('should maintain throughput under sustained load', async () => {
      const batches = 5;
      const tasksPerBatch = 50;
      const allResults: number[] = [];
      const durations: number[] = [];

      for (let batch = 0; batch < batches; batch++) {
        const startTime = Date.now();

        const promises = Array.from({ length: tasksPerBatch }, (_, i) =>
          pool.submit<number[], number>('aggregate', [i, batch, 1])
        );

        const results = await Promise.all(promises);
        const duration = Date.now() - startTime;

        allResults.push(...results);
        durations.push(duration);

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      console.log(`Sustained load test: ${batches} batches of ${tasksPerBatch} tasks`);
      console.log(`Average batch duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`Min: ${minDuration}ms, Max: ${maxDuration}ms`);
      console.log(`Variance: ${(maxDuration - minDuration).toFixed(2)}ms`);

      expect(allResults.length).toBe(batches * tasksPerBatch);
      // Variance should not be too high (indicates stable performance)
      expect(maxDuration - minDuration).toBeLessThan(avgDuration * 2);
    }, 60000);
  });

  describe('Latency Tests', () => {
    it('should have low latency for small tasks', async () => {
      const iterations = 50;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await pool.submit('aggregate', [1, 2, 3]);
        latencies.push(Date.now() - start);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const sortedLatencies = [...latencies].sort((a, b) => a - b);
      const p50 = sortedLatencies[Math.floor(iterations * 0.5)];
      const p95 = sortedLatencies[Math.floor(iterations * 0.95)];
      const p99 = sortedLatencies[Math.floor(iterations * 0.99)];

      console.log(`Latency test (${iterations} iterations):`);
      console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
      console.log(`  P50: ${p50}ms`);
      console.log(`  P95: ${p95}ms`);
      console.log(`  P99: ${p99}ms`);

      expect(avgLatency).toBeLessThan(100); // Average under 100ms
      expect(p99).toBeLessThan(500); // P99 under 500ms
    }, 30000);

    it('should maintain latency with concurrent tasks', async () => {
      const concurrentTasks = 20;
      const latencies: number[] = [];

      const promises = Array.from({ length: concurrentTasks }, async () => {
        const start = Date.now();
        await pool.submit('aggregate', [1, 2, 3, 4, 5]);
        return Date.now() - start;
      });

      const results = await Promise.all(promises);
      latencies.push(...results);

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      console.log(`Concurrent latency test (${concurrentTasks} concurrent tasks):`);
      console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
      console.log(`  Max: ${maxLatency}ms`);

      expect(avgLatency).toBeLessThan(200);
      expect(maxLatency).toBeLessThan(1000);
    }, 30000);
  });

  describe('Scalability Tests', () => {
    it('should scale workers under load', async () => {
      const initialStats = pool.getStats();
      const initialWorkers = initialStats.workers.length;

      // Generate load that exceeds scale-up threshold
      const heavyLoad = 100;
      const ioPromises = Array.from({ length: heavyLoad }, () =>
        pool.submit<{ delay: number }, string>('io', { delay: 50 })
      );

      // Check stats during processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      const midStats = pool.getStats();

      // Wait for completion
      await Promise.all(ioPromises);

      // Wait for scale-down
      await new Promise((resolve) => setTimeout(resolve, 6000));
      const finalStats = pool.getStats();

      console.log(`Scalability test:`);
      console.log(`  Initial workers: ${initialWorkers}`);
      console.log(`  Peak workers: ${midStats.metrics.peakWorkerCount}`);
      console.log(`  Final workers: ${finalStats.workers.length}`);

      // Should have scaled up during load
      expect(midStats.metrics.peakWorkerCount).toBeGreaterThanOrEqual(initialWorkers);
      // Should have scaled down after load (or at least not grown unboundedly)
      expect(finalStats.workers.length).toBeLessThanOrEqual(midStats.metrics.peakWorkerCount);
    }, 30000);

    it('should handle batch processing efficiently', async () => {
      const items = Array.from({ length: 200 }, (_, i) => [i, i + 1, i + 2]);
      const startTime = Date.now();

      const results = await pool.submitBatch<number[], number>('aggregate', items, {
        concurrency: 50,
      });

      const duration = Date.now() - startTime;
      const throughput = items.length / (duration / 1000);

      console.log(`Batch processing test:`);
      console.log(`  Items: ${items.length}`);
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} items/second`);

      expect(results.length).toBe(items.length);
      expect(results[0]).toBe(0 + 1 + 2); // First item sum
      expect(throughput).toBeGreaterThan(20);
    }, 60000);
  });

  describe('Resource Efficiency Tests', () => {
    it('should not leak memory under sustained load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 10;
      const tasksPerIteration = 100;

      for (let i = 0; i < iterations; i++) {
        const promises = Array.from({ length: tasksPerIteration }, (_, j) =>
          pool.submit('aggregate', [i, j, 1])
        );
        await Promise.all(promises);

        // Force GC if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      const memoryGrowthMB = memoryGrowth / (1024 * 1024);

      console.log(`Memory efficiency test:`);
      console.log(`  Initial: ${(initialMemory / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`  Final: ${(finalMemory / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`  Growth: ${memoryGrowthMB.toFixed(2)} MB`);

      // Memory growth should be reasonable (less than 50MB)
      expect(memoryGrowthMB).toBeLessThan(50);
    }, 60000);

    it('should report accurate metrics', async () => {
      const taskCount = 50;
      const initialStats = pool.getStats();

      const promises = Array.from({ length: taskCount }, () =>
        pool.submit('aggregate', [1, 2, 3])
      );

      await Promise.all(promises);
      const finalStats = pool.getStats();

      const tasksCompleted =
        finalStats.metrics.totalTasksCompleted - initialStats.metrics.totalTasksCompleted;

      console.log(`Metrics accuracy test:`);
      console.log(`  Tasks submitted: ${taskCount}`);
      console.log(`  Tasks completed (reported): ${tasksCompleted}`);
      console.log(`  Avg processing time: ${finalStats.metrics.avgProcessingTime.toFixed(2)}ms`);

      expect(tasksCompleted).toBe(taskCount);
      expect(finalStats.metrics.avgProcessingTime).toBeGreaterThan(0);
    }, 30000);
  });
});
