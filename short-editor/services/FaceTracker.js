export class FaceTracker {
    constructor() {
        this.isSupported = typeof window !== 'undefined' && 'FaceDetector' in window;
    }

    async detect(frameCanvas) {
        if (!this.isSupported) return [];

        try {
            // Instanciar uma vez por chamada mantém compatibilidade com os navegadores
            // que expõem FaceDetector apenas como API experimental.
            const detector = new window.FaceDetector({ maxDetectedFaces: 8, fastMode: true });
            return await detector.detect(frameCanvas);
        } catch (error) {
            console.warn('Detecção facial indisponível; usando enquadramento central.', error);
            this.isSupported = false;
            return [];
        }
    }

    getCropMetrics(videoWidth, videoHeight, targetAspect = 9 / 16) {
        const sourceW = Math.min(videoWidth, videoHeight * targetAspect);
        const maxCropX = Math.max(0, videoWidth - sourceW);
        return { sourceW, maxCropX };
    }

    getOptimalCrop(faces, videoWidth, videoHeight, targetAspect = 9 / 16) {
        const { sourceW, maxCropX } = this.getCropMetrics(videoWidth, videoHeight, targetAspect);
        if (!faces || faces.length === 0) return maxCropX / 2;

        // Centraliza o conjunto de pessoas, dando mais peso a rostos maiores.
        const validFaces = faces
            .map(face => face.boundingBox || face)
            .filter(box => box && box.width > 0 && box.height > 0);
        if (!validFaces.length) return maxCropX / 2;

        const weightedCenter = validFaces.reduce((sum, box) => {
            const weight = Math.max(1, box.width * box.height);
            return sum + (box.x + box.width / 2) * weight;
        }, 0) / validFaces.reduce((sum, box) => sum + Math.max(1, box.width * box.height), 0);

        // Deixamos uma pequena folga à frente do grupo para evitar cortar ombros/rosto.
        const desiredCenter = weightedCenter + Math.min(videoWidth * 0.025, sourceW * 0.06);
        return Math.max(0, Math.min(maxCropX, desiredCenter - sourceW / 2));
    }

    async analyzeSegment(video, segment, options = {}) {
        const sampleCount = Math.max(3, Math.min(12, options.sampleCount || 8));
        const canvas = document.createElement('canvas');
        const maxAnalysisWidth = 640;
        const scale = Math.min(1, maxAnalysisWidth / video.videoWidth);
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const keyframes = [];
        const originalTime = video.currentTime;

        if (!ctx || !video.videoWidth || !video.videoHeight) {
            return { keyframes: [], supported: false };
        }

        const seekTo = (time) => new Promise(resolve => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resolve();
            };
            video.addEventListener('seeked', onSeeked, { once: true });
            video.currentTime = Math.max(0, Math.min(video.duration || time, time));
        });

        for (let index = 0; index < sampleCount; index += 1) {
            const progress = sampleCount === 1 ? 0 : index / (sampleCount - 1);
            const time = segment.start + (segment.end - segment.start) * progress;
            await seekTo(time);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const faces = await this.detect(canvas);
            const scaledFaces = faces.map(face => {
                const box = face.boundingBox || face;
                return {
                    x: box.x / scale,
                    y: box.y / scale,
                    width: box.width / scale,
                    height: box.height / scale
                };
            });
            keyframes.push({
                time,
                cropX: this.getOptimalCrop(scaledFaces, video.videoWidth, video.videoHeight)
            });
        }

        await seekTo(originalTime);
        return {
            keyframes,
            supported: this.isSupported,
            maxCropX: this.getCropMetrics(video.videoWidth, video.videoHeight).maxCropX
        };
    }

    getCropAtTime(keyframes, time, fallback = 0) {
        if (!keyframes || keyframes.length === 0) return fallback;
        if (time <= keyframes[0].time) return keyframes[0].cropX;
        const last = keyframes[keyframes.length - 1];
        if (time >= last.time) return last.cropX;

        for (let index = 1; index < keyframes.length; index += 1) {
            const previous = keyframes[index - 1];
            const current = keyframes[index];
            if (time <= current.time) {
                const range = current.time - previous.time || 1;
                const progress = (time - previous.time) / range;
                return previous.cropX + (current.cropX - previous.cropX) * progress;
            }
        }
        return last.cropX;
    }
}
