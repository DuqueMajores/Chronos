export class VideoRenderer {
    static renderShort(videoElement, segment, options = {}, onProgress) {
        return new Promise((resolve, reject) => {
            if (!videoElement || !videoElement.srcObject && !videoElement.src) {
                reject(new Error('Nenhum vídeo carregado.'));
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = 1080;
            canvas.height = 1920;
            const ctx = canvas.getContext('2d');

            if (!ctx || typeof canvas.captureStream !== 'function') {
                reject(new Error('Este navegador não suporta a gravação do vídeo.'));
                return;
            }

            // O canvas fornece o vídeo vertical recortado. Primeiro tentamos
            // capturar o áudio diretamente do elemento de vídeo.
            const canvasStream = canvas.captureStream(30);
            const captureVideo = videoElement.captureStream || videoElement.mozCaptureStream;
            const sourceStream = captureVideo ? captureVideo.call(videoElement) : null;
            let audioTracks = sourceStream ? sourceStream.getAudioTracks() : [];
            let audioContext = null;
            let audioDestination = null;
            let audioSource = null;

            // Alguns navegadores não incluem o áudio de arquivos locais em
            // video.captureStream(). Nesse caso, roteamos o áudio do elemento
            // por um MediaStreamAudioDestinationNode, que é gravável pelo
            // MediaRecorder.
            if (audioTracks.length === 0 && typeof AudioContext !== 'undefined') {
                try {
                    audioContext = new AudioContext();
                    audioSource = audioContext.createMediaElementSource(videoElement);
                    audioDestination = audioContext.createMediaStreamDestination();
                    audioSource.connect(audioDestination);
                    audioSource.connect(audioContext.destination);
                    audioTracks = audioDestination.stream.getAudioTracks();
                } catch (error) {
                    console.warn('Não foi possível capturar o áudio via AudioContext:', error);
                    audioContext?.close();
                    audioContext = null;
                    audioDestination = null;
                    audioSource = null;
                }
            }

            if (audioTracks.length === 0) {
                canvasStream.getTracks().forEach(track => track.stop());
                throw new Error('Nenhuma trilha de áudio foi encontrada no vídeo original.');
            }

            const outputStream = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...audioTracks
            ]);

            const mimeCandidates = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm'
            ];
            const mimeType = mimeCandidates.find(type =>
                typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(type)
            );

            let recorder;
            try {
                recorder = mimeType
                    ? new MediaRecorder(outputStream, { mimeType })
                    : new MediaRecorder(outputStream);
            } catch (error) {
                outputStream.getTracks().forEach(track => track.stop());
                reject(new Error(`Não foi possível iniciar a gravação: ${error.message}`));
                return;
            }

            const chunks = [];
            let animationFrameId = null;
            let settled = false;

            const cleanup = () => {
                if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
                canvasStream.getTracks().forEach(track => track.stop());
                outputStream.getTracks().forEach(track => track.stop());
                audioSource?.disconnect();
                audioContext?.close();
                videoElement.pause();
            };

            const fail = (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error instanceof Error ? error : new Error(String(error)));
            };

            recorder.onerror = (event) => {
                fail(event.error || new Error('Erro ao gravar o vídeo.'));
            };

            recorder.ondataavailable = event => {
                if (event.data && event.data.size > 0) chunks.push(event.data);
            };

            recorder.onstop = () => {
                if (settled) return;
                settled = true;
                cleanup();

                const finalType = recorder.mimeType || mimeType || 'video/webm';
                const blob = new Blob(chunks, { type: finalType });
                const extension = finalType.includes('mp4') ? 'mp4' : 'webm';
                const file = new File([blob], `short_${Date.now()}.${extension}`, {
                    type: finalType
                });
                resolve(file);
            };

            const stopRecording = () => {
                if (recorder.state !== 'inactive') recorder.stop();
            };

            const drawFrame = () => {
                if (videoElement.currentTime >= segment.end) {
                    stopRecording();
                    return;
                }

                if (videoElement.readyState < 2) {
                    animationFrameId = requestAnimationFrame(drawFrame);
                    return;
                }

                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const vW = videoElement.videoWidth;
                const vH = videoElement.videoHeight;
                const targetW = canvas.width;
                const targetH = canvas.height;

                if (!vW || !vH) {
                    animationFrameId = requestAnimationFrame(drawFrame);
                    return;
                }

                if (options.cropMode === 'fit') {
                    const scale = Math.min(targetW / vW, targetH / vH);
                    const dW = vW * scale;
                    const dH = vH * scale;
                    ctx.drawImage(videoElement, (targetW - dW) / 2, (targetH - dH) / 2, dW, dH);
                } else {
                    const sourceW = vH * (9 / 16);
                    const sourceX = Math.max(0, (vW - sourceW) / 2);
                    ctx.drawImage(videoElement, sourceX, 0, Math.min(sourceW, vW), vH, 0, 0, targetW, targetH);
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
                animationFrameId = requestAnimationFrame(drawFrame);
            };

            const startRecording = async () => {
                try {
                    if (audioContext?.state === 'suspended') {
                        await audioContext.resume();
                    }
                    recorder.start(250);
                    await videoElement.play();
                    drawFrame();
                } catch (error) {
                    if (recorder.state !== 'inactive') recorder.stop();
                    fail(error);
                }
            };

            videoElement.onerror = () => fail(new Error('Não foi possível ler o vídeo original.'));
            videoElement.onseeked = startRecording;
            videoElement.currentTime = segment.start;
        });
    }
}
