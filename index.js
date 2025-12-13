/* Taskitos - Sistema de Automação para Sala do Futuro/CMSP */
/* Versão: 8.0 - Backend em JavaScript Puro */

// ============================================================================
// CONFIGURAÇÕES GLOBAIS
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
            <div class="notification-content">
                <div class="notification-icon">
                    ${this.getIcon(type)}
                </div>
                <div class="notification-message">
                    ${this.escapeHtml(message)}
                </div>
            </div>
            <div class="notification-progress">
                <div class="notification-progress-bar"></div>
            </div>
        `;

        container.appendChild(notification);

        // Animação de entrada
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        // Auto-remover
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 400);
        }, duration);

        return notification;
    }

    static getIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }

    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ============================================================================
// CLIENTE DA API EDUSP
// ============================================================================
class EduspApiClient {
    constructor() {
        this.baseURL = CONFIG.API_BASE_URL;
        this.authToken = null;
        this.currentUser = null;
    }

    // Headers padrão para todas as requisições
    getDefaultHeaders() {
        return {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': CONFIG.USER_AGENT,
            'Origin': CONFIG.CLIENT_ORIGIN,
            'Referer': `${CONFIG.CLIENT_ORIGIN}/`
        };
    }

    // Headers com autenticação
    getAuthHeaders() {
        const headers = this.getDefaultHeaders();
        if (this.authToken) {
            headers['x-api-key'] = this.authToken;
        }
        return headers;
    }

    // Função genérica para fazer requisições
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = options.headers || this.getDefaultHeaders();
        
        // Adicionar token de autenticação se disponível
        if (this.authToken && !headers['x-api-key']) {
            headers['x-api-key'] = this.authToken;
        }

        const config = {
            method: options.method || 'GET',
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        };

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    // ============================================================================
    // ENDPOINTS ESPECÍFICOS
    // ============================================================================

    // Login na plataforma
    async login(ra, password) {
        NotificationSystem.show('Fazendo login...', 'info');
        
        const endpoint = '/registration/edusp';
        const payload = {
            realm: 'edusp',
            platform: 'webclient',
            id: ra,
            password: password
        };

        try {
            const data = await this.request(endpoint, {
                method: 'POST',
                body: payload
            });

            if (!data.auth_token) {
                throw new Error('Token de autenticação não recebido');
            }

            this.authToken = data.auth_token;
            this.currentUser = {
                ra: ra,
                nick: data.nick || ra
            };

            NotificationSystem.show(`Login realizado! Olá ${data.nick || ra}`, 'success');
            return data;
        } catch (error) {
            NotificationSystem.show(`Erro no login: ${error.message}`, 'error');
            throw error;
        }
    }

    // Buscar salas do usuário
    async fetchRooms() {
        const endpoint = '/room/user?list_all=true&with_cards=true';
        
        try {
            return await this.request(endpoint, {
                headers: this.getAuthHeaders()
            });
        } catch (error) {
            console.error('Failed to fetch rooms:', error);
            throw error;
        }
    }

    // Buscar tarefas de uma sala específica
    async fetchTasksForRoom(roomId, expiredOnly = false) {
        const endpoint = '/tms/task/todo';
        const params = new URLSearchParams({
            publication_target: roomId,
            limit: '100',
            offset: '0',
            expired_only: expiredOnly.toString()
        });

        try {
            const data = await this.request(`${endpoint}?${params}`, {
                headers: this.getAuthHeaders()
            });

            // A API pode retornar diferentes estruturas
            if (Array.isArray(data)) {
                return data;
            } else if (data && Array.isArray(data.tasks)) {
                return data.tasks;
            } else if (data && Array.isArray(data.data)) {
                return data.data;
            } else {
                return [];
            }
        } catch (error) {
            console.error(`Failed to fetch tasks for room ${roomId}:`, error);
            return [];
        }
    }

    // Buscar todas as tarefas (pendentes ou expiradas)
    async fetchTasks(filter = 'pending') {
        NotificationSystem.show('Buscando atividades...', 'info');
        
        try {
            // Primeiro busca as salas
            const roomsData = await this.fetchRooms();
            const rooms = roomsData.rooms || [];
            
            const allTasks = [];
            const expiredOnly = filter === 'expired';
            
            // Para cada sala, busca tarefas
            for (const room of rooms) {
                try {
                    const roomTasks = await this.fetchTasksForRoom(room.id, expiredOnly);
                    allTasks.push(...roomTasks);
                } catch (roomError) {
                    console.warn(`Erro ao buscar tarefas da sala ${room.id}:`, roomError);
                }
            }
            
            // Remove duplicatas
            const uniqueTasks = this.removeDuplicateTasks(allTasks);
            
            NotificationSystem.show(`Encontradas ${uniqueTasks.length} atividades`, 'success');
            return uniqueTasks;
        } catch (error) {
            NotificationSystem.show(`Erro ao buscar atividades: ${error.message}`, 'error');
            throw error;
        }
    }

    // Buscar detalhes de uma tarefa específica
    async fetchTaskDetails(taskId) {
        const endpoint = `/tms/task/${taskId}`;
        
        try {
            const data = await this.request(endpoint, {
                headers: this.getAuthHeaders()
            });
            
            // Normaliza estrutura
            if (data && data.data) {
                return data.data;
            }
            return data;
        } catch (error) {
            console.error(`Failed to fetch task details ${taskId}:`, error);
            throw error;
        }
    }

    // Enviar respostas de uma tarefa
    async submitTask(taskId, payload) {
        const endpoint = `/tms/task/${taskId}/answer`;
        
        try {
            return await this.request(endpoint, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: payload
            });
        } catch (error) {
            console.error(`Failed to submit task ${taskId}:`, error);
            throw error;
        }
    }

    // Remover tarefas duplicadas
    removeDuplicateTasks(tasks) {
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
// GERADOR DE RESPOSTAS AUTOMÁTICAS
// ============================================================================
class AnswerGenerator {
    // Gerar payload completo para submissão
    static generateSubmissionPayload(taskDetails, options = {}) {
        const { isDraft = false, scorePreset = '75' } = options;
        
        const questions = taskDetails.questions || taskDetails.data?.questions || [];
        const answers = {};

        questions.forEach(question => {
            const qid = question.id || question.question_id;
            const qtype = question.type || question.question_type;
            
            let answer = this.generateAnswerForQuestion(question, scorePreset);
            
            answers[qid] = {
                question_id: qid,
                question_type: qtype,
                answer: answer
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

    // Gerar resposta para um tipo específico de questão
    static generateAnswerForQuestion(question, scorePreset) {
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
                return this.handleDefaultQuestion(options);
        }
    }

    // Manipular questões de múltipla escolha
    static handleMultipleChoice(options, scorePreset) {
        if (Array.isArray(options)) {
            // Tenta encontrar opção correta
            const correctOption = options.find(opt => opt.correct === true);
            if (correctOption) {
                return correctOption.id || correctOption.optionId;
            }
            
            // Se não tem opção correta marcada, usa lógica de score
            const score = parseInt(scorePreset);
            const shouldGetCorrect = (Math.random() * 100) <= score;
            
            if (shouldGetCorrect && options.length > 0) {
                // Tenta "adivinhar" qual seria a correta (normalmente a primeira)
                return options[0].id || options[0].optionId;
            } else {
                // Escolhe aleatoriamente
                const randomIndex = Math.floor(Math.random() * options.length);
                return options[randomIndex].id || options[randomIndex].optionId;
            }
        }
        return null;
    }

    // Manipular ordenação de frases
    static handleOrderSentences(options) {
        if (options.sentences && Array.isArray(options.sentences)) {
            return options.sentences.map(s => 
                typeof s === 'object' ? s.value || s.text : s
            );
        }
        return [];
    }

    // Manipular preenchimento de palavras
    static handleFillWords(options) {
        if (options.phrase && Array.isArray(options.phrase)) {
            return options.phrase
                .filter((_, index) => index % 2 === 1) // Índices ímpares
                .map(item => 
                    typeof item === 'object' ? item.value || item.text : item
                );
        }
        return [];
    }

    // Manipular questões de texto
    static handleTextQuestion(question) {
        const text = question.comment || question.value || question.text || '';
        // Remove HTML tags e limita tamanho
        const cleanText = text.replace(/<[^>]*>/g, '').substring(0, 500);
        return { "0": cleanText };
    }

    // Manipular questões padrão
    static handleDefaultQuestion(options) {
        if (typeof options === 'object') {
            const answer = {};
            Object.keys(options).forEach(key => {
                // Para questões booleanas, define true/false aleatoriamente
                answer[key] = Math.random() > 0.5;
            });
            return answer;
        }
        return {};
    }
}

// ============================================================================
// PROCESSADOR DE TAREFAS
// ============================================================================
class TaskProcessor {
    constructor(apiClient) {
        this.api = apiClient;
        this.isProcessing = false;
        this.progress = {
            total: 0,
            completed: 0,
            failed: 0
        };
    }

    // Processar uma única tarefa
    async processSingleTask(task, options = {}) {
        const {
            timeMin = 1,
            timeMax = 3,
            isDraft = false,
            scorePreset = '75'
        } = options;

        const taskId = task.id || task.task_id;
        
        try {
            // 1. Buscar detalhes da tarefa
            const details = await this.api.fetchTaskDetails(taskId);
            
            // 2. Gerar respostas automáticas
            const submissionPayload = AnswerGenerator.generateSubmissionPayload(details, {
                isDraft,
                scorePreset
            });
            
            // 3. Simular tempo de estudo (delay)
            await this.simulateStudyTime(timeMin, timeMax);
            
            // 4. Enviar respostas
            const result = await this.api.submitTask(taskId, submissionPayload);
            
            return {
                success: true,
                taskId: taskId,
                taskTitle: task.title || `Tarefa ${taskId}`,
                result: result,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                taskId: taskId,
                taskTitle: task.title || `Tarefa ${taskId}`,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Processar múltiplas tarefas em paralelo
    async processMultipleTasks(tasks, options = {}) {
        if (this.isProcessing) {
            throw new Error('Já está processando tarefas');
        }

        this.isProcessing = true;
        this.resetProgress(tasks.length);

        const results = [];
        const maxConcurrent = 3; // Limite de tarefas simultâneas

        // Processar em batches
        for (let i = 0; i < tasks.length; i += maxConcurrent) {
            const batch = tasks.slice(i, i + maxConcurrent);
            const batchPromises = batch.map(task => 
                this.processSingleTask(task, options)
                    .then(result => {
                        this.updateProgress(result.success);
                        this.updateUI();
                        return result;
                    })
            );

            const batchResults = await Promise.allSettled(batchPromises);
            
            batchResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    results.push({
                        success: false,
                        error: result.reason?.message || 'Erro desconhecido',
                        timestamp: new Date().toISOString()
                    });
                    this.updateProgress(false);
                    this.updateUI();
                }
            });

            // Pequena pausa entre batches
            if (i + maxConcurrent < tasks.length) {
                await this.delay(1000);
            }
        }

        this.isProcessing = false;
        return results;
    }

    // Simular tempo de estudo (delay)
    async simulateStudyTime(minMinutes, maxMinutes) {
        const minSec = Math.max(1, minMinutes) * 60;
        const maxSec = Math.max(minSec, maxMinutes) * 60;
        const delaySeconds = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
        
        // Limitar delay máximo para 10 segundos
        const effectiveDelay = Math.min(delaySeconds, 10);
        
        return new Promise(resolve => {
            setTimeout(resolve, effectiveDelay * 1000);
        });
    }

    // Atualizar progresso
    updateProgress(success) {
        if (success) {
            this.progress.completed++;
        } else {
            this.progress.failed++;
        }
    }

    // Resetar progresso
    resetProgress(total) {
        this.progress = {
            total: total,
            completed: 0,
            failed: 0
        };
    }

    // Atualizar interface de progresso
    updateUI() {
        const progressElement = document.getElementById('progressCounter');
        const currentActivityElement = document.getElementById('currentActivity');
        
        if (progressElement) {
            const { total, completed, failed } = this.progress;
            progressElement.textContent = 
                `Processando ${completed + failed} de ${total} atividades`;
        }
    }

    // Delay helper
    async delay(ms) {
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

    // Definir lista de atividades
    setActivities(activities) {
        this.activities = activities || [];
        this.selectedIds.clear();
    }

    // Alternar seleção de uma atividade
    toggleSelection(activityId) {
        if (this.selectedIds.has(activityId)) {
            this.selectedIds.delete(activityId);
        } else {
            this.selectedIds.add(activityId);
        }
    }

    // Selecionar todas as atividades
    selectAll() {
        this.activities.forEach(activity => {
            this.selectedIds.add(activity.id);
        });
    }

    // Limpar todas as seleções
    clearSelection() {
        this.selectedIds.clear();
    }

    // Verificar se atividade está selecionada
    isSelected(activityId) {
        return this.selectedIds.has(activityId);
    }

    // Contar atividades selecionadas
    getSelectedCount() {
        return this.selectedIds.size;
    }

    // Contar total de atividades
    getTotalCount() {
        return this.activities.length;
    }

    // Obter atividades selecionadas
    getSelectedTasks() {
        return this.activities.filter(activity => 
            this.selectedIds.has(activity.id)
        );
    }
}

// ============================================================================
// CONTROLE DE INTERFACE
// ============================================================================
class TaskitosController {
    constructor() {
        this.apiClient = new EduspApiClient();
        this.taskProcessor = new TaskProcessor(this.apiClient);
        this.activityManager = new ActivityManager();
        this.initEventListeners();
    }

    // Inicializar todos os event listeners
    initEventListeners() {
        // Botões de login
        document.getElementById('loginNormal')?.addEventListener('click', () => 
            this.handleLogin('pending'));
        
        document.getElementById('loginOverdue')?.addEventListener('click', () => 
            this.handleLogin('expired'));

        // Modal de atividades
        document.getElementById('closeActivityModal')?.addEventListener('click', () => 
            this.hideModal('activityModal'));
        
        document.getElementById('selectAll')?.addEventListener('change', (e) => 
            this.toggleSelectAllActivities(e.target.checked));

        // Botões de ação
        document.getElementById('startSelected')?.addEventListener('click', () => 
            this.startProcessing(false));
        
        document.getElementById('saveDraft')?.addEventListener('click', () => 
            this.startProcessing(true));

        // Modal Discord
        document.getElementById('closeDiscordModal')?.addEventListener('click', () => 
            this.hideModal('discordModal'));
        
        document.getElementById('dismissDiscord')?.addEventListener('click', () => 
            this.hideModal('discordModal'));

        // Campos de entrada
        this.initInputHandlers();
    }

    // Configurar handlers para campos de entrada
    initInputHandlers() {
        // Botão para limpar RA
        document.getElementById('clearStudentId')?.addEventListener('click', () => {
            document.getElementById('studentId').value = '';
            this.toggleClearButton('clearStudentId', false);
        });

        // Botão para limpar senha
        document.getElementById('clearPassword')?.addEventListener('click', () => {
            document.getElementById('password').value = '';
            this.toggleClearButton('clearPassword', false);
        });

        // Mostrar/esconder senha
        document.getElementById('togglePassword')?.addEventListener('click', (e) => {
            const passwordInput = document.getElementById('password');
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            e.target.textContent = type === 'password' ? '👁' : '🙈';
        });

        // Mostrar botões de limpar quando houver texto
        ['studentId', 'password'].forEach(id => {
            const input = document.getElementById(id);
            const clearBtn = document.getElementById(`clear${id.charAt(0).toUpperCase() + id.slice(1)}`);
            
            if (input && clearBtn) {
                input.addEventListener('input', () => {
                    this.toggleClearButton(clearBtn.id, input.value.length > 0);
                });
            }
        });
    }

    // Controlar visibilidade do botão de limpar
    toggleClearButton(buttonId, show) {
        const btn = document.getElementById(buttonId);
        if (btn) {
            btn.classList.toggle('hidden', !show);
        }
    }

    // ============================================================================
    // HANDLERS PRINCIPAIS
    // ============================================================================

    // Handler de login
    async handleLogin(filterType) {
        const ra = document.getElementById('studentId').value.trim();
        const password = document.getElementById('password').value;
        
        if (!ra || !password) {
            NotificationSystem.show('Preencha RA e senha', 'error');
            return;
        }

        // Verificar CAPTCHA
        const altchaWidget = document.querySelector('altcha-widget');
        if (altchaWidget && !altchaWidget.hasAttribute('verified')) {
            NotificationSystem.show('Complete a verificação "Não sou um robô"', 'warning');
            return;
        }

        try {
            const loginResult = await this.apiClient.login(ra, password);
            
            if (loginResult.auth_token) {
                // Salvar conta se a função estiver disponível
                if (typeof window.saveAccountOnLogin === 'function') {
                    window.saveAccountOnLogin(ra, password, true);
                }
                
                // Buscar e mostrar atividades
                await this.loadAndShowActivities(filterType);
            }
        } catch (error) {
            console.error('Login failed:', error);
        }
    }

    // Carregar e exibir atividades
    async loadAndShowActivities(filterType) {
        try {
            const tasks = await this.apiClient.fetchTasks(filterType);
            this.displayActivities(tasks);
            this.showModal('activityModal');
        } catch (error) {
            console.error('Failed to load activities:', error);
        }
    }

    // Exibir atividades na lista
    displayActivities(tasks) {
        const container = document.getElementById('activityItems');
        if (!container) return;

        container.innerHTML = '';
        this.activityManager.setActivities(tasks);
        
        tasks.forEach((task, index) => {
            const item = document.createElement('div');
            item.className = 'activity-item';
            item.innerHTML = `
                <input type="checkbox" id="task_${task.id}" 
                       ${this.activityManager.isSelected(task.id) ? 'checked' : ''}>
                <label for="task_${task.id}">
                    <strong>${task.title || `Atividade ${index + 1}`}</strong>
                    <div style="font-size: 0.9em; color: var(--text-secondary);">
                        ${task.subject || 'Sem disciplina'} • 
                        ${this.formatDate(task.dueDate)} • 
                        Status: ${task.status || 'Pendente'}
                    </div>
                </label>
            `;
            
            const checkbox = item.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', () => {
                this.activityManager.toggleSelection(task.id);
                this.updateSelectAllCheckbox();
            });
            
            container.appendChild(item);
        });

        this.updateSelectAllCheckbox();
    }

    // Atualizar checkbox "Selecionar Todas"
    updateSelectAllCheckbox() {
        const selectAll = document.getElementById('selectAll');
        if (!selectAll) return;

        const selectedCount = this.activityManager.getSelectedCount();
        const totalCount = this.activityManager.getTotalCount();
        
        selectAll.checked = selectedCount === totalCount && totalCount > 0;
        selectAll.indeterminate = selectedCount > 0 && selectedCount < totalCount;
    }

    // Alternar seleção de todas as atividades
    toggleSelectAllActivities(checked) {
        if (checked) {
            this.activityManager.selectAll();
        } else {
            this.activityManager.clearSelection();
        }
        
        // Atualizar checkboxes visuais
        document.querySelectorAll('#activityItems input[type="checkbox"]').forEach(cb => {
            cb.checked = checked;
        });
    }

    // Iniciar processamento das atividades
    async startProcessing(isDraft) {
        const selectedTasks = this.activityManager.getSelectedTasks();
        
        if (selectedTasks.length === 0) {
            NotificationSystem.show('Selecione pelo menos uma atividade', 'warning');
            return;
        }

        // Obter configurações
        const timeMin = parseInt(document.getElementById('minTime')?.value || 1);
        const timeMax = parseInt(document.getElementById('maxTime')?.value || 3);
        const scorePreset = document.getElementById('scorePreset')?.value || '75';

        this.hideModal('activityModal');
        this.showProgressOverlay();

        try {
            const results = await this.taskProcessor.processMultipleTasks(selectedTasks, {
                timeMin,
                timeMax,
                isDraft,
                scorePreset
            });

            this.showProcessingResults(results, isDraft);
        } catch (error) {
            NotificationSystem.show(`Erro no processamento: ${error.message}`, 'error');
            this.hideProgressOverlay();
        }
    }

    // Exibir resultados do processamento
    showProcessingResults(results, isDraft) {
        this.hideProgressOverlay();
        
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        if (isDraft) {
            NotificationSystem.show(
                `${successful} atividades salvas como rascunho${failed > 0 ? ` (${failed} falhas)` : ''}`,
                failed > 0 ? 'warning' : 'success'
            );
        } else {
            NotificationSystem.show(
                `${successful} atividades concluídas com sucesso${failed > 0 ? ` (${failed} falhas)` : ''}`,
                failed > 0 ? 'warning' : 'success'
            );
            
            // Mostrar modal do Discord após conclusão
            if (successful > 0) {
                setTimeout(() => this.showDiscordModal(), 2000);
            }
        }
    }

    // ============================================================================
    // CONTROLE DE MODAIS E OVERLAYS
    // ============================================================================

    showModal(modalId) {
        document.getElementById(modalId)?.classList.remove('hidden');
    }

    hideModal(modalId) {
        document.getElementById(modalId)?.classList.add('hidden');
    }

    showProgressOverlay() {
        document.getElementById('progressOverlay')?.classList.remove('hidden');
    }

    hideProgressOverlay() {
        document.getElementById('progressOverlay')?.classList.add('hidden');
    }

    showDiscordModal() {
        // Verificar se já mostrou hoje
        const lastShow = localStorage.getItem('discordModalLastShow');
        const today = new Date().toDateString();
        
        if (lastShow !== today) {
            this.showModal('discordModal');
            localStorage.setItem('discordModalLastShow', today);
        }
    }

    // ============================================================================
    // UTILITÁRIOS
    // ============================================================================

    formatDate(dateString) {
        if (!dateString) return 'Sem data';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('pt-BR');
        } catch {
            return dateString;
        }
    }
}

// ============================================================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar controller principal
    const taskitos = new TaskitosController();
    
    // Configurar botão de login rápido se disponível
    if (window.SharedAuthHelper) {
        window.SharedAuthHelper.autoIntegrate({
            onAccountSelected: (userId, token) => {
                // Preencher formulário e notificar
                document.getElementById('studentId').value = userId;
                document.getElementById('password').value = '**********';
                NotificationSystem.show('Conta selecionada. Escolha uma ação para continuar.', 'info');
            }
        });
    }
    
    // Inicializar validação de campos numéricos
    initNumberInputValidation();
    
    console.log('Taskitos inicializado com sucesso!');
});

// Validação de campos numéricos
function initNumberInputValidation() {
    const numberInputs = document.querySelectorAll('input[type="number"]');
    
    numberInputs.forEach(input => {
        input.addEventListener('input', function() {
            const min = parseInt(this.min) || 0;
            const max = parseInt(this.max) || 100;
            let value = parseInt(this.value) || min;
            
            if (value < min) this.value = min;
            if (value > max) this.value = max;
        });
        
        input.addEventListener('blur', function() {
            if (!this.value) {
                this.value = this.min || 0;
            }
        });
    });
}

// Exportar classes para uso externo
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        EduspApiClient,
        AnswerGenerator,
        TaskProcessor,
        ActivityManager,
        TaskitosController,
        NotificationSystem
    };
}
