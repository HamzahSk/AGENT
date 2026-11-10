These tiny media files contain an original, locally generated blue frame and
440 Hz test tone. They are test inputs, not recordings from SnapYT or YouTube.
No page captures, request nonces, cookies, or signed media URLs are stored.

To regenerate with FFmpeg:

    ffmpeg -f lavfi -i color=c=blue:s=32x32:r=4 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 0.5 -c:v mpeg4 -q:v 5 -c:a aac -b:a 32k -movflags +faststart clip.mp4
    ffmpeg -i clip.mp4 -vn -c:a libmp3lame -b:a 32k tone.mp3
    ffmpeg -i clip.mp4 -vn -c:a libopus -b:a 32k tone.webm

The local HTTP tests serve these actual media bytes. They validate transport,
parsing, and file handling, but do not establish that the live SnapYT service
is accessible or that its current response schema still matches.
