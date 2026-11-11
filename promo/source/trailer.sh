#!/bin/sh
# frames/trailer/list.txt (trailer.mjs) → ../trailer/sleep-journal-trailer.mp4: 1920 × 1080, 30 fps,
# H.264 High, with the music from the start, fading in and out as the page does. The page itself
# shows the music credit at the end. Settings as for the app previews (encode.sh): square pixels,
# standard color range, so every player shows it right.
music=${MUSIC:-../trailer/Inspired.mp3}
out=../trailer/sleep-journal-trailer.mp4
length=49.5
ffmpeg -y -loglevel error -f concat -safe 0 -i frames/trailer/list.txt -i "$music" \
  -filter_complex "[0:v]fps=30,scale=1920:1080,setsar=1,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v];[1:a]atrim=0:$length,afade=t=in:st=0:d=0.5,afade=t=out:st=$(awk "BEGIN { print $length - 2 }"):d=2,aformat=sample_rates=44100:channel_layouts=stereo[a]" \
  -map "[v]" -map "[a]" -t $length -c:v libx264 -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -profile:v high -level 4.1 -preset slow -crf 18 -r 30 \
  -c:a aac -b:a 256k -ar 44100 -movflags +faststart "$out"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,channels,sample_aspect_ratio,pix_fmt -show_entries format=duration -of compact "$out"
