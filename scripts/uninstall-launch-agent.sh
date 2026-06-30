#!/usr/bin/env sh
set -eu

LABEL="com.0xjem.omnifocus-mcp-bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
GUI_DOMAIN="gui/$(id -u)"

launchctl bootout "$GUI_DOMAIN/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST"

echo "Uninstalled $LABEL"
