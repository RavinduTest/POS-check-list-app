#!/bin/sh
# Runs the app against the real Firebase project using values from ../.env
# Usage: ./run.sh [flutter run args, e.g. -d <device-id>]
set -a; . "$(dirname "$0")/../.env"; set +a
exec flutter run "$@" \
  --dart-define=FIREBASE_API_KEY="$FIREBASE_API_KEY" \
  --dart-define=FIREBASE_APP_ID="$FIREBASE_APP_ID" \
  --dart-define=FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID" \
  --dart-define=FIREBASE_AUTH_DOMAIN="$FIREBASE_AUTH_DOMAIN" \
  --dart-define=FIREBASE_STORAGE_BUCKET="$FIREBASE_STORAGE_BUCKET" \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID="$FIREBASE_MESSAGING_SENDER_ID" \
  --dart-define=FIREBASE_IOS_APP_ID="$FIREBASE_IOS_APP_ID" \
  --dart-define=FIREBASE_IOS_API_KEY="$FIREBASE_IOS_API_KEY" \
  --dart-define=FIREBASE_ANDROID_APP_ID="$FIREBASE_ANDROID_APP_ID" \
  --dart-define=FIREBASE_ANDROID_API_KEY="$FIREBASE_ANDROID_API_KEY"
