set -x
DOCKERFILE=$1
SCRIPT_PATH=$2
if [[ -n $SCRIPT_PATH ]]
then
    SCRIPT_PATH=$(realpath $SCRIPT_PATH)
    echo "Using script at $SCRIPT_PATH"

fi
docker build -t ctf/tmp-emulator-image - < "$DOCKERFILE"
exec 3>&1
if [[ -n $SCRIPT_PATH ]]
then
    echo "running this docker command"
    docker run -it -v "$(dirname $SCRIPT_PATH):/mnt" --name tempRE ctf/tmp-emulator-image  sh -c "/mnt/$(basename $SCRIPT_PATH);"
    # 
else
    docker run -d --rm --name tempRE ctf/tmp-emulator-image sleep infinity
fi
docker export tempRE -o disk.tar
truncate -s 1G disk
mkdir ext_out

tar -xf  disk.tar -C ext_out

# [[ -f ./ext_out/boot/vmlinuz-virt ]] && cp ./ext_out/boot/vmlinuz-virt . 
# [[ -f ./ext_out/boot/initramfs-virt ]] && cp ./ext_out/boot/initramfs-virt . 
# [[ -d ./ext_out/boot ]] && tar -C ext_out/boot -cf boot.tar ext_out/boot  .
exec 1>&3
# mkcpio
cd ext_out
find . -print0  | cpio -o --format=newc -0 -v -F  ../initrd
cd ..
rm -rf ext_out
docker stop -t0 tempRE
docker rm tempRE || :
docker image rm ctf/tmp-emulator-image
