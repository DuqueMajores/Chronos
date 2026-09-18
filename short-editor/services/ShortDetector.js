export class ShortDetector {
    static async detect(videoElement, maxDuration = 60, targetCount = 3) {
        const duration = videoElement.duration;
        const segments = [];
        const segDuration = Math.min(maxDuration, 30);
        const step = duration / (targetCount + 1);

        for (let i = 1; i <= targetCount; i++) {
            const start = Math.floor(step * i);
            const end = Math.min(start + segDuration, duration);
            if (end - start >= 5) {
                segments.push({
                    start: Number(start.toFixed(1)),
                    end: Number(end.toFixed(1)),
                    score: 0.85 + (i * 0.02),
                    reason: `Segmento relevante ${i}`
                });
            }
        }
        return segments;
    }
}
