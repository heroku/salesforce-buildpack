# Heroku Buildpack for Salesforce DX

This is the official [Heroku buildpack](http://devcenter.heroku.com/articles/buildpacks) for Salesforce provisioned apps.
This buildpack enables various Salesforce specific development operations such as retrieving and deploying metadata,
creating orgs, running tests, and importing/exporting data, to allow for continuous integration and delivery.

## Documentation
This buildpack installs Node.js, the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-command-line),
and the [Salesforce DX CLI] -- provide link to public docs here --.  It can be referenced within your
[app.json](https://devcenter.heroku.com/articles/app-json-schema) file or specified via command line e.g.,
```
heroku buildpacks:add https://github.com/heroku/salesforce-buildpack --app my-app
```

## Requirements
This buildpack requires:
1. The Heroku Salesforce Addon -- provide link to docs here --
   Reference the addon in your [app.json](https://devcenter.heroku.com/articles/app-json-schema) or via command line e.g.,
   ```
   heroku addons:create salesforce
   ```
   The Salesforce addon will set the SALESFORCE_URL config var which is required by the buildpack.  You can also use the
   Salesforce Environment Manager on Heroku or [SEM-H](https://gist.github.com/simpsoka/c584c65d655268eaf26ec487bf6b8295)
   to view all your Salesforce orgs that have been attached to Heroku apps.
2. A [config.json] -- provide link to schema -- file in the root directory.
   This file points to the [force.com](https://www.salesforce.com/products/platform/products/force/) source directory
   via the defaultArtifact property name.

## Pipelines
To achieve a continuous integration and delivery flow you can create a [Heroku Pipeline](https://devcenter.heroku.com/articles/pipelines)
and attach your Salesforce provisioned Heroku apps.  See example below.

## Config Vars
**SALESFORCE_URL**: Salesforce Add-on applied that defines connectivity to an org.
**SALESFORCE_HUB_URL**: Salesforce Add-on or manually applied that enables Salesforce Add-on and Test Runner to create orgs.
**SALESFORCE_BYOO**: Salesforce Add-on applied stating that orgs is a Salesforce Sandbox or Production org, i.e. not a Scratch org.

## Example
1. Create 2 heroku apps; 1 for staging and 1 for production.
  **Staging:** dreamhouse-dev-sdx-staging
  **Prod:** dreamhouse-dev-sdx
2. Create a pipeline: dreamhouse-dev-sdx
3. Run the following commands to add buildpacks and addons:
  ```
  heroku buildpacks:add https://github.com/heroku/salesforce-buildpack --app dreamhouse-dev-sdx-staging
  heroku addons:create salesforce:byoo --app dreamhouse-dev-sdx-staging
  heroku buildpacks:add https://github.com/heroku/salesforce-buildpack --app dreamhouse-dev-sdx
  heroku addons:create salesforce:byoo --app dreamhouse-dev-sdx
  ```
4. From Heroku Pipelines, open up the SEM-H and assign the staging and production environments.
