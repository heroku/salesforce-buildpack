const zipPath = '.salesforce/src.zip';

const fs = require('fs');
const jsforceConnection = require('./jsforce-connection');

const prompt = function(message) {
  console.log(`-----> ${message}`);
};

const info = function(message) {
  console.log(`       ${message}`);
};

const error = function(message) {
  console.error(` !     ${message}`);
};

return jsforceConnection()
  .then( conn => {
    return new Promise((resolve, reject) => {
      console.log('-----> Deploying metadata');
      const zipStream = fs.createReadStream(zipPath);
      conn.metadata.pollTimeout = 240*1000;
      const deployLocator = conn.metadata.deploy(zipStream, {});
      deployLocator.complete(true, function(err, result) {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    })
  })
  .then( result => {
    info('done ? :' + result.done);
    info('success ? : ' + result.true);
    info('state : ' + result.state);
    info('component errors: ' + result.numberComponentErrors);
    info('components deployed: ' + result.numberComponentsDeployed);
    info('tests completed: ' + result.numberTestsCompleted);
    info('       ' + (result.success ? 'Success' : 'Failed'));
  })
  .catch( err => {
    error(err.stack);
    process.exit(1);
  });

