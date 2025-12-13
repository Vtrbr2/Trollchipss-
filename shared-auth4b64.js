// クロスサブドメインSSO用の共有認証マネージャー
class SharedAuthManager {
    constructor() {
        this.domain = '.cupiditys.lol';
        this.cookieName = 'sed_tokens';
        this.encryptionKey = this.generateKey();
    }

    // シンプルなシフト値を生成（ドメインベース）
    generateKey() {
        return window.location.hostname.split('.').slice(1,3).join('').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 25 + 1;
    }

    // シンプルなシーザー暗号による難読化
    obfuscate(str) {
        return str.split('').map(char => {
            const code = char.charCodeAt(0);
            // 印刷可能文字の範囲でシフト（32-126）
            if (code >= 32 && code <= 126) {
                return String.fromCharCode(((code - 32 + this.encryptionKey) % 95) + 32);
            }
            return char;
        }).join('');
    }

    deobfuscate(str) {
        try {
            return str.split('').map(char => {
                const code = char.charCodeAt(0);
                // 印刷可能文字の範囲でシフトを戻す
                if (code >= 32 && code <= 126) {
                    return String.fromCharCode(((code - 32 - this.encryptionKey + 95) % 95) + 32);
                }
                return char;
            }).join('');
        } catch (e) {
            return null;
        }
    }

    // 古いXOR暗号の復号化（後方互換性のため）
    oldDeobfuscate(str) {
        try {
            const oldKey = window.location.hostname.split('.').slice(1,3).join('').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            return atob(str).split('').map(char => 
                String.fromCharCode(char.charCodeAt(0) ^ (oldKey % 256))
            ).join('');
        } catch (e) {
            return null;
        }
    }

    // クロスドメインサポート付きでクッキーを設定
    setCookie(name, value, days) {
        const d = new Date();
        d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = "expires=" + d.toUTCString();
        document.cookie = `${name}=${value};${expires};path=/;domain=${this.domain};SameSite=Strict;Secure`;
    }

    // クッキーの値を取得
    getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    // 保存されているすべてのアカウントを取得
    getStoredAccounts() {
        const cookieData = this.getCookie(this.cookieName);
        if (!cookieData) return {};
        
        try {
            let rawData;
            
            // 新しい形式（シーザー暗号）を最初に試す
            try {
                const deobfuscated = this.deobfuscate(cookieData);
                if (deobfuscated) {
                    rawData = JSON.parse(deobfuscated);
                } else {
                    throw new Error('Deobfuscation failed');
                }
            } catch (e) {
                // 古い形式（XOR暗号）または生のJSONにフォールバック
                try {
                    // 古いXOR暗号を試す
                    const oldDeobfuscated = this.oldDeobfuscate(cookieData);
                    if (oldDeobfuscated) {
                        rawData = JSON.parse(oldDeobfuscated);
                    } else {
                        throw new Error('Old deobfuscation failed');
                    }
                } catch (e2) {
                    // 生のJSONを試す（移行期間用）
                    rawData = JSON.parse(cookieData);
                }
            }
            
            // 古い形式を新しい形式に移行（必要に応じて）
            const normalizedData = this.normalizeAccountData(rawData);
            
            // 互換性レイヤー：外部コードが期待する形式に変換
            return this.addCompatibilityLayer(normalizedData);
            
        } catch (e) {
            console.error('Failed to parse stored accounts:', e);
            return {};
        }
    }

    // アカウントを追加または更新
    saveAccount(ra, token, userName = null, additionalData = {}) {
        // 既存のアカウントデータを取得（互換性レイヤー付き）
        const accounts = this.getStoredAccounts();
        
        // 新しいアカウントデータを効率的な形式で作成
        const accountData = {
            t: token,
            n: userName || ra,
            d: Date.now(),
            l: Date.now()
        };
        
        // パスワードが提供された場合は暗号化して保存
        // Save encrypted password if provided
        if (additionalData.password) {
            accountData.p = this.obfuscate(additionalData.password);
        }
        
        // additionalDataから必要な情報を抽出し、短いキー名で保存
        if (additionalData.roomCode) accountData.r = additionalData.roomCode;
        if (additionalData.allRooms) accountData.a = additionalData.allRooms;
        
        // 互換性レイヤーを取り除いて、純粋な内部形式でアカウントを更新
        const pureAccount = this.removePureAccountData(accounts[ra] || {});
        accounts[ra] = { ...pureAccount, ...accountData };
        
        // 内部形式のみでサイズ制限を適用
        const pureAccounts = this.stripCompatibilityLayer(accounts);
        const limitedAccounts = this.limitAccountsBySize(pureAccounts);
        
        // シンプルな難読化を適用
        const jsonData = JSON.stringify(limitedAccounts);
        const obfuscatedData = this.obfuscate(jsonData);
        this.setCookie(this.cookieName, obfuscatedData, 30);
        
        return true;
    }

    // クッキーサイズ制限に基づいてアカウントを制限
    limitAccountsBySize(accounts) {
        const maxSize = 3800; // 4KB制限より少し小さく
        
        // 最新のアカウントから順番に並べ替え
        const sortedEntries = Object.entries(accounts)
            .sort((a, b) => (b[1].l || 0) - (a[1].l || 0));
        
        const limitedAccounts = {};
        let currentSize = 0;
        
        for (const [ra, data] of sortedEntries) {
            const entrySize = JSON.stringify({[ra]: data}).length;
            
            if (currentSize + entrySize <= maxSize) {
                limitedAccounts[ra] = data;
                currentSize += entrySize;
            } else {
                break; // サイズ制限に達した
            }
        }
        
        return limitedAccounts;
    }
    
    // データを正規化（古い形式から新しい形式に変換）
    normalizeAccountData(rawData) {
        const normalizedData = {};
        
        for (const [ra, account] of Object.entries(rawData)) {
            // 既に新しい形式の場合はそのまま使用
            if (account.l !== undefined) {
                normalizedData[ra] = account;
                continue;
            }
            
            // 古い形式から新しい形式に変換
            const normalizedAccount = {
                t: account.t,
                n: account.n,
                d: account.d,
                l: account.last || account.l || Date.now()
            };
            
            if (account.roomCode) normalizedAccount.r = account.roomCode;
            if (account.allRooms) normalizedAccount.a = account.allRooms;
            if (account.p) normalizedAccount.p = account.p; // パスワードを保持 / Keep password
            
            normalizedData[ra] = normalizedAccount;
        }
        
        return normalizedData;
    }
    
    // 互換性レイヤー：外部コードが期待する形式にプロパティを追加
    addCompatibilityLayer(normalizedData) {
        const compatibleData = {};
        
        for (const [ra, account] of Object.entries(normalizedData)) {
            compatibleData[ra] = {
                // 内部形式（短いキー名）
                ...account,
                // 互換性のための長いキー名
                last: account.l,
                roomCode: account.r,
                userName: account.n,
                allRooms: account.a,
                password: account.p // パスワードアクセス用 / For password access
            };
        }
        
        return compatibleData;
    }
    
    // 互換性レイヤーを取り除いて内部形式のみを残す
    stripCompatibilityLayer(compatibleData) {
        const pureData = {};
        
        for (const [ra, account] of Object.entries(compatibleData)) {
            pureData[ra] = {
                t: account.t,
                n: account.n,
                d: account.d,
                l: account.l || account.last
            };
            
            if (account.r || account.roomCode) pureData[ra].r = account.r || account.roomCode;
            if (account.a || account.allRooms) pureData[ra].a = account.a || account.allRooms;
            if (account.p || account.password) pureData[ra].p = account.p || account.password; // パスワード保持 / Keep password
        }
        
        return pureData;
    }
    
    // 純粋なアカウントデータを取得（互換性プロパティを除去）
    removePureAccountData(account) {
        const { last, roomCode, userName, allRooms, password, ...pureData } = account;
        return pureData;
    }

    // アカウントを削除
    removeAccount(ra) {
        const accounts = this.getStoredAccounts();
        delete accounts[ra];
        
        // 内部形式で保存
        const pureAccounts = this.stripCompatibilityLayer(accounts);
        const jsonData = JSON.stringify(pureAccounts);
        const obfuscatedData = this.obfuscate(jsonData);
        this.setCookie(this.cookieName, obfuscatedData, 30);
        
        return true;
    }

    // 最終使用時刻を更新
    updateLastUsed(ra) {
        const accounts = this.getStoredAccounts();
        if (accounts[ra]) {
            accounts[ra].l = Date.now();
            accounts[ra].last = Date.now(); // 互換性のため
            
            const pureAccounts = this.stripCompatibilityLayer(accounts);
            const jsonData = JSON.stringify(pureAccounts);
            const obfuscatedData = this.obfuscate(jsonData);
            this.setCookie(this.cookieName, obfuscatedData, 30);
        }
    }

    // トークンを検証（基本チェック - サーバー検証で強化すべき）
    isTokenValid(token) {
        try {
            // 基本JWT構造の検証
            const parts = token.split('.');
            if (parts.length !== 3) return false;
            
            // ペイロードのデコードを試みる
            const payload = JSON.parse(atob(parts[1]));
            
            // 存在する場合は有効期限をチェック
            if (payload.exp) {
                return Date.now() < payload.exp * 1000;
            }
            
            return true;
        } catch (e) {
            return false;
        }
    }

    // 表示用にフォーマットされたアカウントリストを取得
    getAccountsList() {
        const accounts = this.getStoredAccounts();
        return Object.entries(accounts).map(([ra, data]) => ({
            ra,
            name: data.n || ra,
            lastUsed: data.l || data.d, // 'last' -> 'l'
            isValid: true
        })).sort((a, b) => b.lastUsed - a.lastUsed);
    }

    // 保存されているすべてのアカウントをクリア
    clearAllAccounts() {
        this.setCookie(this.cookieName, '', -1);
    }
    
    // 保存されたパスワードを取得
    // Get saved password for account
    getSavedPassword(ra) {
        const accounts = this.getStoredAccounts();
        const account = accounts[ra];
        if (account && account.p) {
            return this.deobfuscate(account.p);
        }
        return null;
    }

    // 現在のクッキーサイズを取得（デバッグ用）
    getCurrentCookieSize() {
        const cookieData = this.getCookie(this.cookieName);
        return cookieData ? cookieData.length : 0;
    }
    
    // クッキー使用状況を取得（デバッグ用）
    getCookieStats() {
        const size = this.getCurrentCookieSize();
        const accounts = this.getStoredAccounts();
        const accountCount = Object.keys(accounts).length;
        
        // 生のJSONサイズも計算（難読化前）
        const pureAccounts = this.stripCompatibilityLayer(accounts);
        const rawJsonSize = JSON.stringify(pureAccounts).length;
        const obfuscationOverhead = size - rawJsonSize;
        
        return {
            currentSize: size,
            rawJsonSize: rawJsonSize,
            obfuscationOverhead: obfuscationOverhead,
            maxSize: 4096,
            usage: `${Math.round((size / 4096) * 100)}%`,
            accountCount: accountCount,
            averagePerAccount: accountCount > 0 ? Math.round(size / accountCount) : 0
        };
    }
}

// アカウントセレクタUIコンポーネント
class AccountSelectorUI {
    constructor(authManager) {
        this.authManager = authManager;
        this.modal = null;
        this.isOpen = false;
    }

    // モーダルHTMLを作成
    createModal() {
        const modal = document.createElement('div');
        modal.id = 'accountSelectorModal';
        modal.className = 'account-selector-modal hidden';
        modal.innerHTML = `
            <div class="account-selector-content">
                <div class="account-selector-header">
                    <h2>Selecionar Conta</h2>
                    <button class="close-btn" id="closeAccountSelector">×</button>
                </div>
                <div class="account-selector-body">
                    <div class="saved-accounts-list" id="savedAccountsList">
                        <div style="text-align: center; padding: 20px;">
                            <div class="spinner"></div>
                        </div>
                    </div>
                    <div class="account-selector-footer">
                        <button class="btn btn-danger" id="clearAllAccounts">Limpar Todas</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.modal = modal;
        this.attachEventListeners();
    }

    // イベントリスナーをアタッチ
    attachEventListeners() {
        // 閉じるボタン
        document.getElementById('closeAccountSelector').addEventListener('click', () => {
            this.close();
        });

        // すべてのアカウントをクリアボタン
        document.getElementById('clearAllAccounts').addEventListener('click', () => {
            if (confirm('Tem certeza que deseja limpar todas as contas salvas?')) {
                this.authManager.clearAllAccounts();
                this.close();
                this.showNotification('Todas as contas foram removidas');
            }
        });

        // 外側をクリックして閉じる
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
    }

    // アカウントリストを生成
    populateAccounts() {
        const accountsList = document.getElementById('savedAccountsList');
        const accounts = this.authManager.getAccountsList();
        
        if (accounts.length === 0) {
            accountsList.innerHTML = `
                <div class="no-accounts-message">
                    <p>Nenhuma conta salva encontrada</p>
                    <p class="text-muted">Faça login para salvar sua conta</p>
                </div>
            `;
            return;
        }

        accountsList.innerHTML = accounts.map(account => {
            // RAをメインタイトル、名前が違う場合はサブタイトルとして表示
            const nameDisplay = (account.name && account.name !== account.ra) 
                ? `<div class="account-subtitle">${account.name}</div>` 
                : '';
            
            return `
                <div class="account-item ${!account.isValid ? 'invalid' : ''}" data-ra="${account.ra}">
                    <div class="account-info">
                        <div class="account-name">${account.ra}</div>
                        ${nameDisplay}
                        <div class="account-last-used">
                            ${this.formatRelativeTime(account.lastUsed)}
                        </div>
                    </div>
                    <div class="account-actions">
                        <button class="btn-use-account" data-ra="${account.ra}">
                            ${account.isValid ? 'Usar' : 'Token Expirado'}
                        </button>
                        <button class="btn-remove-account" data-ra="${account.ra}">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');

        // アカウントアイテムのクリックハンドラーを追加
        accountsList.querySelectorAll('.btn-use-account').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ra = e.target.dataset.ra;
                this.selectAccount(ra);
            });
        });

        accountsList.querySelectorAll('.btn-remove-account').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const ra = e.target.dataset.ra;
                if (confirm(`Remover conta ${ra}?`)) {
                    this.authManager.removeAccount(ra);
                    this.populateAccounts();
                    this.showNotification('Conta removida');
                }
            });
        });
    }

    // 相対時間をフォーマット - より簡潔に
    formatRelativeTime(timestamp) {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d atrás`;
        if (hours > 0) return `${hours}h atrás`;
        if (minutes > 0) return `${minutes}m atrás`;
        return 'Agora';
    }

    // アカウントを選択
    selectAccount(ra) {
        const accounts = this.authManager.getStoredAccounts();
        const account = accounts[ra];
        
        if (!account) {
            this.showNotification('Conta não encontrada');
            return;
        }

        // \u6700\u7d42\u4f7f\u7528\u3092\u66f4\u65b0
        this.authManager.updateLastUsed(ra);
        
        // 常にフォームフィールドを埋めて、ユーザーにアクションを選択させる
        if (window.performQuickLogin) {
            window.performQuickLogin(ra, account.t);
        } else {
            // 関数が利用できない場合のフォールバック
            document.getElementById('studentId').value = ra;
            document.getElementById('password').value = '**********';
            this.showNotification('Conta selecionada. Escolha uma ação para continuar.');
        }
        
        this.close();
    }

    // 通知を表示
    showNotification(message) {
        if (window.createNotification) {
            window.createNotification(message);
        } else {
            console.log(message);
        }
    }

    // モーダルを開く
    open() {
        if (!this.modal) {
            this.createModal();
        }
        
        this.modal.classList.remove('hidden');
        this.isOpen = true;

        // スムーズなアニメーションのために少し遅延してアカウントを生成
        requestAnimationFrame(() => {
            this.populateAccounts();
        });
    }

    // モーダルを閉じる
    close() {
        if (this.modal) {
            this.modal.classList.add('hidden');
        }
        this.isOpen = false;
    }
}

// 簡単な統合のためのヘルパークラス
class SharedAuthHelper {
    constructor(authManager, selectorUI) {
        this.authManager = authManager;
        this.selectorUI = selectorUI;
        this.STARRED_PASSWORD = '**********';
        this.savedToken = null;
        this.usingSavedAuth = false;
    }

    // クイックログインボタンを初期化
    initQuickLoginButton(buttonId = 'quickLoginBtn', badgeId = 'accountCount') {
        const button = document.getElementById(buttonId);
        const badge = document.getElementById(badgeId);
        
        if (button) {
            button.addEventListener('click', () => {
                this.selectorUI.open();
            });
        }
        
        this.updateQuickLoginButton(buttonId, badgeId);
        return this;
    }

    // クイックログインボタンの表示を更新
    updateQuickLoginButton(buttonId = 'quickLoginBtn', badgeId = 'accountCount') {
        const button = document.getElementById(buttonId);
        const badge = document.getElementById(badgeId);
        
        if (button && badge) {
            const accounts = this.authManager.getAccountsList();
            if (accounts.length > 0) {
                button.style.display = 'flex';
                badge.textContent = accounts.length;
            } else {
                button.style.display = 'none';
            }
        }
    }

    // 保存された認証情報でフォームを埋める
    fillLoginForm(userId, token, userIdFieldId = 'studentId', passwordFieldId = 'password') {
        const userField = document.getElementById(userIdFieldId);
        const passwordField = document.getElementById(passwordFieldId);
        
        if (userField && passwordField) {
            userField.value = userId;
            passwordField.value = this.STARRED_PASSWORD;
            
            // 後で使用するためにトークンを保存
            this.savedToken = token;
            this.usingSavedAuth = true;
            
            // 最終使用を更新
            this.authManager.updateLastUsed(userId);
            
            // 必要に応じて変更イベントをトリガー
            userField.dispatchEvent(new Event('input'));
            passwordField.dispatchEvent(new Event('input'));
            
            return true;
        }
        return false;
    }

    // 保存された認証を使用しているかチェック
    isUsingSavedAuth(passwordValue) {
        return passwordValue === this.STARRED_PASSWORD;
    }

    // 現在のセッションの保存されたトークンを取得
    getSavedToken(userId = null) {
        // まずメモリをチェック
        if (this.savedToken) {
            return this.savedToken;
        }
        
        // userIdが提供されている場合は保存されたアカウントをチェック
        if (userId) {
            const accounts = this.authManager.getStoredAccounts();
            const account = accounts[userId];
            if (account && account.t) {
                this.savedToken = account.t;
                this.usingSavedAuth = true;
                return account.t;
            }
        }
        
        return null;
    }

    // 保存された認証セッションをクリア
    clearAuthSession() {
        this.savedToken = null;
        this.usingSavedAuth = false;
    }

    // 期限切れトークンを処理
    handleExpiredToken(userId, userIdFieldId = 'studentId', passwordFieldId = 'password') {
        // アカウントをすぐに削除せず、ユーザーにパスワードで再試行させる
        const passwordField = document.getElementById(passwordFieldId);
        if (passwordField) {
            passwordField.value = '';
            passwordField.focus();
        }
        
        // セッションをクリアするがアカウントは保持
        this.clearAuthSession();
        
        return 'Token expired. Please enter your password.';
    }

    // 成功したログインを保存
    saveSuccessfulLogin(userId, token, userName = null, additionalData = {}) {
        this.authManager.saveAccount(userId, token, userName, additionalData);
        this.updateQuickLoginButton();
    }

    // フォームとの自動統合をセットアップ
    autoIntegrate(config = {}) {
        const defaults = {
            userIdFieldId: 'studentId',
            passwordFieldId: 'password', 
            quickLoginBtnId: 'quickLoginBtn',
            accountCountId: 'accountCount',
            loginHandler: null,
            onAccountSelected: null
        };
        
        const settings = { ...defaults, ...config };
        
        // ボタンを初期化
        this.initQuickLoginButton(settings.quickLoginBtnId, settings.accountCountId);
        
        // performQuickLoginをオーバーライド
        window.performQuickLogin = (userId, token) => {
            this.fillLoginForm(userId, token, settings.userIdFieldId, settings.passwordFieldId);
            
            if (settings.onAccountSelected) {
                settings.onAccountSelected(userId, token);
            } else {
                // デフォルトメッセージ
                if (window.createNotification) {
                    window.createNotification('Account selected. Choose an action to continue.');
                } else {
                    console.log('Account selected:', userId);
                }
            }
        };
        
        return this;
    }
}

// 共有認証システムを初期化
const sharedAuth = new SharedAuthManager();
const accountSelector = new AccountSelectorUI(sharedAuth);
const sharedAuthHelper = new SharedAuthHelper(sharedAuth, accountSelector);

// 他のスクリプトで使用するためにエクスポート
window.SharedAuthManager = sharedAuth;
window.AccountSelectorUI = accountSelector;
window.SharedAuthHelper = sharedAuthHelper;