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

    export PATH="\$HOME/.apt/usr/bin:\$PATH"
    export LD_LIBRARY_PATH="\$HOME/.apt/usr/lib/x86_64-linux-gnu:\$HOME/.apt/usr/lib/i386-linux-gnu:\$HOME/.apt/usr/lib:\$LD_LIBRARY_PATH"
    export LIBRARY_PATH="\$HOME/.apt/usr/lib/x86_64-linux-gnu:\$HOME/.apt/usr/lib/i386-linux-gnu:\$HOME/.apt/usr/lib:\$LIBRARY_PATH"
    export INCLUDE_PATH="\$HOME/.apt/usr/include:\$INCLUDE_PATH"
}