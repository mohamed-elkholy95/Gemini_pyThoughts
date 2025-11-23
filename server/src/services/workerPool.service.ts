// Worker Pool Service
// High-performance parallel task execution with load balancing and auto-scaling

import { EventEmitter } from 'events';
import { logger } from '../config/logger.js';

export interface Task<T = unknown, R = unknown> {
  id: string;
  type: string;
  data: T;
  priority: number;
  retries: number;
  maxRetries: number;
  createdAt: Date;
  timeout: number;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
}

export interface WorkerStats {
  id: string;
  status: 'idle' | 'busy' | 'error';
  tasksCompleted: number;
  tasksFailed: number;
  lastTaskAt: Date | null;
  avgProcessingTime: number;
  currentTask: string | null;
}

export interface PoolConfig {
  minWorkers: number;
  maxWorkers: number;
  taskTimeout: number;
  scaleUpThreshold: number; // Queue length to trigger scale up
  scaleDownThreshold: number; // Idle workers to trigger scale down
  healthCheckInterval: number;
  maxTaskRetries: number;
}

export interface PoolMetrics {
  totalTasksSubmitted: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  totalRetries: number;
  avgWaitTime: number;
  avgProcessingTime: number;
  peakQueueLength: number;
  peakWorkerCount: number;
}

type TaskHandler<T, R> = (data: T) => Promise<R>;

const DEFAULT_CONFIG: PoolConfig = {
  minWorkers: 2,
  maxWorkers: 10,
  taskTimeout: 30000,
  scaleUpThreshold: 10,
  scaleDownThreshold: 3,
  healthCheckInterval: 5000,
  maxTaskRetries: 3,
};

export class WorkerPool extends EventEmitter {
  private config: PoolConfig;
  private handlers: Map<string, TaskHandler<unknown, unknown>> = new Map();
  private taskQueue: Task[] = [];
  private workers: Map<string, WorkerStats> = new Map();
  private isRunning = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private processingTasks: Map<string, Task> = new Map();

  // Metrics
  private metrics: PoolMetrics = {
    totalTasksSubmitted: 0,
    totalTasksCompleted: 0,
    totalTasksFailed: 0,
    totalRetries: 0,
    avgWaitTime: 0,
    avgProcessingTime: 0,
    peakQueueLength: 0,
    peakWorkerCount: 0,
  };

  constructor(config: Partial<PoolConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // Register a task handler
  registerHandler<T, R>(taskType: string, handler: TaskHandler<T, R>): void {
    this.handlers.set(taskType, handler as TaskHandler<unknown, unknown>);
    logger.info({ taskType }, 'Task handler registered');
  }

  // Start the worker pool
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Worker pool already running');
      return;
    }

    this.isRunning = true;
    logger.info({ config: this.config }, 'Starting worker pool');

    // Initialize minimum workers
    for (let i = 0; i < this.config.minWorkers; i++) {
      this.addWorker();
    }

    // Start health check
    this.healthCheckTimer = setInterval(() => {
      this.healthCheck();
    }, this.config.healthCheckInterval);

    // Start task processing loop
    this.processQueue();

    this.emit('started');
    logger.info('Worker pool started');
  }

  // Stop the worker pool
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Wait for current tasks to complete (with timeout)
    const timeout = 30000;
    const startTime = Date.now();

    while (this.processingTasks.size > 0 && Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Force fail remaining tasks
    for (const task of this.processingTasks.values()) {
      task.reject(new Error('Worker pool shutdown'));
    }

    this.processingTasks.clear();
    this.workers.clear();

    this.emit('stopped');
    logger.info('Worker pool stopped');
  }

  // Submit a task to the pool
  async submit<T, R>(
    taskType: string,
    data: T,
    options: { priority?: number; timeout?: number } = {}
  ): Promise<R> {
    if (!this.isRunning) {
      throw new Error('Worker pool is not running');
    }

    if (!this.handlers.has(taskType)) {
      throw new Error(`No handler registered for task type: ${taskType}`);
    }

    return new Promise<R>((resolve, reject) => {
      const task: Task<T, R> = {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: taskType,
        data,
        priority: options.priority || 0,
        retries: 0,
        maxRetries: this.config.maxTaskRetries,
        createdAt: new Date(),
        timeout: options.timeout || this.config.taskTimeout,
        resolve: resolve as (result: unknown) => void,
        reject,
      };

      this.enqueueTask(task as unknown as Task);
      this.metrics.totalTasksSubmitted++;

      // Update peak queue length
      if (this.taskQueue.length > this.metrics.peakQueueLength) {
        this.metrics.peakQueueLength = this.taskQueue.length;
      }
    });
  }

  // Submit multiple tasks in batch
  async submitBatch<T, R>(
    taskType: string,
    items: T[],
    options: { priority?: number; timeout?: number; concurrency?: number } = {}
  ): Promise<R[]> {
    const concurrency = options.concurrency || this.config.maxWorkers;
    const results: R[] = [];
    const errors: Error[] = [];

    // Process in batches
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchPromises = batch.map((item, index) =>
        this.submit<T, R>(taskType, item, options)
          .then((result) => ({ index: i + index, result, error: null }))
          .catch((error) => ({ index: i + index, result: null, error }))
      );

      const batchResults = await Promise.all(batchPromises);

      for (const { index, result, error } of batchResults) {
        if (error) {
          errors.push(error);
        } else {
          results[index] = result as R;
        }
      }
    }

    if (errors.length > 0) {
      logger.warn({ errorCount: errors.length }, 'Batch processing had failures');
    }

    return results;
  }

  // Get pool statistics
  getStats(): {
    config: PoolConfig;
    metrics: PoolMetrics;
    workers: WorkerStats[];
    queueLength: number;
    processingCount: number;
  } {
    return {
      config: this.config,
      metrics: { ...this.metrics },
      workers: Array.from(this.workers.values()),
      queueLength: this.taskQueue.length,
      processingCount: this.processingTasks.size,
    };
  }

  // Private methods

  private addWorker(): void {
    const workerId = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const stats: WorkerStats = {
      id: workerId,
      status: 'idle',
      tasksCompleted: 0,
      tasksFailed: 0,
      lastTaskAt: null,
      avgProcessingTime: 0,
      currentTask: null,
    };

    this.workers.set(workerId, stats);

    if (this.workers.size > this.metrics.peakWorkerCount) {
      this.metrics.peakWorkerCount = this.workers.size;
    }

    logger.debug({ workerId }, 'Worker added');
    this.emit('workerAdded', workerId);
  }

  private removeWorker(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker || worker.status === 'busy') return;

    this.workers.delete(workerId);
    logger.debug({ workerId }, 'Worker removed');
    this.emit('workerRemoved', workerId);
  }

  private enqueueTask(task: Task): void {
    // Insert by priority (higher priority first)
    let inserted = false;
    for (let i = 0; i < this.taskQueue.length; i++) {
      if (task.priority > this.taskQueue[i].priority) {
        this.taskQueue.splice(i, 0, task);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.taskQueue.push(task);
    }

    this.emit('taskQueued', task.id);
  }

  private async processQueue(): Promise<void> {
    while (this.isRunning) {
      // Find idle worker
      const idleWorker = Array.from(this.workers.values()).find(
        (w) => w.status === 'idle'
      );

      if (idleWorker && this.taskQueue.length > 0) {
        const task = this.taskQueue.shift()!;
        this.processTask(idleWorker, task);
      }

      // Auto-scaling
      this.autoScale();

      // Small delay to prevent CPU spinning
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  private async processTask(worker: WorkerStats, task: Task): Promise<void> {
    worker.status = 'busy';
    worker.currentTask = task.id;
    this.processingTasks.set(task.id, task);

    const startTime = Date.now();
    const waitTime = startTime - task.createdAt.getTime();

    // Update avg wait time
    this.metrics.avgWaitTime =
      (this.metrics.avgWaitTime * this.metrics.totalTasksCompleted + waitTime) /
      (this.metrics.totalTasksCompleted + 1);

    const handler = this.handlers.get(task.type);
    if (!handler) {
      worker.status = 'idle';
      worker.currentTask = null;
      this.processingTasks.delete(task.id);
      task.reject(new Error(`No handler for task type: ${task.type}`));
      return;
    }

    // Create timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), task.timeout);
    });

    try {
      const result = await Promise.race([handler(task.data), timeoutPromise]);

      const processingTime = Date.now() - startTime;

      // Update metrics
      worker.tasksCompleted++;
      worker.avgProcessingTime =
        (worker.avgProcessingTime * (worker.tasksCompleted - 1) + processingTime) /
        worker.tasksCompleted;
      worker.lastTaskAt = new Date();

      this.metrics.totalTasksCompleted++;
      this.metrics.avgProcessingTime =
        (this.metrics.avgProcessingTime * (this.metrics.totalTasksCompleted - 1) +
          processingTime) /
        this.metrics.totalTasksCompleted;

      task.resolve(result);
      this.emit('taskCompleted', task.id, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Retry logic
      if (task.retries < task.maxRetries) {
        task.retries++;
        this.metrics.totalRetries++;
        logger.warn(
          { taskId: task.id, retry: task.retries, error: errorMessage },
          'Retrying task'
        );
        this.enqueueTask(task);
      } else {
        worker.tasksFailed++;
        this.metrics.totalTasksFailed++;
        task.reject(error instanceof Error ? error : new Error(errorMessage));
        this.emit('taskFailed', task.id, error);
      }
    } finally {
      worker.status = 'idle';
      worker.currentTask = null;
      this.processingTasks.delete(task.id);
    }
  }

  private autoScale(): void {
    const queueLength = this.taskQueue.length;
    const workerCount = this.workers.size;
    const idleCount = Array.from(this.workers.values()).filter(
      (w) => w.status === 'idle'
    ).length;

    // Scale up
    if (queueLength > this.config.scaleUpThreshold && workerCount < this.config.maxWorkers) {
      const toAdd = Math.min(
        Math.ceil(queueLength / this.config.scaleUpThreshold),
        this.config.maxWorkers - workerCount
      );
      for (let i = 0; i < toAdd; i++) {
        this.addWorker();
      }
      logger.info({ added: toAdd, total: this.workers.size }, 'Scaled up workers');
    }

    // Scale down
    if (
      idleCount > this.config.scaleDownThreshold &&
      workerCount > this.config.minWorkers
    ) {
      const toRemove = Math.min(
        idleCount - this.config.scaleDownThreshold,
        workerCount - this.config.minWorkers
      );

      const idleWorkers = Array.from(this.workers.entries())
        .filter(([_, w]) => w.status === 'idle')
        .slice(0, toRemove);

      for (const [id] of idleWorkers) {
        this.removeWorker(id);
      }

      if (toRemove > 0) {
        logger.info({ removed: toRemove, total: this.workers.size }, 'Scaled down workers');
      }
    }
  }

  private healthCheck(): void {
    const stats = this.getStats();

    // Check for stuck tasks
    const now = Date.now();
    for (const task of this.processingTasks.values()) {
      const processingTime = now - task.createdAt.getTime();
      if (processingTime > task.timeout * 2) {
        logger.error({ taskId: task.id, processingTime }, 'Task appears stuck');
        this.emit('taskStuck', task.id);
      }
    }

    // Log health status
    logger.debug(
      {
        workers: stats.workers.length,
        idle: stats.workers.filter((w) => w.status === 'idle').length,
        busy: stats.workers.filter((w) => w.status === 'busy').length,
        queueLength: stats.queueLength,
        processing: stats.processingCount,
      },
      'Worker pool health check'
    );

    this.emit('healthCheck', stats);
  }
}

// Singleton instance
let poolInstance: WorkerPool | null = null;

export const workerPoolService = {
  getInstance(config?: Partial<PoolConfig>): WorkerPool {
    if (!poolInstance) {
      poolInstance = new WorkerPool(config);
    }
    return poolInstance;
  },

  async start(config?: Partial<PoolConfig>): Promise<WorkerPool> {
    const pool = this.getInstance(config);
    await pool.start();
    return pool;
  },

  async stop(): Promise<void> {
    if (poolInstance) {
      await poolInstance.stop();
      poolInstance = null;
    }
  },
};
