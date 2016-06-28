const url = require('url');
const fetch = require('node-fetch');

module.exports = function refreshSalesforceAuth(forceComHost, forceComId, forceComSecret, forceComRefreshToken) {
  if (forceComHost == null || forceComId == null || forceComSecret == null || forceComRefreshToken == null) {
    throw new Error('Requires arguments `forceComHost, forceComId, forceComSecret, forceComRefreshToken`');
  }
  const query = `grant_type=refresh_token&client_id=${
    encodeURIComponent(forceComId)}&client_secret=${
    encodeURIComponent(forceComSecret)}&refresh_token=${
    encodeURIComponent(forceComRefreshToken)}`;
  const refreshAuthUrl = `https://${forceComHost}/services/oauth2/token?${query}`;

  console.log('-----> Refresh Salesforce auth');
  return fetch(refreshAuthUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json'
      }
    })
    .then( response => {
      const status = response.status;
      if (status >= 300) { throw new Error(`Request status ${status} for ${refreshAuthUrl}`) }
      //console.log('       response status', status);
      return response.json();
    })
    .then( salesforceAuth => {
      // Reset the identity URL to the specified instance host, otherwise Salesforce always uses "login.salesforce.com"
      const salesforceIdentityUrl = url.parse(salesforceAuth.id);
      salesforceIdentityUrl.host = forceComHost;
      const idUrl = url.format(salesforceIdentityUrl);
      //console.log(`       instance identity URL ${idUrl}`);
      return {
        accessToken: salesforceAuth.access_token,
        idUrl
      }
    });
}
