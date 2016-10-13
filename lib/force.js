/*
 * Copyright (c) 2016, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root  or https://opensource.org/licenses/BSD-3-Clause
 */

'use strict';

// node & 3pp libs
const path = require('path');
const Promise = require('bluebird');
const http = require('http');
const express = require('express');

// Salesforce lib
const utils = require(path.join(__dirname, 'utils'));
const force = require('salesforce-alm-buildpack-dev');

// General
const DEBUG = utils.getEnvVarValue('SALESFORCE_BUILDPACK_DEBUG', false, false, true); // for development ONLY
const VERBOSE = utils.getEnvVarValue('SALESFORCE_BUILDPACK_VERBOSE', false, false, true);
// App name tells us if we're setting up a Review app org or standard org (Sandbox or Production)
const HEROKU_APP_NAME = utils.getEnvVarValue('HEROKU_APP_NAME', false, 'SalesforceBuildpack');
const SALESFORCE_URL_CONFIG_VAR_NAME = 'SALESFORCE_URL';
// Custom URL provided by Salesforce Add-on that enables connectivity to org.
// If false, app is telling us that a Salesforce Add-on created org is not
// need, eg Test Runner is controlling what/how orgs are spun-up
const SALESFORCE_URL = utils.getEnvVarValue(SALESFORCE_URL_CONFIG_VAR_NAME, true);
const SALESFORCE_HUB_URL_CONFIG_VAR_NAME = 'SALESFORCE_HUB_URL';
const SALESFORCE_ORG = 'org@salesforce.com';
// force://${clientId}:${clientSecret}:${refreshToken}@${instanceUrl}
const SALESFORCE_URL_REGEX = /force:\/\/([A-Z0-9_\.]*):([A-Z0-9]*):([A-Z0-9_\.]*)@([\w-]+(\.[\w-]+)+\.?(:\d+)?)/ig;
const PREVIEW_APP_NAME_REGEX = /-pr-\d+$/;

// Push source options
const PUSH_SOURCE_OPTIONS = {
    // Deploy options
    polltimeout: parseInt(utils.getEnvVarValue('SALESFORCE_RETRIEVE_POLL_TIMEOUT_MS', false, 180 * 1000 /* 3 min */)),
    pollinterval: parseInt(utils.getEnvVarValue('SALESFORCE_RETRIEVE_POLL_INTERVAL_MS', false, 10 * 1000 /* 10 sec */)),
    runtests: utils.getEnvVarValue('SALESFORCE_DEPLOY_RUNTESTS', false, undefined),
    testlevel: utils.getEnvVarValue('SALESFORCE_DEPLOY_TESTLEVEL', false, undefined),
    rollbackonerror: utils.getEnvVarValue('SALESFORCE_DEPLOY_ROLLBACK_ON_ERROR', false, undefined),
    // API option
    username: SALESFORCE_ORG,
    verbose: VERBOSE,
    json: true
};

// Organization config, accessToken, username, instance, etc
let orgConfig;
let orgInstance;


//  F U N C T I O N S

// Generate config object from given SALESFORCE_URL
const parseOrgConfigFromUrl = function parseOrgConfigFromUrl(url, type, username) {
    const match = SALESFORCE_URL_REGEX.exec(url);
    if (match === null) {
        throw new Error(`Invalid SALESFORCE_URL: '${url}'`);
    }
    SALESFORCE_URL_REGEX.lastIndex = 0; // reset
    if (type === 'workspace') {
        orgInstance = `${match[4]}`;
    }

    // w/o accessToken
    return {
        orgId: '00Dxx0000000000',
        accessToken: 'REFRESH_ME', // Salesforce toolbelt commands will refresh
        refreshToken: match[3],
        instanceUrl: `https://${match[4]}`,
        username: username || SALESFORCE_ORG,
        clientId: match[1],
        clientSecret: match[2],
        type
    };
};

// Write workspace org config from SALESFORCE_URL to .appcloud to be consumed by appcloud module.
// If 'false', app is telling us that SALESFORCE_URL is not required.
const writeOrgConfig = function writeOrgConfig() {
    if (DEBUG) {
        utils.info(`[DEBUG] ${SALESFORCE_URL_CONFIG_VAR_NAME}: ${SALESFORCE_URL}`);
    }

    if (SALESFORCE_URL === 'false') {
        if (VERBOSE) {
            utils.info(`Skip writing Organization config: ${SALESFORCE_URL_CONFIG_VAR_NAME} was not required.`);
        }

        return Promise.resolve();
    }

    orgConfig = parseOrgConfigFromUrl(SALESFORCE_URL, 'workspace');

    if (DEBUG) {
        utils.info(`[DEBUG] Organization configuration: ${JSON.stringify(orgConfig)}`);
    }

    const orgConfigApi = new force.scratchOrgApi();
    orgConfigApi.setName(SALESFORCE_ORG);
    return orgConfigApi.saveConfig(orgConfig)
        .then(() => {
            if (DEBUG) {
                const orgConfigFilePath = force.util.getAppCloudFilePath(`${SALESFORCE_ORG}.json`);
                utils.info(`Wrote Organization configuration '${orgInstance}' to ${orgConfigFilePath}`);
            }
        });
};

// Write hub org config from SALESFORCE_URL to .appcloud to be consumed by appcloud module
const writeHubConfig = function writeHubConfig() {
    const salesforceHubUrl = utils.getEnvVarValue(SALESFORCE_HUB_URL_CONFIG_VAR_NAME, false, undefined);

    if (!salesforceHubUrl) {
        utils.info(`${SALESFORCE_HUB_URL_CONFIG_VAR_NAME} not provided, Environment Hub config not written`);
        return Promise.resolve();
    }

    if (DEBUG) {
        utils.info(`[DEBUG] ${SALESFORCE_HUB_URL_CONFIG_VAR_NAME}: ${salesforceHubUrl}`);
    }

    const hubConfig = parseOrgConfigFromUrl(salesforceHubUrl, 'hub');
    if (DEBUG) {
        utils.info(`[DEBUG] Hub config: ${JSON.stringify(hubConfig)}`);
    }

    const hubConfigApi = new force.hubOrgApi();
    return hubConfigApi.saveConfig(hubConfig)
        .then(() => {
            if (DEBUG) {
                const hubConfigFilePath = force.util.getAppCloudFilePath('hubConfig.json');
                utils.info(`Wrote Environment Hub config to ${hubConfigFilePath}`);
            }
        });
};

// Push workspace source to workspace org
const pushSource = function pushSource(targetOrg) {
    utils.info('');
    utils.action('###   P U S H   S O U R C E');

    const pushApi = new force.pushApi();

    if (targetOrg) {
        // set target org to which we'll push; targetOrg must reference ~/.appcloud config file
        PUSH_SOURCE_OPTIONS.username = targetOrg;
    }

    if (PREVIEW_APP_NAME_REGEX.exec(HEROKU_APP_NAME) === null) {
        // if standard org (Sandbox or Production, push all source; if not new (Review app), push only what has changed
        PUSH_SOURCE_OPTIONS.all = true;
    } else {
        // TODO: enable when Review app push-only-changed is supported
        // utils.info('Found Review app: will push only what has changed since previous push');
    }

    if (DEBUG) {
        utils.info(`[DEBUG] Push options: ${JSON.stringify(PUSH_SOURCE_OPTIONS)}`);
    }

    utils.info(`Pushing workspace source to Organization '${orgInstance}'...`);
    const start = (new Date()).getTime();
    return pushApi.doPush(PUSH_SOURCE_OPTIONS)
        .then((result) => {
            utils.info(`Push completed in ${utils.toSec((new Date()).getTime() - start)}s`);

            if (!result || result === null) {
                throw new Error('No result from push operation');
            }

            if (result.status && result.status === 'error') {
                throw new Error(result);
            }

            return Promise.resolve(result);
        })
        .catch((err) => {
            utils.error(`Push failed: ${err.message}`);
            throw err;
        });
};

/**
 * Setup.
 *
 * Setups env to invoke Salesforce and Force CLI plugin commands.
 *
 * @returns {Promise.<TResult>}
 */
const setupEnv = function setupEnv() {
    const config = new force.configApi.Config();
    return config.setEnableEncryption(false) // disable encryption to support headless invocation
        .then(() => {
            if (DEBUG) {
                utils.info('[DEBUG] Disabled encryption');
            }
        })
        .then(config.setWorkspaceOrg(SALESFORCE_ORG))
        .then(() => {
            if (DEBUG) {
                utils.info(`[DEBUG] Set workspace Organization to ${SALESFORCE_ORG}`);
            }
        })
        .then(writeHubConfig)
        .then(writeOrgConfig);
};

/**
 * Release phase.
 *
 * Push source to org.
 *
 * @returns {Promise.<TResult>}
 */
const release = function release() {
    return setupEnv()
        .then(pushSource);
};

/**
 * Redirect.
 *
 * Starts web process that redirects all requests to org opening to SALESFORCE_START_URL.
 */
const redirect = function redirect() {
    const startUrl = process.env.SALESFORCE_START_URL || '/one/one.app';
    const org = process.env.SALESFORCE_ORG || SALESFORCE_ORG;
    const app = express();

    const port = process.env.PORT || 5000;
    app.set('port', port);

    app.get('*', (request, response) => {
        const openApi = new force.openApi();
        openApi.validate({ username: org, path: startUrl, urlonly: true })
            .bind(openApi)
            .then(openApi.execute)
            .then((result) => {
                console.log(`Redirecting to Organization ${result.url}...`);
                response.redirect(result.url);
            });
    });

    const server = http.createServer(app);
    server.listen(app.get('port'), () => {
        console.log(`Redirect-to-Salesforce listening on ${port}`);
    });
};

/**
 * Main driver.
 *
 * Passed on param, invoke desired phase.
 */
const main = function main() {
    // assume success until otherwise
    process.exitCode = 0;
    const validateParamMsg = 'Valid parameters are \'setup\', \'release\', or \'redirect\'';

    let invoke;
    const start = (new Date()).getTime();
    return Promise.resolve()
        .then(() => {
            invoke = process.argv[2];
            if (!invoke) {
                throw new Error(`Parameter not provided.  ${validateParamMsg}`);
            }

            switch (invoke) {
                case 'setup':
                    return setupEnv();
                case 'release':
                    return release();
                case 'redirect':
                    return redirect();
                default:
                    throw new Error(`Illegal parameter '${invoke}'.  ${validateParamMsg}`);
            }
        })
        .catch(err => {
            process.exitCode = 1;
            utils.error(VERBOSE ? err.stack : err.message);
        })
        .finally(() => {
            const done = `${invoke ? invoke.toUpperCase() : ''} ${(process.exitCode === 0 ? 'SUCCESS!' : 'FAILED!')}  Completed in ${utils.toSec((new Date()).getTime() - start)}s`;
            utils.info('');
            utils.action(`${done}`);

            // shell that executed node should see process.exitCode
        });

};

// go!!!!
main();