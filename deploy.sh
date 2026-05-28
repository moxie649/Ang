#!/bin/bash

# 快速部署脚本
# 用法: ./deploy.sh [dev|prod|stop|restart|logs|clean]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 帮助信息
show_help() {
    echo -e "${BLUE}用法: $0 [命令]${NC}"
    echo ""
    echo "命令:"
    echo "  dev       启动开发环境（带热重载）"
    echo "  prod      启动生产环境"
    echo "  stop      停止所有服务"
    echo "  restart   重启服务"
    echo "  logs      查看日志"
    echo "  clean     清理 Docker 资源"
    echo "  build     重新构建镜像"
    echo "  update    更新到最新版本并重启"
    echo ""
    echo "示例:"
    echo "  $0 prod     # 启动生产环境"
    echo "  $0 logs     # 查看日志"
}

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}错误: Docker 未安装${NC}"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo -e "${RED}错误: Docker Compose 未安装${NC}"
        exit 1
    fi
}

# 使用 docker compose 或 docker-compose
DOCKER_COMPOSE="docker compose"
if ! docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
fi

# 开发环境
deploy_dev() {
    echo -e "${YELLOW}🚀 启动开发环境...${NC}"

    # 检查 .env 文件
    if [ ! -f .env ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  已创建 .env 文件，请根据需要进行修改${NC}"
    fi

    $DOCKER_COMPOSE -f docker-compose.yml -f docker-compose.override.yml up -d

    echo -e "${GREEN}✅ 开发环境已启动!${NC}"
    echo -e "${BLUE}前端: http://localhost:5173${NC}"
    echo -e "${BLUE}后端: http://localhost:3001${NC}"
}

# 生产环境
deploy_prod() {
    echo -e "${YELLOW}🚀 启动生产环境...${NC}"

    # 检查 .env 文件
    if [ ! -f .env ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  已创建 .env 文件，请根据需要进行修改${NC}"
        echo -e "${YELLOW}请编辑 .env 文件后再次运行此命令${NC}"
        exit 0
    fi

    # 确保不使用 override 文件
    $DOCKER_COMPOSE -f docker-compose.yml up -d --build

    echo -e "${GREEN}✅ 生产环境已启动!${NC}"
    echo -e "${BLUE}访问: http://localhost${NC}"

    # 等待服务启动
    sleep 3
    show_status
}

# 停止服务
stop_services() {
    echo -e "${YELLOW}🛑 停止服务...${NC}"
    $DOCKER_COMPOSE down
    echo -e "${GREEN}✅ 服务已停止${NC}"
}

# 重启服务
restart_services() {
    echo -e "${YELLOW}🔄 重启服务...${NC}"
    $DOCKER_COMPOSE restart
    sleep 2
    show_status
}

# 查看日志
show_logs() {
    $DOCKER_COMPOSE logs -f
}

# 查看状态
show_status() {
    echo -e "${BLUE}📊 服务状态:${NC}"
    $DOCKER_COMPOSE ps
}

# 清理资源
clean_docker() {
    echo -e "${YELLOW}🧹 清理 Docker 资源...${NC}"

    # 停止并删除容器
    $DOCKER_COMPOSE down -v

    # 删除未使用的镜像
    docker image prune -af --filter "until=168h"

    # 删除构建缓存
    docker builder prune -f

    echo -e "${GREEN}✅ 清理完成${NC}"
}

# 重新构建
rebuild() {
    echo -e "${YELLOW}🔨 重新构建镜像...${NC}"
    $DOCKER_COMPOSE down
    $DOCKER_COMPOSE build --no-cache
    $DOCKER_COMPOSE up -d
    echo -e "${GREEN}✅ 构建完成${NC}"
}

# 更新服务
update_service() {
    echo -e "${YELLOW}⬇️  拉取最新镜像...${NC}"
    $DOCKER_COMPOSE pull
    echo -e "${YELLOW}🔄 重启服务...${NC}"
    $DOCKER_COMPOSE up -d
    echo -e "${GREEN}✅ 更新完成${NC}"
}

# 主逻辑
case "${1:-help}" in
    dev)
        check_docker
        deploy_dev
        ;;
    prod)
        check_docker
        deploy_prod
        ;;
    stop)
        check_docker
        stop_services
        ;;
    restart)
        check_docker
        restart_services
        ;;
    logs)
        check_docker
        show_logs
        ;;
    status)
        check_docker
        show_status
        ;;
    clean)
        check_docker
        clean_docker
        ;;
    build)
        check_docker
        rebuild
        ;;
    update)
        check_docker
        update_service
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}未知命令: $1${NC}"
        show_help
        exit 1
        ;;
esac
