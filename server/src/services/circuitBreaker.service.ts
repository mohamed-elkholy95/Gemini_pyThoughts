// Circuit Breaker Service
// Implements the circuit breaker pattern for fault tolerance and cascading failure prevention

import { EventEmitter } from 'events';
import { logger } from '../config/logger.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes in half-open before closing
  timeout: number; // Time in ms before attempting recovery
  monitoringWindow: number; // Window for tracking failures
  volumeThreshold: number; // Minimum requests before circuit can trip
}

export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  lastStateChange: Date;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
}

interface RequestRecord {
  timestamp: number;
  success: boolean;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000,
  monitoringWindow: 60000,
  volumeThreshold: 10,
};

export class CircuitBreaker extends EventEmitter {
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private requestHistory: RequestRecord[] = [];
  private consecutiveSuccesses = 0;
  private consecutiveFailures = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private lastStateChange: Date = new Date();
  private halfOpenTimer: NodeJS.Timeout | null = null;
  private name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    super();
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // Execute a function with circuit breaker protection
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      const error = new Error(`Circuit breaker '${this.name}' is open`);
      this.emit('rejected', { name: this.name, state: this.state });
      throw error;
    }

    const startTime = Date.now();

    try {
      const result = await fn();
      this.recordSuccess();
      this.emit('success', {
        name: this.name,
        duration: Date.now() - startTime,
      });
      return result;
    } catch (error) {
      this.recordFailure();
      this.emit('failure', {
        name: this.name,
        error,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  // Check if request can be executed
  private canExecute(): boolean {
    this.cleanupOldRecords();

    switch (this.state) {
      case 'closed':
        return true;
      case 'open':
        return this.shouldAttemptRecovery();
      case 'half-open':
        return true;
    }
  }

  // Check if we should attempt recovery
  private shouldAttemptRecovery(): boolean {
    if (!this.lastFailureTime) return true;

    const timeSinceFailure = Date.now() - this.lastFailureTime.getTime();
    if (timeSinceFailure >= this.config.timeout) {
      this.transitionTo('half-open');
      return true;
    }
    return false;
  }

  // Record a successful request
  private recordSuccess(): void {
    const now = Date.now();
    this.requestHistory.push({ timestamp: now, success: true });
    this.lastSuccessTime = new Date();
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;

    if (this.state === 'half-open') {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    }
  }

  // Record a failed request
  private recordFailure(): void {
    const now = Date.now();
    this.requestHistory.push({ timestamp: now, success: false });
    this.lastFailureTime = new Date();
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;

    if (this.state === 'half-open') {
      this.transitionTo('open');
    } else if (this.state === 'closed') {
      this.checkThreshold();
    }
  }

  // Check if failure threshold exceeded
  private checkThreshold(): void {
    this.cleanupOldRecords();

    const totalRequests = this.requestHistory.length;
    if (totalRequests < this.config.volumeThreshold) {
      return;
    }

    const failures = this.requestHistory.filter((r) => !r.success).length;
    const failureRate = failures / totalRequests;

    if (failures >= this.config.failureThreshold || failureRate > 0.5) {
      this.transitionTo('open');
    }
  }

  // Transition to a new state
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();

    if (newState === 'closed') {
      this.consecutiveSuccesses = 0;
      this.consecutiveFailures = 0;
      this.requestHistory = [];
    }

    if (newState === 'open') {
      this.scheduleRecoveryAttempt();
    }

    logger.info(
      {
        circuitBreaker: this.name,
        from: oldState,
        to: newState,
      },
      'Circuit breaker state changed'
    );

    this.emit('stateChange', {
      name: this.name,
      from: oldState,
      to: newState,
    });
  }

  // Schedule automatic recovery attempt
  private scheduleRecoveryAttempt(): void {
    if (this.halfOpenTimer) {
      clearTimeout(this.halfOpenTimer);
    }

    this.halfOpenTimer = setTimeout(() => {
      if (this.state === 'open') {
        this.transitionTo('half-open');
      }
    }, this.config.timeout);
  }

  // Remove old records outside monitoring window
  private cleanupOldRecords(): void {
    const cutoff = Date.now() - this.config.monitoringWindow;
    this.requestHistory = this.requestHistory.filter((r) => r.timestamp > cutoff);
  }

  // Get current statistics
  getStats(): CircuitStats {
    this.cleanupOldRecords();
    const failures = this.requestHistory.filter((r) => !r.success).length;
    const successes = this.requestHistory.filter((r) => r.success).length;

    return {
      state: this.state,
      failures,
      successes,
      totalRequests: this.requestHistory.length,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastStateChange: this.lastStateChange,
      consecutiveSuccesses: this.consecutiveSuccesses,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  // Get current state
  getState(): CircuitState {
    return this.state;
  }

  // Check if circuit is healthy
  isHealthy(): boolean {
    return this.state === 'closed';
  }

  // Force circuit to open state
  forceOpen(): void {
    this.transitionTo('open');
  }

  // Force circuit to closed state
  forceClose(): void {
    this.transitionTo('closed');
  }

  // Reset circuit breaker
  reset(): void {
    if (this.halfOpenTimer) {
      clearTimeout(this.halfOpenTimer);
      this.halfOpenTimer = null;
    }
    this.state = 'closed';
    this.requestHistory = [];
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.lastStateChange = new Date();
    this.emit('reset', { name: this.name });
  }

  // Cleanup
  destroy(): void {
    if (this.halfOpenTimer) {
      clearTimeout(this.halfOpenTimer);
    }
    this.removeAllListeners();
  }
}

// Circuit breaker registry for managing multiple breakers
class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  // Get or create a circuit breaker
  getBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, config);
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  // Get all breakers
  getAllBreakers(): Map<string, CircuitBreaker> {
    return this.breakers;
  }

  // Get stats for all breakers
  getAllStats(): Record<string, CircuitStats> {
    const stats: Record<string, CircuitStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  // Check overall health
  isHealthy(): boolean {
    for (const breaker of this.breakers.values()) {
      if (!breaker.isHealthy()) {
        return false;
      }
    }
    return true;
  }

  // Reset all breakers
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  // Destroy all breakers
  destroyAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.destroy();
    }
    this.breakers.clear();
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

// Pre-configured breakers for common services
export const circuitBreakers = {
  database: circuitBreakerRegistry.getBreaker('database', {
    failureThreshold: 3,
    timeout: 10000,
  }),
  redis: circuitBreakerRegistry.getBreaker('redis', {
    failureThreshold: 5,
    timeout: 5000,
  }),
  external: circuitBreakerRegistry.getBreaker('external-api', {
    failureThreshold: 5,
    timeout: 60000,
  }),
};
