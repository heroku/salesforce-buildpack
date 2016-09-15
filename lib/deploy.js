const fs = require('fs');
const connection = require('jsforce-connection').connection;
const jsforceDeploy = require('jsforce-deploy');

console.log('SALESFORCE_URL: ' + require('process').env['SALESFORCE_URL']);

const srcPath = process.env.SALESFORCE_SRC_PATH || 'salesforce/src';
return connection().then((conn) => jsforceDeploy(conn)(srcPath));

