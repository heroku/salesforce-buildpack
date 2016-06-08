/*
force://<clientId>:<clientSecret>:<refreshToken>@<instanceUrl>
*/
var URL_REGEX = /force:\/\/(.*):(.*):(.*)@(.*)/;
var TOKEN_REGEX = /.*\"access_token\":\"([A-Za-z0-9.!_]*)\".*/;

var zipPath = '.salesforce/src.zip';

var oauth_url = process.env.SALESFORCE_URL;

if (!oauth_url) {
  console.error("Force.com deployment failed because SALESFORCE_URL is not configured");
  process.exit(1);
}

var matcher = oauth_url.match(URL_REGEX);
var clientId = matcher[1];
var clientSecret = matcher[2];
var refreshToken = matcher[3];
var instance = matcher[4];

var fs = require('fs');
var jsforce = require('jsforce');
var Promise = require('bluebird');

var connection = new Promise(function (resolve, reject) {
  var oauth2 = new jsforce.OAuth2({
    clientId : clientId,
    clientSecret : clientSecret
  }).refreshToken(refreshToken, function(res, body) {
    // Logging too be able to log in through the UI. Set as an env var?
    console.log(body.access_token);
    resolve(new jsforce.Connection({
      instanceUrl : `https://${instance}`,
      accessToken : body.access_token
    }));
  }).catch(reject);
});

console.log('-----> Deploying metadata');
connection.then(function(conn) {
  var zipStream = fs.createReadStream(zipPath);
  conn.metadata.pollTimeout = 240*1000;
  var deployLocator = conn.metadata.deploy(zipStream, {});
  deployLocator.on('progress', function(results) {
    console.log('       polling...');
  });
  deployLocator.complete(true, function(err, result) {
    console.log('       ' + results.success);
  });
})
.catch(console.error);
