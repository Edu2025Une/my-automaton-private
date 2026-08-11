FROM node:20-bookworm

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

CMD ["node", "dist/index.js", "--run"]
