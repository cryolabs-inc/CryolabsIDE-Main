FROM --platform=i386 i386/debian:12.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && apt-get update && apt-get install -y --no-install-recommends \
    openrc \
    sysvinit-core \
    gcc \
    g++ \
    clang \
    clangd \
    python3 strace libmimalloc2.0 libjemalloc2 vmtouch curl iproute2 udhcpc gnupg gpgv && rm -rf /var/lib/apt/lists/*


CMD ["/bin/sh"]