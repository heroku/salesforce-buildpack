#!/usr/bin/env bash

setup_dirs() {
  local DIR="$1"
  export PATH="$DIR/vendor/sfdx/cli/bin:$PATH"
  export PATH="$DIR/vendor/sfdx/jq:$PATH"
}

export_env_dir() {
  whitelist_regex=${2:-$'^(SALESFORCE_|HEROKU_)'}
  blacklist_regex=${3:-'^(PATH|GIT_DIR|CPATH|CPPATH|LD_PRELOAD|LIBRARY_PATH)$'}
  if [ -d "$ENV_DIR" ]; then
    for e in $(ls $ENV_DIR); do
      echo "$e" | grep -E "$whitelist_regex" | grep -qvE "$blacklist_regex" &&
      export $e=$(cat $ENV_DIR/$e)
      :
    done
  fi
}

parse_yaml() {
  
   local prefix=$2
   local s='[[:space:]]*'
   local w='[a-zA-Z0-9_]*'
   local fs=$(echo @|tr @ '\034')
   
   sed "h;s/^[^:]*//;x;s/:.*$//;y/-/_/;G;s/\n//" $1 |
   sed -ne "s|^\($s\)\($w\)$s:$s\"\(.*\)\"$s\$|\1$fs\2$fs\3|p" \
        -e "s|^\($s\)\($w\)$s:$s\(.*\)$s\$|\1$fs\2$fs\3|p" |
   awk -F$fs '{
      indent = length($1)/2;
      vname[indent] = $2;

      for (i in vname) {if (i > indent) {delete vname[i]}}
      if (length($3) > 0) {
         vn=""; for (i=0; i<indent; i++) {vn=(vn)(vname[i])("_")}
         printf("%s%s%s=\"%s\"\n", "'$prefix'",vn, $2, $3);
      }
   }'
}

header() {
  echo "" || true
  echo -e "-----> \e[34m$*\033[0m" || true
  echo "" || true
}

status() {
  echo "-----> $*"
}

log() {
  echo -e "       $*"
}

debug() {

  if [ "$SFDX_BUILDPACK_DEBUG" == "true" ] ; then
    echo "       [DEBUG] $*"
  fi
}