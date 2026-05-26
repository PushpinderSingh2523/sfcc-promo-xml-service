const path   = require('path');
const fs     = require('fs');
const winston = require('winston');

const LOGS_DIR = path.join(__dirname, '../../runtime/logs');

// Ensure log directory exists (safe to call multiple times)
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

const transports = [
  // Console (always on unless tests)
  new winston.transports.Console({
    silent: isTest,
    format: isProd
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level}] ${message}${metaStr}`;
          })
        ),
  }),
];

// File transport — always write structured JSON to runtime/logs/
if (!isTest) {
  transports.push(
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'app.log'),
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
      tailable: true,
      format: winston.format.json(),
    }),
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 3,
      tailable: true,
      format: winston.format.json(),
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true })
  ),
  transports,
  silent: isTest,
});

module.exports = logger;
