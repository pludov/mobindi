import winston, { Logger } from 'winston';
import * as fs from 'fs';
import DailyRotateFile from "winston-daily-rotate-file";

const {format} = require('util');
const SPLAT = Symbol.for('splat');

type LogMethod = (message: any, ...params: any[])=>void;

export interface AbstractLogger {
    error: LogMethod;
    warn: LogMethod;
    info: LogMethod;
    debug: LogMethod;
}

export interface RootLogger extends AbstractLogger {
    child: (opts: object)=>AbstractLogger;
}

function consoleLogWrap(where: string|undefined, info:(message?: any, ...optionalParams: any[])=> void)
{
    if (where === undefined) {
        return info;
    } else {
        where = '[' + where + ']';
        return (message?: any, ...optionalParams: any[]) => {
            info(where, ...[message, ...optionalParams]);
        }
    }
}

let uiDebugStatus: boolean = false;

function switchDebug(value?: boolean) {
    uiDebugStatus = value !== undefined ? !!value: !uiDebugStatus;
}

function uiConditional(info:(message?: any, ...optionalParams: any[])=> void) {
    return (message?: any, ...optionalParams: any[])=> {
        if (!uiDebugStatus) {
            return;
        }
        return info(message, optionalParams);
    }
}


function initClientSide(opts: {source?: string|undefined}):RootLogger {
    const source = opts.source;
    try {
        // @ts-ignore
        if ((window as any).location.port === "3000") {
            console.log('Debug mode detected');
            switchDebug(true);
        }
    } catch(e) {
    }
    (global as any).debug = switchDebug;
    return {
        error: consoleLogWrap(source, console.error),
        warn: consoleLogWrap(source, console.warn),
        info: consoleLogWrap(source, console.info),
        debug: uiConditional(consoleLogWrap(source, console.debug)),
        child: initClientSide,
    }
}

function envSubst(t:any):any {
    if (t === null) return t;
    if (Array.isArray(t)) {
        return t.map(envSubst);
    }
    const type = typeof t;
    if (type === "object") {
        return Object.fromEntries(
            Object.entries(t).map(
              ([k, v], i) => [k, envSubst(v)]
            )
        );
    }
    if (type !== "string") {
        return t;
    }
    return t.replace(/\${([^}]*)}/g, (m:string, p1:string)=>(process.env[p1] || ""));
}

function initServerSide() {
    const timeStamp = winston.format.timestamp({
        format:"YY-MM-DD HH:mm:ss.SSS"
    });
    const colorize = winston.format.colorize({
        all:true
    });
    const printf = winston.format.printf(
        info => {
            const t = info[SPLAT as any];
            const message = format(info.message, ...(t || []));
            const level = ((info.level || "???") + '').padEnd(5, ' ');
            return `${info.timestamp} ${level} [${info.source}] ${message}`;
        }
    );

    let textFormat = winston.format.combine(printf, timeStamp);
    let colorTextFormat = winston.format.combine(printf, timeStamp, colorize);

    let loggingDefinition: any = {
        transports: [
            {
                type: 'file',
                filename: '/tmp/error.log',
                level: 'error'
            },
            {
                type: 'file',
                filename: '/tmp/debug.log',
                level: 'debug'
            },
            {
                type: 'console',
                level: 'info',
                format: 'text',
            }
        ]
    };
    const env = process.env.NODE_ENV || 'dev';

    try {
        loggingDefinition = envSubst(JSON.parse(fs.readFileSync('logging.json', 'utf-8')));
        
        if (loggingDefinition?.[env]) {
            loggingDefinition = loggingDefinition?.[env];
        }

        setImmediate(()=>{
            if (!loggingDefinition) {
                logger.error("no valid log configuration in logging.json for env", env);
            } else {
                logger.debug("using log configuration for env", env);
            }
        });
    } catch(e) {
        setImmediate(()=> {
            logger.error("unable to read log configuration file: logging.json", e);
        });
    }

    const jsonFormat = winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    );

    const rootLogger = winston.createLogger({
        level: 'info',
        format: jsonFormat,
        defaultMeta: { service: 'mobindi' },
        transports: (loggingDefinition?.transports || []).map(
            (item:any)=> {
                const {type, format, ...options} = item;
                let formatOpts;
                switch(format) {
                    case 'text':
                        formatOpts = {format: textFormat};
                        break;
                    case 'json':
                        formatOpts = {format: jsonFormat};
                        break;
                    case 'console':
                        formatOpts = {format: colorTextFormat};
                        break;
                }

                switch(((item.type||'')+'').toLowerCase()) {
                    case 'file':
                        return new winston.transports.File({...options, format: textFormat, ...formatOpts});
                    case 'rotated':
                    case 'rotated-file':
                        return new DailyRotateFile({...options, format: textFormat, ...formatOpts});
                    default:
                        return new winston.transports.Console({...options, format: colorTextFormat, ...formatOpts});
                }
                // [
                //     //
                //     // - Write all logs with level `error` and below to `error.log`
                //     // - Write all logs with level `info` and below to `combined.log`
                //     //
                //     new winston.transports.File({ options: {}, filename: '/tmp/error.log', level: 'error' }),
                //     new winston.transports.File({ filename: '/tmp/debug.log'}),
                //     new winston.transports.Console({format: alignColorsAndTime}),
                //   ],
            }),
        exitOnError: false,
        handleExceptions: true,
    });

    rootLogger.on('error', function (err) { console.error('Winston logging error', err) });

    let exited = false;
    process.on('beforeExit', (code) => {
        if (exited) return;
        exited = true;
        logger.info('Process terminating with code', code);
        rootLogger.end();
    });

    return rootLogger;
}

function isUi() {
    return (typeof (global as any).window !== 'undefined');
}

function isWorker() {
    return typeof (fs) === 'undefined' || typeof (fs.existsSync) === 'undefined';
}

function init() : RootLogger {

    if (!isUi() && !isWorker()) {
        return initServerSide();
    }
    return initClientSide({source: undefined});
}

function childLogger(source:string, opts?: object): AbstractLogger {
    let strip = __filename.replace(/[^/]*$/, '');
    if (isUi() || isWorker()) {
        // Hacky patch for ui relative directories
        strip = strip.replace(/[^/]+\/$/, '');
    }
    // Remove common part
    let cut = 0;
    while(cut < source.length && cut < strip.length && source[cut] == strip[cut]) {
        cut++;
    }
    source = source.substr(cut);
    // Add ".." for every parent path
    while(cut < strip.length) {
        if (strip[cut++] == '/') {
            source = '../' + source;
        }
    }
    return rootLogger.child({source, ...opts});
}

const rootLogger:RootLogger = init();

const logger:AbstractLogger = childLogger(__filename);

logger.info('Starting');

export default {logger: childLogger};
