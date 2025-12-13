/* Taskitos - Sistema de Automação para Sala do Futuro/CMSP */
/* Código completo JavaScript - Funciona no navegador */

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================
const CONFIG = {
    API_BASE_URL: "https://edusp-api.ip.tv",
    CLIENT_ORIGIN: "https://taskitos.cupiditys.lol",
    USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    MOCK_MODE: false
};

// ============================================================================
// SISTEMA DE NOTIFICAÇÕES
// ============================================================================
class NotificationSystem {
    static show(message, type = 'info', duration = 5000) {
        const container = document.getElementById('notificationContainer');
        if (!container) {
            console.log(`[${type.toUpperCase()}] ${message}`);
            return;
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div>${message}</div>
            <div class="progress" style="height:3px;background:#666;margin-top:5px;">
                <div class="progress-bar" style="height:100%;background:#4CAF50;width:100%;"></div>
            </div>
        `;

        container.appendChild(notification);

        // Animar barra de progresso
        const bar = notification.querySelector('.progress-bar');
        bar.style.transition = `width ${duration}ms linear`;
        bar.style.width = '0%';

        // Remover após tempo
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, duration);

        return notification;
    }
}

// ============================================================================
// CLIENTE DA API
// ============================================================================
class EduspApiClient {
    constructor() {
        this.baseURL = CONFIG.API_BASE_URL;
        this.authToken = null;
        this.currentUser = null;
    }

    getHeaders(withAuth = false) {
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': CONFIG.USER_AGENT,
            'Origin': CONFIG.CLIENT_ORIGIN
        };
        
        if (withAuth && this.authToken) {
            headers['x-api-key'] = this.authToken;
        }
        
        return headers;
    }

    async login(ra, password) {
        try {
            const response = await fetch(`${this.baseURL}/registration/edusp`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    realm: 'edusp',
                    platform: 'webclient',
                    id: ra,
                    password: password
                })
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            this.authToken = data.auth_token;
            this.currentUser = { ra: ra, nick: data.nick || ra };
            
            NotificationSystem.show(`Login realizado! Olá ${data.nick || ra}`, 'success');
            return data;
        } catch (error) {
            NotificationSystem.show(`Erro no login: ${error.message}`, 'error');
            throw error;
        }
    }

    async fetchRooms() {
        try {
            const response = await fetch(`${this.baseURL}/room/user?list_all=true&with_cards=true`, {
                headers: this.getHeaders(true)
            });
            return await response.json();
        } catch (error) {
            console.error('Erro ao buscar salas:', error);
            return { rooms: [] };
        }
    }

    async fetchTasks(filter = 'pending') {
        try {
            const roomsData = await this.fetchRooms();
            const allTasks = [];
            const expiredOnly = filter === 'expired';
            
            // Buscar tarefas de cada sala
            for (const room of roomsData.rooms || []) {
                try {
                    const params = new URLSearchParams({
                        publication_target: room.id,
                        limit: '100',
                        offset: '0',
                        expired_only: expiredOnly.toString()
                    });
                    
                    const response = await fetch(`${this.baseURL}/tms/task/todo?${params}`, {
                        headers: this.getHeaders(true)
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (Array.isArray(data)) allTasks.push(...data);
                        else if (data.tasks) allTasks.push(...data.tasks);
                    }
                } catch (e) {
                    console.warn(`Erro na sala ${room.id}:`, e);
                }
            }
            
            // Remover duplicados
            return this.removeDuplicates(allTasks);
        } catch (error) {
            NotificationSystem.show('Erro ao buscar tarefas', 'error');
            return [];
        }
    }

    async fetchTaskDetails(taskId) {
        try {
            const response = await fetch(`${this.baseURL}/tms/task/${taskId}`, {
                headers: this.getHeaders(true)
            });
            const data = await response.json();
            return data.data || data;
        } catch (error) {
            throw new Error(`Erro ao buscar detalhes: ${error.message}`);
        }
    }

    async submitTask(taskId, payload) {
        try {
            const response = await fetch(`${this.baseURL}/tms/task/${taskId}/answer`, {
                method: 'POST',
                headers: this.getHeaders(true),
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            throw new Error(`Erro ao enviar: ${error.message}`);
        }
    }

    removeDuplicates(tasks) {
        const seen = new Set();
        return tasks.filter(task => {
            const id = task.id || task.task_id;
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }
}

// ============================================================================
// GERADOR DE RESPOSTAS
// ============================================================================
class AnswerGenerator {
    static generatePayload(taskDetails, options = {}) {
        const { isDraft = false, scorePreset = '75' } = options;
        const questions = taskDetails.questions || taskDetails.data?.questions || [];
        const answers = {};

        questions.forEach(question => {
            const qid = question.id || question.question_id;
            const qtype = question.type || question.question_type;
            
            answers[qid] = {
                question_id: qid,
                question_type: qtype,
                answer: this.generateAnswer(question, scorePreset)
            };
        });

        return {
            accessed_on: new Date().toISOString(),
            executed_on: new Date().toISOString(),
            answers: answers,
            final: !isDraft,
            status: isDraft ? 'draft' : 'submitted'
        };
    }

    static generateAnswer(question, scorePreset) {
        const qtype = question.type || question.question_type;
        const options = question.options || {};

        switch (qtype) {
            case 'multiple_choice':
            case 'single_choice':
                return this.handleMultipleChoice(options, scorePreset);
            case 'order-sentences':
                return this.handleOrderSentences(options);
            case 'fill-words':
                return this.handleFillWords(options);
            case 'text_ai':
            case 'text':
            case 'essay':
                return this.handleTextQuestion(question);
            case 'fill-letters':
                return options.answer || {};
            case 'cloud':
                return options.ids || [];
            default:
                return {};
        }
    }

    static handleMultipleChoice(options, scorePreset) {
        if (Array.isArray(options)) {
            const correct = options.find(opt => opt.correct);
            if (correct) return correct.id || correct.optionId;
            
            const score = parseInt(scorePreset);
            if (Math.random() * 100 <= score && options[0]) {
                return options[0].id || options[0].optionId;
            }
            
            const randomIndex = Math.floor(Math.random() * options.length);
            return options[randomIndex]?.id || null;
        }
        return null;
    }

    static handleOrderSentences(options) {
        if (options.sentences && Array.isArray(options.sentences)) {
            return options.sentences.map(s => s.value || s.text || s);
        }
        return [];
    }

    static handleFillWords(options) {
        if (options.phrase && Array.isArray(options.phrase)) {
            return options.phrase
                .filter((_, i) => i % 2 === 1)
                .map(item => item.value || item.text || item);
        }
        return [];
    }

    static handleTextQuestion(question) {
        const text = question.comment || question.value || question.text || '';
        const clean = text.replace(/<[^>]*>/g, '').substring(0, 500);
        return { "0": clean };
    }
}

// ============================================================================
// PROCESSADOR DE TAREFAS
// ============================================================================
class TaskProcessor {
    constructor(apiClient) {
        this.api = apiClient;
        this.isProcessing = false;
        this.progress = { total: 0, completed: 0, failed: 0 };
    }

    async processSingleTask(task, options = {}) {
        const { timeMin = 1, timeMax = 3, isDraft = false, scorePreset = '75' } = options;
        const taskId = task.id || task.task_id;

        try {
            // Buscar detalhes
            const details = await this.api.fetchTaskDetails(taskId);
            
            // Gerar respostas
            const payload = AnswerGenerator.generatePayload(details, { isDraft, scorePreset });
            
            // Simular tempo
            await this.simulateDelay(timeMin, timeMax);
            
            // Enviar
            const result = await this.api.submitTask(taskId, payload);
            
            return {
                success: true,
                taskId: taskId,
                taskTitle: task.title || `Tarefa ${taskId}`,
                result: result
            };
        } catch (error) {
            return {
                success: false,
                taskId: taskId,
                taskTitle: task.title || `Tarefa ${taskId}`,
                error: error.message
            };
        }
    }

    async processMultipleTasks(tasks, options = {}) {
        if (this.isProcessing) throw new Error('Já está processando');
        
        this.isProcessing = true;
        this.progress = { total: tasks.length, completed: 0, failed: 0 };
        
        const results = [];
        const batchSize = 3;
        
        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            const promises = batch.map(task => 
                this.processSingleTask(task, options)
                    .then(result => {
                        result.success ? this.progress.completed++ : this.progress.failed++;
                        this.updateProgressUI();
                        return result;
                    })
            );
            
            const batchResults = await Promise.allSettled(promises);
            results.push(...batchResults.map(r => r.value || r.reason));
            
            if (i + batchSize < tasks.length) {
                await this.delay(1000);
            }
        }
        
        this.isProcessing = false;
        return results;
    }

    async simulateDelay(min, max) {
        const minSec = Math.max(1, min) * 60;
        const maxSec = Math.max(minSec, max) * 60;
        const delay = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
        const limited = Math.min(delay, 10);
        
        return new Promise(resolve => setTimeout(resolve, limited * 1000));
    }

    updateProgressUI() {
        const counter = document.getElementById('progressCounter');
        if (counter) {
            const { total, completed, failed } = this.progress;
            counter.textContent = `Processando ${completed + failed} de ${total}`;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================================================
// GERENCIADOR DE ATIVIDADES
// ============================================================================
class ActivityManager {
    constructor() {
        this.activities = [];
        this.selectedIds = new Set();
    }

    setActivities(activities) {
        this.activities = activities || [];
        this.selectedIds.clear();
    }

    toggleSelection(id) {
        this.selectedIds.has(id) ? this.selectedIds.delete(id) : this.selectedIds.add(id);
    }

    selectAll() {
        this.activities.forEach(a => this.selectedIds.add(a.id));
    }

    clearSelection() {
        this.selectedIds.clear();
    }

    isSelected(id) {
        return this.selectedIds.has(id);
    }

    getSelectedTasks() {
        return this.activities.filter(a => this.selectedIds.has(a.id));
    }

    getSelectedCount() {
        return this.selectedIds.size;
    }

    getTotalCount() {
        return this.activities.length;
    }
}

// ============================================================================
// CONTROLE PRINCIPAL
// ============================================================================
class TaskitosController {
    constructor() {
        this.api = new EduspApiClient();
        this.processor = new TaskProcessor(this.api);
        this.activityManager = new ActivityManager();
        this.initEventListeners();
    }

    initEventListeners() {
        // Login
        document.getElementById('loginNormal')?.addEventListener('click', () => this.handleLogin('pending'));
        document.getElementById('loginOverdue')?.addEventListener('click', () => this.handleLogin('expired'));
        
        // Modal
        document.getElementById('closeActivityModal')?.addEventListener('click', () => this.hideModal('activityModal'));
        document.getElementById('closeDiscordModal')?.addEventListener('click', () => this.hideModal('discordModal'));
        document.getElementById('dismissDiscord')?.addEventListener('click', () => this.hideModal('discordModal'));
        
        // Seleção
        document.getElementById('selectAll')?.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
        
        // Ações
        document.getElementById('startSelected')?.addEventListener('click', () => this.startProcessing(false));
        document.getElementById('saveDraft')?.addEventListener('click', () => this.startProcessing(true));
        
        // Campos
        this.initInputHandlers();
    }

    initInputHandlers() {
        // Mostrar/esconder senha
        document.getElementById('togglePassword')?.addEventListener('click', (e) => {
            const input = document.getElementById('password');
            input.type = input.type === 'password' ? 'text' : 'password';
            e.target.textContent = input.type === 'password' ? '👁' : '🙈';
        });

        // Botões de limpar
        ['studentId', 'password'].forEach(id => {
            const input = document.getElementById(id);
            const clearBtn = document.getElementById(`clear${id.charAt(0).toUpperCase() + id.slice(1)}`);
            
            if (input && clearBtn) {
                input.addEventListener('input', () => {
                    clearBtn.classList.toggle('hidden', !input.value.length);
                });
                
                clearBtn.addEventListener('click', () => {
                    input.value = '';
                    clearBtn.classList.add('hidden');
                });
            }
        });
    }

    async handleLogin(filter) {
        const ra = document.getElementById('studentId').value.trim();
        const password = document.getElementById('password').value;
        
        if (!ra || !password) {
            NotificationSystem.show('Preencha RA e senha', 'error');
            return;
        }

        try {
            await this.api.login(ra, password);
            await this.loadActivities(filter);
        } catch (error) {
            console.error('Login failed:', error);
        }
    }

    async loadActivities(filter) {
        try {
            const tasks = await this.api.fetchTasks(filter);
            this.displayActivities(tasks);
            this.showModal('activityModal');
        } catch (error) {
            NotificationSystem.show('Erro ao carregar atividades', 'error');
        }
    }

    displayActivities(tasks) {
        const container = document.getElementById('activityItems');
        if (!container) return;

        container.innerHTML = '';
        this.activityManager.setActivities(tasks);
        
        tasks.forEach(task => {
            const div = document.createElement('div');
            div.className = 'activity-item';
            div.innerHTML = `
                <input type="checkbox" id="task_${task.id}" ${this.activityManager.isSelected(task.id) ? 'checked' : ''}>
                <label for="task_${task.id}">
                    <strong>${task.title || 'Atividade sem título'}</strong>
                    <div>${task.subject || 'Sem disciplina'}</div>
                </label>
            `;
            
            div.querySelector('input').addEventListener('change', (e) => {
                this.activityManager.toggleSelection(task.id);
                this.updateSelectAllCheckbox();
            });
            
            container.appendChild(div);
        });
        
        this.updateSelectAllCheckbox();
    }

    updateSelectAllCheckbox() {
        const checkbox = document.getElementById('selectAll');
        if (!checkbox) return;
        
        const selected = this.activityManager.getSelectedCount();
        const total = this.activityManager.getTotalCount();
        
        checkbox.checked = selected === total && total > 0;
        checkbox.indeterminate = selected > 0 && selected < total;
    }

    toggleSelectAll(checked) {
        checked ? this.activityManager.selectAll() : this.activityManager.clearSelection();
        
        document.querySelectorAll('#activityItems input').forEach(cb => {
            cb.checked = checked;
        });
    }

    async startProcessing(isDraft) {
        const tasks = this.activityManager.getSelectedTasks();
        if (tasks.length === 0) {
            NotificationSystem.show('Selecione pelo menos uma atividade', 'warning');
            return;
        }

        const timeMin = parseInt(document.getElementById('minTime')?.value || 1);
        const timeMax = parseInt(document.getElementById('maxTime')?.value || 3);
        const scorePreset = document.getElementById('scorePreset')?.value || '75';

        this.hideModal('activityModal');
        this.showProgressOverlay();

        try {
            const results = await this.processor.processMultipleTasks(tasks, {
                timeMin, timeMax, isDraft, scorePreset
            });
            
            this.showResults(results, isDraft);
        } catch (error) {
            NotificationSystem.show(`Erro: ${error.message}`, 'error');
        }
        
        this.hideProgressOverlay();
    }

    showResults(results, isDraft) {
        const success = results.filter(r => r?.success).length;
        const failed = results.filter(r => !r?.success).length;
        
        const msg = isDraft 
            ? `${success} salvas como rascunho` 
            : `${success} concluídas`;
            
        NotificationSystem.show(`${msg}${failed ? ` (${failed} falhas)` : ''}`, 
            failed > 0 ? 'warning' : 'success');
        
        if (success > 0 && !isDraft) {
            setTimeout(() => this.showDiscordModal(), 2000);
        }
    }

    showDiscordModal() {
        const today = new Date().toDateString();
        if (localStorage.getItem('discordLastShow') !== today) {
            this.showModal('discordModal');
            localStorage.setItem('discordLastShow', today);
        }
    }

    showModal(id) {
        document.getElementById(id)?.classList.remove('hidden');
    }

    hideModal(id) {
        document.getElementById(id)?.classList.add('hidden');
    }

    showProgressOverlay() {
        document.getElementById('progressOverlay')?.classList.remove('hidden');
    }

    hideProgressOverlay() {
        document.getElementById('progressOverlay')?.classList.add('hidden');
    }
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Iniciar controller
    const controller = new TaskitosController();
    
    // Integrar com sistema de autenticação salva
    if (window.SharedAuthHelper) {
        window.SharedAuthHelper.autoIntegrate({
            onAccountSelected: (userId, token) => {
                document.getElementById('studentId').value = userId;
                document.getElementById('password').value = '**********';
                NotificationSystem.show('Conta selecionada. Escolha uma ação.', 'info');
            }
        });
    }
    
    // Validar campos numéricos
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('input', function() {
            const min = parseInt(this.min) || 0;
            const max = parseInt(this.max) || 100;
            let val = parseInt(this.value) || min;
            if (val < min) this.value = min;
            if (val > max) this.value = max;
        });
    });
    
    console.log('Taskitos inicializado!');
});
