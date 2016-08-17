#!/usr/bin/env bash

# Reference: https://github.com/jkutner/heroku-buildpack-minecraft/blob/master/bin/compile#L21-L37
install_libsecret() {
    APT_CACHE_DIR="$CACHE_DIR/apt/cache"
    APT_STATE_DIR="$CACHE_DIR/apt/state"
    APT_OPTIONS="-o debug::nolocking=true -o dir::cache=$APT_CACHE_DIR -o dir::state=$APT_STATE_DIR"

    mkdir -p "$APT_CACHE_DIR/archives/partial"
    mkdir -p "$APT_STATE_DIR/lists/partial"

    status "Installing secret... "
    apt-get $APT_OPTIONS update | indent
    apt-get $APT_OPTIONS -y --force-yes -d install --reinstall libsecret-tools | indent
    mkdir -p $BUILD_DIR/.profile.d

    export PATH="$HOME/.apt/usr/bin:$PATH"
    echo $PATH
    which secret-tool

    for DEB in $(ls -1 $APT_CACHE_DIR/archives/*.deb); do
        echo "Installing $DEB..."
        dpkg -x $DEB $BUILD_DIR/.apt/
    done

    which secret-tool
}