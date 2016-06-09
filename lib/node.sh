create_signature() {
  echo "$(node --version)"
}

save_signature() {
  local sig_file="$1/signature"
  echo "$(create_signature)" > $sig_file
}

load_signature() {
  local sig_file="$1/signature"
  if test -f $sig_file; then
    cat $sig_file
  else
    echo ""
  fi
}

# Get the node binary from the heroku. Similar to how heroku does it but
# without package.json resolution for the node version, since we only need
# to install node to make this build pack work, not to support customer
# node scripts. See the following for reference
#
# Referenced from https://github.com/heroku/heroku-buildpack-nodejs/blob/master/lib/binaries.sh
install_nodejs() {
  local dir="$1/node"
  local version=5.11.1
  local version_str="v$version-$(get_os)-$(get_cpu)"

  if [ "$(create_signature)" != "$(load_signature $dir)" ]; then
    status "Downloading and installing node $version..."
    mkdir -p "$dir"
    local download_url="https://s3pository.heroku.com/node/v$version/node-$version_str.tar.gz"
    curl "$download_url" --silent --fail  --retry 5 --retry-max-time 15 -o /tmp/node.tar.gz || (echo "Unable to download node $version; does it exist?" && false)
    tar xzf /tmp/node.tar.gz -C /tmp
    rm -rf $dir/*
    mv /tmp/node-$version_str/* $dir
    chmod +x $dir/bin/*
    save_signature $dir
  else
    status "Using cached node version $version..."
  fi
}
