const url = require('url');
const jsforce = require('jsforce');
const requireEnvVar = require('./require-env-var');
const refreshSalesforceAuth = require('./refresh-salesforce-auth');
const getSalesforceIdentity = require('./get-salesforce-identity');

// Return Promise of authenticated jsForce connection.
module.exports = function createJsforceConnection(forceComVersion = '37.0') {

  const forceComAlmUrl = url.parse(requireEnvVar('SALESFORCE_URL'));
  const forceComAuth = forceComAlmUrl.auth.split(':');
  const forceComId = forceComAuth[0];
  const forceComSecret = forceComAuth[1];
  const forceComRefreshToken = forceComAuth[2];
  const forceComHost = forceComAlmUrl.host;
  const forceComUrl = `https://${forceComHost}`;

  console.log('-----> Force.com connecting', forceComUrl);

  // Dynamic assignments with top-level scope
  let forceComAuthToken;
  let forceComUserId;
  let forceComUsername;

  let connection;

  return refreshSalesforceAuth(forceComHost, forceComId, forceComSecret, forceComRefreshToken)
    .then( ({accessToken, idUrl}) => {
      forceComAuthToken = accessToken;
      connection = new jsforce.Connection({
        accessToken: accessToken,
        loginUrl: forceComUrl,
        instanceUrl: forceComUrl,
        serverUrl: `${forceComUrl}/services/Soap/u/${forceComVersion}`,
        version: forceComVersion
      });
      return getSalesforceIdentity(accessToken, idUrl);
    })
    .then( res => {
      console.log('-----> Salesforce org ID', res.organization_id);
      console.log('-----> Salesforce admin user ID', res.user_id);
      console.log('-----> Salesforce admin username', res.username);
      return connection;
    });

}
