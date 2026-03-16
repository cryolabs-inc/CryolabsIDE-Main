#!/bin/sh
mount -t devtmpfs /dev /dev
mount -t proc /proc /proc
mount -t sysfs /sys /sys
mdev -s

exec 1>/dev/ttyS0
exec 2>/dev/ttyS0
echo hi

#mount 9p
mount -t 9p host9p /mnt
ls /mnt
mkdir /mnt/root
if [ -e /dev/sda ]
then
    dd if=/dev/sda of=/mnt/root/root.img bs=5M status=progress
fi
mkdir /newroot
ls /mnt/root/root.img
losetup -f /mnt/root/root.img
ls -l /dev/ | grep "tty"
ls -l /newroot

mount -t ext4 /mnt/root/root.img /newroot
mount --bind /mnt/user /newroot/root
mount --bind /mnt/root /newroot/mnt
chmod +x /mnt/root/index.sh
exec switch_root  /newroot /mnt/index.sh
# check if /mnt has the root FS 
exit 0