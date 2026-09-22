# Secured Images

Hardened Docker images rebuilt from official upstream releases, with OS packages and known-vulnerable dependencies patched before they are used in production.

Official images often ship with a frozen package set. New CVEs land in the OS and language runtimes long after the image tag is published. This repository takes those tags as a base, applies available security upgrades, and produces a drop-in replacement you can run instead of the untouched upstream image.

## How it works

Each image lives in its own directory. Inside it, Dockerfiles are named after the upstream version they wrap:

```
<image>/Dockerfile-<version>
```

For example, `postgres/Dockerfile-18.6` rebuilds `postgres:18.6`.

A typical Dockerfile does three things:

1. **Start from the official image** (`FROM postgres:18.6`, `FROM apache/kafka:4.3.1`, and so on).
2. **Upgrade the OS packages** so known CVEs in the base layer are patched (`apt-get upgrade` on Debian, `apk upgrade` on Alpine, `dnf update` on Amazon Linux, `zypper update` on SLES). If the base image runs as a non-root user, switch to `root` for this step and restore the original user afterward.
3. **Patch extra application dependencies when needed.** Some images bump pinned libraries or rebuild binaries that scanners flag (Go stdlib baked into `gosu`, SigNoz, Rancher, Sentry Python packages).

The result is the same application, same major/minor version, with a smaller vulnerability surface.

## Images

Published to Docker Hub as [`thiagoguaru/<name>`](https://hub.docker.com/u/thiagoguaru).

**Kafka**
[![Docker Image Size](https://img.shields.io/docker/image-size/thiagoguaru/kafka/4.3.1?logo=docker)](https://hub.docker.com/r/thiagoguaru/kafka)
[![Docker Image Last Updated](https://img.shields.io/docker/last-updated/thiagoguaru/kafka?logo=docker)](https://hub.docker.com/r/thiagoguaru/kafka)
[![Docker Pulls](https://img.shields.io/docker/pulls/thiagoguaru/kafka?logo=docker)](https://hub.docker.com/r/thiagoguaru/kafka)

**OpenSearch**
[![Docker Image Size](https://img.shields.io/docker/image-size/thiagoguaru/opensearch/2.19.6?logo=docker)](https://hub.docker.com/r/thiagoguaru/opensearch)
[![Docker Image Last Updated](https://img.shields.io/docker/last-updated/thiagoguaru/opensearch?logo=docker)](https://hub.docker.com/r/thiagoguaru/opensearch)
[![Docker Pulls](https://img.shields.io/docker/pulls/thiagoguaru/opensearch?logo=docker)](https://hub.docker.com/r/thiagoguaru/opensearch)

**PostgreSQL**
[![Docker Image Size](https://img.shields.io/docker/image-size/thiagoguaru/postgres/18.6?logo=docker)](https://hub.docker.com/r/thiagoguaru/postgres)
[![Docker Image Last Updated](https://img.shields.io/docker/last-updated/thiagoguaru/postgres?logo=docker)](https://hub.docker.com/r/thiagoguaru/postgres)
[![Docker Pulls](https://img.shields.io/docker/pulls/thiagoguaru/postgres?logo=docker)](https://hub.docker.com/r/thiagoguaru/postgres)

**Rancher**
[![Docker Image Size](https://img.shields.io/docker/image-size/thiagoguaru/rancher/2.15.1?logo=docker)](https://hub.docker.com/r/thiagoguaru/rancher)
[![Docker Image Last Updated](https://img.shields.io/docker/last-updated/thiagoguaru/rancher?logo=docker)](https://hub.docker.com/r/thiagoguaru/rancher)
[![Docker Pulls](https://img.shields.io/docker/pulls/thiagoguaru/rancher?logo=docker)](https://hub.docker.com/r/thiagoguaru/rancher)

**Redis**
[![Docker Image Size](https://img.shields.io/docker/image-size/thiagoguaru/redis/8.10.2?logo=docker)](https://hub.docker.com/r/thiagoguaru/redis)
[![Docker Image Last Updated](https://img.shields.io/docker/last-updated/thiagoguaru/redis?logo=docker)](https://hub.docker.com/r/thiagoguaru/redis)
[![Docker Pulls](https://img.shields.io/docker/pulls/thiagoguaru/redis?logo=docker)](https://hub.docker.com/r/thiagoguaru/redis)

**Sentry**
[![Docker Image Size](https://img.shields.io/docker/image-size/thiagoguaru/sentry/26.8.0?logo=docker)](https://hub.docker.com/r/thiagoguaru/sentry)
[![Docker Image Last Updated](https://img.shields.io/docker/last-updated/thiagoguaru/sentry?logo=docker)](https://hub.docker.com/r/thiagoguaru/sentry)
[![Docker Pulls](https://img.shields.io/docker/pulls/thiagoguaru/sentry?logo=docker)](https://hub.docker.com/r/thiagoguaru/sentry)

**SigNoz**
[![Docker Image Size](https://img.shields.io/docker/image-size/thiagoguaru/signoz/0.142.1?logo=docker)](https://hub.docker.com/r/thiagoguaru/signoz)
[![Docker Image Last Updated](https://img.shields.io/docker/last-updated/thiagoguaru/signoz?logo=docker)](https://hub.docker.com/r/thiagoguaru/signoz)
[![Docker Pulls](https://img.shields.io/docker/pulls/thiagoguaru/signoz?logo=docker)](https://hub.docker.com/r/thiagoguaru/signoz)

| Image | Upstream | Dockerfile | Extra hardening |
| --- | --- | --- | --- |
| Kafka | `apache/kafka:4.3.1` | [`kafka/Dockerfile-4.3.1`](kafka/Dockerfile-4.3.1) | Alpine `apk upgrade` as root, then restore `appuser` |
| OpenSearch | `opensearchproject/opensearch:2.19.6` | [`opensearch/Dockerfile-2.19.6`](opensearch/Dockerfile-2.19.6) | Amazon Linux 2023 `dnf update` as root, then restore UID 1000 |
| PostgreSQL | `postgres:18.6` | [`postgres/Dockerfile-18.6`](postgres/Dockerfile-18.6) | Debian `apt-get upgrade` plus `gosu` rebuilt with a current Go toolchain |
| Rancher | `rancher/rancher:v2.15.1` | [`rancher/Dockerfile-2.15.1`](rancher/Dockerfile-2.15.1) | SLES RPM update via BCI, rebuilt Go drivers/`etcdctl`, newer k3s overlay |
| Redis | `redis:8.10.2` | [`redis/Dockerfile-8.10.2`](redis/Dockerfile-8.10.2) | Debian `apt-get upgrade`; runs as `redis` (UID 999) |
| Sentry | `ghcr.io/getsentry/sentry:26.8.0` | [`sentry/Dockerfile-26.8.0`](sentry/Dockerfile-26.8.0) | Debian upgrades plus pinned Python package bumps |
| SigNoz | `signoz/signoz:v0.142.1` | [`signoz/Dockerfile-0.142.1`](signoz/Dockerfile-0.142.1) | Alpine `apk upgrade` plus the SigNoz binary rebuilt with a patched Go toolchain |

Redis is intentionally non-root by default. Official `redis` starts as root and `gosu`-drops to `redis` at runtime (and chowns `/data` first). Bind-mounted data directories must be writable by UID 999, or use a Docker volume / Kubernetes `fsGroup: 999`.

## Build

Build from the repository root. Tag the result however you publish it (local, GitHub Container Registry, a private registry, and so on).

```bash
docker build -f kafka/Dockerfile-4.3.1 -t secured-images/kafka:4.3.1 kafka
docker build -f opensearch/Dockerfile-2.19.6 -t secured-images/opensearch:2.19.6 opensearch
docker build -f postgres/Dockerfile-18.6 -t secured-images/postgres:18.6 postgres
docker build -f rancher/Dockerfile-2.15.1 -t secured-images/rancher:2.15.1 rancher
docker build -f redis/Dockerfile-8.10.2 -t secured-images/redis:8.10.2 redis
docker build -f sentry/Dockerfile-26.8.0 -t secured-images/sentry:26.8.0 sentry
docker build -f signoz/Dockerfile-0.142.1 -t secured-images/signoz:0.142.1 signoz
```

Use these tags in place of the official ones in Compose files, Helm charts, or Kubernetes manifests.

## Adding a new image or version

1. Create a directory named after the product (`nginx`, `redis`, …) if it does not already exist.
2. Add a `Dockerfile-<version>` that starts `FROM` the official tag you want to harden.
3. Run the OS package upgrade for that distro (`apt-get`, `apk`, `dnf`, or `zypper`). If the base image is non-root, use `USER root` for the upgrade, then switch back.
4. If scanners still report vulnerable application libraries, pin upgraded versions or rebuild binaries in a follow-up step (same pattern as Sentry, PostgreSQL `gosu`, SigNoz, and Rancher).
5. Rebuild and scan the new image before you ship it.

Keep the Dockerfile version in the filename aligned with the upstream tag so it is obvious which release each file hardens.
