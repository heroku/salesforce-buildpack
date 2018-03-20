#!/usr/bin/env bash

START_TIME=$SECONDS

# set -x
set -o errexit      # always exit on error
set -o pipefail     # don't ignore exit codes when piping output
unset GIT_DIR       # Avoid GIT_DIR leak from previous build steps

TARGET_SCRATCH_ORG_ALIAS=${1:-}
SFDX_PACKAGE_VERSION_ID=${2:-}

vendorDir="vendor/sfdx"

source "$vendorDir"/common.sh
source "$vendorDir"/sfdx.sh
source "$vendorDir"/stdlib.sh

: ${SFDX_BUILDPACK_DEBUG:="false"}

header "Running release.sh"

# Setup local paths
log "Setting up paths ..."

setup_dirs "."

log "Config vars ..."
debug "SFDX_DEV_HUB_AUTH_URL: $SFDX_DEV_HUB_AUTH_URL"
debug "STAGE: $STAGE"
debug "SFDX_AUTH_URL: $SFDX_AUTH_URL"
debug "SFDX_BUILDPACK_DEBUG: $SFDX_BUILDPACK_DEBUG"
debug "CI: $CI"
debug "HEROKU_TEST_RUN_BRANCH: $HEROKU_TEST_RUN_BRANCH"
debug "HEROKU_TEST_RUN_COMMIT_VERSION: $HEROKU_TEST_RUN_COMMIT_VERSION"
debug "HEROKU_TEST_RUN_ID: $HEROKU_TEST_RUN_ID"
debug "STACK: $STACK"
debug "SOURCE_VERSION: $SOURCE_VERSION"
debug "TARGET_SCRATCH_ORG_ALIAS: $TARGET_SCRATCH_ORG_ALIAS"
debug "SFDX_INSTALL_PACKAGE_VERSION: $SFDX_INSTALL_PACKAGE_VERSION"
debug "SFDX_CREATE_PACKAGE_VERSION: $SFDX_CREATE_PACKAGE_VERSION"
debug "SFDX_PACKAGE_NAME: $SFDX_PACKAGE_NAME"
debug "SFDX_PACKAGE_VERSION_ID: $SFDX_PACKAGE_VERSION_ID"

whoami=$(whoami)
debug "WHOAMI: $whoami"

log "Parse sfdx.yml values ..."

# Parse sfdx.yml file into env
#BUG: not parsing arrays properly
eval $(parse_yaml sfdx.yml)

debug "scratch-org-def: $scratch_org_def"
debug "assign-permset: $assign_permset"
debug "permset-name: $permset_name"
debug "run-apex-tests: $run_apex_tests"
debug "delete-test-org: $delete_test_org"
debug "delete-scratch-org: $delete_scratch_org"
debug "show_scratch_org_url: $show_scratch_org_url"
debug "open-path: $open_path"
debug "data-plans: $data_plans"

# If review app or CI
if [ "$STAGE" == "" ]; then

  log "Running as a REVIEW APP ..."
  if [ ! "$CI" == "" ]; then
    log "Running via CI ..."
  fi

  # Get sfdx auth url for scratch org
  scratchSfdxAuthUrlFile=$vendorDir/$TARGET_SCRATCH_ORG_ALIAS
  scratchSfdxAuthUrl=`cat $scratchSfdxAuthUrlFile`

  debug "scratchSfdxAuthUrl: $scratchSfdxAuthUrl"

  # Auth to scratch org
  auth "$scratchSfdxAuthUrlFile" "" s "$TARGET_SCRATCH_ORG_ALIAS"

  # Push source
  invokeCmd "sfdx force:source:push -u $TARGET_SCRATCH_ORG_ALIAS"

  # Show scratch org URL
  if [ "$show_scratch_org_url" == "true" ]; then    
    if [ ! "$open_path" == "" ]; then
      invokeCmd "sfdx force:org:open -r -p $open_path"
    else
      invokeCmd "sfdx force:org:open -r"
    fi
  fi

fi

# If Development, Staging, or Prod
if [ ! "$STAGE" == "" ]; then

  log "Detected $STAGE. Kicking off deployment ..."

  auth "$vendorDir/sfdxurl" "$SFDX_AUTH_URL" s "$TARGET_SCRATCH_ORG_ALIAS"

  if [ "$SFDX_INSTALL_PACKAGE_VERSION" == "true" ] 
  then

    pkgVersionInstallScript=bin/package-install.sh
    # run package install
    if [ ! -f "$pkgVersionInstallScript" ];
    then
    
      log "Installing package version $SFDX_PACKAGE_NAME ..."

      invokeCmd "sfdx force:package:install -i \"$SFDX_PACKAGE_VERSION_ID\" -u \"$TARGET_SCRATCH_ORG_ALIAS\" --wait 1000 --publishwait 1000"

    else

      log "Calling $pkgVersionInstallScript"
      sh "$pkgVersionInstallScript" "$TARGET_SCRATCH_ORG_ALIAS" "$STAGE"

    fi

    if [ "$SFDX_BUILDPACK_DEBUG" == "true" ] ; then
      invokeCmd "sfdx force:package:installed:list -u \"$TARGET_SCRATCH_ORG_ALIAS\""
    fi

  else

    log "Source convert and mdapi deploy"

    mdapiDeployScript=bin/mdapi-deploy.sh
    # run mdapi-deploy script
    if [ ! -f "$mdapiDeployScript" ];
    then

      invokeCmd "sfdx force:source:convert -d mdapiout"
      invokeCmd "sfdx force:mdapi:deploy -d mdapiout --wait 1000 -u $TARGET_SCRATCH_ORG_ALIAS"

    else

      log "Calling $mdapiDeployScript"
      sh "$mdapiDeployScript" "$TARGET_SCRATCH_ORG_ALIAS" "$STAGE"

    fi

  fi

fi

postSetupScript=bin/post-setup.sh
# run post-setup script
if [ -f "$postSetupScript" ]; then

  debug "Calling $postSetupScript $TARGET_SCRATCH_ORG_ALIAS $STAGE"
  sh "$postSetupScript" "$TARGET_SCRATCH_ORG_ALIAS" "$STAGE"
fi

header "DONE! Completed in $(($SECONDS - $START_TIME))s"
exit 0