# 前端 Dockerfile - 多阶段构建
ARG DOCKER_REGISTRY=docker.io

# 阶段1: 构建阶段
FROM ${DOCKER_REGISTRY}/library/node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖（构建需要 devDependencies）
RUN npm install

# 复制源代码
COPY . .

# 构建生产环境
RUN npm run build

# 阶段2: 生产阶段 - 使用 Nginx Alpine 镜像
FROM ${DOCKER_REGISTRY}/library/nginx:alpine

# 安装必要的工具
RUN apk add --no-cache curl

# 修改 nginx 主配置：pid 路径改为 nginx 用户可写的目录，注释掉 user 指令（容器以 nginx 用户运行）
RUN sed -i 's|pid\s\+/run/nginx.pid;|pid /var/cache/nginx/nginx.pid;|' /etc/nginx/nginx.conf \
    && sed -i 's|^user\s\+nginx;|#user nginx;|' /etc/nginx/nginx.conf

# 删除默认的 Nginx 配置
RUN rm /etc/nginx/conf.d/default.conf

# 复制自定义 Nginx 配置
COPY nginx/nginx.conf /etc/nginx/conf.d/

# 从构建阶段复制构建产物到 Nginx 目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 创建必要的目录并设置权限
RUN mkdir -p /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    && chmod -R 755 /var/cache/nginx \
    && chown -R nginx:nginx /var/cache/nginx

# 非 root 用户运行
USER nginx

# 暴露 80 端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
