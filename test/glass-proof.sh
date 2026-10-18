set -x
xdpyinfo -ext Composite | head -5 > xdpy.txt 2>&1 || true
display -geometry +0+0 -borderwidth 0 bg.png &
BG=$!
sleep 2
scrot -o 0-bg-only.png
# Compositor WITHOUT blur (what most Linux desktops give today)
picom --backend xrender --no-fading-openclose --config /dev/null --log-level debug --log-file picom1.log &
PIC=$!
sleep 3
../src-tauri/target/debug/brixalo > app1.log 2>&1 &
APP=$!
sleep 40
scrot -o 1-see-through-no-blur.png
xprop -id "$(xwininfo -root -tree | grep '"Brixalo"' | head -1 | awk '{print $1}')" > xprop1.txt 2>&1 || true
kill $APP || true; kill $PIC || true
sleep 2
# Compositor WITH background blur (KWin does this natively on KDE via the same hint)
printf 'blur-background = true;\nblur-method = "kernel";\nblur-kern = "11x11gaussian";\nblur-background-frame = true;\nblur-background-fixed = false;\n' > picom-blur.conf
picom --backend xrender --no-fading-openclose --config picom-blur.conf --log-level debug --log-file picom2.log &
PIC=$!
sleep 3
../src-tauri/target/debug/brixalo > app2.log 2>&1 &
APP=$!
sleep 40
scrot -o 2-with-compositor-blur.png
xwininfo -root -tree > tree2.txt 2>&1 || true
kill $APP || true; kill $PIC || true; kill $BG || true
