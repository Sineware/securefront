FROM denoland/deno:latest

WORKDIR /opt
RUN apt-get update && apt-get install -y git curl socat
RUN git clone https://github.com/acmesh-official/acme.sh.git --depth 1
RUN mkdir /tls

WORKDIR /app
ADD . /app

RUN deno install --entrypoint src/main.ts
RUN deno check src/main.ts
RUN deno cache src/main.ts
RUN touch securefront.config.toml

CMD ["run", "--allow-net", "--allow-read", "--allow-run", "src/main.ts"]