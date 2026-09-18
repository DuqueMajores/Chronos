export class ProcessingManager {
    constructor() {
        this.state = 'idle';
        this.progress = 0;
        this.listeners = [];
    }

    setState(newState, progress = 0) {
        this.state = newState;
        this.progress = progress;
        this.notify();
    }

    subscribe(callback) {
        this.listeners.push(callback);
    }

    notify() {
        this.listeners.forEach(cb => cb({ state: this.state, progress: this.progress }));
    }
}
