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
    python3 strace libmimalloc2.0 libjemalloc2 vmtouch curl iproute2 udhcpc gnupg gpgv wget psmisc procps strace inotify-tools && rm -rf /var/lib/apt/lists/*
RUN wget -O /opt/jdk.tgz 'https://download.bell-sw.com/java/8u482+10/bellsoft-jdk8u482+10-linux-i586-lite.tar.gz'   && tar -C /opt -xvf /opt/jdk.tgz
CMD ["/bin/sh"]