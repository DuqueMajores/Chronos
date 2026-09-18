import { FaceTracker } from './FaceTracker.js';

export class VideoRenderer {
    static async renderShort(videoElement, segment, options = {}, onProgress) {
        if (!videoElement || (!videoElement.srcObject && !videoElement.src)) {
            throw new Error('Nenhum vídeo carregado.');
        }

        const canvas = document.createElement('canvas');
        canvas.width = options.width || 1080;
        canvas.height = options.height || 1920;
        const ctx = canvas.getContext('2d');

        if (!ctx || typeof canvas.captureStream !== 'function') {
            throw new Error('Este navegador não suporta a gravação do vídeo.');
        }

        const faceTracker = new FaceTracker();
        const originalTime = videoElement.currentTime;
        let focusData = { keyframes: [], supported: false };
        const wantsSmartCrop = options.cropMode !== 'fit' && options.smartCrop !== false;

        // A análise acontece antes da gravação para que o recorte não salte entre frames.
        if (wantsSmartCrop) {
            try {
                focusData = await faceTracker.analyzeSegment(videoElement, segment, {
                    sampleCount: options.sampleCount || 8
                });
            } catch (error) {
                console.warn('Não foi possível analisar o foco do vídeo; usando centro.', error);
                videoElement.currentTime = originalTime;
            }
        }

        const canvasStream = canvas.captureStream(options.fps || 30);
        const captureVideo = videoElement.captureStream || videoElement.mozCaptureStream;
        const sourceStream = captureVideo ? captureVideo.call(videoElement) : null;
        let audioTracks = sourceStream ? sourceStream.getAudioTracks() : [];
        let audioContext = null;
        let audioDestination = null;
        let audioSource = null;

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

        const outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
        const mimeCandidates = [
            'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
            'video/mp4;codecs="avc1.4D401F,mp4a.40.2"',
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];
        const mimeType = mimeCandidates.find(type =>
            typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(type)
        );

        let recorder;
        try {
            recorder = mimeType ? new MediaRecorder(outputStream, { mimeType }) : new MediaRecorder(outputStream);
        } catch (error) {
            outputStream.getTracks().forEach(track => track.stop());
            throw new Error(`Não foi possível iniciar a gravação: ${error.message}`);
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

        return new Promise((resolve, reject) => {
            const fail = (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error instanceof Error ? error : new Error(String(error)));
            };

            recorder.onerror = event => fail(event.error || new Error('Erro ao gravar o vídeo.'));
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
                resolve(new File([blob], `short_${Date.now()}.${extension}`, { type: finalType }));
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
                if (!vW || !vH) {
                    animationFrameId = requestAnimationFrame(drawFrame);
                    return;
                }

                if (options.cropMode === 'fit') {
                    const scale = Math.min(canvas.width / vW, canvas.height / vH);
                    const dW = vW * scale;
                    const dH = vH * scale;
                    ctx.drawImage(videoElement, (canvas.width - dW) / 2, (canvas.height - dH) / 2, dW, dH);
                } else {
                    const sourceW = Math.min(vW, vH * (canvas.width / canvas.height));
                    const maxCropX = Math.max(0, vW - sourceW);
                    const centerCrop = maxCropX / 2;
                    const detectedCrop = faceTracker.getCropAtTime(focusData.keyframes, videoElement.currentTime, centerCrop);
                    // O lerp reduz microvariações do detector e mantém a pessoa no eixo central.
                    const previousCrop = this._lastCropX ?? detectedCrop;
                    const cropX = previousCrop + (detectedCrop - previousCrop) * 0.12;
                    this._lastCropX = Math.max(0, Math.min(maxCropX, cropX));
                    ctx.drawImage(videoElement, this._lastCropX, 0, sourceW, vH, 0, 0, canvas.width, canvas.height);
                }

                if (segment.texts) {
                    segment.texts.forEach(txt => {
                        ctx.fillStyle = txt.color || '#ffffff';
                        ctx.font = 'bold 48px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(txt.text, canvas.width / 2, canvas.height - 150);
                    });
                }

                const progress = ((videoElement.currentTime - segment.start) / (segment.end - segment.start)) * 100;
                onProgress?.(Math.min(100, Math.max(0, progress)));
                animationFrameId = requestAnimationFrame(drawFrame);
            };

            const startRecording = async () => {
                try {
                    if (audioContext?.state === 'suspended') await audioContext.resume();
                    this._lastCropX = undefined;
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
