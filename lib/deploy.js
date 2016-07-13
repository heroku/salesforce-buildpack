const fs = require('fs');
const connection = require('jsforce-connection').connection;
const jsforceDeploy = require('jsforce-deploy');


const srcPath = process.env.SALESFORCE_SRC_PATH || 'salesforce/src';
return connection().then((conn) => jsforceDeploy(conn)(srcPath));

