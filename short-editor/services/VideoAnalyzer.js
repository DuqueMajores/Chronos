export class VideoAnalyzer {
    static analyze(file) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            const url = URL.createObjectURL(file);
            video.src = url;

            video.onloadedmetadata = () => {
                const info = {
                    name: file.name,
                    size: file.size,
                    duration: video.duration,
                    width: video.videoWidth,
                    height: video.videoHeight,
                    aspectRatio: (video.videoWidth / video.videoHeight).toFixed(2),
                    url: url
                };
                resolve(info);
            };

            video.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Formato de vídeo incompatível ou corrompido.'));
            };
        });
    }
}
