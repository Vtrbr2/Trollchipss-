// Sistema simples de autenticação salva
const authManager = {
    STORAGE_KEY: 'taskitos_accounts',
    
    loadAccounts() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    },
    
    saveAccount(ra, password) {
        const accounts = this.loadAccounts();
        // Remove se já existir
        const filtered = accounts.filter(acc => acc.ra !== ra);
        filtered.unshift({ ra, password, date: new Date().toISOString() });
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered.slice(0, 5))); // Máx 5 contas
        this.updateUI();
    },
    
    updateUI() {
        const accounts = this.loadAccounts();
        const badge = document.getElementById('accountCount');
        const btn = document.getElementById('quickLoginBtn');
        
        if (badge) badge.textContent = accounts.length;
        if (btn) btn.style.display = accounts.length > 0 ? 'block' : 'none';
    },
    
    showAccountsMenu() {
        const accounts = this.loadAccounts();
        if (accounts.length === 0) return;
        
        // Criar menu simples
        const menu = document.createElement('div');
        menu.style.cssText = `
            position: absolute; background: #1e293b; border: 1px solid #334155;
            border-radius: 10px; padding: 10px; z-index: 1000; margin-top: 5px;
        `;
        
        accounts.forEach(acc => {
            const item = document.createElement('div');
            item.style.cssText = 'padding: 10px; cursor: pointer; border-bottom: 1px solid #334155;';
            item.textContent = acc.ra;
            item.onclick = () => {
                document.getElementById('studentId').value = acc.ra;
                document.getElementById('password').value = acc.password;
                menu.remove();
            };
            menu.appendChild(item);
        });
        
        const btn = document.getElementById('quickLoginBtn');
        btn.parentNode.appendChild(menu);
        
        // Fechar ao clicar fora
        setTimeout(() => {
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && e.target !== btn) {
                    menu.remove();
                }
            });
        }, 100);
    }
};

// Expor função global para salvar login
window.saveAccountOnLogin = function(ra, password, remember) {
    if (remember) {
        authManager.saveAccount(ra, password);
    }
};

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    authManager.updateUI();
    
    // Botão de contas salvas
    const btn = document.getElementById('quickLoginBtn');
    if (btn) {
        btn.addEventListener('click', () => authManager.showAccountsMenu());
    }
});
