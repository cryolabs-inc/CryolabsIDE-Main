#!/bin/sh
mount -t devtmpfs /dev /dev
mount -t proc /proc /proc
mount -t sysfs /sys /sys
# mount -t tmpfs /run /run
mdev -s
if [ -f /mnt/init.sh ]
then
    chmod +x /mnt/init.sh
    sh /mnt/init.sh
fi
exec /sbin/init