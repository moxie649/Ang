# 容器化部署文档

本文档详细说明如何使用 Docker + Docker Compose + GitHub Actions 部署前后端分离项目。

## 项目架构

```
┌─────────────────┐         ┌─────────────────┐
│   Nginx (80)    │────────▶│  Node.js (3001) │
│   前端静态资源   │ /api/*  │   文件上传服务   │
└─────────────────┘         └─────────────────┘
        │                            │
        ▼                            ▼
   dist 目录                    uploads 卷
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `frontend/Dockerfile` | 前端多阶段构建 Dockerfile，基于 Alpine 镜像 |
| `backend/Dockerfile` | 后端 Dockerfile，使用非 root 用户运行 |
| `nginx/nginx.conf` | Nginx 配置，处理反向代理和前端路由 |
| `docker-compose.yml` | 容器编排配置 |
| `.env.example` | 环境变量示例 |
| `.github/workflows/deploy.yml` | GitHub Actions 自动部署工作流 |

---

## 首次部署步骤

### 1. 服务器初始化

#### 1.1 安装 Docker

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin

# 或者使用官方脚本
curl -fsSL https://get.docker.com | sh

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker

# 将当前用户添加到 docker 组（避免使用 sudo）
sudo usermod -aG docker $USER
newgrp docker
```

#### 1.2 验证安装

```bash
docker --version
docker compose version
```

### 2. 配置 GitHub Secrets

在 GitHub 仓库 Settings > Secrets and variables > Actions 中添加以下 secrets：

| Secret 名称 | 说明 | 示例 |
|------------|------|------|
| `SSH_PRIVATE_KEY` | 服务器 SSH 私钥 | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SERVER_HOST` | 服务器 IP 或域名 | `1.2.3.4` 或 `example.com` |
| `SERVER_USER` | SSH 用户名 | `root` 或 `ubuntu` |
| `DEPLOY_PATH` | 部署路径 | `/opt/myapp` |
| `GITHUB_TOKEN` | 自动提供，无需手动添加 | - |

#### 2.1 生成 SSH 密钥对

在本地执行：

```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions
# 或者使用 RSA
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github_actions
```

将公钥添加到服务器的 `~/.ssh/authorized_keys`：

```bash
ssh-copy-id -i ~/.ssh/github_actions.pub user@server
```

将私钥内容复制到 GitHub Secrets：

```bash
cat ~/.ssh/github_actions
```

### 3. 准备后端代码

确保 `backend/` 目录包含：

```
backend/
├── Dockerfile          # 后端 Dockerfile
├── package.json        # 后端依赖
├── server.js           # 后端入口文件
└── uploads/            # 文件上传目录（自动创建）
```

#### 3.1 后端 server.js 示例

```javascript
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 中间件
app.use(cors());
app.use(express.json());

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// 上传接口
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ 
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size
  });
});

// 获取文件列表
app.get('/files', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read directory' });
    }
    res.json({ files });
  });
});

// 下载文件
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(UPLOAD_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.download(filepath);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Upload directory: ${UPLOAD_DIR}`);
});
```

### 4. 首次手动部署（可选）

如果不用 GitHub Actions，可以手动部署：

```bash
# 1. 克隆代码到服务器
git clone <your-repo> /opt/myapp
cd /opt/myapp

# 2. 创建环境文件
cp .env.example .env
vim .env  # 编辑配置

# 3. 构建并启动
docker-compose up -d --build

# 4. 查看状态
docker-compose ps
docker-compose logs -f
```

### 5. GitHub Actions 自动部署

代码推送到 `main` 或 `master` 分支会自动触发部署：

```bash
git add .
git commit -m "feat: 新功能"
git push origin main
```

在 GitHub Actions 页面查看部署进度：
`https://github.com/<user>/<repo>/actions`

---

## 常用运维命令

### 容器管理

```bash
# 查看运行中的容器
docker-compose ps

# 查看所有容器（包括停止的）
docker-compose ps -a

# 查看日志
docker-compose logs

# 实时查看日志
docker-compose logs -f

# 只看某个服务的日志
docker-compose logs -f backend

# 重启服务
docker-compose restart

# 重启单个服务
docker-compose restart backend

# 停止服务
docker-compose stop

# 停止并删除容器
docker-compose down

# 停止并删除容器和数据卷（慎用！）
docker-compose down -v

# 重新构建并启动
docker-compose up -d --build

# 拉取最新镜像并启动
docker-compose pull && docker-compose up -d
```

### 进入容器

```bash
# 进入前端容器
docker exec -it react-frontend sh

# 进入后端容器
docker exec -it node-backend sh

# 以 root 身份进入后端容器（调试用）
docker exec -it -u root node-backend sh
```

### 查看资源使用

```bash
# 查看容器资源使用
docker stats

# 查看磁盘使用
docker system df

# 清理未使用的数据
docker system prune -a
```

### 备份和恢复

```bash
# 备份 uploads 目录
docker run --rm -v react18-ts-vite-2504a_uploads-data:/data -v $(pwd):/backup alpine tar czf /backup/uploads-backup.tar.gz -C /data .

# 恢复 uploads 目录
docker run --rm -v react18-ts-vite-2504a_uploads-data:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/uploads-backup.tar.gz"
```

---

## 故障排查

### 1. 容器无法启动

```bash
# 查看详细错误
docker-compose logs

# 检查配置文件语法
docker-compose config

# 手动运行容器查看错误
docker run --rm -it <image-name> sh
```

### 2. 前端 404 问题

检查 Nginx 配置是否正确处理前端路由：

```bash
# 进入前端容器检查配置
docker exec -it react-frontend cat /etc/nginx/conf.d/nginx.conf

# 检查 index.html 是否存在
docker exec -it react-frontend ls -la /usr/share/nginx/html/
```

### 3. 后端无法访问

```bash
# 检查后端是否运行
docker-compose ps

# 查看后端日志
docker-compose logs backend

# 测试后端接口
curl http://localhost:3001/health

# 从容器内部测试
docker exec -it node-backend wget -qO- http://localhost:3001/health
```

### 4. 文件上传失败

```bash
# 检查 uploads 目录权限
docker exec -it node-backend ls -la /app/uploads

# 检查目录是否存在
docker exec -it node-backend ls -la /app/

# 检查磁盘空间
df -h
```

### 5. Nginx 反向代理失败

```bash
# 检查 Nginx 配置
docker exec -it react-frontend nginx -t

# 检查后端服务名是否能解析
docker exec -it react-frontend nslookup backend

# 查看 Nginx 错误日志
docker exec -it react-frontend cat /var/log/nginx/error.log
```

### 6. 端口冲突

```bash
# 查看端口占用
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :3001

# 或者使用 lsof
sudo lsof -i :80
sudo lsof -i :3001
```

### 7. 镜像拉取失败

```bash
# 检查仓库登录状态
docker login ghcr.io

# 手动拉取镜像测试
docker pull ghcr.io/<user>/<repo>/frontend:latest
```

### 8. 环境变量不生效

```bash
# 检查 .env 文件
cat .env

# 重新加载配置
docker-compose down && docker-compose up -d

# 在容器中检查环境变量
docker exec -it node-backend env
```

---

## 安全建议

1. **定期更新基础镜像**：
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

2. **限制上传文件类型**：在后端代码中添加文件类型校验

3. **启用 HTTPS**：使用 Let's Encrypt 或自有证书

4. **设置防火墙**：
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

5. **定期备份数据**：设置定时任务备份 uploads 目录

---

## 更新记录

| 日期 | 更新内容 |
|------|---------|
| 2024-01-01 | 初始版本 |
