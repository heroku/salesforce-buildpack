#!/usr/bin/env bash

get_os() {
  uname | tr A-Z a-z
}

get_cpu() {
  if [[ "$(uname -p)" = "i686" ]]; then
    echo "x86"
  else
    echo "x64"
  fi
}

error() {
  echo " !     $*" >&2
  exit 1
}

highlight() {
  echo "=====> $*"
}

status() {
  echo "-----> $*"
}

log() {
  echo "       $*"
}

debug() {
  echo "       [DEBUG] $*"
}

# sed -l basically makes sed replace and buffer through stdin to stdout
# so you get updates while the command runs and dont wait for the end
# e.g. npm install | indent
indent() {
  c='s/^/       /'
  case $(uname) in
    Darwin) sed -l "$c";; # mac/bsd sed: -l buffers on line boundaries
    *)      sed -u "$c";; # unix/gnu sed: -u unbuffered (arbitrary) chunks of data
  esac
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

