#!/usr/bin/env bash

invokeCmd() {
  debug "CMD: $1"
  eval $1
}

# <DIR> <SFDX_AUTH_URL> <d|s> <alias>
auth() {
  
  SFDX_AUTH_URL_FILE="$1"
  if [ ! "$2" == "" ]; then
    echo "$2" > "$SFDX_AUTH_URL_FILE"
  fi
  invokeCmd "sfdx force:auth:sfdxurl:store -f $SFDX_AUTH_URL_FILE -$3 -a $4"

}

# <run_apex_tests> <apex_test_format> <alias>
tests() {

  if [ "$1" == "true" ]; then
    invokeCmd "sfdx force:apex:test:run -r $2 -u $3"
  fi

}

# <package_name>
createPackage2Version() {

  packageName="$1"
  
}

# <package_name>
createPackage2Version() {

  packageName="$1"
  
}