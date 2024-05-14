FROM oven/bun:0.7.2 as runner

WORKDIR /app

ENV GROUPS=bun,root  # Assign sneedex user to bun and root groups
ENV USER=sneedex
ENV UID=1001

RUN adduser \
  --system \
  --disabled-password \
  --gecos "" \
  --home "/nonexistent" \
  --shell "/sbin/nologin" \
  --no-create-home \
  --uid "${UID}" \
  --ingroup "${GROUPS}" \  # Set the primary group to bun
  "${USER}"

COPY package.json bun.lockb ./

RUN bun install

COPY . .

ENV NODE_ENV production

USER sneedex  # Switch back to sneedex user

EXPOSE 3000

CMD ["bun", "run", "start"]
