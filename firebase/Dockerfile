# Local Firebase emulator suite (Auth, Firestore, Functions, Storage) + seeding.
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g firebase-tools@13
WORKDIR /srv/firebase
COPY functions/package.json functions/package-lock.json* functions/
RUN cd functions && npm install
COPY seed/package.json seed/
RUN cd seed && npm install
COPY . .
RUN cd functions && npm run build
EXPOSE 4000 8080 9099 5001 9199
CMD ["sh", "-c", "firebase emulators:exec --project demo-serp-pos 'sh -c \"cd seed && node seed.mjs && sleep infinity\"' --ui"]
