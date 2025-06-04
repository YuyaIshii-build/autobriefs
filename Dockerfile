# 1. ベースイメージ
FROM node:18-slim

# 2. Puppeteer用の依存をインストール（重要）
RUN apt-get update && apt-get install -y \
  wget \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libgbm1 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# 3. 作業ディレクトリ
WORKDIR /app

# 4. 依存ファイルをコピー
COPY package.json ./
COPY package-lock.json ./

# 5. Puppeteer含む依存インストール
RUN npm install

# 6. アプリのコードをコピー
COPY . .

# ✅ 7. Next.jsのビルドを追加（←これが重要）
RUN npm run build

# 8. ポート開放（任意）
EXPOSE 3000

# 9. 起動コマンド（Next.js 本番起動）
CMD ["npm", "run", "start"]