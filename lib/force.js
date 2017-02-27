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
const force = require('salesforce-alm');

// General
const DEBUG = utils.getEnvVarValue('SALESFORCE_BUILDPACK_DEBUG', false, false, true); // for development ONLY
const VERBOSE = utils.getEnvVarValue('SALESFORCE_BUILDPACK_VERBOSE', false, false, true);
// App name tells us if we're setting up a Review app org or standard org (Sandbox or Production)
const HEROKU_APP_NAME = utils.getEnvVarValue('HEROKU_APP_NAME', false, 'SalesforceBuildpack');
const SFDX_AUTH_URL_CONFIG_VAR_NAME = 'SFDX_AUTH_URL';
// Custom URL provided by Salesforce Add-on that enables connectivity to org.
// If false, app is telling us that a Salesforce Add-on created org is not
// need, eg Test Runner is controlling what/how orgs are spun-up
const SFDX_AUTH_URL = utils.getEnvVarValue(SFDX_AUTH_URL_CONFIG_VAR_NAME, true);
const SFDX_DEV_HUB_AUTH_URL_CONFIG_VAR_NAME = 'SFDX_DEV_HUB_AUTH_URL';
// force://${clientId}:${clientSecret}:${refreshToken}@${instanceUrl}
const SFDX_AUTH_URL_REGEX = /^force:\/\/(?:(\w*):(\w*):)?([\w.]*)@([\w@:/\-.]*)$/;
const PREVIEW_APP_NAME_REGEX = /-pr-\d+$/;

const WORKSPACE_ORG = '_sfdc_buildpack_workspace@salesforce.com';
const DEV_HUB_ORG = '_sfdc_buildpack_devhub@salesforce.com';

// Push source options
const PUSH_SOURCE_OPTIONS = {
    // Deploy options
    polltimeout: parseInt(utils.getEnvVarValue('SALESFORCE_DEPLOY_POLL_TIMEOUT_MS', false, 180 * 1000 /* 3 min */)),
    pollinterval: parseInt(utils.getEnvVarValue('SALESFORCE_DEPLOY_POLL_INTERVAL_MS', false, 10 * 1000 /* 10 sec */)),
    runtests: utils.getEnvVarValue('SALESFORCE_DEPLOY_RUNTESTS', false, undefined),
    testlevel: utils.getEnvVarValue('SALESFORCE_DEPLOY_TESTLEVEL', false, undefined),
    rollbackonerror: utils.getEnvVarValue('SALESFORCE_DEPLOY_ROLLBACK_ON_ERROR', false, undefined),
    // API option
    targetusername: WORKSPACE_ORG,
    verbose: VERBOSE,
    json: true
};

let orgInstance;

//  F U N C T I O N S

const getOrgInstance = function getOrgInstance(url=SFDX_AUTH_URL) {
    if (!orgInstance) {
        const match = SFDX_AUTH_URL_REGEX.exec(url);
        if (match === null) {
            throw new Error(`Invalid SFDX_AUTH_URL: '${url}'`);
        }
        SFDX_AUTH_URL_REGEX.lastIndex = 0; // reset
        orgInstance = `${match[4]}`;
    }

    return orgInstance;
};

// Write workspace org config from SFDX_AUTH_URL to .sfdx to be consumed by push/deploy/test sfdx APIs.
// If 'false', app is telling us that SALESFORCE_URL is not required.
const writeOrgConfig = function writeOrgConfig() {
    if (DEBUG) {
        utils.info(`[DEBUG] ${SFDX_AUTH_URL_CONFIG_VAR_NAME}: ${SFDX_AUTH_URL}`);
    }

    if (SFDX_AUTH_URL === 'false') {
        if (VERBOSE) {
            utils.info(`Skip writing Organization config: ${SFDX_AUTH_URL_CONFIG_VAR_NAME} was not required.`);
        }

        return Promise.resolve();
    }

    return auth(SFDX_AUTH_URL, 'setdefaultusername', WORKSPACE_ORG)
        .then((response) => {
            utils.info(`Stored WORKSPACE '${DEV_HUB_ORG}' Organization configuration...`);
            if (DEBUG) {
                utils.info(`[DEBUG] ${JSON.stringify(response)}`);
            }
        });
};

// Write hub org config from SFDX_DEV_HUB_AUTH_URL to .sfdx to be consumed by org-create command
const writeHubConfig = function writeHubConfig() {
    const salesforceHubUrl = utils.getEnvVarValue(SFDX_DEV_HUB_AUTH_URL_CONFIG_VAR_NAME, false, undefined);

    if (!salesforceHubUrl) {
        utils.info(`${SFDX_DEV_HUB_AUTH_URL_CONFIG_VAR_NAME} not provided, Dev Hub config not written`);
        return Promise.resolve();
    }

    if (DEBUG) {
        utils.info(`[DEBUG] ${SFDX_DEV_HUB_AUTH_URL_CONFIG_VAR_NAME}: ${salesforceHubUrl}`);
    }

    return auth(salesforceHubUrl, 'setdefaultdevhubusername', DEV_HUB_ORG)
        .then((response) => {
            utils.info(`Stored DEV HUB '${DEV_HUB_ORG}' Organization configuration...`);
            if (DEBUG) {
                utils.info(`[DEBUG] ${JSON.stringify(response)}`);
            }
        });
};

const auth = function auth(authUrl, defaultFlag, alias) {
    const flags = { sfdxurl: authUrl, setalias: alias, json: true };
    if (defaultFlag) {
        flags[defaultFlag] = true;
    }
    const authApi = new force.authApi();
    return authApi.execute(flags)        
        .catch((err) => {
            throw err;
        });
};

// Push workspace source to workspace org
const pushSource = function pushSource(targetUsername = WORKSPACE_ORG) {
    utils.info('');
    utils.action('###   P U S H   S O U R C E');

    if (targetUsername) {
        // set target org to which we'll push; targetOrg must reference ~/.sfdx config file
        PUSH_SOURCE_OPTIONS.targetusername = targetUsername;
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

    utils.info(`Pushing workspace source to Organization '${getOrgInstance()}'...`);
    const start = (new Date()).getTime();
    const orgPromise = force.orgApi.create(targetUsername, force.orgApi.Defaults.USERNAME);
    return orgPromise
        .then((org) => force.metadataRegistry.initializeMetadataTypeInfos(org))
        .then(() => (new force.pushApi(orgPromise.value())).doPush(PUSH_SOURCE_OPTIONS))
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
 * Setups env to invoke SFDX plugin commands.
 *
 * @returns {Promise.<TResult>}
 */
const setupEnv = function setupEnv() {
    return writeHubConfig()
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
    return pushSource();
};

/**
 * Redirect.
 *
 * Starts web process that redirects all requests to org opening to SALESFORCE_START_URL.
 */
const redirect = function redirect() {
    utils.info('');
    utils.action('###   R E D I R E C T   T O   S A L E S F O R C E   O R G A N I Z A T I O N');
    
    const startUrl = process.env.SALESFORCE_START_URL || '/one/one.app';
    const org = WORKSPACE_ORG;
    const app = express();

    const port = process.env.PORT || 5000;
    app.set('port', port);
    
    utils.info(`Will redirect requests to ${startUrl}`);

    app.get('*', (request, response) => {
        const openApi = new force.openApi();
        openApi.validate({ targetusername: org, path: startUrl, urlonly: true })
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
    process.env.SFDX_DISABLE_ENCRYPTION = true;
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
