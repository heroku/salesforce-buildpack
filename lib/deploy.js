const zipPath = '.salesforce/src.zip';

const fs = require('fs');
const jsforce = require('jsforce');
const Promise = require('bluebird');
const { parseUrl, oauthConfig } = require('./auth');

const prompt = function(message) {
  console.log(`-----> ${message}`);
};

const info = function(message) {
  console.log(`       ${message}`);
};

const error = function(message) {
  console.error(`       ${message}`);
};

const addonInfo = parseUrl(process.env.SALESFORCE_URL);

if(!addonInfo) {
  error(`Didn't find a valid SALESFORCE_URL: ${process.env.SALESFORCE_URL}`);
  process.exit(1);
}

const config = oauthConfig(addonInfo);
const conn = new jsforce.Connection(config);

conn.on('refresh', function(accessToken, res) {
  info(`refreshed access token`);
});

console.log('-----> Deploying metadata');
const zipStream = fs.createReadStream(zipPath);
conn.metadata.pollTimeout = 240*1000;
const deployLocator = conn.metadata.deploy(zipStream, {});
deployLocator.on('progress', function(results) {
  info('polling...');
});
deployLocator.complete(true, function(err, result) {
  if(err) { error(err); }
  info('done ? :' + result.done);
  info('success ? : ' + result.true);
  info('state : ' + result.state);
  info('component errors: ' + result.numberComponentErrors);
  info('components deployed: ' + result.numberComponentsDeployed);
  info('tests completed: ' + result.numberTestsCompleted);
  info('       ' + (result.success ? 'Success' : 'Failed'));
});
