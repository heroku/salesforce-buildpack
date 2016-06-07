


var URL_REGEX = /force:\/\/(.*):(.*):(.*)@(.*)/;
var TOKEN_REGEX = /.*\"access_token\":\"([A-Za-z0-9.!_]*)\".*/;

var oauth_url = process.env.SALESFORCE_URL;
var matcher = oauth_url.match(URL_REGEX);
var clientId = matcher[1];
var clientSecret = matcher[2];
var refreshToken = matcher[3];
var instance = matcher[4];

var jsforce = require('jsforce');
var Promise = require('bluebird');

var connection = new Promise(function (resolve, reject) {
  var oauth2 = new jsforce.OAuth2({
    clientId : clientId,
    clientSecret : clientSecret
  }).refreshToken(refreshToken, function(res, body) {
    resolve(new jsforce.Connection({
      instanceUrl : `https://${instance}`,
      accessToken : body.access_token
    }));
  }).catch(reject);
});

/*
force://3MVG9uudbyLbNPZPJ7rfcmjUsSDz.biRmGWhBIqkd53LGaXBYkd3XRFd7uPshVGBOdAAno5KP.FsJDQZTZuy2:5920784165336231569:5Aep861QbHyftz0nI.Y2vqH06LTSXsSFkG1YigczXd_X_OX9IeQCv_m1fhx8uaQujmJJxK.tf7M4qH4BXdW.oA2@scratch-1465313404428-dev-ed.my.salesforce.com
*/

connection.then(function(conn) {
  return conn.query('select id from account').then(res => {
    console.log(res);
  });
})
.catch(console.error);
