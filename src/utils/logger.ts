// utils/logger.ts
import { createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';
import { TransformableInfo } from 'logform';
import path from 'path';

const { combine, timestamp, printf, colorize, errors } = format;

const logFormat = printf((info: TransformableInfo) => {
    const { level, message, timestamp, stack, context } = info;
    if (stack) {
        return `${timestamp ? timestamp : ''} ${level}: ${message}
    STACK=${String(stack).replace(/\n\s+/g, ' | ')}
    CONTEXT=${JSON.stringify(context)}`;

    }
    return `${timestamp ? timestamp : ''} ${level}: ${message}`;
});

const PROCESS_NAME = path.parse(process.argv[1]).name;

const logger = createLogger({
    level: process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'info',
    format: combine(errors({ stack: true }), colorize(), timestamp(), logFormat),
    transports: [
        new transports.Console({
            format: combine(errors({ stack: true }), colorize(), timestamp(), logFormat),
        }),
        new transports.DailyRotateFile({
            filename: `logs/${PROCESS_NAME}/log-%DATE%.log`,
            datePattern: 'YYYY-MM-DD',
            zippedArchive: false,
            maxSize: '100m',
            maxFiles: '7d',
            format: combine(errors({ stack: true }), timestamp(), logFormat),
        }),
    ],
});

// Custom level to handle `none`
if (process.env.LOG_LEVEL === 'none') {
    logger.transports.forEach((t) => (t.silent = true));
}

export default logger;
