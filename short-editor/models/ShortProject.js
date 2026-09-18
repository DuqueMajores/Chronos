export class ShortProject {
    constructor({ id = Date.now().toString(), name = 'Novo Projeto', sourceVideo = null, duration = 0, width = 0, height = 0 }) {
        this.id = id;
        this.name = name;
        this.sourceVideo = sourceVideo;
        this.duration = duration;
        this.width = width;
        this.height = height;
        this.shorts = [];
        this.settings = { cropMode: 'crop-center', maxDuration: 60 };
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
    }
}

export class ShortSegment {
    constructor({ id = Date.now().toString(), start = 0, end = 15, title = '', description = '', crop = 'center', zoom = 1, texts = [], captions = [] }) {
        this.id = id;
        this.start = start;
        this.end = end;
        this.duration = end - start;
        this.crop = crop;
        this.zoom = zoom;
        this.texts = texts;
        this.captions = captions;
        this.title = title;
        this.description = description;
        this.status = 'draft';
    }
}
