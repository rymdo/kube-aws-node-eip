ARG BASE_IMAGE=node:14.4.0-buster-slim

FROM ${BASE_IMAGE} as node-modules
WORKDIR /build
COPY package.json .
COPY yarn.lock .
RUN yarn --frozen-lockfile --production

FROM ${BASE_IMAGE} as app
WORKDIR /build
COPY package.json .
COPY yarn.lock .
RUN yarn --frozen-lockfile
COPY tsconfig.json .
COPY src ./src
RUN yarn build

FROM ${BASE_IMAGE}

RUN \
  DEBIAN_FRONTEND=noninteractive apt-get update && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y curl && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y dumb-init && \
  rm -rf /var/lib/apt/lists/*

RUN \
  curl -sLO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
  chmod u+x kubectl && \
  mv kubectl /usr/local/bin/kubectl && \
  kubectl

WORKDIR /app
COPY --from=node-modules /build/node_modules ./node_modules
COPY --from=app /build/build .

ENTRYPOINT [ "/usr/bin/dumb-init", "--" ]
CMD [ "node", "main.js" ]
