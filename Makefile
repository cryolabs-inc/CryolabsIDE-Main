disk-image:
	cd static; bash ../img2disk.sh ../base_client_image/Dockerfile ../base_client_image/script.sh
mu:
	cd mu-cxx && g++ main.cc -static -m32 -o build/mu