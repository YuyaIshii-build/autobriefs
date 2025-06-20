# 1. ベースイメージ
FROM node:18-slim

# 2. Puppeteer・日本語フォント・ffmpeg 用依存インストール
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
  fonts-noto-cjk \
  ffmpeg \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# 3. 作業ディレクトリ作成
WORKDIR /app

# 4. 依存ファイルを先にコピー（キャッシュを活かす）
COPY package.json ./
COPY package-lock.json ./

# 5. 依存インストール（puppeteer含む）
RUN npm install

# 6. アプリコード全体をコピー
COPY . .

# 7. Next.js ビルド
RUN npm run build

# 8. ポート解放（任意）
EXPOSE 3000

# 9. アプリ起動コマンド
CMD ["npm", "run", "start"]