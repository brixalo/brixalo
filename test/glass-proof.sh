set -x
xdpyinfo -ext Composite | head -5 > xdpy.txt 2>&1 || true
display -geometry +0+0 -borderwidth 0 bg.png &
BG=$!
sleep 2
scrot -o 0-bg-only.png
../src-tauri/target/debug/brixalo > app-nocomp.log 2>&1 &
APP=$!
sleep 12
scrot -o 1-app-no-compositor.png
xwininfo -root -tree > tree1.txt 2>&1 || true
kill $APP || true
sleep 1
picom --backend xrender --no-fading-openclose --config /dev/null --log-level debug --log-file picom.log &
PIC=$!
sleep 3
scrot -o 2-bg-with-picom.png
../src-tauri/target/debug/brixalo > app.log 2>&1 &
APP=$!
sleep 12
scrot -o 3-glass.png
xwininfo -root -tree > tree2.txt 2>&1 || true
kill $APP || true; kill $PIC || true; kill $BG || true
