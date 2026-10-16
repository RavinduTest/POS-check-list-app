# syntax=docker/dockerfile:1
# Builds the Flutter app for web and serves it with nginx.
ARG FLUTTER_VERSION=stable
FROM ghcr.io/cirruslabs/flutter:${FLUTTER_VERSION} AS build
WORKDIR /app
COPY pubspec.yaml pubspec.lock* ./
RUN flutter pub get
COPY . .
ARG FIREBASE_API_KEY
ARG FIREBASE_APP_ID
ARG FIREBASE_MESSAGING_SENDER_ID
ARG FIREBASE_PROJECT_ID=demo-serp-pos
ARG FIREBASE_AUTH_DOMAIN
ARG FIREBASE_STORAGE_BUCKET
ARG USE_EMULATORS=false
ARG EMULATOR_HOST=localhost
RUN flutter build web --release \
    --dart-define=FIREBASE_API_KEY=${FIREBASE_API_KEY:-demo-key} \
    --dart-define=FIREBASE_APP_ID=${FIREBASE_APP_ID:-1:000000000000:web:demo} \
    --dart-define=FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_MESSAGING_SENDER_ID:-000000000000} \
    --dart-define=FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID} \
    --dart-define=FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN} \
    --dart-define=FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET} \
    --dart-define=USE_EMULATORS=${USE_EMULATORS} \
    --dart-define=EMULATOR_HOST=${EMULATOR_HOST}

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/web /usr/share/nginx/html
EXPOSE 80
