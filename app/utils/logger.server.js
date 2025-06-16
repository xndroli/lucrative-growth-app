/**
 * Simple logging utility for the application
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
const currentLogLevel = LOG_LEVELS[LOG_LEVEL] || LOG_LEVELS.INFO;

class Logger {
  constructor() {
    this.context = {};
  }

  setContext(context) {
    this.context = { ...this.context, ...context };
  }

  clearContext() {
    this.context = {};
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level,
      message,
      context: this.context,
      ...meta
    };

    return JSON.stringify(logData);
  }

  error(message, meta = {}) {
    if (currentLogLevel >= LOG_LEVELS.ERROR) {
      console.error(this.formatMessage('ERROR', message, meta));
    }
  }

  warn(message, meta = {}) {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      console.warn(this.formatMessage('WARN', message, meta));
    }
  }

  info(message, meta = {}) {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      console.info(this.formatMessage('INFO', message, meta));
    }
  }

  debug(message, meta = {}) {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message, meta));
    }
  }
}

// Create and export a singleton logger instance
export const logger = new Logger();

/**
 * Create a logger with a specific context
 */
export function createLogger(context = {}) {
  const contextLogger = new Logger();
  contextLogger.setContext(context);
  return contextLogger;
}

/**
 * Log sync operations with structured data
 */
export function logSyncOperation(operation, shop, data = {}) {
  logger.info(`Sync operation: ${operation}`, {
    shop,
    operation,
    ...data
  });
}

/**
 * Log errors with structured data
 */
export function logError(error, context = {}) {
  logger.error(error.message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    ...context
  });
}

/**
 * Log performance metrics
 */
export function logPerformance(operation, duration, metadata = {}) {
  logger.info(`Performance: ${operation}`, {
    operation,
    duration,
    durationMs: `${duration}ms`,
    ...metadata
  });
} 