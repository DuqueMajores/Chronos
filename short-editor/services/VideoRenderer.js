export class VideoRenderer {
    static renderShort(videoElement, segment, options = {}, onProgress) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = 1080;
            canvas.height = 1920;
            const ctx = canvas.getContext('2d');

            const stream = canvas.captureStream(30);
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
            const chunks = [];

            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/mp4' });
                const file = new File([blob], `short_${Date.now()}.mp4`, { type: 'video/mp4' });
                resolve(file);
            };

            videoElement.currentTime = segment.start;

            const drawFrame = () => {
                if (videoElement.currentTime >= segment.end || videoElement.paused) {
                    recorder.stop();
                    videoElement.pause();
                    return;
                }

                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const vW = videoElement.videoWidth;
                const vH = videoElement.videoHeight;
                const targetW = canvas.width;
                const targetH = canvas.height;

                if (options.cropMode === 'fit') {
                    const scale = Math.min(targetW / vW, targetH / vH);
                    const dW = vW * scale;
                    const dH = vH * scale;
                    ctx.drawImage(videoElement, (targetW - dW) / 2, (targetH - dH) / 2, dW, dH);
                } else {
                    const sourceW = vH * (9 / 16);
                    const sourceX = (vW - sourceW) / 2;
                    ctx.drawImage(videoElement, sourceX, 0, sourceW, vH, 0, 0, targetW, targetH);
                }

                if (segment.texts) {
                    segment.texts.forEach(txt => {
                        ctx.fillStyle = txt.color || '#ffffff';
                        ctx.font = 'bold 48px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(txt.text, targetW / 2, targetH - 150);
                    });
                }

                const progress = ((videoElement.currentTime - segment.start) / (segment.end - segment.start)) * 100;
                if (onProgress) onProgress(Math.min(100, Math.max(0, progress)));

                requestAnimationFrame(drawFrame);
            };

            videoElement.onseeked = () => {
                recorder.start();
                videoElement.play();
                drawFrame();
            };
        });
    }
}
