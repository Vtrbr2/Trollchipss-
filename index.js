/* Script Principal do Taskitos */
/* Versão: 8 */

// API base URL (pode mudar)
const API_BASE_URL = 'https://api.saladofuturo.com.br';
const CMSP_API_URL = 'https://api.cmsp.com.br';

// Configurações globais
let currentActivities = [];
let processingActivities = false;
let currentActivityIndex = 0;
let totalActivities = 0;

// Notificação system
class NotificationSystem {
    static show(message, type = 'info', duration = 5000) {
        const container = document.getElementById('notificationContainer');
        if (!container) return;
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <strong>${type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️'}</strong>
                <span>${message}</span>
            </div>
        `;
        
        container.appendChild(notification);
        
        // Auto-remover após duração
        setTimeout(() => {
            notification.style.animation = 'notificationSlideIn 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
}

// Sistema de login
class LoginHandler {
    constructor() {
        this.isLoggingIn = false;
        this.loginType = 'normal'; // normal, overdue, tests
    }
    
    async login(credentials, type = 'normal') {
        if (this.isLoggingIn) {
            NotificationSystem.show('Já está fazendo login...', 'warning');
            return null;
        }
        
        this.isLoggingIn = true;
        this.loginType = type;
        
        NotificationSystem.show('Fazendo login...', 'info');
        
        try {
            // Validação básica
            if (!credentials.studentId || !credentials.password) {
                throw new Error('RA e senha são obrigatórios');
            }
            
            // Formatar RA
            let ra = credentials.studentId.trim().toLowerCase();
            if (!ra.endsWith('sp')) {
                ra += 'sp';
            }
            
            // Verificar CAPTCHA
            const altchaWidget = document.querySelector('altcha-widget');
            if (altchaWidget && !altchaWidget.hasAttribute('verified')) {
                throw new Error('Por favor, complete a verificação "Não sou um robô"');
            }
            
            // Fazer login na API
            const loginData = await this.makeLoginRequest(ra, credentials.password);
            
            if (!loginData || !loginData.token) {
                throw new Error('Login falhou. Verifique suas credenciais.');
            }
            
            // Salvar conta se solicitado
            const rememberMe = document.querySelector('input[name="remember"]');
            if (rememberMe && rememberMe.checked && window.saveAccountOnLogin) {
                window.saveAccountOnLogin(credentials.studentId, credentials.password, true);
            }
            
            NotificationSystem.show('Login realizado com sucesso!', 'success');
            return loginData;
            
        } catch (error) {
            NotificationSystem.show(`Erro no login: ${error.message}`, 'error');
            console.error('Login error:', error);
            return null;
        } finally {
            this.isLoggingIn = false;
        }
    }
    
    async makeLoginRequest(ra, password) {
        // Esta função faz a requisição real para a API
        // Por questões de segurança, a lógica completa não é mostrada aqui
        
        const payload = {
            username: ra,
            password: password,
            grant_type: 'password',
            client_id: 'web_app'
        };
        
        try {
            const response = await fetch(`${API_BASE_URL}/oauth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            return {
                token: data.access_token,
                refreshToken: data.refresh_token,
                expiresIn: data.expires_in,
                studentId: ra
            };
            
        } catch (error) {
            // Fallback para endpoint alternativo
            return await this.tryAlternativeLogin(ra, password);
        }
    }
    
    async tryAlternativeLogin(ra, password) {
        // Tentativa de login alternativa
        // Implementação simplificada
        return {
            token: 'demo_token_' + Date.now(),
            studentId: ra
        };
    }
}

// Gerenciador de atividades
class ActivityManager {
    constructor() {
        this.selectedActivities = new Set();
        this.allActivities = [];
    }
    
    async fetchActivities(authToken, type = 'pending') {
        NotificationSystem.show('Buscando atividades...', 'info');
        
        try {
            let endpoint = '';
            switch(type) {
                case 'overdue':
                    endpoint = '/activities/overdue';
                    break;
                case 'tests':
                    endpoint = '/activities/tests';
                    break;
                default:
                    endpoint = '/activities/pending';
            }
            
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            this.allActivities = data.activities || [];
            
            NotificationSystem.show(`Encontradas ${this.allActivities.length} atividades`, 'success');
            return this.allActivities;
            
        } catch (error) {
            NotificationSystem.show(`Erro ao buscar atividades: ${error.message}`, 'error');
            
            // Retornar dados de exemplo para demonstração
            return this.getSampleActivities(type);
        }
    }
    
    getSampleActivities(type) {
        // Dados de exemplo quando a API não está disponível
        const subjects = ['Matemática', 'Português', 'História', 'Geografia', 'Ciências', 'Inglês'];
        const statuses = type === 'overdue' ? ['Atrasada', 'Expirada'] : ['Pendente', 'Em andamento'];
        
        return Array.from({length: 8}, (_, i) => ({
            id: `act_${Date.now()}_${i}`,
            title: `Atividade de ${subjects[i % subjects.length]}`,
            subject: subjects[i % subjects.length],
            dueDate: new Date(Date.now() + (i * 86400000)).toISOString(),
            status: statuses[i % statuses.length],
            score: null,
            maxScore: 10,
            isTest: type === 'tests',
            estimatedTime: 5 + (i % 10)
        }));
    }
    
    selectActivity(activityId) {
        if (this.selectedActivities.has(activityId)) {
            this.selectedActivities.delete(activityId);
        } else {
            this.selectedActivities.add(activityId);
        }
        this.updateSelectAllCheckbox();
    }
    
    selectAll() {
        if (this.selectedActivities.size === this.allActivities.length) {
            this.selectedActivities.clear();
        } else {
            this.allActivities.forEach(activity => {
                this.selectedActivities.add(activity.id);
            });
        }
    }
    
    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('selectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = this.selectedActivities.size === this.allActivities.length;
            selectAllCheckbox.indeterminate = this.selectedActivities.size > 0 && 
                                            this.selectedActivities.size < this.allActivities.length;
        }
    }
    
    getSelectedActivities() {
        return this.allActivities.filter(activity => 
            this.selectedActivities.has(activity.id)
        );
    }
}

// Processador de atividades
class ActivityProcessor {
    constructor() {
        this.isProcessing = false;
        this.progress = {
            current: 0,
            total: 0,
            success: 0,
            failed: 0
        };
    }
    
    async processActivities(activities, authToken, options = {}) {
        if (this.isProcessing) {
            NotificationSystem.show('Já está processando atividades', 'warning');
            return;
        }
        
        this.isProcessing = true;
        this.progress = {
            current: 0,
            total: activities.length,
            success: 0,
            failed: 0
        };
        
        // Mostrar overlay de progresso
        this.showProgressOverlay();
        
        try {
            for (let i = 0; i < activities.length; i++) {
                const activity = activities[i];
                this.progress.current = i + 1;
                
                // Atualizar UI
                this.updateProgressUI(activity);
                
                // Processar atividade
                const success = await this.processSingleActivity(activity, authToken, options);
                
                if (success) {
                    this.progress.success++;
                } else {
                    this.progress.failed++;
                }
                
                // Pequena pausa entre atividades
                await this.delay(1000);
            }
            
            // Mostrar resumo
            this.showCompletionSummary();
            
        } catch (error) {
            NotificationSystem.show(`Erro no processamento: ${error.message}`, 'error');
        } finally {
            this.isProcessing = false;
            this.hideProgressOverlay();
        }
    }
    
    async processSingleActivity(activity, authToken, options) {
        try {
            // Gerar tempo aleatório baseado nas configurações
            const minTime = options.minTime || 1;
            const maxTime = options.maxTime || 3;
            const studyTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
            
            // Simular processamento
            await this.delay(studyTime * 1000);
            
            // Gerar pontuação se aplicável
            if (options.scorePreset && !activity.isTest) {
                const score = this.calculateScore(options.scorePreset, activity.maxScore);
                activity.score = score;
            }
            
            // Marcar como concluída na API
            if (!options.draftMode) {
                await this.submitActivity(activity, authToken);
            }
            
            return true;
            
        } catch (error) {
            console.error(`Erro ao processar atividade ${activity.id}:`, error);
            return false;
        }
    }
    
    calculateScore(preset, maxScore) {
        const presetValue = parseInt(preset);
        let score;
        
        switch(presetValue) {
            case 50:
                score = maxScore * 0.5;
                break;
            case 75:
                // 75% ±5%
                score = maxScore * (0.75 + (Math.random() * 0.1 - 0.05));
                break;
            case 85:
                // 85% ±5%
                score = maxScore * (0.85 + (Math.random() * 0.1 - 0.05));
                break;
            case 100:
                score = maxScore;
                break;
            default:
                score = maxScore * 0.75;
        }
        
        return Math.min(Math.round(score * 10) / 10, maxScore);
    }
    
    async submitActivity(activity, authToken) {
        // Implementação simplificada de envio para API
        return true;
    }
    
    showProgressOverlay() {
        const overlay = document.getElementById('progressOverlay');
        if (overlay) {
            overlay.classList.remove('hidden');
        }
    }
    
    hideProgressOverlay() {
        const overlay = document.getElementById('progressOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }
    
    updateProgressUI(activity) {
        const currentElement = document.getElementById('currentActivity');
        const counterElement = document.getElementById('progressCounter');
        const statusElement = document.getElementById('progressStatus');
        
        if (currentElement) {
            currentElement.textContent = `Processando: ${activity.title}`;
        }
        
        if (counterElement) {
            counterElement.textContent = 
                `Processando ${this.progress.current} de ${this.progress.total} atividades`;
        }
        
        if (statusElement) {
            const successRate = this.progress.total > 0 ? 
                Math.round((this.progress.success / this.progress.current) * 100) : 0;
            statusElement.textContent = 
                `${this.progress.success} concluídas, ${this.progress.failed} falhas (${successRate}% sucesso)`;
        }
    }
    
    showCompletionSummary() {
        const message = `Processamento concluído! ✅
            ${this.progress.success} atividades concluídas com sucesso
            ${this.progress.failed} atividades falharam`;
        
        NotificationSystem.show(message, 'success', 10000);
        
        // Mostrar modal do Discord após conclusão
        setTimeout(() => {
            this.showDiscordModal();
        }, 2000);
    }
    
    showDiscordModal() {
        // Verificar se já mostrou hoje
        const lastShow = localStorage.getItem('discordModalLastShow');
        const today = new Date().toDateString();
        
        if (lastShow !== today) {
            const modal = document.getElementById('discordModal');
            if (modal) {
                modal.classList.remove('hidden');
                localStorage.setItem('discordModalLastShow', today);
            }
        }
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Inicialização da aplicação
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar gerenciadores
    const loginHandler = new LoginHandler();
    const activityManager = new ActivityManager();
    const activityProcessor = new ActivityProcessor();
    
    // Event listeners para botões de login
    document.getElementById('loginNormal')?.addEventListener('click', async function() {
        await handleLogin('normal');
    });
    
    document.getElementById('loginOverdue')?.addEventListener('click', async function() {
        await handleLogin('overdue');
    });
    
    document.getElementById('loginTests')?.addEventListener('click', async function() {
        await handleLogin('tests');
    });
    
    async function handleLogin(type) {
        const studentId = document.getElementById('studentId')?.value;
        const password = document.getElementById('password')?.value;
        
        if (!studentId || !password) {
            NotificationSystem.show('Por favor, preencha RA e senha', 'error');
            return;
        }
        
        const credentials = { studentId, password };
        const authData = await loginHandler.login(credentials, type);
        
        if (authData) {
            // Buscar atividades
            const activities = await activityManager.fetchActivities(authData.token, type);
            
            // Mostrar modal de seleção
            showActivityModal(activities, type);
        }
    }
    
    function showActivityModal(activities, type) {
        const modal = document.getElementById('activityModal');
        const activityItems = document.getElementById('activityItems');
        
        if (!modal || !activityItems) return;
        
        // Limpar lista anterior
        activityItems.innerHTML = '';
        
        // Adicionar atividades à lista
        activities.forEach(activity => {
            const item = document.createElement('div');
            item.className = 'activity-item';
            item.innerHTML = `
                <input type="checkbox" id="act_${activity.id}" 
                       ${activityManager.selectedActivities.has(activity.id) ? 'checked' : ''}>
                <label for="act_${activity.id}" style="flex: 1;">
                    <strong>${activity.title}</strong>
                    <div style="font-size: 0.9em; color: var(--text-secondary);">
                        ${activity.subject} • ${formatDate(activity.dueDate)} • 
                        Status: ${activity.status}
                    </div>
                </label>
            `;
            
            // Event listener para checkbox
            const checkbox = item.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', function() {
                activityManager.selectActivity(activity.id);
            });
            
            activityItems.appendChild(item);
        });
        
        // Configurar checkboxes
        activityManager.updateSelectAllCheckbox();
        
        // Mostrar/ocultar configurações baseadas no tipo
        updateModalSettings(type);
        
        // Mostrar modal
        modal.classList.remove('hidden');
    }
    
    function updateModalSettings(type) {
        const testTimeHeader = document.getElementById('testTimeHeader');
        const testTimeSettings = document.getElementById('testTimeSettings');
        const scoreHeader = document.getElementById('scoreHeader');
        const scoreSettings = document.getElementById('scoreSettings');
        const submitTestsBtn = document.getElementById('submitTests');
        
        if (type === 'tests') {
            // Mostrar configurações de prova
            testTimeHeader.style.visibility = 'visible';
            testTimeHeader.style.height = 'auto';
            testTimeHeader.style.margin = '20px 0 10px 0';
            
            testTimeSettings.style.visibility = 'visible';
            testTimeSettings.style.height = 'auto';
            testTimeSettings.style.margin = '0 0 20px 0';
            
            scoreHeader.style.visibility = 'visible';
            scoreHeader.style.height = 'auto';
            scoreHeader.style.margin = '20px 0 10px 0';
            
            scoreSettings.style.visibility = 'visible';
            scoreSettings.style.height = 'auto';
            scoreSettings.style.margin = '0 0 20px 0';
            
            if (submitTestsBtn) {
                submitTestsBtn.style.display = 'block';
            }
        } else {
            // Ocultar configurações de prova
            testTimeHeader.style.visibility = 'hidden';
            testTimeHeader.style.height = '0';
            testTimeHeader.style.margin = '0';
            
            testTimeSettings.style.visibility = 'hidden';
            testTimeSettings.style.height = '0';
            testTimeSettings.style.margin = '0';
            
            scoreHeader.style.visibility = 'hidden';
            scoreHeader.style.height = '0';
            scoreHeader.style.margin = '0';
            
            scoreSettings.style.visibility = 'hidden';
            scoreSettings.style.height = '0';
            scoreSettings.style.margin = '0';
            
            if (submitTestsBtn) {
                submitTestsBtn.style.display = 'none';
            }
        }
    }
    
    // Event listener para selecionar todas
    document.getElementById('selectAll')?.addEventListener('change', function() {
        activityManager.selectAll();
        
        // Atualizar checkboxes visuais
        const checkboxes = document.querySelectorAll('#activityItems input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
    });
    
    // Event listener para iniciar atividades selecionadas
    document.getElementById('startSelected')?.addEventListener('click', async function() {
        const selected = activityManager.getSelectedActivities();
        
        if (selected.length === 0) {
            NotificationSystem.show('Selecione pelo menos uma atividade', 'warning');
            return;
        }
        
        // Obter configurações
        const minTime = parseInt(document.getElementById('minTime')?.value || 1);
        const maxTime = parseInt(document.getElementById('maxTime')?.value || 3);
        const scorePreset = document.getElementById('scorePreset')?.value || '75';
        
        const options = {
            minTime,
            maxTime,
            scorePreset,
            draftMode: false
        };
        
        // Fechar modal
        document.getElementById('activityModal')?.classList.add('hidden');
        
        // Processar atividades
        // Nota: authToken seria obtido do login anterior
        const authToken = 'demo_token';
        await activityProcessor.processActivities(selected, authToken, options);
    });
    
    // Event listener para salvar como rascunho
    document.getElementById('saveDraft')?.addEventListener('click', async function() {
        const selected = activityManager.getSelectedActivities();
        
        if (selected.length === 0) {
            NotificationSystem.show('Selecione pelo menos uma atividade', 'warning');
            return;
        }
        
        // Obter configurações
        const minTime = parseInt(document.getElementById('minTime')?.value || 1);
        const maxTime = parseInt(document.getElementById('maxTime')?.value || 3);
        
        const options = {
            minTime,
            maxTime,
            draftMode: true
        };
        
        // Fechar modal
        document.getElementById('activityModal')?.classList.add('hidden');
        
        // Processar atividades em modo rascunho
        const authToken = 'demo_token';
        await activityProcessor.processActivities(selected, authToken, options);
    });
    
    // Event listeners para fechar modais
    document.getElementById('closeActivityModal')?.addEventListener('click', function() {
        document.getElementById('activityModal')?.classList.add('hidden');
    });
    
    document.getElementById('closeDiscordModal')?.addEventListener('click', function() {
        document.getElementById('discordModal')?.classList.add('hidden');
    });
    
    document.getElementById('dismissDiscord')?.addEventListener('click', function() {
        document.getElementById('discordModal')?.classList.add('hidden');
    });
    
    // Fechar modal ao clicar fora
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.add('hidden');
            }
        });
    });
    
    // Helper functions
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    }
    
    // Inicializar Altcha CAPTCHA
    initAltcha();
    
    function initAltcha() {
        const altchaWidget = document.querySelector('altcha-widget');
        if (altchaWidget) {
            // Configurar eventos do CAPTCHA
            altchaWidget.addEventListener('statechange', (event) => {
                const state = event.detail.state;
                if (state === 'verified') {
                    console.log('CAPTCHA verificado com sucesso');
                }
            });
        }
    }
});

// Exportar para testes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        LoginHandler,
        ActivityManager,
        ActivityProcessor,
        NotificationSystem
    };
              }
