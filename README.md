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

1. **Start from the official image** (`FROM postgres:18.6`, `FROM ghcr.io/getsentry/sentry:26.8.0`, and so on).
2. **Upgrade the OS packages** so known CVEs in the base layer are patched (`apt-get upgrade` on Debian-based images, `apk upgrade` on Alpine).
3. **Patch extra application dependencies when needed.** Some images (Sentry) also bump Python packages that the base image pins to vulnerable versions.

The result is the same application, same major/minor version, with a smaller vulnerability surface.

## Images

| Image | Upstream | Dockerfile | Extra hardening |
| --- | --- | --- | --- |
| PostgreSQL | `postgres:18.6` | [`postgres/Dockerfile-18.6`](postgres/Dockerfile-18.6) | Debian `apt-get upgrade` |
| Sentry | `ghcr.io/getsentry/sentry:26.8.0` | [`sentry/Dockerfile-26.8.0`](sentry/Dockerfile-26.8.0) | Debian upgrades plus pinned Python package bumps |
| SigNoz | `signoz/signoz:v0.142.1` | [`signoz/Dockerfile-0.142.1`](signoz/Dockerfile-0.142.1) | Alpine `apk upgrade` |

## Build

Build from the repository root. Tag the result however you publish it (local, GitHub Container Registry, a private registry, and so on).

```bash
docker build -f postgres/Dockerfile-18.6 -t secured-images/postgres:18.6 postgres
docker build -f sentry/Dockerfile-26.8.0 -t secured-images/sentry:26.8.0 sentry
docker build -f signoz/Dockerfile-0.142.1 -t secured-images/signoz:0.142.1 signoz
```

Use these tags in place of the official ones in Compose files, Helm charts, or Kubernetes manifests.

## Adding a new image or version

1. Create a directory named after the product (`nginx`, `redis`, …) if it does not already exist.
2. Add a `Dockerfile-<version>` that starts `FROM` the official tag you want to harden.
3. Run the OS package upgrade for that distro (`apt-get` or `apk`).
4. If scanners still report vulnerable application libraries, pin upgraded versions in a follow-up `RUN` (same pattern as Sentry).
5. Rebuild and scan the new image before you ship it.

Keep the Dockerfile version in the filename aligned with the upstream tag so it is obvious which release each file hardens.
