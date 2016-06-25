const zipPath = '.salesforce/src.zip';
const oauth_url = process.env.SALESFORCE_URL;

const fs = require('fs');
const jsforce = require('jsforce');
const Promise = require('bluebird');
const { oauthConfig } = require('./auth');

const config = oauthConfig(oauth_url);
const conn = new jsforce.Connection(config);

conn.on('refresh', function(accessToken, res) {
  info(`refreshed access token`);
});

const prompt = function(message) {
  console.log(`-----> ${message}`);
};

const info = function(message) {
  console.log(`       ${message}`);
};

const error = function(message) {
  console.error(`       ${message}`);
};

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
