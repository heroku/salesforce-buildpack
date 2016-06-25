/*
force://<clientId>:<clientSecret>:<refreshToken>@<instanceUrl>
*/
var URL_REGEX = /force:\/\/(.*):(.*):(.*)@(.*)/;
var TOKEN_REGEX = /.*\"access_token\":\"([A-Za-z0-9.!_]*)\".*/;

function parseUrl(oauth_url) {
  if(oauth_url) {
    const matcher = oauth_url.match(URL_REGEX);
    if(matcher) {
      return {
          clientId : matcher[1],
          clientSecret : matcher[2],
          refreshToken : matcher[3],
          instance : matcher[4]
      }
    }
  }
  return null;
};

function oauthConfig(addonInfo) {

  const oauth2 = {
    clientId: addonInfo.clientId,
    clientSecret: addonInfo.clientSecret,
    redirectUri: 'https://www.example.com' // we don't care what this is but it has to match the Salesforce Connected App config set in the Environment Hub
  };

  const instanceUrl = `https://${addonInfo.instance}`;

  return {
    oauth2,
    instanceUrl,
    loginUrl: instanceUrl,
    refreshToken: addonInfo.refreshToken
  }
}

const request = require('request');
const refreshAuth = function(oauth) {
  return new Promise((resolve, reject) => {
    request
    .post(`https://${oauth.instance}/services/oauth2/token`, {
      qs: {
        grant_type: 'refresh_token',
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        refresh_token: oauth.refreshToken
      },
      headers: {
        Accept: 'application/json'
      }
    }, function (error, response, body) {
      if (error != null) {
        console.error(error);
        reject(error);
        return;
      }
      console.log('-----> Refresh auth', response.statusCode, body);
      resolve(JSON.parse(response.body).access_token);
    });
  })
};

module.exports = {
  parseUrl,
  oauthConfig,
  refreshAuth
};
