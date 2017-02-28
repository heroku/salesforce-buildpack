# Heroku Buildpack for Salesforce DX

This is the official [Heroku buildpack](http://devcenter.heroku.com/articles/buildpacks) for Salesforce provisioned apps.
This buildpack enables various Salesforce specific development operations such as retrieving and deploying metadata,
creating orgs, running tests, and importing/exporting data, to allow for Continuous Integration and Continuous Delivery.

## Documentation
This buildpack installs Node.js, the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-command-line),
and the [Salesforce DX Plugin] -- provide link to public docs here -- and the [Salesforce Force.com Plugin] -- provide link to public docs here --.  It can be referenced within your
[app.json](https://devcenter.heroku.com/articles/app-json-schema) file or specified via command line e.g.,
```
heroku buildpacks:add https://github.com/heroku/salesforce-buildpack --app my-app
```

## Requirements
This buildpack requires:

1. The Heroku Salesforce Addon -- provide link to docs here --

   Reference the addon in your [app.json](https://devcenter.heroku.com/articles/app-json-schema) or via command line e.g.,
   ```
   heroku addons:create salesforce:standard
   ```
   The Salesforce addon will set the SALESFORCE_URL config var which is required by the buildpack.  You can use the
   Salesforce Environment Manager on Heroku or [SEM-H](https://gist.github.com/simpsoka/c584c65d655268eaf26ec487bf6b8295)
   to view all your Salesforce orgs that have been attached to Heroku apps.
   
   The Salesforce add-on is in alpha status.  Please contact Heroku to request access. 
   
2. A [config.json] -- provide link to schema -- file in the root directory.

   This file points to the [force.com](https://www.salesforce.com/products/platform/products/force/) source directory
   of your project via the defaultArtifact property name.
   
   Example:
   ```
   {
      "sfdcLoginUrl": "https://login.salesforce.com",
      "apiVersion": "38.0",
      "defaultArtifact": "force-app"
   }
   ```

## Pipelines
To achieve a Continuous Integration and Continuous Delivery flow, you can create a [Heroku Pipeline](https://devcenter.heroku.com/articles/pipelines) and attach your Salesforce provisioned Heroku apps.  See example below.

## Config Vars
**SALESFORCE_URL**: Salesforce Add-on applied that defines connectivity to an org.

**SALESFORCE_HUB_URL**: Salesforce Add-on or manually applied that enables the Salesforce Add-on and Test Runner to create orgs.  To enable creating orgs fro Review apps, include `SALESFORCE_HUB_URL` in your `app.json` and set `required: true`.

##Using the buildpack with test runner
Running tests means setting up and managing the testing environment. The Salesforce DX test runner can be configured to do all setup and cleanup tasks. A sample set of tasks could be: create a scratch org; push source to the org; create permsets; import data; run tests; delete the org.
Alternatively, the test runner can simply run tests and leverage setup done during (e.g.) the [release phase](https://devcenter.heroku.com/articles/release-phase).

In order to have the test runner perform setup and cleanup tasks, the SALESFORCE_HUB_URL config var must be defined in the pipeline config.  Test runner uses this variable, along with the Salesforce buildpack-generated `~/.sfdx/hubOrg.json` file, to create scratch orgs.  Within the scripts section of `app.json` or `app-ci.json`, define a test script that will execute the test runner command from the Salesforce DX CLI. For example:
```
heroku force:test -c test/test-runner-config.json -r tap
```
The `test-runner-config.json` defines the setup and tear-down tasks as well as the tests to be executed as part of that
test profile.

To have the test runner simply run tests, the Salesforce addon must be provisioned and all setup tasks must be performed before the
tests execute.  This is accomplished by defining a `test-setup` script within `app.json` or `app-ci.json`. This script must handle
pushing source, creating permsets, and importing data.  The test runner would then just execute tests with a command
such as,
```
heroku force:apex:test -r tap
```


## Testing via Heroku CI
The buildpack allows testing your code changes via [Heroku CI](https://devcenter.heroku.com/articles/heroku-ci-prerelease). 

## Force.com Source Deployment via Release Phase
After the Salesforce buildpack completes there are setup tasks that need to be completed prior to running tests.  These
setup tasks can be executed as part of the [release phase](https://devcenter.heroku.com/articles/release-phase).  The
buildpack generates a `.salesforce/deploy` script which is called in the release phase by the release script and handles
source deployment.  The release script is defined as a process in the [Procfile](https://devcenter.heroku.com/articles/procfile).

## Example
1. Create 2 Heroku apps; 1 for staging and 1 for production.

  **Staging:** my-app-staging

  **Prod:** my-app
2. Create a pipeline: my-app
3. Run the following commands to add buildpacks and addons:

  `heroku buildpacks:add https://github.com/heroku/salesforce-buildpack --app my-app-staging`

  `heroku addons:create salesforce:standard --app my-app-staging`

  `heroku buildpacks:add https://github.com/heroku/salesforce-buildpack --app my-app`

  `heroku addons:create salesforce:standard --app my-app`
4. From Heroku Pipelines, open up the SEM-H and assign the staging and production environments.
