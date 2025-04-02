type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  success(message: string, ...args: any[]): void;
}

interface LoggerConfig {
  minLevel?: LogLevel;
  logFunctions?: Partial<Record<LogLevel, 'log' | 'info' | 'warn' | 'error'>>;
}

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  success: 1
};

const defaultConfig: LoggerConfig = {
  minLevel: 'debug',
  logFunctions: {
    debug: 'log',
    info: 'info',
    warn: 'warn',
    error: 'error',
    success: 'info'
  }
};

let config: LoggerConfig = { ...defaultConfig };

const logMessage = (
  level: LogLevel,
  message: string,
  args: any[]
): void => {
  if (config.minLevel && LOG_LEVEL_SEVERITY[level] < LOG_LEVEL_SEVERITY[config.minLevel]) {
    return;
  }

  const logFunction = config.logFunctions?.[level] || 'log';

  console[logFunction](`[${level.toUpperCase()}]`, message, ...(args.length ? args : []));
};

/**
* Initialize logger with configuration from environment variables
  */
  export const initializeLogger = (): void => {
    const logLevel = process.env.LOG_LEVEL || 'info';

    let logFunctions;

    if (process.env.LOG_FUNCTIONS) {
      try {
        logFunctions = JSON.parse(process.env.LOG_FUNCTIONS);
      } catch (e) {
        console.error('Failed to parse LOG_FUNCTIONS, using defaults');
      }
    }

    const newConfig = {
      minLevel: logLevel as LogLevel,
      ...(logFunctions && { logFunctions })
    };

    config = { ...defaultConfig, ...newConfig };
  };

export const logger: Logger = {
  debug: (message: string, ...args: any[]) => logMessage('debug', message, args),
  info: (message: string, ...args: any[]) => logMessage('info', message, args),
  warn: (message: string, ...args: any[]) => logMessage('warn', message, args),
  error: (message: string, ...args: any[]) => logMessage('error', message, args),
  success: (message: string, ...args: any[]) => logMessage('success', message, args),
};
