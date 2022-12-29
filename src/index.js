const fs = require('fs').promises;
const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');

const axios = require('axios');
const express = require('express');
const spdy = require('spdy');
const multer = require('multer');
const AsyncLock = require('async-lock');
const ts = require('typescript');
const FluentClient = require('@fluent-org/logger').FluentClient;

const { getFunctionFilePathDefault, getFunctionFilePath, getFunctionMetadataFilePath, getFunctionFolder, fileExists, JS_FUNCTION_FILE, TS_FUNCTION_FILE } = require('./helpers');
const { transformError } = require('./helpers');
const { app: { port }, fluentd, service: { functionsApiServiceUrl } } = require('./config');
const { setLogger } = require('@faasff/nodejs-common');

const logger = new FluentClient('nodejs-runtime', {
    socket: {
        host: fluentd.host,
        port: fluentd.port,
        timeout: fluentd.timeout,
    }
});

logger.socketOn('error', (err) => {
    console.log("Fluentd error", err)
});

const lock = new AsyncLock();
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));

const loggerWrap = (baseLogger, executionId) => ({
    debug: (msg) => baseLogger.emit('log', { level: 'debug', executionId, message: msg.message, data: msg.data }),
    info: (msg) => baseLogger.emit('log', { level: 'info', executionId, message: msg.message, data: msg.data }),
    warn: (msg) => baseLogger.emit('log', { level: 'warn', executionId, message: msg.message, data: msg.data }),
    error: (msg) => baseLogger.emit('log', { level: 'error', executionId, message: msg.message, data: msg.data }),
})

const upload = multer();
const totalWorkers = process.env.NODE_WORKERS ?? os.cpus().length;

if (cluster.isMaster) {
    let executingFunctions = [];
    logger.emit('log', { level: 'info', message: `Runtime started with '${totalWorkers}' workers.` });

    for (let i = 0; i < totalWorkers; i++) {
        const worker = cluster.fork();

        worker.on('message', (msg) => {
            if (msg.data.name === 'start') {
                executingFunctions.push({ ...msg.data, worker });

                logger.emit('log', { level: 'debug', executionId: msg.data.id, message: `Master - Function execution started '${msg.data.id}'` });
            } else if (msg.data.name === 'finish') {
                logger.emit('log', { level: 'debug', executionId: msg.data.id, message: `Master - Function execution finished '${msg.data.id}'` });
                executingFunctions = executingFunctions.filter(x => x.id !== msg.data.id);
            }
        });
    }

    setInterval(() => {
        for (let i = 0; i < executingFunctions.length; i++) {
            functionData = executingFunctions[i];
            var timeObject = new Date(new Date(functionData.date).getTime() + functionData.timeout);
            if (new Date() > timeObject) {
                logger.emit('log', { level: 'debug', executionId: msg.data.id, message: `Master - Function with id '${msg.data.id}' exceeded the execution timeout, terminating the worker` });
                process.kill(functionData.worker.process.pid, 'SIGKILL');
                executingFunctions = executingFunctions.filter(x => x !== functionData);
            }
        }
    }, 500);

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker with pid '${worker.process.pid}' killed`);
        cluster.fork();
    });
} else {
    const compileFunction = async (functionPath) => {
        if (!functionPath.endsWith('.ts')) {
            return functionPath;
        }

        const compiledPath = functionPath.replace(TS_FUNCTION_FILE, JS_FUNCTION_FILE);
        if (await fileExists(compiledPath)) {
            return compiledPath;
        }

        const compilerOptions = {
            target: ts.ScriptTarget.ES5,
            module: ts.ModuleKind.CommonJS,
            sourceMap: true
        };
        const result = ts.transpileModule(await fs.readFile(functionPath, 'utf8'), {
            compilerOptions,
            fileName: compiledPath,
            reportDiagnostics: false
        });

        await fs.writeFile(compiledPath, result.outputText);
        await fs.writeFile(`${compiledPath}.map`, result.sourceMapText);

        return compiledPath;
    };

    const saveFunction = async (executionId, fnData) => {
        logger.emit('log', { level: 'debug', executionId, message: `Executing function '${fnData.name}'-${fnData.etag}`, data: { functionName: fnData.name, etag: fnData.etag } });

        let functionPath = getFunctionFilePathDefault(fnData.name, fnData.etag);
        if (await fileExists(functionPath)) {
            logger.emit('log', { level: 'debug', executionId, message: `Function file already exists` });

            return functionPath;
        }

        logger.emit('log', { level: 'debug', executionId, message: `Missing function file` });

        await lock.acquire(`${fnData.name}-${fnData.etag}`, async () => {
            if (await fileExists(functionPath)) {
                return;
            }

            logger.emit('log', { level: 'debug', executionId, message: `Getting function file` });

            const response = await axios.get(`${functionsApiServiceUrl}v1/functions/${fnData.name}`);

            if (response.status !== 200) {
                logger.emit('log', { level: 'error', executionId, message: `Error while getting function`, data: { functionName: fnData.name } });
                functionPath = null;
                return;
            }

            const isTsFunction = response.data.sourceCode.language === 'typescript';

            await fs.mkdir(getFunctionFolder(response.data), { recursive: true });

            functionPath = getFunctionFilePath(response.data);
            const sourceCode = response.data.sourceCode.content;
            await fs.writeFile(functionPath, sourceCode, 'utf8');

            const metadataPath = getFunctionMetadataFilePath(response.data);
            const functionData = response.data;
            delete functionData.sourceCode;
            await fs.writeFile(metadataPath, JSON.stringify(functionData), 'utf8');

            if (isTsFunction) {
                logger.emit('log', { level: 'debug', executionId, message: `Compiling function`, data: { functionName: fnData.name } });
                functionPath = await compileFunction(functionPath);
            }
        });

        return functionPath;
    };

    app.get('/', (req, res) => {
        return res.status(200).send({ status: 'UP' });
    });

    app.post('/test', upload.any(), async (req, res) => {
        const id = crypto.randomUUID();

        logger.emit('log', { level: 'debug', executionId: id, message: `Http trigger started` });

        const headers = req.headers;
        const fnMetadataJson = headers['x-function-data'];

        if (!fnMetadataJson) {
            logger.emit('log', { level: 'error', executionId: id, message: `Missing function data` });

            return res.set('X-Execution-Id', id).status(500).send({ error: 'Missing function data' });
        }

        let fnData = null;
        try {
            fnData = JSON.parse(fnMetadataJson);
        } catch {
            logger.emit('log', { level: 'error', executionId: id, message: `Invalid function data` });

            return res.set('X-Execution-Id', id).status(500).send({ error: 'Invalid function data' });
        }

        const functionPath = await saveFunction(id, fnData);
        if (!functionPath) {
            logger.emit('log', { level: 'error', executionId: id, message: `Error while saving function` });

            return res.set('X-Execution-Id', id).status(500).send({ error: 'Error while saving function' });
        }

        req.params = fnData.params;
        
        try {
            setLogger(loggerWrap(logger, id));

            let requiredFunction = require('.' + functionPath);

            if (requiredFunction.default) {
                requiredFunction = requiredFunction.default;
            }

            const timeout = 30 * 1000;

            logger.emit('log', { level: 'info', executionId: id, message: `Executing function with timeout '${timeout}'` });

            process.send({ data: { id: id, name: 'start', date: new Date(), timeout } });

            const result = await requiredFunction(req);

            res.set(result.headers).set('X-Execution-Id', id).status(result.statusCode).send(result.body);

            process.send({ data: { id: id, name: 'finish' } });

            logger.emit('log', { level: 'info', executionId: id, message: `Execution finished` });

        } catch (e) {
            const error = transformError(fnData.name, e);
            logger.emit('log', { level: 'error', executionId: id, message: `Error while execution function`, data: { error } });
            res.set('X-Execution-Id', id).status(500).send(error);
            process.send({ data: { id: id, name: 'finish' } });
            console.log(e);
        }
    });

    const options = {
        spdy: {
            protocols: ['h2'],
            plain: true,
            ssl: false
        }
    };

    spdy.createServer(options, app).listen(port, (err) => {
        if (err) {
            throw new Error(err);
        }
        console.log(`Listening on port ${port}`);
    });
}