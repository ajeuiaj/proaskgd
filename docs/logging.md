change your dockerfile to this. the proxy needs access to the storage on huggingface

```dockerfile
FROM node:18-bullseye-slim
RUN apt-get update && \
    apt-get install -y git
RUN git clone https://gitgud.io/fiz1/oai-reverse-proxy.git /app
WORKDIR /app
RUN chown -R 1000:1000 /app
USER 1000
RUN npm install
COPY Dockerfile greeting.md* .env* ./
RUN npm run build
EXPOSE 7860
ENV NODE_ENV=production
CMD [ "npm", "start" ]

```

added options:
```shell
# max file size in MB.
MAX_FILE_SIZE=10
# file prefix. set this as a secret if you want your logs to be private.
LOG_PREFIX=log_
# file count. huggingface might run out of storage. 20(20*25=500mb) is fine.
MAX_FILE_COUNT=2
# this needs to be true. obviously.
PROMPT_LOGGING=true
```
logs are accessible at `https://{your proxy}.hf.space/user_content/{your prefix}1.jsonl` change the number to download the next file.
