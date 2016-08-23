'use strict';

// node & 3pp libs
const process = require('process');

const LOG_INDENT = '       ';
const ERROR_INDENT = ' !     ';
const ACTION_INDENT = '-----> ';

// Get value from environment
const getEnvVarValue = function getEnvVarValue(name, required, defaultValue, isBool) {
    let value = process.env[name];
    if (typeof(value) !== "undefined" && value !== null) {
        return isBool ? value === 'true' : value;
    } else {
        if (required) {
            error(`Environment variable '${name}' is required`);
            process.exit(1);
        } else {
            return defaultValue;
        }
    }
};


const info = function info(message) {
    console.log(`${LOG_INDENT}${message}`);
};

const action = function warning(message) {
    console.log(`${ACTION_INDENT}${message}`);
};

const warning = function warning(message) {
    console.warn(`${ERROR_INDENT}${message}`);
};

const error = function error(message) {
    console.error(`${ERROR_INDENT}${message}`);
};

const toSec = function toSec(ms) {
    return (ms / 1000).toFixed(2).replace(/\.00$/, '');
};

const toMb = function toMb(bytes) {
    return (bytes / 1000).toFixed(2).replace(/\.00$/, '');
};

module.exports = {
    INDENT: {
        LOG: LOG_INDENT,
        ACTION: ACTION_INDENT,
        ERROR: ERROR_INDENT
    },
    getEnvVarValue: getEnvVarValue,
    info: info,
    action: action,
    warning: warning,
    error: error,
    toSec: toSec,
    toKb: toMb
};