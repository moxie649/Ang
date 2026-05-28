# 后端 Dockerfile - Node.js 文件上传服务
ARG DOCKER_REGISTRY=docker.io

# 使用 Node.js 20 Alpine 镜像
FROM ${DOCKER_REGISTRY}/library/node:20-alpine

# 安装必要的系统依赖
RUN apk add --no-cache dumb-init

# 创建非 root 用户和组
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装生产依赖
RUN npm install --omit=dev && \
    npm cache clean --force

# 复制应用代码
COPY . .

# 创建 uploads 目录并设置权限
RUN mkdir -p /app/uploads && \
    chown -R nodejs:nodejs /app

# 切换到非 root 用户
USER nodejs

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 使用 dumb-init 处理信号，防止僵尸进程
ENTRYPOINT ["dumb-init", "--"]

# 启动应用
CMD ["node", "server.js"]
