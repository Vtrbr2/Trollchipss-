/* Sistema de Autenticação Compartilhado */
/* Versão: 87 */

class AuthManager {
    constructor() {
        this.STORAGE_KEY = 'taskitos_accounts';
        this.CURRENT_ACCOUNT_KEY = 'taskitos_current_account';
        this.accounts = this.loadAccounts();
        this.initEventListeners();
    }

    loadAccounts() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Erro ao carregar contas:', e);
            return [];
        }
    }

    saveAccounts() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.accounts));
            this.updateAccountCount();
        } catch (e) {
            console.error('Erro ao salvar contas:', e);
        }
    }

    addAccount(studentId, password, remember = false) {
        if (!studentId || !password) return false;
        
        // Remove espaços e formata RA
        studentId = studentId.trim().toLowerCase();
        
        // Remove conta existente se houver
        this.removeAccount(studentId);
        
        const account = {
            id: studentId,
            studentId: studentId,
            password: password,
            addedAt: new Date().toISOString(),
            lastUsed: new Date().toISOString()
        };
        
        this.accounts.unshift(account);
        
        if (remember) {
            this.saveAccounts();
        }
        
        return true;
    }

    removeAccount(studentId) {
        studentId = studentId.trim().toLowerCase();
        const index = this.accounts.findIndex(acc => acc.studentId === studentId);
        if (index !== -1) {
            this.accounts.splice(index, 1);
            this.saveAccounts();
            return true;
        }
        return false;
    }

    getAccount(studentId) {
        studentId = studentId.trim().toLowerCase();
        return this.accounts.find(acc => acc.studentId === studentId);
    }

    updateLastUsed(studentId) {
        const account = this.getAccount(studentId);
        if (account) {
            account.lastUsed = new Date().toISOString();
            this.saveAccounts();
        }
    }

    updateAccountCount() {
        const badge = document.getElementById('accountCount');
        const quickLoginBtn = document.getElementById('quickLoginBtn');
        
        if (badge) {
            badge.textContent = this.accounts.length;
        }
        
        if (quickLoginBtn) {
            if (this.accounts.length > 0) {
                quickLoginBtn.style.display = 'flex';
            } else {
                quickLoginBtn.style.display = 'none';
            }
        }
    }

    initEventListeners() {
        // Event listener para mostrar contas salvas
        const quickLoginBtn = document.getElementById('quickLoginBtn');
        if (quickLoginBtn) {
            quickLoginBtn.addEventListener('click', () => this.showAccountsMenu());
        }
        
        // Atualizar contagem inicial
        this.updateAccountCount();
    }

    showAccountsMenu() {
        // Remove menu existente
        const existingMenu = document.querySelector('.accounts-menu');
        if (existingMenu) {
            existingMenu.remove();
            return;
        }

        if (this.accounts.length === 0) return;

        // Cria menu
        const menu = document.createElement('div');
        menu.className = 'accounts-menu';
        menu.style.cssText = `
            position: absolute;
            background: var(--card-background);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 10px;
            z-index: 1000;
            max-width: 300px;
            width: 100%;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            backdrop-filter: blur(10px);
        `;

        // Adiciona contas ao menu
        this.accounts.forEach(account => {
            const accountItem = document.createElement('div');
            accountItem.className = 'account-item';
            accountItem.style.cssText = `
                padding: 10px;
                border-radius: 5px;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 5px;
                transition: background 0.2s;
            `;
            
            accountItem.innerHTML = `
                <div>
                    <strong>${account.studentId}</strong>
                    <div style="font-size: 0.8em; color: var(--text-secondary);">
                        ${new Date(account.lastUsed).toLocaleDateString()}
                    </div>
                </div>
                <button class="remove-account" style="
                    background: var(--error-color);
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    cursor: pointer;
                    font-size: 16px;
                ">×</button>
            `;

            // Evento para selecionar conta
            accountItem.addEventListener('click', (e) => {
                if (!e.target.classList.contains('remove-account')) {
                    document.getElementById('studentId').value = account.studentId;
                    document.getElementById('password').value = account.password;
                    this.updateLastUsed(account.studentId);
                    menu.remove();
                    
                    // Dispara evento de mudança
                    document.getElementById('studentId').dispatchEvent(new Event('input'));
                    document.getElementById('password').dispatchEvent(new Event('input'));
                }
            });

            // Evento para remover conta
            const removeBtn = accountItem.querySelector('.remove-account');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Remover conta ${account.studentId}?`)) {
                    this.removeAccount(account.studentId);
                    accountItem.remove();
                    
                    if (this.accounts.length === 0) {
                        menu.remove();
                    }
                }
            });

            menu.appendChild(accountItem);
        });

        // Adiciona ao DOM
        const quickLoginBtn = document.getElementById('quickLoginBtn');
        quickLoginBtn.parentNode.appendChild(menu);
        
        // Posiciona o menu
        const rect = quickLoginBtn.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left}px`;
        
        // Fecha menu ao clicar fora
        setTimeout(() => {
            const closeMenu = (e) => {
                if (!menu.contains(e.target) && e.target !== quickLoginBtn) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            document.addEventListener('click', closeMenu);
        }, 100);
    }

    // Gera hash simples para identificação
    generateHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    // Valida formato do RA
    isValidRA(ra) {
        if (!ra) return false;
        ra = ra.trim().toLowerCase();
        return /^\d+[a-z]?sp$/i.test(ra) || /^\d+$/i.test(ra);
    }

    // Formata RA
    formatRA(ra) {
        if (!ra) return '';
        ra = ra.trim().toLowerCase();
        
        if (ra.endsWith('sp')) {
            return ra;
        }
        
        if (/^\d+$/.test(ra)) {
            return ra + 'sp';
        }
        
        return ra;
    }
}

// Inicializar gerenciador de autenticação
let authManager = null;

document.addEventListener('DOMContentLoaded', function() {
    authManager = new AuthManager();
    
    // Auto-preenchimento do formulário
    const lastAccount = authManager.accounts[0];
    if (lastAccount && document.getElementById('studentId')) {
        document.getElementById('studentId').value = lastAccount.studentId;
        document.getElementById('password').value = lastAccount.password;
    }
    
    // Event listeners para limpar campos
    const studentIdInput = document.getElementById('studentId');
    const passwordInput = document.getElementById('password');
    
    if (studentIdInput) {
        const clearStudentIdBtn = document.getElementById('clearStudentId');
        
        studentIdInput.addEventListener('input', function() {
            if (this.value.trim()) {
                clearStudentIdBtn.classList.remove('hidden');
            } else {
                clearStudentIdBtn.classList.add('hidden');
            }
            
            // Formata RA enquanto digita
            if (authManager.isValidRA(this.value)) {
                this.value = authManager.formatRA(this.value);
            }
        });
        
        clearStudentIdBtn.addEventListener('click', function() {
            studentIdInput.value = '';
            studentIdInput.focus();
            clearStudentIdBtn.classList.add('hidden');
        });
    }
    
    if (passwordInput) {
        const clearPasswordBtn = document.getElementById('clearPassword');
        const togglePasswordBtn = document.getElementById('togglePassword');
        
        passwordInput.addEventListener('input', function() {
            if (this.value.trim()) {
                clearPasswordBtn.classList.remove('hidden');
            } else {
                clearPasswordBtn.classList.add('hidden');
            }
        });
        
        clearPasswordBtn.addEventListener('click', function() {
            passwordInput.value = '';
            passwordInput.focus();
            clearPasswordBtn.classList.add('hidden');
        });
        
        togglePasswordBtn.addEventListener('click', function() {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            togglePasswordBtn.textContent = type === 'password' ? '👁' : '🙈';
        });
    }
    
    // Salvar conta ao fazer login
    window.saveAccountOnLogin = function(studentId, password, remember = true) {
        if (authManager) {
            return authManager.addAccount(studentId, password, remember);
        }
        return false;
    };
    
    // Função para obter conta atual
    window.getCurrentAccount = function() {
        if (authManager && studentIdInput) {
            return {
                studentId: studentIdInput.value.trim(),
                password: passwordInput.value
            };
        }
        return null;
    };
});

// Exportar para uso em outros scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
          }
