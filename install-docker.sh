#!/bin/bash
# ============================================================
# Docker 一键安装脚本 - Ubuntu 22.04
# 功能: 安装 Docker + Compose、配置国内镜像加速、
#       开启防火墙(22/80)、创建部署目录
# ============================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# 检查是否为 root
if [ "$EUID" -ne 0 ]; then
    err "请使用 root 用户或 sudo 执行此脚本"
fi

log "============================================"
log " Docker 一键安装脚本 - Ubuntu 22.04"
log "============================================"

# ---- Step 1: 卸载旧版本 ----
log "卸装旧版本 Docker..."
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# ---- Step 2: 安装依赖 ----
log "安装系统依赖..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release

# ---- Step 3: 添加 Docker 官方 GPG Key ----
log "添加 Docker 官方 GPG Key..."
install -m 0755 -d /etc/apt/keyrings
if [ -f /etc/apt/keyrings/docker.gpg ]; then
    rm -f /etc/apt/keyrings/docker.gpg
fi
curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# ---- Step 4: 添加 APT 源 (阿里云) ----
log "添加 Docker APT 源 (阿里云镜像)..."
ARCH=$(dpkg --print-architecture)
echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] \
https://mirrors.aliyun.com/docker-ce/linux/ubuntu \
$(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list

# ---- Step 5: 安装 Docker Engine ----
log "安装 Docker Engine 与 Docker Compose..."
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

# ---- Step 6: 配置国内镜像加速 ----
log "配置 Docker 镜像加速 (阿里云 + 网易 + 中科大)..."
mkdir -p /etc/docker

cat > /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.1panel.live",
    "https://docker.1ms.run",
    "https://hub.rat.dev"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "live-restore": true
}
EOF

systemctl daemon-reload
systemctl enable docker --now
systemctl restart docker

# 验证 Docker
if docker info >/dev/null 2>&1; then
    log "Docker 安装成功: $(docker --version)"
    log "Docker Compose: $(docker compose version)"
else
    err "Docker 启动失败，请检查日志: journalctl -u docker"
fi

# ---- Step 7: 配置防火墙 (UFW) ----
log "配置防火墙..."
# 先确保 SSH 端口不关(防止远程断开)
ufw --force disable 2>/dev/null || true

# 重置并设置默认策略
echo "y" | ufw reset 2>/dev/null || true
ufw default deny incoming
ufw default allow outgoing

# 开放端口
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'

# 如果后续需要 HTTPS
# ufw allow 443/tcp comment 'HTTPS'

# 启用防火墙
echo "y" | ufw --force enable

log "防火墙状态:"
ufw status verbose | grep -E "Status|22|80" || true

# ---- Step 8: 创建部署目录 ----
DEPLOY_DIR="/var/www/todolist"
log "创建部署目录: ${DEPLOY_DIR}"
mkdir -p "${DEPLOY_DIR}"

# 设置目录权限 (可选: 给默认用户访问权)
if [ -n "$SUDO_USER" ]; then
    chown -R "${SUDO_USER}:${SUDO_USER}" "${DEPLOY_DIR}"
    log "已将 ${DEPLOY_DIR} 权限赋予用户 ${SUDO_USER}"
fi

# ---- 完成 ----
log "============================================"
log " 安装完成!"
log "============================================"
echo ""
echo "  Docker:         $(docker --version)"
echo "  Compose:        $(docker compose version)"
echo "  镜像加速:       已配置 (1panel / 1ms / rat)"
echo "  防火墙:         已开启, 开放端口 22, 80"
echo "  部署目录:        ${DEPLOY_DIR}"
echo ""
echo "  将项目文件放入 ${DEPLOY_DIR} 后运行:"
echo "    cd ${DEPLOY_DIR} && docker compose up -d"
echo ""
