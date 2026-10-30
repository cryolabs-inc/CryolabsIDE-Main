FROM --platform=$BUILDPLATFORM maven:3.9.9-eclipse-temurin-21 AS java-language-server-build
WORKDIR /server
COPY java-lang-server/pom.xml ./
COPY java-lang-server/src/ ./src/
RUN mvn -B package -DskipTests
COPY base_client_image/iterator/IterativeBuilder.java /iterator/IterativeBuilder.java
RUN mkdir -p /iterator/classes \
    && javac --add-exports jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED \
        -cp /server/dist/classpath/gson-2.8.9.jar -d /iterator/classes /iterator/IterativeBuilder.java

FROM --platform=linux/386 i386/debian:trixie-slim

ENV JAVA_TOOL_OPTIONS="-XX:TieredStopAtLevel=1"

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && apt-get update && apt-get install -y --no-install-recommends \
    openrc \
    sysvinit-core \
    gcc \
    g++ \
    clang \
    clangd \
    openjdk-21-jdk-headless \
    python3 strace libmimalloc3 libjemalloc2 vmtouch curl iproute2 udhcpc gnupg gpgv wget psmisc procps strace inotify-tools && rm -rf /var/lib/apt/lists/*
COPY --from=java-language-server-build /server/dist/classpath/ /opt/java-language-server/
COPY base_client_image/java-language-server /usr/local/bin/java-language-server
RUN printf 'export JAVA_TOOL_OPTIONS="%s"\n' "$JAVA_TOOL_OPTIONS" > /etc/profile.d/java.sh \
    && chmod +x /usr/local/bin/java-language-server \
    && java -version && javac -version
COPY --from=java-language-server-build /iterator/classes/ /opt/iterator/
COPY --from=java-language-server-build /server/dist/classpath/gson-2.8.9.jar /opt/iterator/gson.jar
COPY base_client_image/iterator/ /opt/iterator-source/
RUN apt-get update && apt-get install -y --no-install-recommends libcli11-dev nlohmann-json3-dev \
    && g++ -std=c++17 -O2 -static -s /opt/iterator-source/iterator.cpp -o /usr/local/bin/iterator \
    && ln -s iterator /usr/local/bin/fast-javac \
    && install -m 755 /opt/iterator-source/iterator-server /usr/local/bin/iterator-server \
    && install -m 755 /opt/iterator-source/iterator.initd /etc/init.d/iterator \
    && install -m 644 /opt/iterator-source/LICENSE /opt/iterator/LICENSE \
    && apt-get purge -y libcli11-dev nlohmann-json3-dev \
    && rm -rf /var/lib/apt/lists/* /opt/iterator-source
CMD ["/bin/sh"]
