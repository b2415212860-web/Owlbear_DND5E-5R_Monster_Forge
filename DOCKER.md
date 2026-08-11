# Bestiary Forge Docker 部署

项目使用多阶段构建，最终镜像只包含 Node.js 运行环境和 Vinext 的独立生产包。容器内监听 `3000`，默认仅映射到服务器本机的 `127.0.0.1:3001`，供现有 Nginx 反向代理使用。

## 构建与启动

在项目根目录执行：

```bash
docker compose up -d --build
```

检查状态和日志：

```bash
docker compose ps
docker compose logs -f bestiary-forge
curl http://127.0.0.1:3001/manifest.json
```

更新代码后重新构建：

```bash
git pull
docker compose up -d --build
```

停止服务：

```bash
docker compose down
```

## 单独使用 Docker

```bash
docker build -t bestiary-forge:latest .
docker run -d \
  --name bestiary-forge \
  --restart unless-stopped \
  -p 127.0.0.1:3001:3000 \
  bestiary-forge:latest
```

## 连接现有 Nginx

如果 Nginx 安装在服务器宿主机，反向代理目标使用：

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Halo 原有的 Nginx 配置无需修改；为怪物图鉴建立单独的子域名和 `server` 块即可。

如果 Nginx 自己也运行在 Docker 中，不要使用 `127.0.0.1:3001` 作为容器间地址。应把两个服务加入同一个 Docker 网络，并将代理目标改为：

```nginx
proxy_pass http://bestiary-forge:3000;
```

## 推送到镜像仓库（可选）

登录仓库后给镜像添加仓库标签并推送：

```bash
docker login <你的镜像仓库域名>
docker tag bestiary-forge:latest <你的镜像仓库域名>/<命名空间>/bestiary-forge:latest
docker push <你的镜像仓库域名>/<命名空间>/bestiary-forge:latest
```

然后在服务器执行：

```bash
docker pull <你的镜像仓库域名>/<命名空间>/bestiary-forge:latest
```
