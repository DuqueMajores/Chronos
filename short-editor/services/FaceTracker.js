export class FaceTracker {
    constructor() {
        this.isSupported = 'FaceDetector' in window;
    }

    async detect(frameCanvas) {
        if (!this.isSupported) {
            return [];
        }
        try {
            const detector = new window.FaceDetector();
            return await detector.detect(frameCanvas);
        } catch (e) {
            console.warn('Face Detection não suportado nativamente.', e);
            return [];
        }
    }

    getOptimalCrop(faces, videoWidth, videoHeight) {
        if (!faces || faces.length === 0) {
            return (videoWidth - (videoHeight * 9 / 16)) / 2;
        }
        const mainFace = faces[0].boundingBox;
        const faceCenterX = mainFace.x + (mainFace.width / 2);
        const targetWidth = videoHeight * (9 / 16);
        let cropX = faceCenterX - (targetWidth / 2);
        
        cropX = Math.max(0, Math.min(cropX, videoWidth - targetWidth));
        return cropX;
    }
}
