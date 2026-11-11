#!/bin/sh
# frames/<name>/list.txt → out/previews/<name>.mp4: 886 × 1920, 30 fps, H.264, with music,
# ending on out/endcard.png (the music credit; make it with python endcard.py).
# (setsar=1: square pixels, or players squash the picture. out_range=tv: Windows Media Player refuses "full range" video.)
name=$1
music=${MUSIC:-../trailer/Inspired.mp3}
mkdir -p out/previews
# 1. The app recording, with the status bar and home bar.
ffmpeg -y -loglevel error -f concat -safe 0 -i "frames/$name/list.txt" -i preview-overlay.png \
  -filter_complex "[0:v]fps=30,scale=886:1734,format=rgb24,setsar=1,split=3[a][b][c];[a]crop=886:1:0:2,scale=886:118,setsar=1[top];[c]crop=886:1:0:ih-2,scale=886:68,setsar=1[bot];[top][b][bot]vstack=3[v];[v][1:v]overlay=0:0,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setsar=1[out]" \
  -map "[out]" -an -c:v libx264 -crf 12 -preset fast -r 30 "out/previews/$name.app.mp4"
# 2. Fade into the end card (3 s on screen), and lay the music under all of it, fading out at the end.
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "out/previews/$name.app.mp4")
calc() { awk "BEGIN { print $1 }"; }
total=$(calc "$d + 3")
ffmpeg -y -loglevel error -i "out/previews/$name.app.mp4" -loop 1 -framerate 30 -t 3.5 -i out/endcard.png -i "$music" \
  -filter_complex "[1:v]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setsar=1,fps=30,settb=1/30[end];[0:v]fps=30,settb=1/30[app];[app][end]xfade=transition=fade:duration=0.5:offset=$(calc "$d - 0.5"),format=yuv420p[out];[2:a]atrim=0:$total,afade=t=out:st=$(calc "$total - 2"):d=2,aformat=sample_rates=44100:channel_layouts=stereo[mus]" \
  -map "[out]" -map "[mus]" -t "$total" -c:v libx264 -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -profile:v high -level 4.0 -preset slow -crf 17 -r 30 \
  -c:a aac -b:a 256k -ar 44100 -movflags +faststart "out/previews/$name.mp4"
rm "out/previews/$name.app.mp4"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,channels,sample_aspect_ratio,pix_fmt -show_entries format=duration -of compact "out/previews/$name.mp4"
