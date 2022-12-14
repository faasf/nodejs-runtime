const { serializeError } = require('serialize-error');
const fs = require('fs').promises;
const { constants } = require('fs');
const BASE_FUNCTIONS_PATH = './functions';

const JS_FUNCTION_FILE = 'index.js';
const TS_FUNCTION_FILE = 'index.ts';
const FUNCTION_METADATA_FILE = 'function.json';

const platform = { isWin: false };
if (/^win/.test(process.platform)) {
    platform.isWin = true;
}

function getPathSeparator() {
    if (platform.isWin) {
        return '\\';
    }
    return '/';
}

const fileExists = async (path) => {
    try {
        await fs.access(path, constants.R_OK);
        return true;
    } catch (e) {
        return false;
    }
};

const getFunctionFolder = (fn) => {
    return `${BASE_FUNCTIONS_PATH}/${fn.name}/${fn.etag}/`;
};

const getFunctionFilePath = (fn) => {
    const functionFile = fn.sourceCode.language === 'typescript' ? TS_FUNCTION_FILE : JS_FUNCTION_FILE;
    return `${BASE_FUNCTIONS_PATH}/${fn.name}/${fn.etag}/${functionFile}`;
};

const getFunctionFilePathDefault = (functionName, etag) => {
    return `${BASE_FUNCTIONS_PATH}/${functionName}/${etag}/${JS_FUNCTION_FILE}`;
};

const getFunctionMetadataFilePath = (fn) => {
    return `${BASE_FUNCTIONS_PATH}/${fn.name}/${fn.etag}/${FUNCTION_METADATA_FILE}`;
};

const transformError = (functionName, e) => {
    const error = serializeError(e);

    if (error.stack) {
        const [line, exact] = error.stack.split('\n');

        const pathSplit = line.split(getPathSeparator());
        const lastPath = pathSplit[pathSplit.length - 1];
        const functionPath = lastPath.replace('index.js', functionName);

        error.stack = `${functionPath}\n${exact}`;
    }

    return error;
};

exports.BASE_FUNCTIONS_PATH = BASE_FUNCTIONS_PATH;
exports.JS_FUNCTION_FILE = JS_FUNCTION_FILE;
exports.TS_FUNCTION_FILE = TS_FUNCTION_FILE;
exports.FUNCTION_METADATA_FILE = FUNCTION_METADATA_FILE;

exports.getFunctionFilePathDefault = getFunctionFilePathDefault;
exports.getFunctionFolder = getFunctionFolder;
exports.getFunctionFilePath = getFunctionFilePath;
exports.getFunctionMetadataFilePath = getFunctionMetadataFilePath;
exports.fileExists = fileExists;
exports.transformError = transformError;
