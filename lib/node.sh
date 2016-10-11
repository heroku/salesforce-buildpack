#!/usr/bin/env bash

create_signature() {
    if [ -f $1/node ]; then
        echo "$($1/node --version)"
    else
        echo "node missing"
    fi
}

save_signature() {
    local sig_file="$1/signature"
    echo "$(create_signature $1/bin)" > $sig_file
}

load_signature() {
    local sig_file="$1/signature"
    if test -f $sig_file; then
        cat $sig_file
    else
        echo ""
    fi
}

# Get the node binary from Heroku. Similar to how Heroku does it but
# without package.json resolution for the node version, since we only need
# to install node to make this buildpack work, not to support customer
# node scripts. See the following for reference
#
# Referenced from https://github.com/heroku/heroku-buildpack-nodejs/blob/master/lib/binaries.sh
install_nodejs() {
    local dir="$1/node"

    # TODO: get version from salesforce-alm package.json
    local version=${SALESFORCE_NODEJS_VERSION:-6.5.0}
    local version_str="v$version-$(get_os)-$(get_cpu)"

    if [ "$(create_signature $dir/bin)" != "$(load_signature $dir)" ]; then
        status "Downloading and installing node $version..."
        mkdir -p "$dir"
        local download_url="https://s3pository.heroku.com/node/v$version/node-$version_str.tar.gz"
        curl "$download_url" --silent --fail --retry 5 --retry-max-time 15 -o /tmp/node.tar.gz || (echo "Unable to download node $version; does it exist?" && false)
        tar xzf /tmp/node.tar.gz -C /tmp
        rm -rf $dir/*
        mv /tmp/node-$version_str/* $dir
        chmod +x $dir/bin/*
        save_signature $dir
    else
        status "Using cached node version $version..."
    fi
}
