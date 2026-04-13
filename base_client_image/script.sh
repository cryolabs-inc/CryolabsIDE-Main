echo Setting up the disk image with the script
rm -rf /var/lib/apt/lists/*
cp /mnt/custom_init /etc/init.d/custom_init
g++ /mnt/mu-cxx/main.cc -m32 -static -o /usr/bin/mu
cp /mnt/spawn-in.sh /usr/bin/spawn-in
chmod +x /usr/bin/spawn-in
chmod +x /etc/init.d/custom_init
chsh -s /bin/bash root
rc-update add custom_init default
ln -s /etc/init.d/agetty /etc/init.d/agetty.ttyS0
ln -s /etc/init.d/agetty /etc/init.d/agetty.tty1
mkdir -p /etc/conf.d
echo 'agetty_options="--autologin root"' >> /etc/conf.d/agetty.ttyS0
echo 'agetty_options="--autologin root"' >> /etc/conf.d/agetty
echo 'agetty_options="--autologin root"' >> /etc/conf.d/agetty.tty1
sed -i '/tty1/d' /etc/inittab
rc-update add agetty.ttyS0 default
cp /mnt/bashrc /etc/bash/bashrc
cp /mnt/ldr.sh /custom-init
sed -i '1i export force_color_prompt=yes; cp /etc' /etc/profile
chmod +x /custom-init