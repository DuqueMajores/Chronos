import { VideoAnalyzer } from '../services/VideoAnalyzer.js';
import { ShortDetector } from '../services/ShortDetector.js';
import { VideoRenderer } from '../services/VideoRenderer.js';
import { StorageManager } from '../services/StorageManager.js';
import { ProcessingManager } from '../services/ProcessingManager.js';
import { ShortProject, ShortSegment } from '../models/ShortProject.js';
export class ShortEditorUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        this.storage = new StorageManager();
        this.processing = new ProcessingManager();
        this.currentProject = null;
        this.activeSegment = null;
        this.videoDuration = 0;
        this.init();
    }
    async init() {
        try {
            await this.storage.init();
            this.renderLayout();
            this.bindEvents();
        } catch (error) {
            console.error('Erro ao inicializar:', error);
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    getBadgeConfig(score = 0) {
        if (score >= 80) return { label: '🔥 Alto Potencial', bg: '#ef4444' };
        if (score >= 50) return { label: '⚡ Médio Potencial', bg: '#f59e0b' };
        return { label: '💡 Normal', bg: '#3b82f6' };
    }

    /* STREAMING_CHUNK:Rendering responsive centered HTML layout and CSS styles... */
    renderLayout() {
        this.container.innerHTML = `
        <div class="short-editor-wrapper">
            <!-- Painel Esquerdo: Upload, Controles e Lista -->
            <div class="left-panel">
                <div id="upload-zone">
                    <p>Arraste seu vídeo aqui ou clique para selecionar (.mp4 ou .webm)</p>
                    <input type="file" id="video-input" accept="video/mp4,video/webm,.mp4,.webm" style="display: none;">
                </div>

                <div id="video-info"></div>

                <!-- Seletor de Intervalo com Barra Arrastável -->
                <div class="range-selection-container">
                    <div class="range-slider-wrapper">
                        <div class="range-slider-track"></div>
                        <input type="range" id="range-start" min="0" max="100" value="0" step="0.1">
                        <input type="range" id="range-end" min="0" max="100" value="100" step="0.1">
                    </div>

                    <div class="range-footer">
                        <span class="range-text">
                            Trecho Selecionado: <strong id="range-text-start">0:00</strong> até <strong id="range-text-end">0:00</strong>
                        </span>
                        <button id="btn-detect-shorts" class="btn-primary">
                            Gerar Shorts
                        </button>
                    </div>
                </div>

                <!-- Exibição do Short Selecionado (Não Configurável) -->
                <div class="timeline-container">
                    <span class="label-text">Short Selecionado:</span>
                    <div class="timeline-inputs">
                        <input type="number" id="start-time-min" value="0" step="0.05" min="0" readonly disabled>
                        <span>min até</span>
                        <input type="number" id="end-time-min" value="0.25" step="0.05" min="0" readonly disabled>
                        <span>min</span>
                    </div>
                </div>

                <div class="shorts-list">
                    <h3>Shorts Gerados</h3>
                    <div id="shorts-items"></div>
                </div>
            </div>

            <!-- Painel Direito: Preview e Ações -->
            <div class="right-panel">
                <h4 class="preview-title">Preview 9:16</h4>
                <div class="preview-box">
                    <video id="editor-video" controls></video>
                </div>

                <div id="progress-bar">
                    <div id="progress-fill"></div>
                </div>

                <div class="action-buttons">
                    <button id="btn-download" class="btn-action btn-green">Baixar</button>
                    
                </div>
            </div>
        </div>

        <style>
            .short-editor-wrapper {
                max-width: 1200px;
                width: 100%;
                margin: 0 auto;
                box-sizing: border-box;
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 20px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                color: #fff;
                background: #18181b;
                padding: 20px;
                border-radius: 12px;
            }

            .left-panel {
                flex: 1 1 500px;
                max-width: 100%;
                min-width: 300px;
                display: flex;
                flex-direction: column;
            }

            .right-panel {
                flex: 0 1 340px;
                width: 100%;
                max-width: 360px;
                display: flex;
                flex-direction: column;
                align-items: center;
                background: #27272a;
                padding: 20px;
                border-radius: 8px;
                box-sizing: border-box;
            }

            #upload-zone {
                border: 2px dashed #4f46e5;
                padding: 30px 20px;
                text-align: center;
                border-radius: 8px;
                cursor: pointer;
                background: rgba(79, 70, 229, 0.05);
                transition: background 0.2s ease;
            }

            #upload-zone:hover {
                background: rgba(79, 70, 229, 0.12);
            }

            #video-info {
                margin-top: 15px;
                display: none;
                background: #27272a;
                padding: 12px 15px;
                border-radius: 6px;
                font-size: 14px;
            }

            .range-selection-container {
                margin-top: 20px;
                background: #27272a;
                padding: 15px;
                border-radius: 6px;
            }

            .range-slider-wrapper {
                position: relative;
                height: 30px;
                display: flex;
                align-items: center;
            }

            .range-slider-track {
                position: absolute;
                width: 100%;
                height: 6px;
                background: #3f3f46;
                border-radius: 3px;
            }

            .range-slider-wrapper input[type=range] {
                position: absolute;
                width: 100%;
                pointer-events: none;
                -webkit-appearance: none;
                background: none;
                border: none;
                outline: none;
                z-index: 2;
                margin: 0;
            }

            .range-slider-wrapper input[type=range]#range-end {
                z-index: 3;
            }

            .range-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 12px;
                flex-wrap: wrap;
                gap: 10px;
            }

            .range-text {
                font-size: 13px;
                color: #a1a1aa;
            }

            .range-text strong {
                color: #fff;
            }

            .timeline-container {
                margin-top: 15px;
                background: #27272a;
                padding: 12px 15px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 10px;
            }

            .timeline-inputs {
                display: flex;
                gap: 8px;
                align-items: center;
                font-size: 13px;
                color: #a1a1aa;
            }

            .timeline-inputs input {
                width: 70px;
                background: #18181b;
                color: #a1a1aa;
                border: 1px solid #3f3f46;
                border-radius: 4px;
                padding: 4px 6px;
                cursor: not-allowed;
                opacity: 0.7;
            }

            .label-text {
                font-size: 13px;
                color: #a1a1aa;
            }

            .shorts-list {
                margin-top: 20px;
            }

            .shorts-list h3 {
                margin: 0 0 10px 0;
                font-size: 16px;
            }

            .preview-title {
                margin: 0 0 12px 0;
                font-size: 16px;
                width: 100%;
                text-align: center;
            }

            .preview-box {
                width: 100%;
                max-width: 270px;
                aspect-ratio: 9 / 16;
                background: #000;
                position: relative;
                overflow: hidden;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            }

            .preview-box video {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .inputs-group {
                width: 100%;
                margin-top: 15px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .inputs-group input,
            .inputs-group textarea {
                width: 100%;
                padding: 8px 10px;
                box-sizing: border-box;
                background: #18181b;
                color: #fff;
                border: 1px solid #3f3f46;
                border-radius: 4px;
                font-family: inherit;
                font-size: 14px;
            }

            .inputs-group textarea {
                resize: vertical;
                min-height: 60px;
            }

            #progress-bar {
                width: 100%;
                display: none;
                margin-top: 10px;
                background: #3f3f46;
                border-radius: 4px;
                overflow: hidden;
                height: 8px;
            }

            #progress-fill {
                width: 0%;
                height: 100%;
                background: #22c55e;
                transition: width 0.2s ease;
            }

            .action-buttons {
                display: flex;
                gap: 10px;
                margin-top: 15px;
                width: 100%;
            }

            .btn-primary {
                background: #4f46e5;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                transition: background 0.2s ease;
            }

            .btn-primary:hover {
                background: #4338ca;
            }

            .btn-action {
                flex: 1;
                padding: 10px;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                transition: opacity 0.2s ease;
            }

            .btn-action:hover {
                opacity: 0.9;
            }

            .btn-green { background: #22c55e; }
            .btn-cyan { background: #06b6d4; }

            /* Range Slider Thumb Styles */
            input[type=range]::-webkit-slider-thumb {
                pointer-events: auto;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: #4f46e5;
                cursor: pointer;
                -webkit-appearance: none;
            }
            input[type=range]::-moz-range-thumb {
                pointer-events: auto;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: #4f46e5;
                cursor: pointer;
            }

            /* Responsive Breakpoints */
            @media (max-width: 850px) {
                .short-editor-wrapper {
                    flex-direction: column;
                    align-items: center;
                    padding: 15px;
                }

                .left-panel,
                .right-panel {
                    width: 100%;
                    max-width: 100%;
                    flex: 1 1 100%;
                }

                .preview-box {
                    max-width: 240px;
                }
            }

            @media (max-width: 480px) {
                .range-footer {
                    flex-direction: column;
                    align-items: stretch;
                }

                .btn-primary {
                    width: 100%;
                }

                .timeline-container {
                    flex-direction: column;
                    align-items: flex-start;
                }
            }
        </style>
    `;
    }

    /* STREAMING_CHUNK:Binding event listeners to interface elements... */
    bindEvents() {
        const uploadZone = this.container.querySelector('#upload-zone');
        const fileInput = this.container.querySelector('#video-input');
        const videoElem = this.container.querySelector('#editor-video');

        if (uploadZone && fileInput) {
            uploadZone.onclick = () => fileInput.click();
            fileInput.onchange = (e) => this.handleVideoUpload(e.target.files[0]);
        }

        const rangeStart = this.container.querySelector('#range-start');
        const rangeEnd = this.container.querySelector('#range-end');

        rangeStart.oninput = () => this.updateRangeValues();
        rangeEnd.oninput = () => this.updateRangeValues();

        const btnDetect = this.container.querySelector('#btn-detect-shorts');
        if (btnDetect) {
            btnDetect.onclick = () => {
                if (!videoElem.src) return alert('Carregue um vídeo primeiro.');

                const startSec = parseFloat(rangeStart.value);
                const endSec = parseFloat(rangeEnd.value);

                if (endSec - startSec < 15) {
                    return alert('Selecione um intervalo de pelo menos 15 segundos na linha do tempo.');
                }

                const segments = this.generateSequentialShorts(startSec, endSec, 30);
                this.renderShortsList(segments);
            };
        }

        const btnDownload = this.container.querySelector('#btn-download');
        if (btnDownload) btnDownload.onclick = () => this.exportAndProcess(false);

        const btnPublish = this.container.querySelector('#btn-publish');
        if (btnPublish) btnPublish.onclick = () => this.exportAndProcess(true);
    }

    updateRangeValues() {
        const rangeStart = this.container.querySelector('#range-start');
        const rangeEnd = this.container.querySelector('#range-end');
        const textStart = this.container.querySelector('#range-text-start');
        const textEnd = this.container.querySelector('#range-text-end');

        let valStart = parseFloat(rangeStart.value);
        let valEnd = parseFloat(rangeEnd.value);

        if (valStart >= valEnd) {
            valStart = valEnd - 1;
            rangeStart.value = valStart;
        }

        textStart.textContent = this.formatTime(valStart);
        textEnd.textContent = this.formatTime(valEnd);
    }

    /* STREAMING_CHUNK:Handling video uploads and analyzing project metadata... */
    async handleVideoUpload(file) {
        if (!file) return;
        const info = await VideoAnalyzer.analyze(file);
        this.currentProject = new ShortProject({ name: file.name, duration: info.duration, width: info.width, height: info.height });

        this.videoDuration = info.duration;
        const videoElem = this.container.querySelector('#editor-video');
        videoElem.src = info.url;

        const infoDiv = this.container.querySelector('#video-info');
        infoDiv.style.display = 'block';
        infoDiv.innerHTML = `<strong>${info.name}</strong> | ${info.width}x${info.height} | ${this.formatTime(info.duration)} min | ${(info.size / 1024 / 1024).toFixed(2)} MB`;

        const rangeStart = this.container.querySelector('#range-start');
        const rangeEnd = this.container.querySelector('#range-end');

        rangeStart.min = 0;
        rangeStart.max = info.duration;
        rangeStart.value = 0;

        rangeEnd.min = 0;
        rangeEnd.max = info.duration;
        rangeEnd.value = info.duration;

        this.updateRangeValues();
        await this.storage.saveVideoBlob(this.currentProject.id, file);
    }

    generateSequentialShorts(start, end, targetDuration = 30) {
        const segments = [];
        let current = start;

        while (current < end) {
            let nextEnd = current + targetDuration;

            if (nextEnd > end) {
                nextEnd = end;
            }

            const duration = nextEnd - current;

            if (duration >= 15 && duration < 60) {
                const score = Math.floor(Math.random() * 40) + 60;
                segments.push({
                    start: Number(current.toFixed(1)),
                    end: Number(nextEnd.toFixed(1)),
                    score: score
                });
            }

            current = nextEnd;
        }

        return segments;
    }

    /* STREAMING_CHUNK:Rendering list of generated shorts... */
    renderShortsList(segments = []) {
        const list = this.container.querySelector('#shorts-items');
        if (!list) return;

        list.innerHTML = '';

        if (segments.length === 0) {
            list.innerHTML = '<p style="color: #a1a1aa; font-size: 14px;">Nenhum corte de 15s a 59s pôde ser gerado para o intervalo selecionado.</p>';
            return;
        }

        const sortedSegments = [...segments].sort((a, b) => (b.score || 0) - (a.score || 0));

        sortedSegments.forEach((seg, idx) => {
            const start = seg.start ?? 0;
            const end = seg.end ?? 15;
            const score = seg.score || 0;
            const badge = this.getBadgeConfig(score);
            const duration = (end - start).toFixed(1);

            const div = document.createElement('div');
            div.style.cssText = 'background: #3f3f46; padding: 10px; border-radius: 6px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;';

            div.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: bold;">SHORT 0${idx + 1}</span>
                    <span style="background: ${badge.bg}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">
                        ${badge.label} (${score} pts)
                    </span>
                </div>
                <span style="font-size: 12px; color: #a1a1aa;">
                    ${this.formatTime(start)} - ${this.formatTime(end)} (${duration}s)
                </span>
            </div>
            <button style="background: #4f46e5; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer;">Selecionar</button>
        `;

            div.querySelector('button').onclick = () => {
                this.activeSegment = new ShortSegment({ start, end });
                this.container.querySelector('#start-time-min').value = (start / 60).toFixed(2);
                this.container.querySelector('#end-time-min').value = (end / 60).toFixed(2);
                const video = this.container.querySelector('#editor-video');
                video.currentTime = start;
            };

            list.appendChild(div);
        });
    }

    /* STREAMING_CHUNK:Processing short rendering, download, and publishing... */
    async exportAndProcess(shouldPublish = false) {
        const video = this.container.querySelector('#editor-video');
        if (!video.src) return alert('Nenhum vídeo carregado.');

        const startMin = parseFloat(this.container.querySelector('#start-time-min').value);
        const endMin = parseFloat(this.container.querySelector('#end-time-min').value);

        const start = startMin * 60;
        const end = endMin * 60;
        const duration = end - start;

        if (duration >= 60) {
            return alert(`O corte selecionado tem ${duration.toFixed(1)}s. Shorts precisam ter menos de 60 segundos!`);
        }

        if (duration < 15) {
            return alert('O corte selecionado precisa ter no mínimo 15 segundos.');
        }

        // Esses campos podem não existir nesta versão da interface. O acesso
        // opcional evita que o download seja interrompido por TypeError.
        const titleInput = this.container.querySelector('#short-title');
        const descriptionInput = this.container.querySelector('#short-desc');
        const title = (titleInput?.value || 'Meu Short').trim();
        const description = descriptionInput?.value || '';

        const segment = this.activeSegment || new ShortSegment({ start, end });
        segment.title = title;
        segment.description = description;

        const progressBar = this.container.querySelector('#progress-bar');
        const progressFill = this.container.querySelector('#progress-fill');
        progressBar.style.display = 'block';

        try {
            const file = await VideoRenderer.renderShort(video, segment, { cropMode: 'center' }, (pct) => {
                progressFill.style.width = `${pct}%`;
            });

            if (!file) {
                throw new Error('O renderizador não retornou um arquivo de vídeo.');
            }

            if (shouldPublish) {
                this.sendToExistingPublishingSystem({
                    file: file,
                    title: segment.title,
                    description: segment.description,
                    type: 'short'
                });
            } else {
                // Anexar o link ao DOM aumenta a compatibilidade com browsers
                // que bloqueiam cliques em elementos ainda não inseridos.
                const objectUrl = URL.createObjectURL(file);
                const downloadLink = document.createElement('a');
                const safeTitle = title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Meu Short';

                downloadLink.href = objectUrl;
                const extension = file.type.includes('mp4') ? 'mp4' : 'webm';
                downloadLink.download = `${safeTitle}.${extension}`;
                downloadLink.style.display = 'none';
                document.body.appendChild(downloadLink);
                downloadLink.click();

                // Remover o link depois do início do download e liberar a URL.
                setTimeout(() => {
                    downloadLink.remove();
                    URL.revokeObjectURL(objectUrl);
                }, 1000);
            }
        } catch (error) {
            console.error('Erro ao gerar ou baixar o short:', error);
            alert(`Não foi possível baixar o short: ${error.message || 'erro desconhecido'}`);
        } finally {
            progressBar.style.display = 'none';
            progressFill.style.width = '0%';
        }
    }

    sendToExistingPublishingSystem(payload) {
        if (typeof window.publishVideo === 'function') {
            window.publishVideo(payload);
        } else if (typeof window.uploadToYouTube === 'function') {
            window.uploadToYouTube(payload);
        } else {
            const event = new CustomEvent('chronos:publish-short', { detail: payload });
            window.dispatchEvent(event);
            alert('Short gerado com sucesso! Entregue ao módulo de publicação da aplicação.');
        }
    }
}
