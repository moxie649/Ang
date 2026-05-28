# 快速部署脚本 (PowerShell)
# 用法: .\deploy.ps1 [dev|prod|stop|restart|logs|clean]

param(
    [Parameter(Position=0)]
    [ValidateSet("dev", "prod", "stop", "restart", "logs", "status", "clean", "build", "update", "help")]
    [string]$Command = "help"
)

# 颜色定义
$Red = "`e[0;31m"
$Green = "`e[0;32m"
$Yellow = "`e[1;33m"
$Blue = "`e[0;34m"
$NC = "`e[0m"

# 帮助信息
function Show-Help {
    Write-Host "${Blue}用法: deploy.ps1 [命令]${NC}"
    Write-Host ""
    Write-Host "命令:"
    Write-Host "  dev       启动开发环境（带热重载）"
    Write-Host "  prod      启动生产环境"
    Write-Host "  stop      停止所有服务"
    Write-Host "  restart   重启服务"
    Write-Host "  logs      查看日志"
    Write-Host "  status    查看服务状态"
    Write-Host "  clean     清理 Docker 资源"
    Write-Host "  build     重新构建镜像"
    Write-Host "  update    更新到最新版本并重启"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "  .\deploy.ps1 prod     # 启动生产环境"
    Write-Host "  .\deploy.ps1 logs     # 查看日志"
}

# 检查 Docker 是否安装
function Test-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "${Red}错误: Docker 未安装${NC}"
        exit 1
    }
}

# 使用 docker compose 或 docker-compose
$DockerCompose = "docker compose"
try {
    docker compose version | Out-Null
} catch {
    $DockerCompose = "docker-compose"
}

# 开发环境
function Deploy-Dev {
    Write-Host "${Yellow}🚀 启动开发环境...${NC}"

    if (-not (Test-Path .env)) {
        Copy-Item .env.example .env
        Write-Host "${Yellow}⚠️  已创建 .env 文件，请根据需要进行修改${NC}"
    }

    Invoke-Expression "$DockerCompose -f docker-compose.yml -f docker-compose.override.yml up -d"

    Write-Host "${Green}✅ 开发环境已启动!${NC}"
    Write-Host "${Blue}前端: http://localhost:5173${NC}"
    Write-Host "${Blue}后端: http://localhost:3001${NC}"
}

# 生产环境
function Deploy-Prod {
    Write-Host "${Yellow}🚀 启动生产环境...${NC}"

    if (-not (Test-Path .env)) {
        Copy-Item .env.example .env
        Write-Host "${Yellow}⚠️  已创建 .env 文件，请根据需要进行修改${NC}"
        Write-Host "${Yellow}请编辑 .env 文件后再次运行此命令${NC}"
        return
    }

    Invoke-Expression "$DockerCompose -f docker-compose.yml up -d --build"

    Write-Host "${Green}✅ 生产环境已启动!${NC}"
    Write-Host "${Blue}访问: http://localhost${NC}"

    Start-Sleep -Seconds 3
    Show-Status
}

# 停止服务
function Stop-Services {
    Write-Host "${Yellow}🛑 停止服务...${NC}"
    Invoke-Expression "$DockerCompose down"
    Write-Host "${Green}✅ 服务已停止${NC}"
}

# 重启服务
function Restart-Services {
    Write-Host "${Yellow}🔄 重启服务...${NC}"
    Invoke-Expression "$DockerCompose restart"
    Start-Sleep -Seconds 2
    Show-Status
}

# 查看日志
function Show-Logs {
    Invoke-Expression "$DockerCompose logs -f"
}

# 查看状态
function Show-Status {
    Write-Host "${Blue}📊 服务状态:${NC}"
    Invoke-Expression "$DockerCompose ps"
}

# 清理资源
function Clean-Docker {
    Write-Host "${Yellow}🧹 清理 Docker 资源...${NC}"

    Invoke-Expression "$DockerCompose down -v"
    docker image prune -af --filter "until=168h"
    docker builder prune -f

    Write-Host "${Green}✅ 清理完成${NC}"
}

# 重新构建
function Rebuild {
    Write-Host "${Yellow}🔨 重新构建镜像...${NC}"
    Invoke-Expression "$DockerCompose down"
    Invoke-Expression "$DockerCompose build --no-cache"
    Invoke-Expression "$DockerCompose up -d"
    Write-Host "${Green}✅ 构建完成${NC}"
}

# 更新服务
function Update-Service {
    Write-Host "${Yellow}⬇️  拉取最新镜像...${NC}"
    Invoke-Expression "$DockerCompose pull"
    Write-Host "${Yellow}🔄 重启服务...${NC}"
    Invoke-Expression "$DockerCompose up -d"
    Write-Host "${Green}✅ 更新完成${NC}"
}

# 主逻辑
switch ($Command) {
    "dev" {
        Test-Docker
        Deploy-Dev
    }
    "prod" {
        Test-Docker
        Deploy-Prod
    }
    "stop" {
        Test-Docker
        Stop-Services
    }
    "restart" {
        Test-Docker
        Restart-Services
    }
    "logs" {
        Test-Docker
        Show-Logs
    }
    "status" {
        Test-Docker
        Show-Status
    }
    "clean" {
        Test-Docker
        Clean-Docker
    }
    "build" {
        Test-Docker
        Rebuild
    }
    "update" {
        Test-Docker
        Update-Service
    }
    "help" {
        Show-Help
    }
    default {
        Show-Help
    }
}
