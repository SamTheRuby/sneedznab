FROM oven/bun:0.7.2 as runner
WORKDIR /app
RUN apt-get update && apt-get install -y nano curl wget git
COPY package.json bun.lockb ./
RUN bun install
COPY . .
ENV NODE_ENV production
EXPOSE 3000
CMD ["bun", "run", "start"]
