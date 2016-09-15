'use strict';

// node & 3pp libs
const fs = require('fs');
const path = require('path');
const util = require('util');
const Promise = require('bluebird');

const fs_mkdir = Promise.promisify(fs.mkdir);

// AppCloud lib
const _ = require(path.join(__dirname, 'utils'));
const force = require('salesforce-alm-buildpack-dev');

// General
const DEBUG = _.getEnvVarValue('SALESFORCE_BUILDPACK_DEBUG', false, false, true); // for development ONLY
const VERBOSE = _.getEnvVarValue('SALESFORCE_BUILDPACK_VERBOSE', false, false, true);
const HEROKU_APP_NAME = _.getEnvVarValue('HEROKU_APP_NAME', false, 'Salesforce Buildpack');
// FORCE_WORKSPACE=true if we're pushing source, false if deploying source
const IS_SALESFORCE_WORKSPACE = _.getEnvVarValue('SALESFORCE_WORKSPACE', false, true, true); // set by bin/compile
const SALESFORCE_SRC_PATH = _.getEnvVarValue('SALESFORCE_SRC_PATH', false, 'salesforce/src');
const SALESFORCE_URL_CONFIG_VAR_NAME = 'SALESFORCE_URL';
// custom URL provided by Salesforce Add-on that enables connectivity to org
const SALESFORCE_URL = _.getEnvVarValue(SALESFORCE_URL_CONFIG_VAR_NAME, true);
const SALESFORCE_HUB_URL_CONFIG_VAR_NAME = 'SALESFORCE_HUB_URL';
const SALESFORCE_DEPLOY_DIR = _.getEnvVarValue('SALESFORCE_DEPLOY_DIR', false, '.salesforce'); // set by bin/compile
const DEPLOY_ZIP_FILEPATH = path.join(SALESFORCE_DEPLOY_DIR, 'unpackaged.zip');
const SALESFORCE_ORG = 'org@salesforce.com';
// force://${clientId}:${clientSecret}:${refreshToken}@${instanceUrl}
const SALESFORCE_URL_REGEX = /force:\/\/([A-Z0-9_\.]*):([A-Z0-9]*):([A-Z0-9_\.]*)@([\w-]+(\.[\w-]+)+\.?(:\d+)?)/ig;
const PREVIEW_APP_NAME_REGEX = /-pr-\d+$/;

// AppCloud command invocation params
const HEROKU_APP_NAME_REPLACE_TOKEN = '[heroku-app-name]';
const DEFAULT_ORG_SHAPE = {
    'Company': HEROKU_APP_NAME_REPLACE_TOKEN,
    'Country': 'US',
    'LastName': HEROKU_APP_NAME_REPLACE_TOKEN,
    'SignupEmail': 'user@salesforce.com',
    'Edition': 'Developer',
    'OrgPreferences' : {
        'S1DesktopEnabled' : true
    }
};
const CREATE_ORG_CMD = {
    name: 'org:create',
    flags: {
        env: 'sandbox',
        workspace: true,
        json: true
    }
};
const PUSH_SOURCE_CMD = {
    name: 'org:push',
    flags: {
        targetname: SALESFORCE_ORG,
        all: true,
        workspace: true,
        json: true
    }
};
// Retrieve source from org to generate zip for upstream deployment; lack of unpackaged param
// signifies auto-generation of package.xml based on workspace content
const MDAPI_RETRIEVE_CMD = {
    name: 'mdapi:retrieve',
    flags: {
        targetname: SALESFORCE_ORG,
        retrievetarget: SALESFORCE_DEPLOY_DIR,
        all: true,
        // FIXME: convert to secs
        polltimeout: parseInt(_.getEnvVarValue('SALESFORCE_RETRIEVE_POLL_TIMEOUT_MS', false, 180 * 1000 /* 3 min */)),
        pollinterval: parseInt(_.getEnvVarValue('SALESFORCE_RETRIEVE_POLL_INTERVAL_MS', false, 10 * 1000 /* 10 sec */)),
        silent: true, // to quiet api output
        verbose: false, // for debugging
        json: true
    }
};
// Set deployroot (mdapi project) and/or zipfile (workspace project) when used
const MDAPI_DEPLOY_CMD = {
    name: 'mdapi:deploy',
    flags: {
        targetname: SALESFORCE_ORG,
        runtest: _.getEnvVarValue('SALESFORCE_DEPLOY_RUNTEST', false, ''),
        testlevel: _.getEnvVarValue('SALESFORCE_DEPLOY_TEST_LEVEL', false, ''),
        rollbackonerror: _.getEnvVarValue('SALESFORCE_DEPLOY_ROLLBACK_ON_ERROR', false, true),
        // FIXME: convert to secs
        polltimeout: parseInt(_.getEnvVarValue('SALESFORCE_DEPLOY_POLL_TIMEOUT_MS', false, 3 * 60 * 1000 /* 3 min */)),
        pollinterval: parseInt(_.getEnvVarValue('SALESFORCE_DEPLOY_POLL_INTERVAL_MS', false, 10 * 1000 /* 10 sec */)),
        silent: true, // to quiet api output
        verbose: false, // for debugging
        json: true
    }
};

// Org config, accessToken, username, instance, etc
let orgConfig;
// determines deploy mechanism: true we use Metadata API, false we use AppCloud push
let isByoo = _.getEnvVarValue('SALESFORCE_BYOO', false, false, true);


//  F U N C T I O N S

// Create artifact dir (SALESFORCE_DEPLOY_DIR), okay if exists
const makeArtifactDir = function makeArtifactDir() {
    return new Promise((resolve, reject) => {
        fs_mkdir(SALESFORCE_DEPLOY_DIR)
            .then(() => resolve(SALESFORCE_DEPLOY_DIR))
            .catch(error => {
                // It is ok if the directory already exist
                if (error.code === 'EEXIST') {
                    resolve(SALESFORCE_DEPLOY_DIR);
                } else {
                    reject(error);
                }
            });
    });
};

// Generate config object from given SALESFORCE_URL
const parseOrgConfigFromUrl = function parseOrgConfigFromUrl(url, type, username) {
    const match = SALESFORCE_URL_REGEX.exec(url);
    if (match === null) {
        throw new Error(`Invalid SALESFORCE_URL: '${url}'`);
    }
    SALESFORCE_URL_REGEX.lastIndex = 0; // reset

    // w/o accessToken
    return {
        orgId: '00Dxx0000000000',
        accessToken: 'REFRESH_ME', // AppCloud toolbelt commands will refresh
        refreshToken: match[3],
        instanceUrl: `https://${match[4]}`,
        username: username || SALESFORCE_ORG,
        clientId: match[1],
        clientSecret: match[2],
        type
    };
};

// Write workspace org config from SALESFORCE_URL to .appcloud to be consumed by appcloud module
const writeOrgConfig = function writeOrgConfig() {
    if (DEBUG) {
        _.info(`[DEBUG] ${SALESFORCE_URL_CONFIG_VAR_NAME}: ${SALESFORCE_URL}`);
    }

    orgConfig = parseOrgConfigFromUrl(SALESFORCE_URL, 'workspace');

    if (DEBUG) {
        _.info(`[DEBUG] Org config: ${JSON.stringify(orgConfig)}`);
    }

    const orgConfigApi = new force.scratchOrgApi();
    orgConfigApi.setName(SALESFORCE_ORG);
    return orgConfigApi.saveConfig(orgConfig)
        .then(() => {
            const orgConfigFilePath = force.util.getAppCloudFilePath(`${SALESFORCE_ORG}.json`);
            _.info(`Wrote '${orgConfig.username}' user org config to ${orgConfigFilePath}`);
        });
};

// Write hub org config from SALESFORCE_URL to .appcloud to be consumed by appcloud module
const writeHubConfig = function writeHubConfig(required = true) {
    const salesforceHubUrl = _.getEnvVarValue(SALESFORCE_HUB_URL_CONFIG_VAR_NAME, required, undefined);

    if (!salesforceHubUrl && !required) {
        _.info(`${SALESFORCE_HUB_URL_CONFIG_VAR_NAME} not provided: hub config not written`);
        return Promise.resolve();
    }

    if (DEBUG) {
        _.info(`[DEBUG] ${SALESFORCE_HUB_URL_CONFIG_VAR_NAME}: ${salesforceHubUrl}`);
    }

    const hubConfig = parseOrgConfigFromUrl(salesforceHubUrl, 'hub');
    if (DEBUG) {
        _.info(`[DEBUG] Hub config: ${JSON.stringify(hubConfig)}`);
    }

    const hubConfigApi = new force.hubOrgApi();
    return hubConfigApi.saveConfig(hubConfig)
        .then(() => {
            const hubConfigFilePath = force.util.getAppCloudFilePath('hubConfig.json');
            _.info(`Wrote hub config to ${hubConfigFilePath}`);
        });
};

// Prepare for push/deploy
const prepareEnv = function prepare() {
    _.info('');
    _.action('###   P R E P A R E');

    return makeArtifactDir()
        .then(writeOrgConfig);
};

// Inspect command result
const evalResult = function evalResult(cmd, result) {
    if (!result || result === null) {
        throw new Error(`No result from ${cmd.name}`);
    }

    if (result.status && result.status === 'error') {
        throw new Error(result);
    }

    return Promise.resolve(result);
};

// Create build org which we push source to and generate a zip
// from; zip will be stored in slug and deployed to prod org
const createBuildOrg = function pushSource() {
    _.info('');
    _.action('###   C R E A T E   B U I L D   O R G');  // REVIEWME: we may want to create org silently

    const createOrgCmd = new force.createOrg();

    let orgShape = _.getEnvVarValue('SALESFORCE_ORG_SHAPE', false);
    if (!orgShape) {
        orgShape = DEFAULT_ORG_SHAPE;
        orgShape.Company = orgShape.Company.replace(HEROKU_APP_NAME_REPLACE_TOKEN, HEROKU_APP_NAME);
        orgShape.LastName = orgShape.LastName.replace(HEROKU_APP_NAME_REPLACE_TOKEN, HEROKU_APP_NAME);

        // FIXME: temp for gs0
        delete orgShape.Edition;
        orgShape.TemplateId = '0TTB00000003V07';
    }

    CREATE_ORG_CMD.flags.object = JSON.stringify(orgShape);

    if (DEBUG) {
        _.info(`[DEBUG] CreateBuildOrg options: ${JSON.stringify(CREATE_ORG_CMD.flags)}`);
    }

    _.info('Creating build org...');
    const start = (new Date()).getTime();
    return createOrgCmd.validate(CREATE_ORG_CMD.flags)
        .bind(createOrgCmd)
        .then(createOrgCmd.execute)
        .then((result) => {
            _.info(`Create build org completed in ${_.toSec((new Date()).getTime() - start)}s`);

            return evalResult(CREATE_ORG_CMD.name, result);
        })
        .then((result) => {
            if (VERBOSE) {
                _.info(`Created build org '${result.username}' [${result.orgId}]`);
            }

            return result;
        })
        .catch((err) => {
            _.error(`CreateBuildOrg failed: ${err.message}`);
            throw err;
        });
};

// Push workspace source to workspace org
const pushSource = function pushSource(targetOrg) {
    _.info('');
    _.action('###   P U S H');

    const pushCmd = new force.push();

    if (targetOrg) {
        // set target org to which we'll push; targetOrg must reference ~/.appcloud config file
        // TODO: check for ~/.appcloud/<targetOrg>.json
        PUSH_SOURCE_CMD.flags.targetname = targetOrg;
    }

    if (DEBUG) {
        _.info(`[DEBUG] Push options: ${JSON.stringify(PUSH_SOURCE_CMD.flags)}`);
    }

    _.info(`Pushing workspace source to org '${PUSH_SOURCE_CMD.flags.targetname}'...`);
    const start = (new Date()).getTime();
    return pushCmd.validate(PUSH_SOURCE_CMD.flags)
        .bind(pushCmd)
        .then(pushCmd.execute)
        .then((result) => {
            _.info(`Push completed in ${_.toSec((new Date()).getTime() - start)}s`);

            return evalResult(PUSH_SOURCE_CMD.name, result);
        })
        .then((result) => {
            if (VERBOSE) {
                _.info(`Pushed source [${result.PushedSource.length}]:`);

                result.PushedSource.sort((file1, file2) => {
                    const field = file1.path ? 'path' : 'filePath';
                    const fileName1 = file1[field].toUpperCase();
                    const fileName2 = file2[field].toUpperCase();
                    if (fileName1 < fileName2) {
                        return -1;
                    }

                    if (fileName1 > fileName2) {
                        return 1;
                    }

                    return 0;
                });

                const paths = [];
                result.PushedSource.forEach(file => {
                    const field = file.path ? 'path' : 'filePath';
                    paths.push(`${_.INDENT.LOG}  ${file[field]}`);
                });

                console.log(paths.join('\n'));
            }
        })
        .catch((err) => {
            _.error(`Push failed: ${err.message}`);
            throw err;
        });
};

// Retrieve source from org to local zip
const retrieveZip = function retrieveZip(targetOrg) {
    _.info('');
    _.action('###   R E T R I E V E');

    const retrieveCmd = new force.retrieve();

    if (targetOrg) {
        // set target org to which we'll retrieve; targetOrg must reference ~/.appcloud config file
        // TODO: check for ~/.appcloud/<targetOrg>.json
        MDAPI_RETRIEVE_CMD.flags.targetname = targetOrg;
    }

    if (DEBUG) {
        _.info(`[DEBUG] Retrieve options: ${JSON.stringify(MDAPI_RETRIEVE_CMD.flags)}`);
    }

    _.info(`Retrieving source metadata zip from org '${MDAPI_RETRIEVE_CMD.flags.targetname}'...`);
    const start = (new Date()).getTime();
    return retrieveCmd.execute(MDAPI_RETRIEVE_CMD.flags)
        .then((result) => {
            _.info(`Retrieve completed in ${_.toSec((new Date()).getTime() - start)}s`);
            return evalResult(MDAPI_RETRIEVE_CMD.name, result);
        })
        .then((result) => {
            _.info('');
            _.info(`Status: ${result.status}`);
            _.info(`Id:  ${result.id}`);

            if (VERBOSE) {
                const hasFileProperties = result.fileProperties
                    && Array.isArray(result.fileProperties)
                    && result.fileProperties.length > 0;

                if (hasFileProperties) {
                    result.fileProperties.sort((file1, file2) => {
                        const fileName1 = file1.fullName.toUpperCase();
                        const fileName2 = file2.fullName.toUpperCase();
                        if (fileName1 < fileName2) {
                            return -1;
                        }

                        if (fileName1 > fileName2) {
                            return 1;
                        }

                        return 0;
                    });

                    const paths = [];
                    result.fileProperties.forEach(file => {
                        paths.push(`${_.INDENT.LOG}  ${file.fullName}`);
                    });


                    _.info(`Components retrieved [${result.fileProperties.length}]:`);
                    console.log(paths.join('\n'));
                } else {
                    _.warning('No components retrieved');
                }
            }

            if (result.messages
                && Array.isArray(result.messages)
                && result.messages.length > 0) {
                result.messages.sort((file1, file2) => {
                    const fileName1 = file1.fileName.toUpperCase();
                    const fileName2 = file2.fileName.toUpperCase();
                    if (fileName1 < fileName2) {
                        return -1;
                    }

                    if (fileName1 > fileName2) {
                        return 1;
                    }

                    return 0;
                });

                const problems = [];
                result.messages.forEach(file => {
                    problems.push(`${_.INDENT.ERROR}  ${file.fileName}`);
                    problems.push(`${_.INDENT.LOG}  ${file.problem}`);
                });

                console.error(problems.join('\n'));
            }

            _.info('');

            try {
                const stat = fs.statSync(result.zipFilePath);
                _.info(`Wrote retrieve zip to ${result.zipFilePath} (${_.toKb(stat.size)} KB)`);
            }
            catch (err) {
                if (err.code === 'ENOENT') {
                    throw new Error(`Deploy zip should have been generated.  Zip not found: ${result.zipFilePath}`);
                } else {
                    throw err;
                }
            }
        })
        .catch((err) => {
            _.error(`Retrieve failed: ${err.message}`);
            throw err;
        });
};

// Deploy source root or zip to workspace org
const deploy = function deploy(addtlDeployOptions) {
    _.info('');
    _.action('###   D E P L O Y');

    if (util.isNullOrUndefined(addtlDeployOptions)) {
        throw new Error('Deploy options (deployroot or zipfile) not provided');
    }

    const deployCmd = new force.deploy();
    const deployOptions = Object.assign(MDAPI_DEPLOY_CMD.flags, addtlDeployOptions);
    if (DEBUG) {
        _.info(`[DEBUG] Deploy options: ${JSON.stringify(deployOptions)}`);
    }

    _.info(`Deploying ${(addtlDeployOptions.deployroot ? 'source' : 'zip')} to org '${orgConfig.username}' at ${orgConfig.instanceUrl} (timeout: ${deployOptions.polltimeout}ms, interval: ${deployOptions.pollinterval}ms)...`);

    const start = (new Date()).getTime();
    return deployCmd.execute(deployOptions)
        .then((result) => {
            _.info(`Deploy completed in ${_.toSec((new Date()).getTime() - start)}s`);
            return evalResult(MDAPI_DEPLOY_CMD.name, result);
        })
        .then((result) => {
            _.info('');
            _.action(`Status:  ${result.status}`);
            _.info(`Id:  ${result.id}`);
            _.info(`Completed:  ${result.completedDate}`); // TODO: convert to locale
            _.info(`Component errors:  ${result.numberComponentErrors}`);
            _.info(`Components deployed:  ${result.numberComponentsDeployed}`);
            _.info(`Components total:  ${result.numberComponentsTotal}`);
            _.info(`Tests errors:  ${result.numberTestErrors}`);
            _.info(`Tests completed:  ${result.numberTestsCompleted}`);
            _.info(`Tests total:  ${result.numberTestsTotal}`);

            if (VERBOSE) {
                if (result.details) {
                    if (result.details.componentSuccesses) {
                        result.details.componentSuccesses.sort((file1, file2) => {
                            const fileName1 = file1.fullName.toUpperCase();
                            const fileName2 = file2.fullName.toUpperCase();
                            if (fileName1 < fileName2) {
                                return -1;
                            }

                            if (fileName1 > fileName2) {
                                return 1;
                            }

                            return 0;
                        });

                        const paths = [];
                        result.details.componentSuccesses.forEach(source => {
                            paths.push(`${_.INDENT.LOG}  ${source.fullName}`);
                        });

                        _.info(`Deployment successes [${result.details.componentSuccesses.length}]:`);
                        console.log(paths.join('\n'));
                    }

                    if (result.details.componentFailures) {
                        result.details.componentFailures.sort((file1, file2) => {
                            const fileName1 = file1.fullName.toUpperCase();
                            const fileName2 = file2.fullName.toUpperCase();
                            if (fileName1 < fileName2) {
                                return -1;
                            }

                            if (fileName1 > fileName2) {
                                return 1;
                            }

                            return 0;
                        });

                        const paths = [];
                        result.details.componentFailures.forEach(source => {
                            paths.push(`${_.INDENT.LOG}  ${source.fullName}`);
                        });

                        _.info(`Deployment failures [${result.details.componentFailures.length}]:`);
                        console.log(paths.join('\n'));
                    }
                }
            }
        })
        .catch(err => {
            if (err && err.message && err.message.startsWith('Polling time out')) {
                _.warning(`Deploy timed out in ${_.toSec((new Date()).getTime() - start)}s`);
            } else {
                _.error(`Deploy failed: ${err.message}`);
            }

            throw err;
        });
};

/**
 * Compile phase.
 *
 * Review app (Scratch Org): nothing as we'll push source in release phase
 * Stage (non-Scratch Org w/ BYOO config var): create org, push source to org,
 * retrieve zip for release phase deployment
 *
 * @returns {Promise.<TResult>}
 */
const compile = function compile() {
    return Promise.resolve()
        .then(() => {
            if (isByoo) {
                _.info('Found BYOO app.');

                if (IS_SALESFORCE_WORKSPACE) {
                    _.info('Found Force.com workspace project.');
                    _.info('Generating deployment artifact...');

                    return prepareEnv()
                        .then(writeHubConfig)
                        .then(createBuildOrg)
                        .then((result) => {
                            if (!result && !result.username) {
                                throw new Error('Expected org target');
                            }

                            const targetName = result.username;
                            return pushSource(targetName)
                                .then(() => retrieveZip(targetName));
                        })
                        .then(() => {
                            try {
                                const stat = fs.statSync(DEPLOY_ZIP_FILEPATH);
                                if (VERBOSE) {
                                    _.info(`Verified deployment artifact: ${DEPLOY_ZIP_FILEPATH} (${_.toKb(stat.size)} KB)`);
                                }
                            }
                            catch (err) {
                                if (err.code === 'ENOENT') {
                                    throw new Error(`Deploy zip should have been generated.  Zip not found: ${DEPLOY_ZIP_FILEPATH}`);
                                } else {
                                    throw err;
                                }
                            }

                            _.info('');
                            _.action('Source zip deployment performed in release phase script or Procfile.');
                        });
                } else {
                    _.info('Found Force.com Metadata API project.');
                    _.info('');
                    _.action('Source root deployment performed in release phase script or Procfile.');

                    return Promise.resolve();
                }
            } else {
                _.info('Found Scratch Org app.');

                return prepareEnv()
                    .then(pushSource);
            }
        });
};

/**
 * Release phase.
 *
 * Review app (Scratch Org): push source to org
 * Stage or Prod app (non-Scratch Org w/ BYOO config var): deploy zip to org
 *
 * @returns {Promise.<TResult>}
 */
const release = function release() {
    return Promise.resolve()
        .then(() => {
            if (isByoo) {
                _.info('Found BYOO app.');

                let stats;
                try {
                    stats = fs.statSync(DEPLOY_ZIP_FILEPATH);
                }
                catch (err) {
                    if (err.code === 'ENOENT') {
                        throw new Error(`Unable to deploy: deployment zip not found: ${DEPLOY_ZIP_FILEPATH}`);
                    } else {
                        throw err;
                    }
                }

                _.info(`Found deployment artifact: ${DEPLOY_ZIP_FILEPATH} (${_.toKb(stats.size)} KB)`);

                return prepareEnv()
                    .then(() => deploy({ zipfile: DEPLOY_ZIP_FILEPATH }));
            } else {
                _.info('Found Scratch Org app.');

                return writeOrgConfig()
                    .then(writeHubConfig)
                    .then(() => {
                        if (IS_SALESFORCE_WORKSPACE) {
                            _.info('Found Force.com workspace project.');
                            _.info('Source pushed in compile phase.');

                            return Promise.resolve();
                        } else {
                            _.info('Found Force.com Metadata API project.');

                            // REVIEWME: project root should come from config var
                            return deploy({
                                deployroot: SALESFORCE_SRC_PATH
                            });
                        }
                    });
            }
        });
};

/**
 * Setup.
 *
 * Setups env to invoke AppCloud and Force CLI plugin commands.
 *
 * @returns {Promise.<TResult>}
 */
const setup = function setup() {
    _.info('Setting up environment for AppCloud and Force CLI plugin commands.');
    return writeHubConfig(false)
        .then(writeOrgConfig);
};

/**
 * Main driver.
 *
 * Passed on param, invoke desired phase.
 *
 */
const main = function main() {
    // assume success until otherwise
    process.exitCode = 0;
    const validateParamMsg = 'Valid parameters are \'compile\' or \'release\' or \'setup\'';

    let invoke;
    const start = (new Date()).getTime();
    return Promise.resolve()
        .then(() => {
            invoke = process.argv[2];
            if (!invoke) {
                throw new Error(`Parameter not provided.  ${validateParamMsg}`);
            }

            // since Review apps inherit from parent app and may have SALESFORCE_BYOO=true, let's
            // double-check that this isn't a Review app and if it is, set isByoo to false to
            // signal that we'll AppCloud push to org (instead of mdAPI deploy)
            isByoo = isByoo && PREVIEW_APP_NAME_REGEX.exec(HEROKU_APP_NAME) !== null ? false : isByoo;

            switch (invoke) {
                case 'setup':
                    return setup();
                case 'compile':
                    return compile();
                case 'release':
                    return release();
                default:
                    throw new Error(`Illegal parameter '${invoke}'.  ${validateParamMsg}`);
            }
        })
        .catch(err => {
            process.exitCode = 1;
            _.error(VERBOSE ? err.stack : err.message);
        })
        .finally(() => {
            const done = `${invoke ? invoke.toUpperCase() : ''} ${(process.exitCode === 0 ? 'SUCCESS!' : 'FAILED!')}  Completed in ${_.toSec((new Date()).getTime() - start)}s`;
            _.info('');
            _.action(`${done}`);

            // shell that executed node should see process.exitCode
        });

};

// go!!!!
main();