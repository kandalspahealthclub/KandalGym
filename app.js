// Tratador de Erros Global - Deve ser o primeiro a carregar
window.onerror = function (message, source, lineno, colno, error) {
    console.error("Erro detectado:", message, "em", source, ":", lineno);
    const container = document.getElementById('main-content');
    if (container && (container.innerHTML === '' || container.innerText.length < 50)) {
        container.innerHTML = `
            <div class="glass-card" style="margin:2rem; padding:2rem; border:2px solid var(--danger); text-align:center;">
                <i class="fas fa-exclamation-circle" style="font-size:3rem; color:var(--danger); margin-bottom:1rem;"></i>
                <h2 style="color:#fff;">Ocorreu um erro na aplicacao</h2>
                <p style="color:var(--text-muted);">A pagina nao conseguiu carregar corretamente.</p>
                <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; margin:1rem 0; text-align:left; font-family:monospace; font-size:0.75rem; color:var(--danger); overflow-x:auto;">
                    ${message}<br><small>Linha: ${lineno}</small>
                </div>
                <button class="btn btn-primary" onclick="location.reload()">Recarregar App</button>
            </div>
        `;
    }
    return false;
};

class FitnessApp {
    constructor() {
        this.role = 'client';
        this.currentClientId = null;
        this.activeView = 'dashboard';
        this.spySubView = 'training';
        this.dashboardMonth = new Date().toISOString().substring(0, 7);
        this.hasLoadedData = false; // Flag para evitar flickering de "Utilizador nao encontrado"
        this.isCheckingClasses = false;
        this.checkInterval = null;
        this.qrActiveTab = 'clients';
        this.selectedQRClients = [];

        // Tentar carregar estado do LocalStorage como cache inicial
        const cachedState = localStorage.getItem('kandalgym_state');
        if (cachedState) {
            try {
                this.state = JSON.parse(cachedState);
            } catch (e) {
                this.state = (typeof mockState !== 'undefined') ? mockState : {};
            }
        } else {
            this.state = (typeof mockState !== 'undefined') ? mockState : {};
        }

        const vitalCollections = ['admins', 'teachers', 'clients', 'qrClients', 'foodCategories', 'exerciseCategories', 'foods', 'exercises', 'notifications', 'classes'];
        vitalCollections.forEach(c => { if (!this.state[c]) this.state[c] = []; });

        const vitalDicts = ['trainingPlans', 'mealPlans', 'evaluations', 'trainingHistory', 'messages', 'anamnesis', 'enrollments'];
        vitalDicts.forEach(d => { if (!this.state[d]) this.state[d] = {}; });

        this.shownNotifications = JSON.parse(localStorage.getItem('shown_notifications') || '[]');
        this.isLoggedIn = false;
        this.currentUser = null;

        // Initialize Firebase
        this.firebaseAppConfig = {
            apiKey: "AIzaSyD7cf3sfJBm0YsLOagu6or2hCTd-xcjO1E",
            authDomain: "kandalgym.firebaseapp.com",
            databaseURL: "https://kandalgym-default-rtdb.europe-west1.firebasedatabase.app",
            projectId: "kandalgym",
            storageBucket: "kandalgym.firebasestorage.app",
            messagingSenderId: "367817039949",
            appId: "1:367817039949:web:5c72215819b9bb1eb07c04",
            measurementId: "G-WY0QSKYVCR",
            serverKey: "AIzaSyD7cf3sfJBm0YsLOagu6or2hCTd-xcjO1E" // ATENCAO: Esta chave deve comecar por AAAA...
        };

        try {
            firebase.initializeApp(this.firebaseAppConfig);
            this.db = firebase.database();
            this.dbRef = this.db.ref('kandalGymState');
            console.log("Firebase inicializado.");
        } catch (fbErr) {
            console.error("Erro ao inicializar Firebase:", fbErr);
            alert("Erro Firebase: Verifique a sua ligacao a internet.");
        }
        this.isSaving = false;

        this.deferredPrompt = null;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.renderSidebar();
            this.renderNavbar();
        });

        // 1. Restaurar login e renderizar interface IMEDIATAMENTE
        this.restoreLogin();
        if (!this.isLoggedIn) {
            this.renderLogin();
        } else {
            this.renderAppInterface();
        }

        // 2. Iniciar escuta do Firebase em segundo plano
        this.init();
    }


    renderAppInterface() {
        try {
            const loginScreen = document.getElementById('login-screen');
            const appScreen = document.getElementById('app');
            if (loginScreen) loginScreen.style.display = 'none';
            if (appScreen) {
                appScreen.style.display = 'flex';
                appScreen.style.opacity = '1';
            }
            this.renderNavbar();
            this.renderSidebar();
            this.renderUserProfile();
            this.renderContent();
            this.renderFAB();
        } catch (e) {
            console.error("Erro ao renderizar interface:", e);
        }
    }

    async saveState() {
        if (!this.hasLoadedData) {
            console.warn('Tentativa de gravar antes de carregar dados do Firebase ignorada.');
            return;
        }
        if (this.isSaving) return;
        this.isSaving = true;
        try {
            // Tentar gravar no LocalStorage (cache rapido)
            try {
                localStorage.setItem('kandalgym_state', JSON.stringify(this.state));
            } catch (lsError) {
                console.warn('LocalStorage Quota exceeded');
            }

            await this.dbRef.set(this.state);
            // Backup imediato no localStorage para evitar perda de dados local
            localStorage.setItem('kandalgym_state', JSON.stringify(this.state));
            console.log("Estado guardado com sucesso no Firebase");
        } catch (e) {
            console.error('Firebase Sync error:', e);
            alert("Erro ao guardar dados. Verifique a internet.");
        } finally {
            // Tempo suficiente para o Firebase processar e devolver o sinal de volta
            setTimeout(() => { this.isSaving = false; }, 1000);
        }
    }

    async init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        this.dbRef.on('value', (snapshot) => {
            // Se entrou no listener, ja temos resposta do servidor
            this.hasLoadedData = true;

            // Nao processar se for uma gravacao nossa (evita loops e cintilacao)
            if (this.isSaving) return;

            const data = snapshot.val();
            if (data) {
                this.state = data;
            }

            // 1. Integridade local
            const collections = ['admins', 'teachers', 'clients', 'qrClients', 'foodCategories', 'exerciseCategories', 'foods', 'exercises', 'notifications', 'classes'];
            collections.forEach(coll => { if (!this.state[coll]) this.state[coll] = []; });

            const dictCollections = ['trainingPlans', 'mealPlans', 'evaluations', 'trainingHistory', 'messages', 'anamnesis', 'enrollments'];
            dictCollections.forEach(coll => { if (!this.state[coll]) this.state[coll] = {}; });

            // 2. Conta mestre garantida
            if (!this.state.admins.some(a => a.email === 'admin@kandalgym.com')) {
                this.state.admins.push({
                    id: 1, name: 'KandalGym Master', email: 'admin@kandalgym.com', password: 'admin', role: 'admin'
                });
            }

            // 3. Sincronizacao local e UI
            try {
                localStorage.setItem('kandalgym_state', JSON.stringify(this.state));
            } catch (e) { }

            this.syncSessionWithState();

            // Atualizar UI apenas se logado e nao houver modais abertas
            if (this.isLoggedIn && !document.querySelector('.modal-overlay')) {
                this.renderContent();
            }

            if (!this.checkInterval) {
                setTimeout(() => this.checkFinishedClasses(), 2000);
                this.checkInterval = setInterval(() => this.checkFinishedClasses(), 60000);
            }
        });
    }

    async backgroundSync() {
        // Agora o 'init' com dbRef.on('value') ja faz a sincronizacao automatica em tempo real.
        // Nao precisamos mais de intervalo.
        return;
    }

    addAppNotification(targetUserId, title, body, senderId = null, type = 'notification', shouldSave = true, replyTo = null) {
        if (!this.state.notifications) this.state.notifications = [];
        if (this.state.notifications.length > 200) {
            this.state.notifications = this.state.notifications.slice(-200);
        }

        const newNotification = {
            id: Date.now() + Math.random(),
            targetUserId: Number(targetUserId),
            senderId: senderId,
            type: type,
            title,
            body,
            createdAt: new Date().toISOString(),
            replyTo: replyTo // Store reference to original message
        };

        this.state.notifications.push(newNotification);
        if (shouldSave) this.saveState();
    }

    showModal(content, maxWidth = '600px') {
        this.closeModal();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay animate-fade-in';
        modal.innerHTML = `<div class="modal-content animate-scale-in" style="max-width: ${maxWidth};">${content}</div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModal(); });
    }

    closeModal() {
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = 'animate-fade-in';
        toast.style.cssText = `
            position: fixed;
            bottom: 2rem;
            left: 50%;
            transform: translateX(-50%);
            padding: 1rem 2rem;
            border-radius: 12px;
            background: ${type === 'success' ? 'var(--success)' : 'var(--danger)'};
            color: white;
            font-weight: 600;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            z-index: 9999;
            display: flex; align-items: center; gap: 10px;
        `;
        toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${message}`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.5s ease';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    renderUserProfile() {
        const container = document.getElementById('user-profile-header');
        if (!container || !this.currentUser) return;

        const name = this.currentUser.name || 'User';
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const photo = this.currentUser.photoUrl;

        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <div class="avatar" style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.9rem; border: 2px solid var(--surface-border); overflow: hidden;">
                    ${photo ? `<img src="${photo}" style="width:100%; height:100%; object-fit:cover;">` : initials}
                </div>
                <button class="btn btn-ghost btn-sm" onclick="app.installPWA()" title="Instalar App" style="color: var(--primary); padding: 6px 10px; border: 1px solid var(--primary); border-radius: 8px;">
                    <i class="fas fa-download"></i>
                </button>
                <button class="btn btn-ghost btn-sm" onclick="app.handleLogout()" title="Sair" style="color:var(--text-muted);">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
            </div>
        `;
    }

    renderLogin() {
        const loginScreen = document.getElementById('login-screen');
        const appScreen = document.getElementById('app');
        if (loginScreen) loginScreen.style.display = 'flex';
        if (appScreen) appScreen.style.display = 'none';

        loginScreen.innerHTML = `
            <div class="login-card">
                <div class="login-hero">
                    <div class="logo">
                        <img src="logo.png" alt="KandalGym Logo">
                    </div>
                    <p>Entre na sua conta para continuar</p>
                </div>
                <form class="login-form" onsubmit="app.handleLogin(); return false;">
                    <div class="input-icon-group">
                        <i class="fas fa-envelope"></i>
                        <input type="email" id="login-email" placeholder="Email" required>
                    </div>
                    <div class="input-icon-group">
                        <i class="fas fa-lock"></i>
                        <input type="password" id="login-pass" placeholder="Password" required>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width:100%; margin-top:0.5rem;">
                        Entrar <i class="fas fa-arrow-right"></i>
                    </button>
                </form>
                <div class="login-footer">
                    Problemas de Acesso? <a href="https://wa.me/351963939017" target="_blank"><i class="fab fa-whatsapp"></i> Contacte-nos</a>
                </div>
            </div>
        `;
    }

    renderRegister() {
        const loginScreen = document.getElementById('login-screen');
        loginScreen.innerHTML = `
            <div class="login-card">
                <div class="login-hero">
                    <div class="logo">
                        <img src="logo.png" alt="KandalGym Logo">
                    </div>
                    <p>Crie a sua conta gratuita</p>
                </div>
                <form class="login-form" onsubmit="app.handleRegister(); return false;">
                    <div class="input-icon-group">
                        <i class="fas fa-user"></i>
                        <input type="text" id="reg-name" placeholder="Nome Completo" required>
                    </div>
                    <div class="input-icon-group">
                        <i class="fas fa-envelope"></i>
                        <input type="email" id="reg-email" placeholder="Email" required>
                    </div>
                    <div class="input-icon-group">
                        <i class="fas fa-lock"></i>
                        <input type="password" id="reg-pass" placeholder="Palavra-passe" required>
                    </div>
                    <div class="input-icon-group">
                        <i class="fas fa-phone"></i>
                        <input type="tel" id="reg-phone" placeholder="Telemovel (ex: 912345678)" required>
                    </div>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0.5rem 0; text-align: left;">
                        * O seu registo sera como <strong>Aluno</strong>. Contas de Professor devem ser solicitadas ao Administrador.
                    </p>
                    <button type="submit" class="btn btn-primary" style="width:100%; margin-top:0.5rem;">
                        Criar Conta <i class="fas fa-check"></i>
                    </button>
                </form>
                <div class="login-footer">
                    Ja tem conta? <a href="#" onclick="app.renderLogin(); return false;">Faca Login</a>
                </div>
            </div>
        `;
    }

    handleRegister() {
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim().toLowerCase();
        const pass = document.getElementById('reg-pass').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();

        if (!name || !email || !pass || !phone) {
            alert('Por favor, preencha todos os campos, incluindo o contacto.');
            return;
        }

        // Verificar se ja existe
        const exists = this.state.clients.some(c => c.email.toLowerCase() === email) ||
            this.state.teachers.some(t => t.email.toLowerCase() === email);
        if (exists) {
            alert('Este email ja esta registado.');
            return;
        }

        const newId = Date.now();
        const newClient = { id: newId, name, email, phone, password: pass, status: 'Ativo', lastEvaluation: '-', goal: 'Novo Aluno' };
        this.state.clients.push(newClient);
        this.state.trainingPlans[newId] = [];
        this.state.mealPlans[newId] = { title: 'Plano Alimentar', meals: [] };
        this.state.evaluations[newId] = [];
        this.state.trainingHistory[newId] = [];

        this.saveState();
        alert('Conta criada com sucesso! Ja pode entrar.');
        this.renderLogin();
    }

    handleLogin() {
        try {
            const emailInput = document.getElementById('login-email');
            const passInput = document.getElementById('login-pass');

            if (!emailInput || !passInput) return;

            const email = emailInput.value.trim().toLowerCase();
            const pass = passInput.value;

            if (!email || !pass) {
                return alert('Por favor, preencha todos os campos.');
            }

            // Garantir que o estado e listas basicas existem
            if (!this.state) this.state = {};
            if (!this.state.admins) this.state.admins = [];
            if (!this.state.teachers) this.state.teachers = [];
            if (!this.state.clients) this.state.clients = [];

            const admin = this.state.admins.find(a => a.email.toLowerCase() === email && a.password === pass);
            if (admin) {
                this.role = 'admin';
                this.currentUser = admin;
                this.isLoggedIn = true;
                this.persistLogin();
                this.renderAppInterface();
                return;
            }

            const teacher = this.state.teachers.find(t => t.email.toLowerCase() === email && t.password === pass);
            if (teacher) {
                this.role = 'teacher';
                this.currentUser = teacher;
                this.isLoggedIn = true;
                this.persistLogin();
                this.renderAppInterface();
                return;
            }

            const client = this.state.clients.find(c => c.email.toLowerCase() === email && c.password === pass);
            if (client) {
                this.role = 'client';
                this.currentUser = client;
                this.currentClientId = client.id;
                this.isLoggedIn = true;
                this.persistLogin();
                this.renderAppInterface();
            } else {
                alert('Email ou palavra-passe incorretos.');
            }
        } catch (error) {
            console.error('Erro no login:', error);
            alert('Ocorreu um erro ao entrar. Tente refrescar a pagina.');
        }
    }

    syncSessionWithState() {
        if (!this.isLoggedIn || !this.currentUser) return;

        const email = this.currentUser.email.toLowerCase();
        let found = null;

        // Procurar o utilizador fresco no estado descarregado
        if (this.role === 'admin') found = this.state.admins.find(a => a.email.toLowerCase() === email);
        else if (this.role === 'teacher') found = this.state.teachers.find(t => t.email.toLowerCase() === email);
        else if (this.role === 'client') found = this.state.clients.find(c => c.email.toLowerCase() === email);

        if (found) {
            this.currentUser = found;
            if (this.role === 'client') this.currentClientId = Number(found.id);
        }
    }

    persistLogin() {
        const session = {
            isLoggedIn: this.isLoggedIn,
            role: this.role,
            currentUser: this.currentUser,
            currentClientId: this.currentClientId,
            activeView: this.activeView
        };
        localStorage.setItem('kandalgym_session', JSON.stringify(session));
    }

    restoreLogin() {
        try {
            const savedSession = localStorage.getItem('kandalgym_session');
            if (savedSession && savedSession !== 'null' && savedSession !== 'undefined') {
                const session = JSON.parse(savedSession);
                if (session && typeof session === 'object') {
                    this.isLoggedIn = session.isLoggedIn || false;
                    this.role = session.role || 'client';
                    this.currentUser = session.currentUser || null;
                    this.currentClientId = session.currentClientId || null;
                    this.activeView = session.activeView || 'dashboard';
                }
            }

        } catch (e) {
            console.error("Erro ao restaurar sessao:", e);
            localStorage.removeItem('kandalgym_session');
        }
    }

    handleLogout() {
        this.isLoggedIn = false;
        this.currentUser = null;
        localStorage.removeItem('kandalgym_session');

        // Force refresh to clear all state and re-initialize purely on the login screen
        window.location.reload();
    }

    renderFAB() {
        const existingFab = document.querySelector('.action-fab');
        if (existingFab) existingFab.remove();

        if (this.role === 'admin') {
            const fab = document.createElement('button');
            fab.className = 'action-fab animate-fade-in';
            fab.innerHTML = '<i class="fas fa-plus"></i>';
            fab.onclick = () => {
                const userTab = document.querySelector('.admin-tabs .tab.active');
                if (this.activeView === 'users') {
                    this.showAddUserModal();
                } else if (this.activeView === 'classes') {
                    // Logic to add class if needed
                } else {
                    this.showAddUserModal();
                }
            };
            document.body.appendChild(fab);
        }
    }

    showAddUserModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Criar Utilizador</h2>
                <div style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Tipo</label>
                        <select id="new-user-type" onchange="const val = this.value; const isClient = val === 'client'; ['teacher-select-container', 'client-dob-container', 'client-job-container', 'client-plan-container'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = isClient ? 'block' : 'none'; });">
                            <option value="client">Aluno/Cliente</option>
                            <option value="teacher">Professor/Trainer</option>
                            ${this.role === 'admin' ? '<option value="admin">Administrador (Gestor)</option>' : ''}
                        </select>
                    </div>
                    <div id="teacher-select-container">
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Atribuir Professor Responsavel</label>
                        <div class="teacher-assign-tag" style="width:100%; justify-content:space-between; padding:8px 15px; background:rgba(0,0,0,0.2);">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <i class="fas fa-user-tie"></i>
                                <select id="new-user-teacher" style="min-width:150px;">
                                    <option value="">Sem Professor (Atribuir depois)</option>
                                    ${this.state.teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                                </select>
                            </div>
                            <i class="fas fa-chevron-down" style="font-size:0.7rem; opacity:0.5;"></i>
                        </div>
                    </div>
                    <input type="text" id="new-user-name" placeholder="Nome Completo">
                    <input type="email" id="new-user-email" placeholder="Email">
                    <div style="position:relative;">
                        <input type="password" id="new-user-pass" placeholder="Palavra-passe" style="padding-right:85px;">
                        <div style="position:absolute; right:10px; top:50%; transform:translateY(-50%); display:flex; gap:8px; align-items:center;">
                            <i class="fas fa-eye" style="cursor:pointer; color:var(--text-muted); font-size:0.9rem;" 
                                onclick="const i = document.getElementById('new-user-pass'); i.type = i.type === 'password' ? 'text' : 'password'; this.className = i.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash'"></i>
                            <button class="btn btn-ghost btn-sm" style="padding:4px 8px; font-size:0.7rem; background:rgba(255,255,255,0.05);" onclick="app.generateRandomPassword()">Gerar</button>
                        </div>
                    </div>
                    <input type="tel" id="new-user-phone" placeholder="Contacto (ex: 912345678)">
                    <div id="client-dob-container">
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Data de Nascimento</label>
                        <input type="date" id="new-user-dob" style="color-scheme: dark;">
                    </div>
                    <div id="client-job-container">
                        <input type="text" id="new-user-job" placeholder="Profissao (Obrigatorio)">
                    </div>
                    <div id="client-plan-container">
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Plano de Acesso</label>
                        <select id="new-user-plan">
                            <option value="total">Total (Musculacao + Todas as Aulas)</option>
                            <option value="musculacao">Musculacao (Sem Aulas)</option>
                            <option value="aulas">Aulas (Exceto Pilates)</option>
                            <option value="pilates">Pilates (So Aulas de Pilates)</option>
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.addUser()">Adicionar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    generateRandomPassword() {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
        let pass = "";
        for (let i = 0; i < 8; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const input = document.getElementById('new-user-pass');
        input.value = pass;
        input.type = 'text'; // Mostrar ao gerar para o admin ver
    }

    addUser() {
        try {
            const type = document.getElementById('new-user-type').value;
            const name = document.getElementById('new-user-name').value.trim();
            const email = document.getElementById('new-user-email').value.trim().toLowerCase();
            const pass = document.getElementById('new-user-pass').value.trim();
            const phone = document.getElementById('new-user-phone').value.trim();
            const jobInput = document.getElementById('new-user-job');
            const job = jobInput ? jobInput.value.trim() : '';

            if (!name || !email || !pass || !phone || (type === 'client' && !job)) return alert('Por favor, preencha todos os campos obrigatorios' + (type === 'client' ? ', incluindo a profissao.' : '.'));

            // Garantir que as listas existem antes de verificar duplicados
            if (!this.state.clients) this.state.clients = [];
            if (!this.state.teachers) this.state.teachers = [];
            if (!this.state.admins) this.state.admins = [];

            // Verificar se ja existe email
            const existsEmail = this.state.clients.some(c => c.email.toLowerCase() === email) ||
                this.state.teachers.some(t => t.email.toLowerCase() === email) ||
                this.state.admins.some(a => a.email.toLowerCase() === email);

            if (existsEmail) {
                alert('Este email ja esta registado no sistema.');
                return;
            }

            // Verificar se ja existe contacto telefonico (normalizando espacos)
            const cleanPhone = phone.replace(/\s+/g, '');
            const existsPhone = this.state.clients.some(c => (c.phone || '').replace(/\s+/g, '') === cleanPhone) ||
                this.state.teachers.some(t => (t.phone || '').replace(/\s+/g, '') === cleanPhone) ||
                this.state.admins.some(a => (a.phone || '').replace(/\s+/g, '') === cleanPhone);

            if (existsPhone) {
                alert('Este contacto telefonico ja esta registado na base de dados (Professor, Aluno ou Admin).');
                return;
            }

            const newId = Date.now();
            if (type === 'admin') {
                this.state.admins.push({ id: newId, name, email, phone, password: pass });
            } else if (type === 'teacher') {
                this.state.teachers.push({ id: newId, name, email, phone, password: pass });
            } else {
                const teacherId = document.getElementById('new-user-teacher').value;
                const newClient = {
                    id: newId,
                    name,
                    email,
                    phone,
                    password: pass,
                    status: 'Ativo',
                    lastEvaluation: '-',
                    goal: 'Novo Aluno',
                    teacherId: teacherId ? Number(teacherId) : null,
                    birthDate: document.getElementById('new-user-dob').value,
                    job: job,
                    plan: document.getElementById('new-user-plan')?.value || 'total'
                };
                this.state.clients.push(newClient);

                // Initialize empty data structures for the new client
                if (!this.state.trainingPlans) this.state.trainingPlans = {};
                if (!this.state.mealPlans) this.state.mealPlans = {};
                if (!this.state.evaluations) this.state.evaluations = {};
                if (!this.state.trainingHistory) this.state.trainingHistory = {};

                this.state.trainingPlans[newId] = [];
                this.state.mealPlans[newId] = { title: 'Plano Alimentar', meals: [] };
                this.state.evaluations[newId] = [];
                this.state.trainingHistory[newId] = [];

                // Notificar o professor da nova Inscrição (sem gravar ainda)
                if (teacherId) {
                    this.addAppNotification(teacherId, 'Novo Aluno Inscrito!', `O aluno ${name} foi registado no sistema.`, null, 'notification', false);
                }

                // Ativar QR automaticamente para o novo aluno (sem gravar ainda)
                this.enableQRForClient(newId, false);
            }

            this.saveState();
            document.querySelector('.modal-overlay').remove();
            this.showInviteModal(name, email, pass, type, phone);

            if (this.activeView === 'users') {
                this.switchAdminTab(type === 'client' ? 'clients' : (type === 'admin' ? 'admins' : 'teachers'));
            }
        } catch (error) {
            console.error('Erro ao adicionar utilizador:', error);
            alert('Erro ao guardar utilizador: ' + error.message);
        }
    }

    showInviteModal(name, email, pass, type, phone) {
        const label = type === 'teacher' ? 'Professor' : 'Aluno';
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';

        const subject = `Bem-vindo a KandalGym - ${name}`;
        const body = `Ola ${name},

A sua conta de ${label} na KandalGym foi criada com sucesso!

Podera aceder a plataforma atraves do seguinte endereco: https://kandalspahealthclub.github.io/KandalGym/

As suas credenciais de acesso sao:
- Email: ${email}
- Password: ${pass}

Recomendamos que guarde este link nos seus favoritos ou instale a App no seu telemovel.

Bons treinos!
Equipa KandalGym`;

        const whatsappText = `*Bem-vindo a KandalGym* 

Ola ${name}, a sua conta de ${label} foi criada!

 Aceda aqui: https://kandalspahealthclub.github.io/KandalGym/

 *Credenciais:*
 Email: ${email}
 Password: ${pass}

Bons treinos!`;

        const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        // Clean phone number for WhatsApp link
        const cleanPhone = phone ? phone.replace(/\s+/g, '').replace(/^00/, '').replace(/^\+/, '') : '';
        const whatsappLink = `https://wa.me/${cleanPhone.startsWith('351') || cleanPhone.length < 9 ? (cleanPhone.length === 9 ? '351' + cleanPhone : cleanPhone) : cleanPhone}?text=${encodeURIComponent(whatsappText)}`;

        modal.innerHTML = `
            <div class="modal-content animate-fade-in" style="max-width: 450px; text-align: center;">
                <h2 style="margin-top: 0;">Conta Criada!</h2>
                <p style="color: var(--text-muted); font-size: 0.9rem;">O utilizador <strong>${name}</strong> foi adicionado com sucesso ao sistema.</p>
                
                <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px; margin: 1.5rem 0; text-align: left; font-size: 0.85rem;">
                    <div style="margin-bottom: 0.5rem;"><i class="fas fa-envelope" style="width: 20px;"></i> ${email}</div>
                    <div style="margin-bottom: 0.5rem;"><i class="fas fa-phone" style="width: 20px;"></i> ${phone}</div>
                    <div><i class="fas fa-lock" style="width: 20px;"></i> ${pass}</div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                    <a href="${whatsappLink}" target="_blank" class="btn" style="text-decoration: none; background: #25D366; color: white;">
                        <i class="fab fa-whatsapp"></i> Enviar por WhatsApp
                    </a>
                    <a href="${mailtoLink}" class="btn btn-secondary" style="text-decoration: none;">
                        <i class="fas fa-envelope"></i> Enviar por Email
                    </a>
                    <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove(); app.setView('users');">
                        Concluir sem enviar
                    </button>
                </div>
                
                <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 1.5rem;">
                    * Escolha o metodo de envio acima para partilhar as credenciais com o utilizador.
                </p>
            </div>
        `;
        document.body.appendChild(modal);
    }

    showSharePlanModal(clientId, planType) {
        const client = (this.state.clients || []).find(c => Number(c.id) === Number(clientId));
        if (!client) {
            this.setView('spy_view');
            return;
        }

        const name = client.name;
        const email = client.email;
        const phone = client.phone;
        const typeLabel = planType === 'training' ? 'Treino' : 'Alimentar';

        const subject = `Novo Plano de ${typeLabel} - KandalGym`;
        const body = `Ola ${name},

O seu plano de ${typeLabel} foi atualizado no sistema KandalGym.

Pode consulta-lo na sua area pessoal atraves do endereco: https://kandalspahealthclub.github.io/KandalGym/

Bons treinos!
Equipa KandalGym`;

        const whatsappText = `*KandalGym - Novo Plano de ${typeLabel}*

Ola ${name}, o seu plano de ${typeLabel} foi atualizado! 🏋️‍♂️🍎

Aceda aqui para consultar: https://kandalspahealthclub.github.io/KandalGym/

Bons treinos!`;

        const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        const cleanPhone = phone ? String(phone).replace(/\s+/g, '').replace(/^00/, '').replace(/^\+/, '') : '';
        const whatsappLink = `https://wa.me/${cleanPhone.startsWith('351') || (cleanPhone.length < 12 && cleanPhone.length >= 9) ? (cleanPhone.length === 9 ? '351' + cleanPhone : cleanPhone) : cleanPhone}?text=${encodeURIComponent(whatsappText)}`;

        this.showModal(`
            <div style="text-align: center; padding: 1rem 0;">
                <h2 style="margin-top: 0; font-size: 1.5rem;">Plano Guardado!</h2>
                <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 2rem;">
                    Deseja notificar o aluno <strong>${name}</strong>?
                </p>

                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <a href="${whatsappLink}" target="_blank" class="btn" style="text-decoration: none; background: #25D366; color: white; display:flex; align-items:center; justify-content:center; gap:10px; height:50px; font-weight:600;">
                        <i class="fab fa-whatsapp" style="font-size:1.2rem;"></i> Enviar por WhatsApp
                    </a>
                    
                    <a href="${mailtoLink}" class="btn btn-secondary" style="text-decoration: none; display:flex; align-items:center; justify-content:center; gap:10px; height:50px; font-weight:600;">
                        <i class="fas fa-envelope"></i> Enviar por Email
                    </a>

                    <button class="btn btn-ghost" onclick="app.closeModal(); app.setView('spy_view');" style="margin-top: 0.5rem; font-weight: 500; opacity: 0.8;">
                        Concluir sem enviar
                    </button>
                </div>
            </div>
        `, '380px');
    }

    showAddExerciseModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        this.tempExercisePhoto = null;

        const cats = this.state.exerciseCategories || ["Geral"];
        const options = cats.map(c => `<option value="${c}">${c}</option>`).join('');

        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Novo Exercicio</h2>
                <div style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div style="text-align:center; margin-bottom:5px;">
                        <div id="ex-photo-preview" style="width:120px; height:120px; border-radius:12px; border:2px dashed var(--surface-border); margin:0 auto 10px; display:flex; items-align:center; justify-content:center; overflow:hidden; background:rgba(0,0,0,0.2);">
                            <i class="fas fa-image" style="font-size:2rem; color:var(--text-muted); align-self:center;"></i>
                        </div>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('ex-photo-input').click()">
                            <i class="fas fa-camera"></i> Carregar Foto
                        </button>
                        <input type="file" id="ex-photo-input" style="display:none;" accept="image/*" onchange="app.handleExercisePhotoUpload(this, 'ex-photo-preview')">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Nome</label>
                        <input type="text" id="ex-name" placeholder="Ex: Agachamento">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Link YouTube (opcional)</label>
                        <input type="text" id="ex-url" placeholder="https://youtube.com/...">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Categoria</label>
                        <select id="ex-category" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.2); color:#fff; border:1px solid var(--surface-border);">
                            ${options}
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-top:0.5rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.addExercise()">Guardar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    handleExercisePhotoUpload(input, previewId) {
        if (input.files && input.files[0]) {
            this.processImage(input.files[0], 600, 0.75, (base64) => {
                this.tempExercisePhoto = base64;
                const preview = document.getElementById(previewId);
                if (preview) {
                    preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:cover;">`;
                }
            });
        }
    }

    addExercise() {
        const name = document.getElementById('ex-name').value.trim();
        const url = document.getElementById('ex-url').value.trim();
        const cat = document.getElementById('ex-category').value;
        if (!name) return alert('O nome do exercicio e obrigatorio.');

        let finalUrl = "";
        if (url) {
            finalUrl = url;
            if (url.includes('watch?v=')) {
                finalUrl = url.replace('watch?v=', 'embed/');
            }
            const params = "modestbranding=1&rel=0&showinfo=0&controls=1";
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + params;
        }

        this.state.exercises.push({
            id: Date.now(),
            name: name,
            videoUrl: finalUrl,
            photoUrl: this.tempExercisePhoto || '',
            category: cat || 'Geral'
        });

        this.saveState();
        document.querySelector('.modal-overlay').remove();
        this.renderContent();
    }

    showAddFoodModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';

        // Generate options with safety check
        const cats = this.state.foodCategories || [];
        const options = cats.map(c => `<option value="${c}">${c}</option>`).join('');

        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Novo Alimento</h2>
                <div style="display:flex; flex-direction:column; gap:1rem;">
                    <input type="text" id="food-name" placeholder="Nome (Ex: Ovo)">
                    
                    <div>
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Categoria</label>
                        <select id="food-category" style="width:100%; padding:8px; border-radius:8px; border:1px solid #ccc;">
                            ${options}
                        </select>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem;">
                    <input type="number" id="food-kcal" placeholder="Kcal/100g">
                    <input type="number" id="food-prot" placeholder="Prot/100g">
                    <input type="number" id="food-carb" placeholder="Carb/100g">
                    <input type="number" id="food-fat" placeholder="Gord/100g">
                </div>
                <div>
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Peso por Unidade (opcional)</label>
                    <input type="number" id="food-portion" placeholder="Ex: 80 para uma Lata Atum">
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.addFood()">Guardar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    addFood() {
        const name = document.getElementById('food-name').value.trim();
        const category = document.getElementById('food-category').value;
        const kcal = document.getElementById('food-kcal').value;
        const prot = document.getElementById('food-prot').value;
        const carb = document.getElementById('food-carb').value;
        const fat = document.getElementById('food-fat').value;
        const portion = document.getElementById('food-portion').value;

        if (!name) return alert('Insira o nome.');

        // Verificar se ja existe um alimento com o mesmo nome (ignorando maiusculas/minusculas)
        const normalizedName = name.toLowerCase();
        const existingFood = this.state.foods.find(f => f.name.toLowerCase() === normalizedName);

        if (existingFood) {
            alert(`O alimento "${existingFood.name}" ja existe na base de dados.\n\nCategoria: ${existingFood.category}\nCalorias: ${existingFood.kcal} kcal/100g`);
            return;
        }

        this.state.foods.push({
            id: Date.now(),
            name: name,
            category: category || 'Outros',
            kcal: Number(kcal) || 0,
            protein: Number(prot) || 0,
            carbs: Number(carb) || 0,
            fat: Number(fat) || 0,
            portionWeight: Number(portion) || null
        });
        this.saveState();
        document.querySelector('.modal-overlay').remove();
        this.setView('foods');
    }

    renderNavbar() {
        let mobileNav = document.querySelector('.mobile-nav');
        if (!mobileNav) {
            mobileNav = document.createElement('nav');
            mobileNav.className = 'mobile-nav';
            document.body.appendChild(mobileNav);
        }

        let navItems = [];
        if (this.role === 'admin') {
            navItems = [
                { id: 'dashboard', icon: 'fa-shield-alt', label: 'Painel' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Aulas' },
                { id: 'users', icon: 'fa-users-cog', label: 'Contas' },
                { id: 'qr_manager', icon: 'fa-qrcode', label: 'Entradas' },
                { id: 'exercises', icon: 'fa-play-circle', label: 'Exercicios' },
                { id: 'foods', icon: 'fa-apple-alt', label: 'Alimentos' },
                { id: 'profile', icon: 'fa-user-circle', label: 'Perfil' }
            ];
        } else if (this.role === 'teacher') {
            navItems = [
                { id: 'dashboard', icon: 'fa-chart-pie', label: 'Inicio' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Aulas' },
                { id: 'clients', icon: 'fa-user-friends', label: 'Alunos' },
                { id: 'chat', icon: 'fa-comment-alt', label: 'Msgs' },
                { id: 'exercises', icon: 'fa-play-circle', label: 'Exercicios' },
                { id: 'foods', icon: 'fa-apple-alt', label: 'Alim.' },
                { id: 'profile', icon: 'fa-user-circle', label: 'Perfil' }
            ];
        } else {
            navItems = [
                { id: 'dashboard', icon: 'fa-home', label: 'Home' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Aulas' },
                { id: 'training', icon: 'fa-dumbbell', label: 'Treino' },
                { id: 'meal', icon: 'fa-apple-alt', label: 'Dieta' },
                { id: 'evaluation', icon: 'fa-chart-line', label: 'Aval.' },
                { id: 'chat', icon: 'fa-comment-alt', label: 'Msgs' },
                { id: 'profile', icon: 'fa-user-circle', label: 'Perfil' }
            ];
        }

        mobileNav.innerHTML = navItems.map(item => `
            <a href="#" class="mobile-nav-item ${this.activeView === item.id ? 'active' : ''}" onclick="app.setView('${item.id}'); return false;">
                <i class="fas ${item.icon}"></i>
                <span>${item.label}</span>
            </a>
        `).join('') + `
            <a href="#" class="mobile-nav-item" onclick="app.installPWA(); return false;" style="color:var(--primary); font-weight:bold; animation: pulse 2s infinite;">
                <i class="fas fa-download"></i>
                <span>App</span>
            </a>
        ` + `
            <a href="#" class="mobile-nav-item" onclick="app.handleLogout(); return false;">
                <i class="fas fa-sign-out-alt"></i>
                <span>Sair</span>
            </a>
        `;
    }

    renderSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        let navItems = [];
        if (this.role === 'admin') {
            navItems = [
                { id: 'dashboard', icon: 'fa-shield-alt', label: 'Painel Admin' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Horario & Aulas' },
                { id: 'users', icon: 'fa-users-cog', label: 'Gestao Contas' },
                { id: 'qr_manager', icon: 'fa-qrcode', label: 'Gestao de Entradas' },
                { id: 'exercises', icon: 'fa-play-circle', label: 'Biblioteca Exercicios' },
                { id: 'foods', icon: 'fa-apple-alt', label: 'Base de Alimentos' },
                { id: 'all-clients', icon: 'fa-search', label: 'Acesso Global' },
                { id: 'profile', icon: 'fa-user-circle', label: 'O Meu Perfil' }
            ];
        } else if (this.role === 'teacher') {
            navItems = [
                { id: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Gestao de Aulas' },
                { id: 'clients', icon: 'fa-user-friends', label: 'Meus Alunos' },
                { id: 'anamnesis', icon: 'fa-notes-medical', label: 'Anamnese' },
                { id: 'exercises', icon: 'fa-play-circle', label: 'Biblioteca Exercicios' },
                { id: 'foods', icon: 'fa-apple-alt', label: 'Base de Alimentos' },
                { id: 'chat', icon: 'fa-comment-alt', label: 'Mensagens' },
                { id: 'profile', icon: 'fa-user-circle', label: 'O Meu Perfil' }
            ];
        } else {
            navItems = [
                { id: 'dashboard', icon: 'fa-home', label: 'Inicio' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Horario de Aulas' },
                { id: 'training', icon: 'fa-dumbbell', label: 'Meu Treino' },
                { id: 'meal', icon: 'fa-apple-alt', label: 'Minha Dieta' },
                { id: 'evaluation', icon: 'fa-chart-line', label: 'Avaliação Fisica' },
                { id: 'chat', icon: 'fa-comment-alt', label: 'Mensagens' },
                { id: 'profile', icon: 'fa-user-circle', label: 'O Meu Perfil' }
            ];
        }

        sidebar.innerHTML = navItems.map(item => `
            <button class="btn btn-ghost ${this.activeView === item.id ? 'glass-card' : ''}" onclick="app.setView('${item.id}')">
                <i class="fas ${item.icon}"></i> <span>${item.label}</span>
            </button>
        `).join('') + `
        <button class="btn btn-ghost" onclick="app.handleLogout()" style="margin-top:auto; color:var(--danger); gap: 10px;">
                <i class="fas fa-sign-out-alt"></i> <span>Terminar Sessao</span>
            </button>
        `;
    }

    setView(view) {
        this.activeView = view;
        this.persistLogin();
        this.renderNavbar();
        this.renderSidebar();
        this.renderContent();
        this.renderFAB();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    renderContent() {
        const container = document.getElementById('main-content');
        if (!container) return;

        // Se ainda nao carregamos dados frescos do Firebase, mostramos um loader
        // em vez de mostrar dados potencialmente obsoletos do cache (evita aulas que "aparecem e desaparecem")
        if (!this.hasLoadedData) {
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:5rem; gap:1.5rem; text-align:center;">
                    <div class="loader"></div>
                    <p style="color:var(--text-muted); font-size:1.1rem;">Sincronizando com o servidor...</p>
                    <small style="color:var(--text-muted); opacity:0.7;">Isto garante que ve as inscricoes e horarios mais recentes.</small>
                </div>
            `;
            return;
        }

        container.innerHTML = '';

        if (this.activeView === 'edit_training') {
            this.renderTrainingEditor();
            return;
        }

        if (this.activeView === 'edit_meal') {
            this.renderMealEditor();
            return;
        }

        if (this.activeView === 'spy_view') {
            this.renderSpyView(container);
            return;
        }

        if (this.activeView === 'classes') {
            this.renderClassesView(container);
            return;
        }

        if (this.role === 'admin') {
            try {
                this.renderAdminContent(container);
            } catch (e) {
                console.error("Critical error rendering admin content:", e);
                container.innerHTML = `<div class="glass-card" style="color:var(--danger); padding:2rem;">Erro ao carregar conteudo: ${e.message}</div>`;
            }
        } else if (this.role === 'teacher') {
            this.renderTeacherContent(container);
        } else {
            this.renderClientContent(container);
        }
    }

    renderAdminContent(container) {
        if (!this.hasLoadedData) {
            container.innerHTML = `<div style="padding:5rem; text-align:center;"><div class="loader" style="margin:0 auto;"></div></div>`;
            return;
        }
        switch (this.activeView) {
            case 'dashboard':
                container.innerHTML = `
                    <h2 class="animate-fade-in"><i class="fas fa-user-shield"></i> Dashboard Admin</h2>
                    
                    <div class="stats-grid" style="margin-bottom: 2rem;">
                        <div class="glass-card" style="border-left: 4px solid var(--primary); display: flex; align-items: center; gap: 1rem;">
                            <div style="background: rgba(99, 102, 241, 0.1); padding: 1rem; border-radius: 12px; color: var(--primary);">
                                <i class="fas fa-user-tie" style="font-size: 1.5rem;"></i>
                            </div>
                            <div>
                                <small style="color: var(--text-muted); display: block;">Professores</small>
                                <div style="font-size: 1.8rem; font-weight: 800;">${this.state.teachers.length}</div>
                            </div>
                        </div>
                        
                        <div class="glass-card" style="border-left: 4px solid var(--secondary); display: flex; align-items: center; gap: 1rem;">
                            <div style="background: rgba(16, 185, 129, 0.1); padding: 1rem; border-radius: 12px; color: var(--secondary);">
                                <i class="fas fa-user-friends" style="font-size: 1.5rem;"></i>
                            </div>
                            <div>
                                <small style="color: var(--text-muted); display: block;">Alunos</small>
                                <div style="font-size: 1.8rem; font-weight: 800;">${this.state.clients.length}</div>
                            </div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr; gap: 2rem;">
                        <div class="glass-panel" style="padding: 1.5rem;">
                            <h3 style="margin-top: 0; color: var(--primary); display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-user-tie"></i> Equipa de Professores
                            </h3>
                            <div class="client-list">
                                ${this.state.teachers.map(t => `
                                    <div class="glass-card" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; background: rgba(99, 102, 241, 0.05);">
                                        <div>
                                            <strong>${t.name}</strong>
                                            <div style="font-size: 0.8rem; color: var(--text-muted);">${t.email}</div>
                                        </div>
                                        <button class="btn btn-ghost btn-sm" onclick="app.setView('users')">Gerir <i class="fas fa-chevron-right"></i></button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="glass-panel" style="padding: 1.5rem;">
                            <h3 style="margin-top: 0; color: var(--secondary); display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-user-friends"></i> Ultimos Alunos Registados
                            </h3>
                            <div class="client-list">
                                ${this.state.clients.slice(-3).reverse().map(c => `
                                    <div class="glass-card" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; background: rgba(16, 185, 129, 0.05);">
                                        <div>
                                            <strong>${c.name}</strong>
                                            <div style="font-size: 0.8rem; color: var(--text-muted);">${c.email}</div>
                                        </div>
                                        <button class="btn btn-ghost btn-sm" onclick="app.spyClient(${c.id})">Ver Ficha <i class="fas fa-chevron-right"></i></button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
                break;
            case 'users':
                container.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h2 style="margin:0;">Gestao de Contas</h2>
                        <button class="btn btn-primary" onclick="app.showAddUserModal()"><i class="fas fa-plus"></i> Novo Utilizador</button>
                    </div>

                    <div class="tab-container" style="display: flex; gap: 1rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--surface-border); padding-bottom: 0.5rem; overflow-x: auto;">
                        <button class="btn btn-ghost" id="tab-teachers" onclick="app.switchAdminTab('teachers')" style="color: var(--primary); font-weight: 600;">
                            <i class="fas fa-user-tie"></i> Professores (${(this.state.teachers || []).length})
                        </button>
                        <button class="btn btn-ghost" id="tab-clients" onclick="app.switchAdminTab('clients')" style="color: var(--secondary); font-weight: 600;">
                            <i class="fas fa-user-friends"></i> Alunos (${(this.state.clients || []).length})
                        </button>
                        <button class="btn btn-ghost" id="tab-admins" onclick="app.switchAdminTab('admins')" style="color: var(--accent); font-weight: 600;">
                            <i class="fas fa-user-shield"></i> Gestores (${(this.state.admins || []).length})
                        </button>
                    </div>

                    <div id="admin-user-list">
                        <!-- Teachers list by default -->
                        <div class="client-list">
                            ${(this.state.teachers || []).map(t => this.renderUserCard(t, 'teacher')).join('')}
                        </div>
                    </div>
                `;
                break;
            case 'qr_manager':
                this.renderQRManager(container);
                break;
            case 'exercises':
                this.renderExerciseLibrary(container);
                break;
            case 'foods':
                this.renderFoodDatabase(container);
                break;
            case 'all-clients':
                container.innerHTML = `
                    <h2 style="margin-bottom:0.5rem;">Acesso Global (Admin)</h2>
                    <p style="color:var(--text-muted); margin-bottom:1.5rem;">Como Administrador, tem acesso total a todos os alunos, independentemente do professor atribuido.</p>
                    
                    <div class="search-container">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Pesquisar aluno por nome, email ou contacto..." 
                            oninput="app.renderAdminGlobalClientsList(this.value)"
                            class="search-bar">
                    </div>

                    <div id="admin-global-clients-list" class="client-list"></div>
                `;
                this.renderAdminGlobalClientsList();
                break;
            case 'profile':
                this.renderProfileView(container);
                break;
        }
    }

    renderTeacherContent(container) {
        if (!this.hasLoadedData) {
            container.innerHTML = `<div style="padding:5rem; text-align:center;"><div class="loader" style="margin:0 auto;"></div></div>`;
            return;
        }
        const teacherClients = this.state.clients.filter(c => c.teacherId === this.currentUser.id);

        // Calcular estatisticas baseadas no mes selecionado
        const [selYear, selMonth] = this.dashboardMonth.split('-');

        let monthEvals = 0;
        Object.values(this.state.evaluations || {}).forEach(clientEvals => {
            clientEvals.forEach(ev => {
                if (ev.author === this.currentUser.name && ev.date) {
                    const parts = ev.date.split('/');
                    if (parts.length === 3) {
                        const d = parts[0].trim();
                        const m = parts[1].trim();
                        const y = parts[2].trim();
                        if (m === selMonth && y === selYear) monthEvals++;
                    }
                }
            });
        });

        let monthTraining = 0;
        Object.values(this.state.trainingPlans || {}).forEach(plan => {
            if (plan && plan.author === this.currentUser.name && plan.updatedAt) {
                const parts = plan.updatedAt.split('/');
                if (parts.length === 3) {
                    const m = parts[1].trim();
                    const y = parts[2].trim();
                    if (m === selMonth && y === selYear) monthTraining++;
                }
            }
        });

        let monthMeals = 0;
        Object.values(this.state.mealPlans || {}).forEach(plan => {
            if (plan && plan.author === this.currentUser.name && plan.updatedAt) {
                const parts = plan.updatedAt.split('/');
                if (parts.length === 3) {
                    const m = parts[1].trim();
                    const y = parts[2].trim();
                    if (m === selMonth && y === selYear) monthMeals++;
                }
            }
        });

        let monthAnamnesis = 0;
        Object.values(this.state.anamnesis || {}).forEach(entries => {
            entries.forEach(entry => {
                if (entry && entry.author === this.currentUser.name && entry.updatedAt) {
                    const parts = entry.updatedAt.split('/');
                    if (parts.length === 3) {
                        const m = parts[1].trim();
                        const y = parts[2].trim();
                        if (m === selMonth && y === selYear) monthAnamnesis++;
                    }
                }
            });
        });

        switch (this.activeView) {
            case 'dashboard':
                const displayDate = new Date(selYear, selMonth - 1);
                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                        <h2 style="margin:0;"><i class="fas fa-chart-line"></i> Dashboard Trainer</h2>
                        <div style="display:flex; align-items:center; gap:0.5rem; background:rgba(255,255,255,0.05); padding:5px 15px; border-radius:12px; border:1px solid var(--surface-border);">
                            <small style="color:var(--text-muted); font-weight:600; text-transform:uppercase; font-size:0.65rem;">Periodo:</small>
                            <input type="month" id="stats-month-picker" value="${this.dashboardMonth}" 
                                onchange="app.updateDashboardMonth(this.value)"
                                style="background:transparent; border:none; color:#fff; font-family:inherit; font-weight:600; font-size:0.9rem; outline:none; cursor:pointer; width:180px;">
                        </div>
                    </div>
                    
                    <div class="stats-grid">
                        <div class="glass-card" style="border-left: 4px solid var(--primary);">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Meus Alunos</small>
                            <div style="font-size:1.8rem; font-weight:800; color:var(--primary);">${teacherClients.length}</div>
                        </div>
                        
                        <div class="glass-card" style="border-left: 4px solid var(--accent);">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Avaliacoes</small>
                            <div style="font-size:1.8rem; font-weight:800; color:var(--accent);">${monthEvals}</div>
                        </div>

                        <div class="glass-card" style="border-left: 4px solid var(--success);">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Planos Treino</small>
                            <div style="font-size:1.8rem; font-weight:800; color:var(--success);">${monthTraining}</div>
                        </div>

                        <div class="glass-card" style="border-left: 4px solid #60a5fa;">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Planos Dieta</small>
                            <div style="font-size:1.8rem; font-weight:800; color:#60a5fa;">${monthMeals}</div>
                        </div>

                        <div class="glass-card" style="border-left: 4px solid var(--primary);">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Anamneses</small>
                            <div style="font-size:1.8rem; font-weight:800; color:var(--primary);">${monthAnamnesis}</div>
                        </div>
                    </div>

                    <div style="margin-top:2rem;">
                        <h3>Atividade de ${new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(displayDate)}</h3>
                        <p style="color:var(--text-muted); font-size:0.9rem;">Resumo de produtividade registada por si neste periodo.</p>
                    </div>
                `;
                break;
            case 'clients':
                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                        <h2 style="margin:0;">Os Meus Alunos</h2>
                    </div>
                    
                    <div class="search-container">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Pesquisar por nome..." 
                            oninput="app.renderTeacherClientsList(this.value)"
                            class="search-bar">
                    </div>

                    <div id="teacher-clients-list" class="client-list"></div>
                `;
                this.renderTeacherClientsList();
                break;
            case 'anamnesis':
                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:10px;">
                        <h2 style="margin:0;"><i class="fas fa-notes-medical"></i> Gestao de Anamneses</h2>
                        <button class="btn btn-primary" onclick="app.showAddAnamnesisModal()"><i class="fas fa-plus"></i> Nova Anamnese</button>
                    </div>
                    
                    <div class="search-container">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Pesquisar aluno ou data..." 
                            oninput="app.renderAnamnesisList(this.value)"
                            class="search-bar">
                    </div>

                    <div id="anamnesis-list" class="client-list"></div>
                `;
                this.renderAnamnesisList();
                break;
            case 'exercises':
                this.renderExerciseLibrary(container);
                break;
            case 'foods':
                this.renderFoodDatabase(container);
                break;
            case 'chat': this.renderChat(container); break;
            case 'profile': this.renderProfileView(container); break;
        }
    }

    renderExerciseLibrary(container) {
        const isAdmin = this.role === 'admin';
        const controls = isAdmin ? `
                <div style="display:flex; gap:0.5rem; flex-wrap: wrap;">
                    <button class="btn btn-secondary btn-sm" onclick="app.showManageExerciseCategoriesModal()" title="Gerir Categorias"><i class="fas fa-tags"></i> <span class="hide-mobile">Categorias</span></button>
                    <button class="btn btn-secondary btn-sm" onclick="app.exportExerciseDatabase()" title="Exportar Backup"><i class="fas fa-file-export"></i> <span class="hide-mobile">Exportar</span></button>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-exercise-input').click()" title="Importar Backup"><i class="fas fa-file-import"></i> <span class="hide-mobile">Importar</span></button>
                    <input type="file" id="import-exercise-input" style="display:none;" accept=".json" onchange="app.importExerciseDatabase(this)">
                    <button class="btn btn-accent btn-sm" onclick="app.importLocalBaseExercicios()" title="Importar base_exercicios.json"><i class="fas fa-database"></i> <span class="hide-mobile">Base JSON</span></button>
                    <button class="btn btn-primary btn-sm" onclick="app.showAddExerciseModal()"><i class="fas fa-plus"></i> <span class="hide-mobile">Novo</span></button>
                </div>` : '';

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap: wrap; gap: 1rem;">
                <h2>Biblioteca de Exercicios</h2>
                ${controls}
            </div>

            <div class="search-container">
                <i class="fas fa-search"></i>
                <input type="text" id="exercise-search-input" placeholder="Pesquisar exercicios..." 
                    oninput="app.renderExerciseList(this.value)"
                    class="search-bar">
            </div>

            <div id="exercise-list-container">
                ${this.renderExerciseListGrouped()}
            </div>
        `;
    }

    renderExerciseListGrouped(searchQuery = '') {
        const cats = this.state.exerciseCategories || ["Geral"];
        let filtered = this.state.exercises || [];

        if (searchQuery) {
            const query = this.normalizeText(searchQuery);
            filtered = filtered.filter(ex =>
                this.normalizeText(ex.name).includes(query) ||
                this.normalizeText(ex.category).includes(query) ||
                this.normalizeText(ex.muscle).includes(query)
            );
        }

        const grouped = {};
        cats.forEach(c => grouped[c] = []);
        grouped['Geral'] = grouped['Geral'] || [];

        filtered.forEach(ex => {
            const c = ex.category || 'Geral';
            if (!grouped[c]) grouped[c] = [];
            grouped[c].push(ex);
        });

        if (searchQuery && filtered.length === 0) {
            return `
                <div class="glass-card" style="text-align:center; padding:2rem;">
                    <i class="fas fa-search" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                    <p style="color:var(--text-muted);">Nenhum exercicio encontrado para "${searchQuery}"</p>
                </div>
            `;
        }

        let keys = [...cats];
        Object.keys(grouped).forEach(k => {
            if (!keys.includes(k)) keys.push(k);
        });

        return keys.map(catName => {
            const exercises = grouped[catName];
            if (!exercises || exercises.length === 0) return '';

            return `
                <div style="margin-bottom: 2rem;">
                    <h3 style="color:var(--primary); font-size:1.1rem; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px; margin-bottom:15px;">${catName}</h3>
                    <div class="video-grid">
                        ${exercises.map(ex => {
                let cleanUrl = ex.videoUrl || '';
                const hasVideo = cleanUrl && (cleanUrl.includes('youtube') || cleanUrl.includes('embed'));
                if (hasVideo && !cleanUrl.includes('modestbranding')) {
                    const params = "modestbranding=1&rel=0&showinfo=0";
                    cleanUrl += (cleanUrl.includes('?') ? '&' : '?') + params;
                }

                return `
                                <div class="glass-card" style="padding:0; overflow:hidden; position:relative; border-top: 3px solid var(--primary);">
                                    ${hasVideo ? `<iframe width="100%" height="150" src="${cleanUrl}" frameborder="0" allowfullscreen></iframe>` : `
                                        <div style="width:100%; height:150px; background:rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; flex-direction: column; gap: 10px;">
                                            ${ex.photoUrl ? `<img src="${ex.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `
                                                <i class="fas fa-video-slash" style="font-size:1.5rem; opacity: 0.3;"></i>
                                                <small style="color:var(--text-muted); font-size: 0.7rem;">Sem video disponivel</small>
                                            `}
                                        </div>
                                     `}
                <div style="padding:0.75rem;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <strong style="font-size:1rem; color:#fff;">${ex.name}</strong><br>
                                <small style="color:var(--text-muted);">${ex.muscle ? ex.muscle : (ex.category || 'Geral')}</small>
                        </div>
                        <div style="display:flex; gap:0.4rem;">
                            ${this.role === 'admin' ? `
                                                <button class="btn btn-ghost btn-sm" style="color:var(--accent); padding:5px;" onclick="app.showEditExerciseModal(${ex.id})" title="Editar">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-ghost btn-sm" style="color:var(--danger); padding:5px;" onclick="app.deleteExercise(${ex.id})" title="Eliminar">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                                ` : ''}
                        </div>
                    </div>
                </div>
                                </div >
                    `;
            }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderExerciseList(searchQuery = '') {
        const container = document.getElementById('exercise-list-container');
        if (!container) return;
        container.innerHTML = this.renderExerciseListGrouped(searchQuery);
    }

    exportExerciseDatabase() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state.exercises, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `KandalGym_Exercicios_Backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    importExerciseDatabase(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) throw new Error("Formato invalido");

                if (confirm(`Deseja importar ${imported.length} exercicios? Isso ira substituir a sua lista atual.`)) {
                    this.state.exercises = imported;
                    this.saveState();
                    this.renderContent();
                    alert('Base de exercicios importada com sucesso!');
                }
            } catch (err) {
                alert('Erro ao importar: ' + err.message);
            }
            input.value = '';
        };
        reader.readAsText(file);
    }

    async importLocalBaseExercicios() {
        if (!confirm('Deseja importar a base de exercicios local (base_exercicios.json)? Novos exercicios serao adicionados aos existentes (sem duplicar nomes).')) return;

        try {
            const res = await fetch('base_exercicios.json');
            if (!res.ok) throw new Error('Nao foi possivel carregar base_exercicios.json');

            const data = await res.json();
            let addedCount = 0;

            data.forEach(item => {
                const name = item.nome || item.name;
                if (!name) return;

                const exists = this.state.exercises.some(ex => ex.name.toLowerCase() === name.toLowerCase());
                if (!exists) {
                    this.state.exercises.push({
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        name: name,
                        videoUrl: "",
                        category: "Geral"
                    });
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                this.saveState();
                this.renderContent();
                alert(`${addedCount} novos exercicios adicionados com sucesso!`);
            } else {
                alert('Nenhum exercicio novo encontrado para adicionar.');
            }
        } catch (e) {
            alert('Erro ao importar base local: ' + e.message);
        }
    }

    showManageExerciseCategoriesModal() {
        if (!this.state.exerciseCategories) this.state.exerciseCategories = ["Geral"];

        const renderListIdx = () => {
            return this.state.exerciseCategories.map((c, idx) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);">
                    <span>${c}</span>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="app.editExerciseCategory(${idx})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.deleteExerciseCategory(${idx})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
        };

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'manage-ex-cats-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Categorias de Exercicios</h2>
                <div id="ex-cats-list-container" style="max-height:300px; overflow-y:auto; margin-bottom:1rem;">
                    ${renderListIdx()}
                </div>
                <div style="display:flex; gap:0.5rem; margin-bottom:1.5rem;">
                    <input type="text" id="new-ex-cat-name" placeholder="Nova categoria..." style="flex:1;">
                    <button class="btn btn-primary" onclick="app.addExerciseCategory()">Add</button>
                </div>
                <button class="btn btn-secondary" style="width:100%;" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    addExerciseCategory() {
        const input = document.getElementById('new-ex-cat-name');
        const name = input.value.trim();
        if (!name) return;
        if (this.state.exerciseCategories.includes(name)) return alert('Ja existe.');

        this.state.exerciseCategories.push(name);
        this.saveState();
        input.value = '';

        const container = document.getElementById('ex-cats-list-container');
        if (container) {
            container.innerHTML = this.state.exerciseCategories.map((c, idx) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);">
                    <span>${c}</span>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="app.editExerciseCategory(${idx})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.deleteExerciseCategory(${idx})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
        }
    }

    editExerciseCategory(idx) {
        const oldName = this.state.exerciseCategories[idx];
        const newName = prompt('Novo nome para a categoria:', oldName);
        if (newName && newName !== oldName) {
            this.state.exerciseCategories[idx] = newName;
            // Update exercises with this category
            this.state.exercises.forEach(ex => {
                if (ex.category === oldName) ex.category = newName;
            });
            this.saveState();
            document.getElementById('manage-ex-cats-modal').remove();
            this.showManageExerciseCategoriesModal();
        }
    }

    deleteExerciseCategory(idx) {
        const name = this.state.exerciseCategories[idx];
        if (confirm(`Tem a certeza que deseja eliminar a categoria "${name}"? Exercicios nesta categoria serao movidos para "Geral".`)) {
            this.state.exerciseCategories.splice(idx, 1);
            this.state.exercises.forEach(ex => {
                if (ex.category === name) ex.category = 'Geral';
            });
            this.saveState();
            document.getElementById('manage-ex-cats-modal').remove();
            this.showManageExerciseCategoriesModal();
        }
    }



    showEditExerciseModal(id) {
        const ex = this.state.exercises.find(e => e.id === id);
        if (!ex) return;

        const cats = this.state.exerciseCategories || ["Geral"];
        const options = cats.map(c => `<option value="${c}" ${c === ex.category ? 'selected' : ''}>${c}</option>`).join('');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        this.tempExercisePhoto = ex.photoUrl || null;

        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Editar Exercicio</h2>
                <div style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div style="text-align:center; margin-bottom:5px;">
                        <div id="edit-ex-photo-preview" style="width:120px; height:120px; border-radius:12px; border:2px dashed var(--surface-border); margin:0 auto 10px; display:flex; items-align:center; justify-content:center; overflow:hidden; background:rgba(0,0,0,0.2);">
                            ${ex.photoUrl ? `<img src="${ex.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas fa-image" style="font-size:2rem; color:var(--text-muted); align-self:center;"></i>`}
                        </div>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('edit-ex-photo-input').click()">
                            <i class="fas fa-camera"></i> Alterar Foto
                        </button>
                        <input type="file" id="edit-ex-photo-input" style="display:none;" accept="image/*" onchange="app.handleExercisePhotoUpload(this, 'edit-ex-photo-preview')">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Nome</label>
                        <input type="text" id="edit-ex-name" value="${ex.name}">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Link YouTube (opcional)</label>
                        <input type="text" id="edit-ex-url" value="${ex.videoUrl}">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Categoria</label>
                        <select id="edit-ex-category" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.2); color:#fff; border:1px solid var(--surface-border);">
                            ${options}
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-top:0.5rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.updateExercise(${id})">Atualizar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    updateExercise(id) {
        const name = document.getElementById('edit-ex-name').value.trim();
        const url = document.getElementById('edit-ex-url').value.trim();
        const cat = document.getElementById('edit-ex-category').value;

        if (!name) return alert('O nome e obrigatorio.');

        const ex = this.state.exercises.find(e => e.id === id);
        if (ex) {
            let finalUrl = "";
            if (url) {
                finalUrl = url;
                if (url.includes('watch?v=') && !url.includes('embed/')) {
                    finalUrl = url.replace('watch?v=', 'embed/');
                }
            }

            ex.name = name;
            ex.videoUrl = finalUrl;
            ex.photoUrl = this.tempExercisePhoto || '';
            ex.category = cat || 'Geral';

            this.saveState();
            document.querySelector('.modal-overlay').remove();
            this.renderContent();
            alert('Exercicio atualizado com sucesso! ');
        }
    }

    deleteExercise(id) {
        if (confirm('Tem a certeza que deseja eliminar este exercicio da biblioteca?')) {
            this.state.exercises = this.state.exercises.filter(e => e.id !== id);
            this.saveState();
            this.renderContent();
            alert('Exercicio removido. ');
        }
    }

    renderFoodDatabase(container) {
        const isAdmin = this.role === 'admin';
        const controls = isAdmin ? `
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-secondary btn-sm" onclick="app.showManageCategoriesModal()" title="Gerir Categorias"><i class="fas fa-tags"></i> <span class="hide-mobile">Categorias</span></button>
                    <button class="btn btn-secondary btn-sm" onclick="app.exportFoodDatabase()" title="Exportar Backup"><i class="fas fa-file-export"></i> <span class="hide-mobile">Exportar</span></button>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-food-input').click()" title="Importar Backup"><i class="fas fa-file-import"></i> <span class="hide-mobile">Importar</span></button>
                    <input type="file" id="import-food-input" style="display:none;" accept=".json" onchange="app.importFoodDatabase(this)">
                    <button class="btn btn-primary btn-sm" onclick="app.showAddFoodModal()"><i class="fas fa-plus"></i> <span class="hide-mobile">Novo</span></button>
                </div>` : '';

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap: wrap; gap: 1rem;">
                <h2>Base de Alimentos</h2>
                ${controls}
            </div>
            
            <div class="search-container">
                <i class="fas fa-search"></i>
                <input type="text" id="food-search-input" placeholder="Pesquisar alimentos..." 
                    oninput="app.renderFoodList(this.value)"
                    class="search-bar">
            </div>

            <div id="food-list-container" class="client-list">
                ${this.renderFoodListGrouped()}
            </div>
        `;
    }

    renderFoodListGrouped(searchQuery = '') {
        // Ensure standard categories exist if methods called directly
        const cats = this.state.foodCategories || ["Outros"];

        // Filter foods by search query
        let filteredFoods = this.state.foods;
        if (searchQuery) {
            const query = searchQuery.toLowerCase().trim();
            filteredFoods = this.state.foods.filter(f =>
                f.name.toLowerCase().includes(query) ||
                (f.category && f.category.toLowerCase().includes(query))
            );
        }

        // Group foods
        const grouped = {};
        cats.forEach(c => grouped[c] = []);
        // Also a catch-all for unknown categories
        grouped['Outros'] = [];

        filteredFoods.forEach(f => {
            const c = f.category || 'Outros';
            if (grouped[c]) {
                grouped[c].push(f);
            } else {
                // If category deleted or mismatch, put in Outros or create new key? 
                // Let's put in 'Outros' or create key if we want to show it.
                // Better: Create key on fly.
                if (!grouped[c]) grouped[c] = [];
                grouped[c].push(f);
            }
        });

        // Sort keys to respect order in state, plus any extras sorted alpha
        let keys = [...cats];
        Object.keys(grouped).forEach(k => {
            if (!keys.includes(k)) keys.push(k);
        });

        // Show message if no results
        if (searchQuery && filteredFoods.length === 0) {
            return `
                <div class="glass-card" style="text-align:center; padding:2rem;">
                    <i class="fas fa-search" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                    <p style="color:var(--text-muted);">Nenhum alimento encontrado para "${searchQuery}"</p>
                </div>
            `;
        }

        return keys.map(catName => {
            const foods = grouped[catName];
            if (!foods || foods.length === 0) return ''; // Skip empty categories? Or show empty header? Skipping for clean look.

            return `
                <div style="margin-bottom: 2rem;">
                    <h3 style="color:var(--primary); font-size:1.1rem; border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:10px;">${catName}</h3>
                    ${foods.map(f => `
                        <div class="glass-card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem;">
                            <div>
                                <strong>${f.name}</strong>
                                <div style="font-size:0.8rem; color:var(--text-muted);">
                                    ${f.kcal} kcal | P: ${f.protein}g | C: ${f.carbs}g | G: ${f.fat}g (por 100g)
                                    ${f.portionWeight ? ` | Unidade: ${f.portionWeight}g` : ''}
                                </div>
                            </div>
                            <div style="display:flex; gap:0.5rem;">
                                ${this.role === 'admin' ? `
                                <button class="btn btn-ghost" style="color:var(--accent);" onclick="app.showEditFoodModal(${f.id})"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-ghost" style="color:var(--danger);" onclick="app.deleteFood(${f.id})"><i class="fas fa-trash"></i></button>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }).join('');
    }

    renderFoodList(searchQuery = '') {
        const container = document.getElementById('food-list-container');
        if (!container) return;
        container.innerHTML = this.renderFoodListGrouped(searchQuery);
    }

    deleteFood(id) {
        if (confirm('Apagar este alimento?')) {
            this.state.foods = this.state.foods.filter(f => f.id !== id);
            this.saveState();
            this.renderContent();
        }
    }

    exportFoodDatabase() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state.foods, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `KandalGym_Alimentos_Backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    importFoodDatabase(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedFoods = JSON.parse(e.target.result);
                if (!Array.isArray(importedFoods)) throw new Error("Formato invalido");

                if (confirm(`Deseja importar ${importedFoods.length} alimentos ? Isso ira substituir a sua lista atual.`)) {
                    this.state.foods = importedFoods;
                    this.saveState();
                    this.renderContent();
                    alert('Base de alimentos importada com sucesso!');
                }
            } catch (err) {
                alert('Erro ao importar ficheiro: ' + err.message);
            }
            input.value = ''; // Reset input
        };
        reader.readAsText(file);
    }

    showManageCategoriesModal() {
        if (!this.state.foodCategories) this.state.foodCategories = [];

        const renderList = () => {
            return this.state.foodCategories.map((c, idx) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #eee;">
                    <span>${c}</span>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="app.editCategory(${idx})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.deleteCategory(${idx})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
        };

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'manage-categories-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-height:80vh; overflow-y:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h2 style="margin:0;">Gerir Categorias</h2>
                    <button class="btn btn-primary btn-sm" onclick="app.addCategoryFromModal()"><i class="fas fa-plus"></i> Nova</button>
                </div>
                <div id="categories-list-container">
                    ${renderList()}
                </div>
                <div style="margin-top:1.5rem; text-align:right;">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove(); app.renderContent();">Fechar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    addCategoryFromModal() {
        const newCat = prompt("Nome da nova categoria:");
        if (newCat && newCat.trim()) {
            const catName = newCat.trim();
            if (!this.state.foodCategories.includes(catName)) {
                this.state.foodCategories.push(catName);
                this.saveState();
                this.refreshCategoriesModal();
            } else {
                alert('Categoria ja existe.');
            }
        }
    }

    editCategory(idx) {
        const oldName = this.state.foodCategories[idx];
        const newName = prompt("Novo nome para a categoria:", oldName);
        if (newName && newName.trim() && newName !== oldName) {
            const finalName = newName.trim();
            if (this.state.foodCategories.includes(finalName)) return alert('Nome ja existe.');

            this.state.foodCategories[idx] = finalName;

            // Update foods with this category
            this.state.foods.forEach(f => {
                if (f.category === oldName) f.category = finalName;
            });

            this.saveState();
            this.refreshCategoriesModal();
        }
    }

    deleteCategory(idx) {
        const catName = this.state.foodCategories[idx];
        if (confirm(`Tem a certeza que deseja eliminar a categoria "${catName}"? Os alimentos ficarao como "Outros".`)) {
            this.state.foodCategories.splice(idx, 1);

            // Reassign foods to 'Outros' (or just leave them, but safest to mark as Outros or let them fall to default)
            // Let's explicitly set to 'Outros' so they don't get lost
            this.state.foods.forEach(f => {
                if (f.category === catName) f.category = 'Outros';
            });

            this.saveState();
            this.refreshCategoriesModal();
        }
    }

    refreshCategoriesModal() {
        const container = document.getElementById('categories-list-container');
        if (container) {
            container.innerHTML = this.state.foodCategories.map((c, idx) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #eee;">
                    <span>${c}</span>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="app.editCategory(${idx})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.deleteCategory(${idx})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
        }
    }

    showEditFoodModal(id) {
        const food = this.state.foods.find(f => f.id === id);
        if (!food) return;

        const cats = this.state.foodCategories || [];
        // Ensure current category is in the list of options to render, temporarily if needed
        let renderCats = [...cats];
        if (food.category && !renderCats.includes(food.category)) {
            renderCats.push(food.category);
        }

        const options = renderCats.map(c =>
            `<option value="${c}" ${food.category === c ? 'selected' : ''}>${c}</option>`
        ).join('');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Editar Alimento</h2>
                <div style="display:flex; flex-direction:column; gap:1rem;">
                    <div>
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Nome</label>
                        <input type="text" id="edit-food-name" value="${food.name}">
                    </div>

                    <div>
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Categoria</label>
                        <select id="edit-food-category" style="width:100%; padding:8px; border-radius:8px; border:1px solid #ccc;">
                            ${options}
                        </select>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem;">
                        <div>
                            <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Kcal/100g</label>
                            <input type="number" id="edit-food-kcal" value="${food.kcal}">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Prot/100g</label>
                            <input type="number" id="edit-food-prot" value="${food.protein}">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Carb/100g</label>
                            <input type="number" id="edit-food-carb" value="${food.carbs}">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Gord/100g</label>
                            <input type="number" id="edit-food-fat" value="${food.fat}">
                    </div>
                </div>
                <div>
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Peso por Unidade (g/ml)</label>
                    <input type="number" id="edit-food-portion" value="${food.portionWeight || ''}" placeholder="Ex: 80">
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-top:0.5rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.updateFood(${id})">Atualizar</button>
                    </div>
                </div>
            </div>
            `;
        document.body.appendChild(modal);
    }

    updateFood(id) {
        const name = document.getElementById('edit-food-name').value;
        const category = document.getElementById('edit-food-category').value;
        const kcal = document.getElementById('edit-food-kcal').value;
        const prot = document.getElementById('edit-food-prot').value;
        const carb = document.getElementById('edit-food-carb').value;
        const fat = document.getElementById('edit-food-fat').value;
        const portion = document.getElementById('edit-food-portion').value;

        if (!name) return alert('Insira o nome.');

        const food = this.state.foods.find(f => f.id === id);
        if (food) {
            food.name = name;
            food.category = category || 'Outros';
            food.kcal = Number(kcal) || 0;
            food.protein = Number(prot) || 0;
            food.carbs = Number(carb) || 0;
            food.fat = Number(fat) || 0;
            food.portionWeight = Number(portion) || null;

            this.saveState();
            document.querySelector('.modal-overlay').remove();
            this.renderContent();
            alert('Alimento atualizado com sucesso! ');
        }
    }

    renderTrainingView(container, clientId) {
        const c = this.state.clients.find(x => x.id == clientId);
        if (!c) {
            container.innerHTML = '<p class="text-muted">Erro: Cliente nao encontrado.</p>';
            return;
        }

        const plans = this.getTrainingDays(clientId);

        const isTeacher = this.role === 'teacher' || this.role === 'admin';
        const isClient = this.role === 'client';

        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2>Plano de Treino</h2>
                    <h3 class="client-name">${c.name}</h3>
                </div>
                <div class="header-actions">
                    <button class="btn btn-secondary btn-sm" onclick="app.downloadTrainingPDF('${clientId}')" title="Download PDF"><i class="fas fa-file-pdf"></i> <span class="hide-mobile">PDF</span></button>
                    ${isClient ? `<button class="btn btn-secondary btn-sm" onclick="app.setView('training_history')"><i class="fas fa-history"></i> <span class="hide-mobile">Historico</span></button>` : ''}
                    ${isTeacher ? `
                        <button class="btn btn-primary btn-sm" onclick="app.openTrainingEditor('${clientId}')"><i class="fas fa-edit"></i> <span class="hide-mobile">Gerir</span></button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger); border:1px solid rgba(220, 38, 38, 0.2);" onclick="app.deleteTrainingPlan('${clientId}')">
                            <i class="fas fa-trash"></i> <span class="hide-mobile">Eliminar</span>
                        </button>
                    ` : ''}
                    ${this.role !== 'client' ? `<button class="btn btn-secondary btn-sm" onclick="app.setView(app.role === 'admin' ? 'all-clients' : 'clients')"><i class="fas fa-arrow-left"></i> <span class="hide-mobile">Voltar</span></button>` : ''}
                </div>
            </div>

            ${plans && plans.length ? plans.map((day, dIdx) => `
                <div class="glass-panel" style="padding:1.5rem; margin-bottom:1.5rem;">
                    <h3 style="color:var(--primary); margin-bottom:1.25rem; display:flex; align-items:center; gap:0.6rem; border-bottom:1px solid var(--surface-border); padding-bottom:0.75rem;">
                        <i class="fas fa-calendar-day"></i> ${day.title}
                    </h3>
                    <div style="display:grid; grid-template-columns: 1fr; gap:1.25rem;">
                        ${day.exercises.map((ex, exIdx) => {
            const numSets = parseInt(ex.sets) || 0;
            // Busca robusta: primeiro por ID, fallback por nome se o ID nao encontrar
            let libEx = this.state.exercises.find(le => le.id == ex.id);
            if (!libEx && ex.name) {
                libEx = this.state.exercises.find(le => le.name.toLowerCase() === ex.name.toLowerCase());
            }

            return `
                            <div class="glass-card" style="margin-bottom:0; background:rgba(255,255,255,0.02); padding: 1rem;">
                                <div style="display:flex; align-items:center; gap:12px; margin-bottom:0.75rem;">
                                    <!-- Miniatura do Exercicio -->
                                    <div style="width:55px; height:55px; border-radius:10px; overflow:hidden; background:rgba(0,0,0,0.3); flex-shrink:0; display:flex; align-items:center; justify-content:center; border: 1px solid var(--surface-border); box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
                                        ${libEx && libEx.photoUrl ?
                    `<img src="${libEx.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` :
                    `<div style="font-size:1.5rem; opacity:0.6;">${this.getExerciseIcon(libEx ? libEx.muscle : '')}</div>`
                }
                                    </div>

                                    <div style="min-width: 0; flex: 1;">
                                        <strong style="font-size:1rem; display:block; margin-bottom:2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #fff;">${ex.name}</strong>
                                        <div style="color:var(--text-muted); font-size:0.85rem; font-weight: 600;">
                                            <span style="color: var(--primary);"><i class="fas fa-redo"></i> ${ex.sets} x ${ex.reps}</span>
                                            ${ex.observations ? `<br><small style="color:var(--accent); font-size: 0.75rem; font-weight: 400;"><i class="fas fa-info-circle"></i> ${ex.observations}</small>` : ''}
                                        </div>
                                    </div>

                                    ${libEx && libEx.videoUrl ? `
                                        <button class="btn btn-ghost btn-sm" onclick="app.viewExerciseVideo('${libEx.videoUrl}', '${ex.name}')" 
                                            style="color:var(--primary); background:rgba(145,27,43,0.1); padding: 8px 12px; font-size: 0.75rem; flex-shrink: 0; border-radius: 8px; border: 1px solid rgba(145,27,43,0.2);">
                                            <i class="fas fa-video"></i> <span class="hide-mobile" style="margin-left:4px;">Video</span>
                                        </button>
                                    ` : ''}
                                </div>

                                ${isClient ? `
                                    <div style="margin-top:0.75rem; padding-top:0.75rem; border-top:1px dashed rgba(255,255,255,0.08);">
                                        <label style="display:block; font-size:0.65rem; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">Cargas (kg)</label>
                                        <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
                                            ${Array.from({ length: numSets }).map((_, sIdx) => {
                    const val = (ex.weightLog && ex.weightLog[sIdx]) || '';
                    return `
                                                <div style="flex:1; min-width:45px; max-width:60px;">
                                                    <small style="display:block; text-align:center; font-size:0.6rem; color:var(--text-muted); margin-bottom:1px;">S${sIdx + 1}</small>
                                                    <input type="number" value="${val}" placeholder="0" 
                                                        onblur="app.logWeight(${clientId}, ${dIdx}, ${exIdx}, ${sIdx}, this.value)"
                                                        style="width:100%; height:32px; background:rgba(0,0,0,0.3); border:1px solid var(--surface-border); border-radius:6px; color:#fff; text-align:center; font-size:0.85rem;">
                                                </div>
                                                `;
                }).join('')}
                                        </div>
                                        <div style="margin-top:0.75rem;">
                                            <textarea id="note-${clientId}-${dIdx}-${exIdx}" 
                                                onblur="app.saveExerciseNote(${clientId}, ${dIdx}, ${exIdx}, this.value)"
                                                placeholder="Notas (ex: senti leve...)"
                                                style="width:100%; min-height:45px; background:rgba(0,0,0,0.3); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:8px; font-size:0.85rem; resize:vertical; font-family:inherit;">${ex.clientNotes || ''}</textarea>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                            `;
        }).join('')}
                    </div>

                    ${isClient ? `
                        <div style="margin-top:2rem; text-align:center;">
                            <button class="btn btn-primary" onclick="app.finishWorkout(${clientId}, ${dIdx})" style="width:100%; height:55px; font-size:1.1rem; box-shadow:0 4px 15px rgba(145,27,43,0.3);">
                                <i class="fas fa-check-circle"></i> Concluir Treino (${day.title})
                            </button>
                            <p style="font-size:0.75rem; color:var(--text-muted); margin-top:10px;">
                                Ao concluir, os pesos registados serao gravados no seu historico.
                            </p>
                        </div>
                    ` : ''}
                </div>
            `).join('') : `
                <div class="glass-panel" style="padding:3rem 1rem; text-align:center;">
                    <i class="fas fa-dumbbell" style="font-size:3rem; color:var(--text-muted); opacity:0.3; margin-bottom:1rem;"></i>
                    <p style="color:var(--text-muted); margin-bottom:1.5rem;">Ainda nao tem plano de treino atribuido.</p>
                    ${isTeacher ? `<button class="btn btn-primary" onclick="app.openTrainingEditor('${clientId}')"><i class="fas fa-plus"></i> Criar Plano de Treino</button>` : ''}
                </div>
            `}
        `;
    }

    // Helper central: extrai sempre um array de dias independentemente do formato gravado
    getTrainingDays(clientId) {
        const cid = String(clientId); // Firebase usa sempre chaves de string
        const raw = this.state.trainingPlans ? this.state.trainingPlans[cid] : null;
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (raw.days && Array.isArray(raw.days)) return raw.days;
        if (typeof raw === 'object') return Object.values(raw).filter(v => v && typeof v === 'object' && v.exercises);
        return [];
    }

    finishWorkout(clientId, dayIdx) {
        const cid = String(clientId);
        const days = this.getTrainingDays(cid);
        const day = days ? days[dayIdx] : null;
        if (!day) { alert('Dia de treino nao encontrado. Tente recarregar a pagina.'); return; }

        const hasWeights = day.exercises.some(ex => ex.weightLog && ex.weightLog.some(w => w !== '' && w !== null && w !== undefined));

        if (!hasWeights) {
            // Usar modal customizado  confirm() e bloqueado em PWA/standalone iOS
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width:380px; text-align:center; padding:2rem;">
                    <div style="font-size:3rem; margin-bottom:1rem;"></div>
                    <h3 style="margin:0 0 0.75rem;">Sem cargas registadas</h3>
                    <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">Nao registou nenhuma carga neste treino. Deseja conclui-lo na mesma?</p>
                    <div style="display:flex; gap:1rem;">
                        <button class="btn btn-secondary" style="flex:1;" onclick="this.closest('.modal-overlay').remove()">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                        <button class="btn btn-primary" style="flex:1;" id="confirm-finish-btn">
                            <i class="fas fa-check"></i> Concluir
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            document.getElementById('confirm-finish-btn').onclick = () => {
                modal.remove();
                this.doFinishWorkout(cid, dayIdx, day);
            };
        } else {
            this.doFinishWorkout(cid, dayIdx, day);
        }
    }

    doFinishWorkout(cid, dayIdx, day) {
        try {
            if (!this.state.trainingHistory) this.state.trainingHistory = {};
            if (!this.state.trainingHistory[cid] || !Array.isArray(this.state.trainingHistory[cid])) {
                this.state.trainingHistory[cid] = [];
            }

            const session = {
                date: new Date().toLocaleDateString('pt-PT'),
                time: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
                title: day.title,
                exercises: day.exercises.map(ex => ({
                    name: ex.name,
                    sets: ex.sets,
                    reps: ex.reps,
                    weights: [...(ex.weightLog || [])]
                }))
            };

            this.state.trainingHistory[cid].unshift(session);
            this.saveState();

            this.showToast('Treino concluido!  As suas cargas foram gravadas no historico.');
            setTimeout(() => this.setView('dashboard'), 1200);
        } catch (err) {
            console.error('Erro ao concluir treino:', err);
            alert('Ocorreu um erro ao guardar. Por favor tente novamente.');
        }
    }

    deleteTrainingSession(index) {
        if (confirm('Tem a certeza que deseja eliminar este treino do historico?')) {
            const history = this.state.trainingHistory[this.currentClientId];
            if (history) {
                history.splice(index, 1);
                this.saveState();
                this.renderContent();
            }
        }
    }

    logWeight(clientId, dayIdx, exIdx, setIdx, value) {
        const days = this.getTrainingDays(clientId);
        if (!days[dayIdx] || !days[dayIdx].exercises[exIdx]) return;

        const ex = days[dayIdx].exercises[exIdx];
        if (!ex.weightLog) ex.weightLog = [];
        ex.weightLog[setIdx] = value;
        // Guardar diretamente na estrutura de estado para persistir
        const cid = String(clientId);
        const raw = this.state.trainingPlans[cid];
        if (raw && raw.days) raw.days[dayIdx].exercises[exIdx] = ex;
        this.saveState();
    }

    saveExerciseNote(clientId, dayIdx, exIdx, note) {
        const days = this.getTrainingDays(clientId);
        if (!days[dayIdx] || !days[dayIdx].exercises[exIdx]) return;

        const ex = days[dayIdx].exercises[exIdx];
        ex.clientNotes = note;
        const cid = String(clientId);
        const raw = this.state.trainingPlans[cid];
        if (raw && raw.days) raw.days[dayIdx].exercises[exIdx] = ex;
        this.saveState();
    }

    viewExerciseVideo(url, name) {
        let cleanUrl = url;
        const params = "autoplay=1&modestbranding=1&rel=0";
        cleanUrl += (cleanUrl.includes('?') ? '&' : '?') + params;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay animate-fade-in';
        modal.innerHTML = `
            <div class="glass-panel animate-scale-up" style="max-width:800px; width:95%; padding:1rem; position:relative;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; padding:0 0.5rem;">
                    <h3 style="margin:0; font-size:1.2rem;">${name}</h3>
                    <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:12px; background:#000;">
                    <iframe src="${cleanUrl}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen
                        style="position:absolute; top:0; left:0; width:100%; height:100%;"></iframe>
                </div>
            </div>
            `;
        document.body.appendChild(modal);
    }

    openTrainingEditor(clientId) {
        clientId = Number(clientId);
        // Verificar se existe um rascunho pendente
        const draft = localStorage.getItem('kandalgym_training_draft');
        if (draft) {
            const draftData = JSON.parse(draft);
            if (draftData.clientId === clientId) {
                if (confirm('Detetamos um rascunho nao guardado deste treino. Deseja recupera-lo?')) {
                    this.editingPlan = draftData.plan;
                    this.editingClientId = clientId;
                    this.setView('edit_training');
                    return;
                } else {
                    localStorage.removeItem('kandalgym_training_draft');
                }
            }
        }

        const rawPlan = this.state.trainingPlans[clientId];
        let existingDays = [];

        if (rawPlan) {
            if (Array.isArray(rawPlan)) {
                existingDays = rawPlan;
            } else if (rawPlan.days && Array.isArray(rawPlan.days)) {
                existingDays = rawPlan.days;
            } else if (typeof rawPlan === 'object') {
                existingDays = Object.values(rawPlan).filter(v => v && typeof v === 'object' && v.exercises);
            }
        }

        this.editingPlan = JSON.parse(JSON.stringify(existingDays));

        if (!Array.isArray(this.editingPlan) || this.editingPlan.length === 0) {
            this.editingPlan = [{ title: 'Dia 1', exercises: [] }];
        }

        this.editingClientId = clientId;
        this.setView('edit_training');
    }

    saveTrainingDraft() {
        if (this.activeView !== 'edit_training') return;
        const draftData = {
            clientId: this.editingClientId,
            plan: this.editingPlan,
            timestamp: Date.now()
        };
        localStorage.setItem('kandalgym_training_draft', JSON.stringify(draftData));
    }

    clearTrainingDraft() {
        localStorage.removeItem('kandalgym_training_draft');
    }

    renderTrainingEditor() {
        const container = document.getElementById('main-content');
        if (!container) return;
        const c = this.state.clients.find(x => x.id === this.editingClientId);

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2 style="margin:0;">Editar Treino: ${c.name}</h2>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-ghost" style="color:var(--danger);" onclick="app.deleteTrainingPlan(app.editingClientId)"><i class="fas fa-trash"></i> Eliminar</button>
                    <button class="btn btn-secondary" onclick="app.clearTrainingDraft(); app.setView('spy_view')">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.saveTrainingPlan()"><i class="fas fa-save"></i> Guardar Plano</button>
                </div>
            </div>

            <div style="margin-bottom:1.5rem; display:flex; gap:1rem; align-items:center; flex-wrap: wrap;">
                <div>
                    <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase;">Objetivo do Plano</label>
                    <input type="text" id="edit-training-goal" value="${c.goal || ''}" placeholder="Ex: Hipertrofia, Reducao de Massa Gorda..."
                        onchange="app.state.clients.find(x => x.id === app.editingClientId).goal = this.value; app.saveState();"
                        style="width:300px; height:40px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:0 12px; font-size:0.95rem;">
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem; align-self: flex-end;">
                    <strong style="color:var(--text-muted);">Dias:</strong>
                    <button class="btn btn-secondary btn-sm" onclick="app.addTrainingDay()"><i class="fas fa-plus"></i> Adicionar Dia</button>
                </div>
            </div>

            <div id="editor-days-container">
                ${this.editingPlan.map((day, dIdx) => `
                    <div class="glass-panel" style="padding:1.5rem; margin-bottom:1.5rem; border-top: 4px solid var(--primary);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                            <input type="text" value="${day.title === 'Pendente' ? '' : day.title}" 
                                placeholder="Nome do Plano (ex: Treino A)..."
                                oninput="app.editingPlan[${dIdx}].title = this.value; app.saveTrainingDraft();"
                                style="font-weight:700; font-size:1.2rem; background:transparent; border:none; border-bottom:1px solid var(--surface-border); width:100%; max-width:400px; padding:5px 0; color:#fff; outline:none;">
                            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.removeTrainingDay(${dIdx})">
                                <i class="fas fa-trash"></i> Remover Dia
                            </button>
                        </div>

                        <div id="day-${dIdx}-exercises">
                            ${day.exercises.map((ex, eIdx) => `
                                <div class="glass-card" style="padding:1.5rem; margin-bottom:1.5rem; background:rgba(255,255,255,0.03); border-left:4px solid var(--secondary);">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                                        <div style="flex:1; margin-right:1rem;">
                                            <label style="display:block; font-size:0.8rem; color:var(--accent); font-weight:600; text-transform:uppercase; margin-bottom:6px;">Exercicio Selecionado</label>
                                            <button class="btn btn-secondary exercise-search-btn" onclick="app.showExerciseSelectionModal(${dIdx}, ${eIdx})" 
                                                style="width:100%; height:45px; background:#1e293b; color:#fff; border:1px solid var(--surface-border); border-radius:10px; padding:0 15px; font-size:1rem; cursor:pointer; text-align:left; display:flex; align-items:center; gap:10px; justify-content:flex-start;">
                                                <i class="fas fa-search" style="color:var(--primary);"></i>
                                                <span id="ex-name-display-${dIdx}-${eIdx}" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                                    ${ex.name || '-- Selecionar Exercicio --'}
                                                </span>
                                            </button>
                                        </div>
                                        <button class="btn btn-ghost" style="color:var(--danger); padding:0.5rem; align-self:flex-end;" onclick="app.removeExerciseFromEditor(${dIdx}, ${eIdx})" title="Remover Exercicio">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                    
                                    <div style="display:grid; grid-template-columns: 100px 100px 1fr; gap:1.25rem;">
                                        <div>
                                            <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">Series</label>
                                            <input type="text" value="${ex.sets || ''}" placeholder="Ex: 4" onchange="app.updateEditorExercise(${dIdx}, ${eIdx}, 'sets', this.value)"
                                                style="width:100%; height:45px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:0 10px; text-align:center; font-size:1.1rem; font-weight:600;">
                                        </div>
                                        <div>
                                            <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">Reps</label>
                                            <input type="text" value="${ex.reps || ''}" placeholder="Ex: 12" onchange="app.updateEditorExercise(${dIdx}, ${eIdx}, 'reps', this.value)"
                                                style="width:100%; height:45px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:0 10px; text-align:center; font-size:1.1rem; font-weight:600;">
                                        </div>
                                        <div>
                                            <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">Observacoes (opcional)</label>
                                            <input type="text" value="${ex.observations || ''}" placeholder="Ex: Foco na descida controlada" onchange="app.updateEditorExercise(${dIdx}, ${eIdx}, 'observations', this.value)"
                                                style="width:100%; height:45px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:0 15px; font-size:1rem;">
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn btn-ghost btn-sm" style="color:var(--primary);" onclick="app.addExerciseToEditor(${dIdx})">
                            <i class="fas fa-plus"></i> Adicionar Exercicio
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    addTrainingDay() {
        this.editingPlan.push({ title: '', exercises: [] });
        this.saveTrainingDraft();
        this.renderTrainingEditor();
    }

    removeTrainingDay(idx) {
        if (confirm('Deseja remover este dia de treino e todos os exercicios associados?')) {
            this.editingPlan.splice(idx, 1);
            this.saveTrainingDraft();
            this.renderTrainingEditor();
        }
    }

    addExerciseToEditor(dayIdx) {
        this.editingPlan[dayIdx].exercises.push({ id: '', name: '', sets: '', reps: '', observations: '' });
        this.saveTrainingDraft();
        this.renderTrainingEditor();
    }

    removeExerciseFromEditor(dayIdx, exIdx) {
        this.editingPlan[dayIdx].exercises.splice(exIdx, 1);
        this.saveTrainingDraft();
        this.renderTrainingEditor();
    }

    updateEditorExercise(dayIdx, exIdx, field, value) {
        if (field === 'id') {
            const libEx = this.state.exercises.find(x => x.id == value);
            this.editingPlan[dayIdx].exercises[exIdx].id = value;
            this.editingPlan[dayIdx].exercises[exIdx].name = libEx ? libEx.name : '';
        } else {
            this.editingPlan[dayIdx].exercises[exIdx][field] = value;
        }
        this.saveTrainingDraft();
    }

    saveTrainingPlan() {
        // Filtrar exercicios sem ID (linhas em branco que o utilizador nao preencheu)
        const cleanDays = this.editingPlan
            .map(day => ({
                ...day,
                exercises: day.exercises.filter(ex => ex.id)
            }))
            .filter(day => day.exercises.length > 0 || this.editingPlan.length === 1);

        // Guardar como objeto estruturado para evitar corrompimento no Firebase
        const planObject = {
            days: cleanDays,
            author: this.currentUser.name,
            updatedAt: new Date().toLocaleDateString('pt-PT')
        };

        this.state.trainingPlans[this.editingClientId] = planObject;
        this.saveState();

        // Notificar o aluno do novo plano de treino (sem gravar novamente)
        this.addAppNotification(this.editingClientId, 'Novo Plano de Treino!', 'O seu professor atualizou o seu plano de treino.', null, 'notification', false);

        this.clearTrainingDraft();
        this.showSharePlanModal(this.editingClientId, 'training');
    }

    deleteTrainingPlan(clientId) {
        if (confirm('Tem a certeza que deseja eliminar todo o plano de treino deste aluno?')) {
            this.state.trainingPlans[clientId] = [];
            this.saveState();
            this.clearTrainingDraft();
            this.renderContent();
            alert('Plano de treino eliminado com sucesso! ');
        }
    }

    renderMealView(container, clientId) {
        // Usar comparacao loosa (==) para garantir que encontra mesmo se for string vs number
        const c = this.state.clients.find(x => x.id == clientId);
        if (!c) {
            container.innerHTML = '<p class="text-muted">Erro: Cliente nao encontrado.</p>';
            return;
        }
        const cid = String(clientId); // Firebase normaliza chaves para string
        const meal = this.state.mealPlans[cid];
        const canEdit = (this.role === 'admin' || this.role === 'teacher');

        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2>Plano Alimentar</h2>
                    <h3 class="client-name">${c.name}</h3>
                    ${meal && meal.author ? `<small style="color:var(--text-muted); display:block; margin-top:5px;">Criado por: ${meal.author} em ${meal.updatedAt || ''}</small>` : ''}
                </div>
                <div class="header-actions">
                    <button class="btn btn-secondary btn-sm" onclick="app.downloadMealPDF('${c.id}')" title="Download PDF"><i class="fas fa-file-pdf"></i> <span class="hide-mobile">PDF</span></button>
                    ${canEdit ? `
                        <button class="btn btn-primary btn-sm" onclick="app.openMealEditor('${c.id}')"><i class="fas fa-edit"></i> <span class="hide-mobile">Gerir</span></button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger); border:1px solid rgba(220, 38, 38, 0.2);" onclick="app.deleteMealPlan('${c.id}')">
                            <i class="fas fa-trash"></i> <span class="hide-mobile">Eliminar</span>
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="app.setView(app.role === 'admin' ? 'all-clients' : 'clients')"><i class="fas fa-arrow-left"></i> <span class="hide-mobile">Voltar</span></button>
                    ` : ''}
                </div>
            </div>
            <div class="glass-panel" style="padding:1.5rem;">
                ${(() => {
                const dailyTotal = { kcal: 0, prot: 0, carb: 0, fat: 0 };
                const mealsHtml = meal?.meals && meal.meals.length ? meal.meals.map(m => {
                    const mTotal = this.getNutritionFromText(m.items);
                    dailyTotal.kcal += mTotal.kcal;
                    dailyTotal.prot += mTotal.prot;
                    dailyTotal.carb += mTotal.carb;
                    dailyTotal.fat += mTotal.fat;

                    return `
                            <div class="glass-card" style="margin-bottom:1rem;">
                                <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem; align-items: center;">
                                    <strong style="color:var(--primary); font-size: 1rem;">${m.time} - ${m.name}</strong>
                                    <i class="fas fa-utensils" style="color:var(--text-muted); font-size:0.75rem;"></i>
                                </div>
                                <div style="font-size:0.9rem; white-space: pre-wrap; line-height: 1.5; color: #e2e8f0;">${m.items}</div>
                                ${mTotal.kcal > 0 ? `
                                    <div class="nutrition-summary">
                                        <span class="nu-tag nu-kcal"><strong>${Math.round(mTotal.kcal)}</strong> kcal</span>
                                        <span class="nu-tag nu-prot"><strong>${Math.round(mTotal.prot)}g</strong> Prot</span>
                                        <span class="nu-tag nu-carb"><strong>${Math.round(mTotal.carb)}g</strong> Carb</span>
                                        <span class="nu-tag nu-fat"><strong>${Math.round(mTotal.fat)}g</strong> Gord</span>
                                    </div>
                                ` : ''}
                            </div>
                        `;
                }).join('') : `
                        <div style="text-align:center; padding:3rem 1rem;">
                            <i class="fas fa-utensils" style="font-size:3rem; color:var(--text-muted); opacity:0.3; margin-bottom:1rem;"></i>
                            <p style="color:var(--text-muted); margin-bottom:1.5rem;">Ainda nao tem plano alimentar atribuido.</p>
                            ${canEdit ? `<button class="btn btn-primary" onclick="app.openMealEditor('${c.id}')"><i class="fas fa-plus"></i> Criar Plano Alimentar</button>` : ''}
                        </div>
                    `;

                return (dailyTotal.kcal > 0 ? `
                        <div class="daily-macros-bar">
                            <div class="macro-box"><small>Kcal Total</small><strong>${Math.round(dailyTotal.kcal)}</strong></div>
                            <div class="macro-box"><small>Proteina</small><strong>${Math.round(dailyTotal.prot)}g</strong></div>
                            <div class="macro-box"><small>Hidratos</small><strong>${Math.round(dailyTotal.carb)}g</strong></div>
                            <div class="macro-box"><small>Gordura</small><strong>${Math.round(dailyTotal.fat)}g</strong></div>
                        </div>
                    ` : '') + mealsHtml;
            })()}
            </div>
        `;
    }

    openMealEditor(clientId) {
        // Se o clientId vier vazio, tenta usar o currentClientId (o aluno que esta a ser visto)
        const finalId = clientId || this.currentClientId;
        if (!finalId) return alert("Erro: Nao foi possivel identificar o aluno.");

        const cid = String(finalId);
        this.editingClientId = Number(finalId);
        this.currentClientId = Number(finalId); // Sincroniza ambos

        if (!this.state.mealPlans) this.state.mealPlans = {};

        let existing = this.state.mealPlans[cid];
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
            existing = { title: 'Plano Alimentar', meals: [] };
        }

        // Garantir estrutura minima para evitar erros de renderizacao
        if (!existing.meals) existing.meals = [];
        existing.meals = existing.meals.filter(m => m !== null);
        existing.meals.forEach(m => {
            m.items = m.items || '';
            m.time = m.time || '08:00';
            m.name = m.name || 'Refeicao';
        });

        this.editingMeal = JSON.parse(JSON.stringify(existing));
        this.setView('edit_meal');
    }

    renderMealEditor() {
        const container = document.getElementById('main-content');
        if (!container) return;

        try {
            // Se o ID de edicao sumiu, tenta recuperar do ID atual da ficha
            if (!this.editingClientId && this.currentClientId) {
                this.editingClientId = this.currentClientId;
            }

            if (!this.editingClientId) {
                throw new Error("ID do aluno nao identificado. Por favor, volte a ficha do aluno e tente novamente.");
            }

            const c = this.state.clients.find(x => Number(x.id) === Number(this.editingClientId));
            if (!c) throw new Error(`Aluno com ID ${this.editingClientId} nao encontrado.`);

            // Garantir que a estrutura basica existe
            if (!this.editingMeal.meals) this.editingMeal.meals = [];
            this.editingMeal.meals = this.editingMeal.meals.filter(m => m !== null);
            if (!this.state.foods) this.state.foods = [];

            container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2 style="margin:0;">Editar Dieta: ${c.name}</h2>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-ghost" style="color:var(--danger);" onclick="app.deleteMealPlan(app.editingClientId)"><i class="fas fa-trash"></i> Eliminar</button>
                    <button class="btn btn-secondary" onclick="app.setView('spy_view')">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.saveMealPlan()"><i class="fas fa-save"></i> Guardar Dieta</button>
                </div>
            </div>

            <div class="glass-panel" style="padding:2rem;">
                ${(() => {
                    const dailyTotal = { kcal: 0, prot: 0, carb: 0, fat: 0 };
                    this.editingMeal.meals.forEach(m => {
                        const mN = this.getNutritionFromText(m.items);
                        dailyTotal.kcal += mN.kcal;
                        dailyTotal.prot += mN.prot;
                        dailyTotal.carb += mN.carb;
                        dailyTotal.fat += mN.fat;
                    });

                    return dailyTotal.kcal > 0 ? `
                        <div class="daily-macros-bar" style="margin-bottom:2rem;">
                            <div class="macro-box"><small>Kcal Total</small><strong>${Math.round(dailyTotal.kcal)}</strong></div>
                            <div class="macro-box"><small>Proteina</small><strong>${Math.round(dailyTotal.prot)}g</strong></div>
                            <div class="macro-box"><small>Hidratos</small><strong>${Math.round(dailyTotal.carb)}g</strong></div>
                            <div class="macro-box"><small>Gordura</small><strong>${Math.round(dailyTotal.fat)}g</strong></div>
                        </div>
                    ` : '';
                })()}

                <div style="margin-bottom:2rem;">
                    <label style="display:block; font-size:0.7rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase; letter-spacing:1px;">Nome do Plano Alimentar</label>
                    <input type="text" value="${this.editingMeal.title === 'Pendente' ? '' : this.editingMeal.title}" placeholder="Nome Plano..."
                        oninput="app.editingMeal.title = this.value"
                        style="width:100%; background:transparent; border:none; border-bottom:2px solid var(--surface-border); border-radius:0; color:#fff; padding:10px 0; font-weight:700; font-size:1.4rem; outline:none; transition:border-color 0.3s ease;"
                        onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--surface-border)'">
                </div>

                <div id="meal-items-container">
                    ${this.editingMeal.meals.map((m, idx) => {
                    const mTotal = this.getNutritionFromText(m.items);
                    return `
                            <div class="glass-card" style="padding:1.25rem; margin-bottom:2rem; border-left:4px solid var(--success); position:relative;">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem; gap:10px;">
                                    <div style="display:flex; flex-direction:column; gap:12px; flex:1;">
                                        <div style="display:flex; align-items:center; gap:10px;">
                                            <label style="font-size:0.75rem; color:var(--text-muted); min-width:40px;">Hora:</label>
                                            <input type="text" value="${m.time}" placeholder="00:00" 
                                                oninput="app.formatTimeInput(this, ${idx})"
                                                onkeydown="app.handleTimeKeydown(event, this)"
                                                maxlength="5"
                                                style="background:rgba(0,0,0,0.3); border:1px solid var(--surface-border); border-radius:8px; color:#fff; font-weight:600; width:100px; font-size:0.95rem; padding:8px 12px; outline:none; text-align:center; font-family: monospace;">
                                        </div>
                                        <input type="text" value="${m.name}" placeholder="Nome (Ex: Pequeno Almoco)" oninput="app.editingMeal.meals[${idx}].name = this.value"
                                            style="width:100%; max-width:400px; background:transparent; border:none; border-bottom:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700; font-size:1.15rem; padding:6px 0;">
                                    </div>
                                    <button class="btn btn-ghost" style="color:var(--danger); padding:8px;" onclick="app.removeMealFromEditor(${idx})">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                </div>

                                <!-- Selecao de Alimentos da Base de Dados -->
                                <div style="margin-bottom:1.5rem; background:rgba(0,0,0,0.2); padding:1.25rem; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                                    <label style="display:block; font-size:0.7rem; color:var(--text-muted); margin-bottom:10px; text-transform:uppercase; letter-spacing:0.5px;">Adicionar Alimento da Base de Dados</label>
                                    <div style="display:flex; flex-direction:column; gap:12px;">
                                        <div class="food-row" style="flex-wrap: wrap;">
                                            <button class="btn btn-secondary food-search-btn" onclick="app.showFoodSelectionModal(${idx})" style="flex: 1 1 auto; min-width: 140px;">
                                                <i class="fas fa-search"></i> <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Pesquisar</span>
                                            </button>
                                            <input type="hidden" id="selected-food-${idx}" value="">
                                            
                                            <div class="food-qty-group" style="flex: 1 1 auto; min-width: 140px;">
                                                <input type="number" id="food-qty-${idx}" placeholder="Qtd" min="0" class="food-qty">
                                                <select id="food-unit-${idx}" class="food-unit">
                                                    <option value="g" style="background:#1e293b; color:#fff;">gramas</option>
                                                    <option value="un" style="background:#1e293b; color:#fff;">unidades</option>
                                                    <option value="c. sopa" style="background:#1e293b; color:#fff;">colher de sopa</option>
                                                    <option value="c. sobremesa" style="background:#1e293b; color:#fff;">colher de sobremesa</option>
                                                    <option value="c. cafe" style="background:#1e293b; color:#fff;">colher de cafe</option>
                                                   <option value="fatia(s)" style="background:#1e293b; color:#fff;">fatia(s)</option>
                                                </select>
                                            </div>
                                        </div>
                                        
                                        <div id="selected-food-display-${idx}" style="display:none; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; border:1px solid var(--success);">
                                            <!-- Alimento selecionado aparecera aqui -->
                                        </div>

                                        <button class="btn btn-primary btn-sm" onclick="app.addSelectedFoodToMeal(${idx})" style="width:100%; height:40px; background:var(--success); border:none;">
                                            <i class="fas fa-plus"></i> Adicionar a Refeicao
                                        </button>
                                    </div>
                                </div>
                                
                                <div>
                                    <label style="display:block; font-size:0.7rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Resumo da Refeicao</label>
                                    <textarea id="meal-items-${idx}" placeholder="Os alimentos inseridos aparecerao aqui..." oninput="app.editingMeal.meals[${idx}].items = this.value" onblur="app.renderMealEditor()"
                                        style="width:100%; min-height:120px; background:rgba(0,0,0,0.2); color:rgba(255,255,255,0.95); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:15px; font-family:inherit; resize:vertical; line-height:1.6; font-size:0.95rem;">${m.items}</textarea>
                                </div>
                                ${mTotal.kcal > 0 ? `
                                    <div class="nutrition-summary">
                                        <span class="nu-tag nu-kcal"><strong>${Math.round(mTotal.kcal)}</strong> kcal</span>
                                        <span class="nu-tag nu-prot"><strong>${Math.round(mTotal.prot)}g</strong> Prot</span>
                                        <span class="nu-tag nu-carb"><strong>${Math.round(mTotal.carb)}g</strong> Carb</span>
                                        <span class="nu-tag nu-fat"><strong>${Math.round(mTotal.fat)}g</strong> Gord</span>
                                    </div>
                                ` : ''}
                            </div>
                        `;
                }).join('')}
                </div>

                <button class="btn btn-ghost" style="color:var(--success); width:100%; border:1px dashed var(--success); padding:1rem;" onclick="app.addMealToEditor()">
                    <i class="fas fa-plus"></i> Adicionar Refeicao
                </button>
            </div>
        `;
        } catch (error) {
            console.error("Erro fatal no renderMealEditor:", error);
            const container = document.getElementById('main-content');
            if (container) {
                container.innerHTML = `
                    <div class="glass-card" style="padding:3rem; text-align:center; border:2px solid var(--danger);">
                        <i class="fas fa-bug" style="font-size:4rem; color:var(--danger); margin-bottom:1.5rem;"></i>
                        <h2 style="color:#fff;">Erro no Editor de Dieta</h2>
                        <p style="color:var(--text-muted); margin-bottom:2rem;">Algo impediu o carregamento do plano.</p>
                        <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; margin-bottom:2rem; text-align:left; font-family:monospace; font-size:0.8rem; color:var(--danger); overflow-x:auto;">
                            <strong>Detalhes:</strong> ${error.message}
                        </div>
                        <button class="btn btn-primary" onclick="app.setView('spy_view')">Voltar</button>
                    </div>
                `;
            }
        }
    }

    addMealToEditor() {
        this.editingMeal.meals.push({ time: '08:00', name: '', items: '' });
        this.renderMealEditor();
    }

    addSelectedFoodToMeal(mealIdx) {
        const hiddenInput = document.getElementById(`selected-food-${mealIdx}`);
        const foodName = hiddenInput.value;
        if (!foodName) {
            alert('Por favor, selecione um alimento primeiro.');
            return;
        }

        const qty = document.getElementById(`food-qty-${mealIdx}`).value;
        const unit = document.getElementById(`food-unit-${mealIdx}`).value;
        const measure = qty ? `${qty} ${unit}` : 'q.b.';

        const textarea = document.getElementById(`meal-items-${mealIdx}`);
        const currentVal = textarea.value.trim();
        const newVal = currentVal ? `${currentVal}\n- ${foodName}: ${measure}` : `- ${foodName}: ${measure}`;

        textarea.value = newVal;
        this.editingMeal.meals[mealIdx].items = newVal;

        // Reset campos
        hiddenInput.value = "";
        document.getElementById(`food-qty-${mealIdx}`).value = '';
        document.getElementById(`selected-food-display-${mealIdx}`).style.display = 'none';

        // RE-RENDER para atualizar totais
        this.renderMealEditor();
    }

    getFoodEmoji(category) {
        const emojiMap = {
            'Carne': '',
            'Peixe': '',
            'Leguminosas': '',
            'Laticinios': '',
            'Cereais': '',
            'Horticolas': '',
            'Fruta': '',
            'Gorduras/Oleos': '',
            'Bebidas Energeticas': '',
            'Outros': ''
        };
        return emojiMap[category] || '';
    }

    getExerciseIcon(muscle) {
        const iconMap = {
            'Peitorais': '',
            'Costas': '',
            'Ombros': '',
            'Biceps': '',
            'Triceps': '',
            'Quadriceps': '',
            'Isquiotibiais': '',
            'Gluteos': '',
            'Gemeos': '',
            'Abdominais': '',
            'Antebraco': '',
            'Lombar': ''
        };
        return iconMap[muscle] || '';
    }

    showExerciseSelectionModal(dayIdx, exIdx) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:800px; max-height:85vh; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                    <h2 style="margin:0;"><i class="fas fa-dumbbell"></i> Selecionar Exercicio</h2>
                    <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()" style="padding:8px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="search-container" style="margin-bottom:1.5rem;">
                    <i class="fas fa-search"></i>
                    <input type="text" id="exercise-search-input" placeholder="Pesquisar exercicio ou musculo..." 
                        oninput="app.filterExercisesInModal(this.value)"
                        class="search-bar" autofocus>
                </div>

                <div id="exercise-grid-container" style="overflow-y:auto; flex:1; padding-right:5px;">
                    ${this.renderExerciseGrid()}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.currentSelectionState = { dayIdx, exIdx };
    }

    renderExerciseGrid(searchQuery = '') {
        const baseEx = this.state.exercises || [];
        let exercises = [...baseEx].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        if (searchQuery) {
            const query = this.normalizeText(searchQuery);
            exercises = exercises.filter(ex =>
                this.normalizeText(ex.name).includes(query) ||
                this.normalizeText(ex.muscle).includes(query) ||
                this.normalizeText(ex.category).includes(query)
            );
        }

        if (exercises.length === 0) {
            return `
                <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                    <i class="fas fa-search" style="font-size:3rem; opacity:0.3; margin-bottom:1rem; display:block;"></i>
                    <p>Nenhum exercicio encontrado</p>
                </div>
            `;
        }

        return `
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:1rem; padding:0.5rem;">
                ${exercises.map(ex => `
                    <div class="glass-card food-card" onclick="app.selectExerciseFromModal('${ex.id}')" 
                        style="cursor:pointer; padding:1rem; transition:all 0.2s ease; border:2px solid transparent; text-align:center;">
                        <div style="width:100%; height:120px; border-radius:10px; overflow:hidden; margin-bottom:0.75rem; background:rgba(0,0,0,0.2); display:flex; align-items:center; justify-content:center;">
                            ${ex.photoUrl ? `<img src="${ex.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `
                                <div style="font-size:2.5rem;">${this.getExerciseIcon(ex.muscle)}</div>
                            `}
                        </div>
                        <div style="font-weight:700; font-size:0.95rem; margin-bottom:0.25rem; color:#fff; line-height:1.2; padding:0 5px;">
                            ${ex.name}
                        </div>
                        <div style="font-size:0.7rem; color:var(--primary); font-weight:600; text-transform:uppercase; margin-bottom:5px;">
                            ${ex.muscle || 'Geral'}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    filterExercisesInModal(query) {
        const container = document.getElementById('exercise-grid-container');
        if (container) {
            container.innerHTML = this.renderExerciseGrid(query);
        }
    }

    selectExerciseFromModal(exId) {
        if (!this.currentSelectionState) return;
        const { dayIdx, exIdx } = this.currentSelectionState;

        this.updateEditorExercise(dayIdx, exIdx, 'id', exId);

        // Fechar modal
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();

        // Renderizar novamente para atualizar o nome no botao
        this.renderTrainingEditor();
    }

    showFoodSelectionModal(mealIdx) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:700px; max-height:80vh; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                    <h2 style="margin:0;"><i class="fas fa-search"></i> Selecionar Alimento</h2>
                    <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()" style="padding:8px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="search-container" style="margin-bottom:1.5rem;">
                    <i class="fas fa-search"></i>
                    <input type="text" id="food-search-input" placeholder="Pesquisar alimento..." 
                        oninput="app.filterFoodsInModal(this.value)"
                        class="search-bar" autofocus>
                </div>

                <div id="food-grid-container" style="overflow-y:auto; flex:1;">
                    ${this.renderFoodGrid()}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Store mealIdx for later use
        this.currentMealIdx = mealIdx;
    }

    renderFoodGrid(searchQuery = '') {
        let foods = [...this.state.foods].sort((a, b) => a.name.localeCompare(b.name));

        if (searchQuery) {
            const query = searchQuery.toLowerCase().trim();
            foods = foods.filter(f =>
                f.name.toLowerCase().includes(query) ||
                (f.category && f.category.toLowerCase().includes(query))
            );
        }

        if (foods.length === 0) {
            return `
                <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                    <i class="fas fa-search" style="font-size:3rem; opacity:0.3; margin-bottom:1rem; display:block;"></i>
                    <p>Nenhum alimento encontrado</p>
                </div>
            `;
        }

        return `
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:1rem; padding:0.5rem;">
                ${foods.map(food => `
                    <div class="glass-card food-card" onclick="app.selectFoodFromModal('${food.name.replace(/'/g, "\\'")}', ${food.id})" 
                        style="cursor:pointer; padding:1rem; transition:all 0.2s ease; border:2px solid transparent;"
                        onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='translateY(-2px)'"
                        onmouseout="this.style.borderColor='transparent'; this.style.transform='translateY(0)'">
                        <div style="text-align:center;">
                            <div style="font-size:3rem; margin-bottom:0.5rem;">
                                ${this.getFoodEmoji(food.category)}
                            </div>
                            <div style="font-weight:700; font-size:0.95rem; margin-bottom:0.25rem; color:#fff;">
                                ${food.name}
                            </div>
                            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem;">
                                ${food.category || 'Outros'}
                            </div>
                            <div style="display:flex; justify-content:center; gap:0.5rem; flex-wrap:wrap; font-size:0.7rem;">
                                <span style="background:rgba(255,193,7,0.2); color:#ffc107; padding:2px 6px; border-radius:4px;">
                                    <strong>${food.kcal || 0}</strong> kcal
                                </span>
                                <span style="background:rgba(76,175,80,0.2); color:#4caf50; padding:2px 6px; border-radius:4px;">
                                    P: ${food.protein || 0}g
                                </span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    filterFoodsInModal(query) {
        const container = document.getElementById('food-grid-container');
        if (container) {
            container.innerHTML = this.renderFoodGrid(query);
        }
    }

    selectFoodFromModal(foodName, foodId) {
        const mealIdx = this.currentMealIdx;

        // Update hidden input
        document.getElementById(`selected-food-${mealIdx}`).value = foodName;

        // Update display
        const food = this.state.foods.find(f => f.id === foodId);
        const displayDiv = document.getElementById(`selected-food-display-${mealIdx}`);
        displayDiv.style.display = 'block';
        displayDiv.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="font-size:2rem;">${this.getFoodEmoji(food.category)}</div>
                <div style="flex:1;">
                    <div style="font-weight:700; color:#fff;">${food.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">
                        ${food.kcal || 0} kcal  Prot: ${food.protein || 0}g  Carb: ${food.carbs || 0}g  Gord: ${food.fat || 0}g
                    </div>
                </div>
                <button class="btn btn-ghost btn-sm" onclick="document.getElementById('selected-food-${mealIdx}').value=''; this.parentElement.parentElement.style.display='none'" style="color:var(--danger);">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Close modal
        document.querySelector('.modal-overlay').remove();

        // Focus on quantity input
        document.getElementById(`food-qty-${mealIdx}`).focus();
    }

    removeMealFromEditor(idx) {
        this.editingMeal.meals.splice(idx, 1);
        this.renderMealEditor();
    }

    saveMealPlan() {
        this.editingMeal.author = this.currentUser.name;
        this.editingMeal.updatedAt = new Date().toLocaleDateString('pt-PT');
        this.state.mealPlans[this.editingClientId] = this.editingMeal;
        this.saveState();

        // Notificar o aluno do novo plano de dieta
        this.addAppNotification(this.editingClientId, 'Nova Dieta Disponivel!', 'O seu professor atualizou o seu plano alimentar.');

        this.showSharePlanModal(this.editingClientId, 'meal');
    }

    deleteMealPlan(clientId) {
        if (confirm('Tem a certeza que deseja eliminar toda a dieta deste aluno?')) {
            const cid = String(clientId);
            this.state.mealPlans[cid] = { title: 'Plano Alimentar', meals: [], author: this.currentUser.name, updatedAt: new Date().toLocaleDateString('pt-PT') };
            this.saveState();
            this.renderContent();
            alert('Dieta eliminada com sucesso! ');
        }
    }

    formatTimeInput(input, mealIdx) {
        let value = input.value.replace(/[^0-9]/g, ''); // Remove tudo exceto numeros

        // Limitar a 4 digitos
        if (value.length > 4) {
            value = value.substring(0, 4);
        }

        // Formatar como HH:MM
        if (value.length >= 3) {
            value = value.substring(0, 2) + ':' + value.substring(2, 4);
        } else if (value.length >= 1) {
            // Enquanto digita, manter o formato
            if (value.length === 1) {
                value = value;
            } else if (value.length === 2) {
                value = value + ':';
            }
        }

        // Validar horas (00-23) e minutos (00-59)
        const parts = value.split(':');
        if (parts[0] && parseInt(parts[0]) > 23) {
            parts[0] = '23';
        }
        if (parts[1] && parseInt(parts[1]) > 59) {
            parts[1] = '59';
        }

        value = parts.join(':');

        // Atualizar o input e o estado
        input.value = value;
        this.editingMeal.meals[mealIdx].time = value;
    }

    handleTimeKeydown(event, input) {
        const key = event.key;
        const cursorPos = input.selectionStart;

        // Permitir teclas de navegacao e controle
        if (['ArrowLeft', 'ArrowRight', 'Tab', 'Delete'].includes(key)) {
            // Se tentar deletar os dois pontos, pular para o proximo caractere
            if (key === 'Delete' && cursorPos === 2) {
                event.preventDefault();
                input.setSelectionRange(3, 3);
            }
            return;
        }

        // Backspace: nao permitir apagar os dois pontos
        if (key === 'Backspace') {
            if (cursorPos === 3) {
                // Se estiver logo apos os dois pontos, voltar para antes
                event.preventDefault();
                input.setSelectionRange(2, 2);
            }
            return;
        }

        // Permitir apenas numeros
        if (!/^[0-9]$/.test(key)) {
            event.preventDefault();
        }
    }

    renderEvaluationView(container, clientId) {
        const c = this.state.clients.find(x => x.id == clientId);
        if (!c) {
            container.innerHTML = '<p class="text-muted">Erro: Cliente nao encontrado.</p>';
            return;
        }
        const cid = String(clientId); // Firebase usa chaves de string
        const evals = this.state.evaluations[cid] || [];
        const isTeacher = this.role === 'teacher' || this.role === 'admin';

        container.innerHTML = `
            <div class="page-header" style="margin-bottom: 2rem;">
                <div>
                    <h2 style="margin:0;">Avaliação Fisica</h2>
                    <h3 class="client-name">${c.name}</h3>
                </div>
                <div class="header-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${evals.length ? `<button class="btn btn-secondary btn-sm" onclick="app.downloadEvaluationPDF(${clientId})"><i class="fas fa-file-pdf"></i> <span class="hide-mobile">Exportar PDF</span></button>` : ''}
                    ${isTeacher ? `<button class="btn btn-primary btn-sm" onclick="app.showEvaluationModal(${clientId})"><i class="fas fa-plus"></i> <span class="hide-mobile">Nova Avaliação</span></button>` : ''}
                    ${this.role !== 'client' ? `<button class="btn btn-secondary btn-sm" onclick="app.setView(app.role === 'admin' ? 'all-clients' : 'clients')"><i class="fas fa-arrow-left"></i> <span class="hide-mobile">Voltar</span></button>` : ''}
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 1.5rem;" id="evals-list">
                ${evals.length ? evals.map((ev, idx) => this.renderEvaluationCard(ev, idx, clientId, isTeacher)).join('') : `
                    <div class="glass-panel" style="padding: 4rem 1rem; text-align: center; color: var(--text-muted);">
                        <i class="fas fa-chart-line" style="font-size: 3rem; opacity: 0.2; margin-bottom: 1.5rem; display: block;"></i>
                        Ainda nao existem avaliacoes registadas.
                    </div>
                `}
            </div>
        `;
    }

    renderEvaluationCard(ev, idx, clientId, isTeacher) {
        return `
            <div class="glass-panel" style="padding: 1.5rem; position: relative; border-left: 4px solid var(--primary);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--surface-border); padding-bottom: 1rem;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: rgba(145, 27, 43, 0.1); width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--primary);">
                            <i class="fas fa-calendar-alt"></i>
                        </div>
                        <div>
                            <strong style="font-size: 1.1rem; display: block;">${ev.date}</strong>
                            <small style="color: var(--text-muted);">Realizada em ${ev.date}</small>
                            ${ev.author ? `<small style="color: var(--accent); display:block; margin-top:2px;">Por: ${ev.author}</small>` : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <button class="btn btn-ghost btn-sm" style="color: var(--text-muted);" onclick="app.downloadEvaluationPDF(${clientId}, ${idx})" title="Exportar esta Avaliação">
                            <i class="fas fa-file-pdf"></i>
                        </button>
                        ${isTeacher ? `
                            <button class="btn btn-ghost btn-sm" style="color: var(--accent);" onclick="app.showEvaluationModal(${clientId}, ${idx})"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-ghost btn-sm" style="color: var(--danger);" onclick="app.deleteEvaluation(${clientId}, ${idx})"><i class="fas fa-trash-alt"></i></button>
                        ` : ''}
                        <span class="badge badge-blue">Bioimpedancia</span>
                    </div>
                </div>

                <div style="margin-bottom: 1.5rem;">
                    <h4 style="font-size: 0.8rem; color: var(--accent); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1rem; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-bolt"></i> Bioimpedancia
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(85px, 1fr)); gap: 0.75rem;">
                        <div class="macro-box">
                            <small>Peso</small>
                            <strong>${ev.weight || '-'} <span style="font-size: 0.65rem; font-weight: normal;">kg</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Altura</small>
                            <strong>${ev.height || '-'} <span style="font-size: 0.65rem; font-weight: normal;">cm</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Musculo</small>
                            <strong style="color: var(--success);">${ev.muscleMass || '-'} <span style="font-size: 0.65rem; font-weight: normal; color: var(--text-muted);">kg</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Gordura</small>
                            <strong style="color: var(--danger);">${ev.fatPercentage || '-'} <span style="font-size: 0.65rem; font-weight: normal; color: var(--text-muted);">%</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Agua</small>
                            <strong style="color: #60a5fa;">${ev.water || '-'} <span style="font-size: 0.65rem; font-weight: normal; color: var(--text-muted);">%</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Ossea</small>
                            <strong>${ev.boneMass || '-'}</strong>
                        </div>
                        <div class="macro-box">
                            <small>Gord. Visceral</small>
                            <strong>${ev.visceralFat || '-'}</strong>
                        </div>
                        <div class="macro-box">
                            <small>Idade Met.</small>
                            <strong>${ev.metabolicAge || '-'}</strong>
                        </div>
                        <div class="macro-box">
                            <small>Met. Basal</small>
                            <strong>${ev.basalMetabolism || '-'}</strong>
                        </div>
                    </div>
                </div>

                <div>
                    <h4 style="font-size: 0.8rem; color: var(--accent); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1rem; display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--surface-border); padding-top: 1rem;">
                        <i class="fas fa-ruler-combined"></i> Medidas Corporais
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(85px, 1fr)); gap: 0.75rem;">
                        <div class="macro-box">
                            <small>Torax</small>
                            <strong>${ev.chest || '-'} <span style="font-size: 0.65rem; font-weight: normal;">cm</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Cintura</small>
                            <strong>${ev.waist || '-'} <span style="font-size: 0.65rem; font-weight: normal;">cm</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Abdominal</small>
                            <strong>${ev.abdominal || '-'} <span style="font-size: 0.65rem; font-weight: normal;">cm</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Quadril</small>
                            <strong>${ev.hip || '-'} <span style="font-size: 0.65rem; font-weight: normal;">cm</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Coxa</small>
                            <strong>${ev.thigh || '-'} <span style="font-size: 0.65rem; font-weight: normal;">cm</span></strong>
                        </div>
                    </div>
                </div>
            </div>
            `;
    }

    showEvaluationModal(clientId, index = null) {
        let ev = { date: new Date().toISOString().split('T')[0] };
        if (index !== null) {
            const entry = this.state.evaluations[String(clientId)][index];
            // Converter data DD/MM/YYYY para YYYY-MM-DD para o input type="date"
            let dateVal = entry.date;
            if (dateVal.includes('/')) {
                const [d, m, y] = dateVal.split('/');
                dateVal = `${y} -${m} -${d} `;
            }
            ev = { ...entry, date: dateVal };
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
                    <div>
                        <h2 style="margin: 0;">${index === null ? 'Nova Avaliação' : 'Editar Avaliação'}</h2>
                        <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 5px;">Registe os dados da bioimpedancia e medidas.</p>
                    </div>
                    <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <div>
                        <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">Data da Avaliação</label>
                        <input type="date" id="ev-date" value="${ev.date}" style="color-scheme: dark;">
                    </div>

                    <div>
                        <h4 style="font-size: 0.85rem; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1rem; border-bottom: 1px solid var(--surface-border); padding-bottom: 5px;">
                            <i class="fas fa-bolt"></i> Bioimpedancia
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Peso (kg)</label>
                                <input type="number" id="ev-weight" step="0.1" value="${ev.weight || ''}" placeholder="ex: 75.5">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Altura (cm)</label>
                                <input type="number" id="ev-height" value="${ev.height || ''}" placeholder="ex: 175">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Musculo (kg)</label>
                                <input type="number" id="ev-muscle" step="0.1" value="${ev.muscleMass || ''}">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Gordura (%)</label>
                                <input type="number" id="ev-fat" step="0.1" value="${ev.fatPercentage || ''}">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Agua (%)</label>
                                <input type="number" id="ev-water" step="0.1" value="${ev.water || ''}">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Massa Ossea</label>
                                <input type="number" id="ev-bone" step="0.1" value="${ev.boneMass || ''}">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Gordura Visceral</label>
                                <input type="number" id="ev-visceral" value="${ev.visceralFat || ''}">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Idade Metabolica</label>
                                <input type="number" id="ev-metabolic-age" value="${ev.metabolicAge || ''}">
                            </div>
                            <div style="grid-column: span 2;">
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Metabolismo Basal</label>
                                <input type="number" id="ev-basal" value="${ev.basalMetabolism || ''}">
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 style="font-size: 0.85rem; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1rem; border-bottom: 1px solid var(--surface-border); padding-bottom: 5px;">
                            <i class="fas fa-ruler-combined"></i> Medidas Corporais (cm)
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Torax</label>
                                <input type="number" id="ev-chest" step="0.1" value="${ev.chest || ''}">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Cintura</label>
                                <input type="number" id="ev-waist" step="0.1" value="${ev.waist || ''}">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Abdominal</label>
                                <input type="number" id="ev-abdominal" step="0.1" value="${ev.abdominal || ''}">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Quadril</label>
                                <input type="number" id="ev-hip" step="0.1" value="${ev.hip || ''}">
                            </div>
                            <div style="grid-column: span 2;">
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Coxa</label>
                                <input type="number" id="ev-thigh" step="0.1" value="${ev.thigh || ''}">
                            </div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.saveEvaluation(${clientId}, ${index})">
                            ${index === null ? 'Guardar Avaliação' : 'Atualizar Dados'}
                        </button>
                    </div>
                </div>
            </div>
            `;
        document.body.appendChild(modal);
    }

    saveEvaluation(clientId, index = null) {
        const dateRaw = document.getElementById('ev-date').value;
        const [y, m, d] = dateRaw.split('-');
        const dateFormatted = `${d} /${m}/${y} `;

        const entry = {
            date: dateFormatted,
            weight: document.getElementById('ev-weight').value || null,
            height: document.getElementById('ev-height').value || null,
            muscleMass: document.getElementById('ev-muscle').value || null,
            fatPercentage: document.getElementById('ev-fat').value || null,
            water: document.getElementById('ev-water').value || null,
            boneMass: document.getElementById('ev-bone').value || null,
            visceralFat: document.getElementById('ev-visceral').value || null,
            metabolicAge: document.getElementById('ev-metabolic-age').value || null,
            basalMetabolism: document.getElementById('ev-basal').value || null,
            chest: document.getElementById('ev-chest').value || null,
            waist: document.getElementById('ev-waist').value || null,
            abdominal: document.getElementById('ev-abdominal').value || null,
            hip: document.getElementById('ev-hip').value || null,
            thigh: document.getElementById('ev-thigh').value || null,
            author: this.currentUser.name // Attribution
        };

        if (!entry.weight) {
            alert('O peso e obrigatorio para registar a Avaliação.');
            return;
        }

        const cid = String(clientId);
        if (!this.state.evaluations[cid]) this.state.evaluations[cid] = [];

        if (index === null) {
            this.state.evaluations[cid].unshift(entry);
        } else {
            this.state.evaluations[cid][index] = entry;
        }

        // Atualizar o ultimo peso/data no perfil do cliente se necessario
        const client = this.state.clients.find(c => c.id == clientId);
        if (client) {
            client.lastEvaluation = dateRaw;
        }

        this.saveState();
        document.querySelector('.modal-overlay').remove();
        this.renderContent();
        alert(index === null ? 'Avaliação registada com sucesso! ' : 'Avaliação atualizada com sucesso! ');
    }

    deleteEvaluation(clientId, index) {
        if (confirm('Tem a certeza que deseja eliminar este registo de Avaliação?')) {
            this.state.evaluations[String(clientId)].splice(index, 1);
            this.saveState();
            this.renderContent();
            alert('Avaliação removida.');
        }
    }

    setSpySubView(view) {
        this.spySubView = view;
        this.renderContent();
    }

    renderSpyView(container) {
        const c = this.state.clients.find(x => x.id === this.currentClientId);
        if (!c) return;

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <div>
                    <h2 style="margin:0;">Ficha: ${c.name}</h2>
                    ${c.birthDate ? `<small style="color:var(--text-muted); font-size:0.9rem;">${this.calculateAge(c.birthDate)} anos (${this.formatDate(c.birthDate)})` : ''}
                    ${c.job ? ` &bull; <i class="fas fa-briefcase" style="font-size:0.8rem; opacity:0.7;"></i> ${c.job}` : ''}
                    ${c.birthDate ? '</small>' : ''}
                    ${(() => { const p = this.getPlanLabel(c.plan); return `<div style="display:inline-flex; align-items:center; gap:5px; background:rgba(255,255,255,0.05); border:1px solid ${p.color}; color:${p.color}; border-radius:20px; padding:3px 10px; font-size:0.75rem; font-weight:700; margin-top:6px;"><i class="fas ${p.icon}" style="font-size:0.65rem;"></i> ${p.label}</div>`; })()}
                    <div style="font-size:0.85rem; color:var(--primary); margin-top:5px; font-weight:500;">
                        <i class="fas fa-user-tie" style="font-size:0.8rem; margin-right:5px;"></i> 
                        ${(() => {
                const t = this.state.teachers.find(teacher => teacher.id === c.teacherId);
                return t ? `Professor: ${t.name}` : 'Sem Professor Associado';
            })()}
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                    ${(this.role === 'teacher' || this.role === 'admin') ? `
                        <button class="btn btn-ghost btn-sm" style="color:var(--accent); font-size: 1.1rem; padding: 0.5rem 0.8rem;" onclick="app.showManualNotificationModal(${c.id})" title="Enviar Notificacao Direta">
                            <i class="fas fa-bell"></i>
                        </button>
                    ` : ''}
                    ${this.role === 'teacher' ? `<button class="btn btn-primary btn-sm" onclick="app.showTransferClientModal(${c.id})"><i class="fas fa-exchange-alt"></i> Transferir</button>` : ''}
                    ${this.role === 'admin' ? `
                        <select onchange="app.updateClientPlan(${c.id}, this.value)" style="height:36px; font-size:0.8rem; padding:0 10px; border-radius:8px; background:rgba(255,255,255,0.07); border:1px solid var(--surface-border); color:#fff;" title="Mudar Plano de Acesso">
                            <option value="total" ${(c.plan || 'total') === 'total' ? 'selected' : ''}>Total</option>
                            <option value="musculacao" ${c.plan === 'musculacao' ? 'selected' : ''}>Musculacao</option>
                            <option value="aulas" ${c.plan === 'aulas' ? 'selected' : ''}>Aulas</option>
                            <option value="pilates" ${c.plan === 'pilates' ? 'selected' : ''}>Pilates</option>
                        </select>
                    ` : ''}
                    <button class="btn btn-secondary" onclick="app.setView(app.role === 'admin' ? 'all-clients' : 'clients')">
                        <i class="fas fa-arrow-left"></i> Voltar
                    </button>
                </div>
            </div>

            <div class="glass-panel" style="display:flex; gap:0.75rem; padding:0.5rem; margin-bottom:1.5rem; background:rgba(255,255,255,0.03); overflow-x: auto; scrollbar-width: none;">
                <button class="btn btn-sm ${this.spySubView === 'training' ? 'btn-primary' : 'btn-ghost'}" onclick="app.setSpySubView('training')" style="flex:1; min-width: 100px;">
                    <i class="fas fa-dumbbell"></i> Treino
                </button>
                <button class="btn btn-sm ${this.spySubView === 'meal' ? 'btn-primary' : 'btn-ghost'}" onclick="app.setSpySubView('meal')" style="flex:1; min-width: 100px;">
                    <i class="fas fa-apple-alt"></i> Dieta
                </button>
                <button class="btn btn-sm ${this.spySubView === 'evaluation' ? 'btn-primary' : 'btn-ghost'}" onclick="app.setSpySubView('evaluation')" style="flex:1; min-width: 110px;">
                    <i class="fas fa-chart-line"></i> Avaliação
                </button>
                <button class="btn btn-sm ${this.spySubView === 'anamnesis' ? 'btn-primary' : 'btn-ghost'}" onclick="app.setSpySubView('anamnesis')" style="flex:1; min-width: 110px;">
                    <i class="fas fa-notes-medical"></i> Anamnese
                </button>
                <button class="btn btn-sm ${this.spySubView === 'messages' ? 'btn-primary' : 'btn-ghost'}" onclick="app.setSpySubView('messages')" style="flex:1; min-width: 110px;">
                    <i class="fas fa-comment-dots"></i> Mensagens
                </button>
            </div>

            <div id="spy-content-area"></div>
        `;

        const area = document.getElementById('spy-content-area');
        if (this.spySubView === 'training') {
            this.renderTrainingView(area, this.currentClientId);
        } else if (this.spySubView === 'meal') {
            this.renderMealView(area, this.currentClientId);
        } else if (this.spySubView === 'evaluation') {
            this.renderEvaluationView(area, this.currentClientId);
        } else if (this.spySubView === 'anamnesis') {
            this.renderAnamnesisView(area, this.currentClientId);
        } else {
            this.renderClientNotificationsView(area, this.currentClientId);
        }

        // O cabecalho agora e mantido para dar acesso ao botao de edicao
    }

    renderClientNotificationsView(container, clientId) {
        const notifications = (this.state.notifications || []).filter(n => n.targetUserId == clientId).reverse();

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h3 style="margin:0;"><i class="fas fa-comment-dots"></i> Historico de Mensagens</h3>
                <p style="margin:0; font-size:0.85rem; color:var(--text-muted);">${notifications.length} registos</p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${notifications.length === 0 ? `
                    <div class="glass-card" style="text-align:center; padding:3rem; opacity:0.6;">
                        <i class="fas fa-bell-slash" style="font-size:3rem; margin-bottom:1rem; display:block;"></i>
                        <p>Ainda nao foram enviadas notificacoes personalizadas para este aluno.</p>
                    </div>
                ` : notifications.map(n => `
                    <div class="glass-card animate-fade-in" style="border-left: 4px solid var(--accent);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                            <strong style="color:var(--accent); font-size:1.1rem;">${n.title}</strong>
                            <small style="color:var(--text-muted);">${new Date(n.createdAt).toLocaleDateString('pt-PT')} ${new Date(n.createdAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</small>
                        </div>
                        <div style="color:#e2e8f0; line-height:1.5; font-size:0.95rem;">${n.body}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderClientContent(container) {
        // Mostrar loader apenas se nao houver dados nenhuns (nem cache nem servidor)
        const hasClients = this.state.clients && this.state.clients.length > 0;
        if (!this.hasLoadedData && !hasClients) {
            container.innerHTML = `
                <div style="padding:10rem 2rem; text-align:center;">
                    <div class="loader" style="margin:0 auto 1.5rem;"></div>
                    <h3 style="color:var(--primary); text-transform:uppercase; letter-spacing:1px;">A carregar...</h3>
                </div>
            `;
            return;
        }

        // Tentar encontrar o cliente (flexivel Number/String)
        const c = this.state.clients.find(x => String(x.id) === String(this.currentClientId));

        if (!c) {
            container.innerHTML = `<div style="padding:4rem 2rem; text-align:center;">
                <i class="fas fa-user-slash" style="font-size:3rem; color:var(--danger); opacity:0.5; margin-bottom:1.5rem;"></i>
                <h3 style="color:#fff;">Utilizador nao encontrado.</h3>
                <p style="color:var(--text-muted); margin-bottom:2rem;">O seu perfil (ID: ${this.currentClientId}) nao existe na base de dados.</p>
                <button class="btn btn-primary" onclick="app.handleLogout()">Sair e Tentar Novamente</button>
            </div>`;
            return;
        }
        switch (this.activeView) {
            case 'dashboard':
                container.innerHTML = `
                    <h2 class="animate-fade-in">Bem-vindo, ${c.name} </h2>
                    <p style="color:var(--text-muted); margin-bottom:1rem;">Este e o seu painel de acompanhamento KandalGym.</p>
                    
                    ${(() => {
                        const t = this.state.teachers.find(teacher => teacher.id === c.teacherId);
                        if (t) {
                            return `
                            <div class="glass-card" style="margin-bottom:2rem; border-left:4px solid var(--primary); display:flex; align-items:center; gap:1rem; padding:1rem;">
                                <div style="width: 50px; height: 50px; border-radius: 50%; background: var(--surface); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color:var(--primary); border: 2px solid var(--surface-border); overflow:hidden;">
                                     ${t.photoUrl ? `<img src="${t.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : '<i class="fas fa-user-tie"></i>'}
                                </div>
                                <div>
                                    <small style="color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; font-size:0.7rem;">O seu Professor</small>
                                    <h3 style="margin:0; font-size:1.1rem;">${t.name}</h3>
                                    ${t.email ? `<small style="color:var(--text-muted);"><i class="fas fa-envelope" style="font-size:0.8rem; margin-right:5px;"></i> ${t.email}</small>` : ''}
                                </div>
                            </div>
                            `;
                        }
                        return '';
                    })()}

                    <div class="stats-grid">
                        <div class="glass-card" onclick="app.setView('training')" style="cursor:pointer;">
                            <i class="fas fa-dumbbell" style="font-size:1.5rem; color:var(--primary); margin-bottom:1rem;"></i>
                            <h3>O Meu Treino</h3>
                            <small>Ver exercicios e series</small>
                        </div>
                        <div class="glass-card" onclick="app.setView('meal')" style="cursor:pointer;">
                            <i class="fas fa-apple-alt" style="font-size:1.5rem; color:var(--success); margin-bottom:1rem;"></i>
                            <h3>Minha Dieta</h3>
                            <small>Ver plano alimentar</small>
                        </div>
                        <div class="glass-card" onclick="app.setView('evaluation')" style="cursor:pointer;">
                            <i class="fas fa-chart-line" style="font-size:1.5rem; color:var(--accent); margin-bottom:1rem;"></i>
                            <h3>Avaliação Fisica</h3>
                            <small>Ver peso e medidas</small>
                        </div>
                    </div>
        `;
                break;
            case 'training': this.renderTrainingView(container, this.currentClientId); break;
            case 'meal': this.renderMealView(container, this.currentClientId); break;
            case 'evaluation': this.renderEvaluationView(container, this.currentClientId); break;
            case 'chat': this.renderChat(container); break;
            case 'profile': this.renderProfileView(container); break;
            case 'training_history': this.renderTrainingHistoryView(container); break;
        }
    }

    renderTrainingHistoryView(container) {
        const history = this.state.trainingHistory[this.currentClientId] || [];

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2 style="margin:0;"><i class="fas fa-history"></i> Historico de Treinos</h2>
                <button class="btn btn-secondary" onclick="app.setView('training')">Voltar</button>
            </div>

            ${history.length === 0 ? `
                <div class="glass-panel" style="padding:3rem; text-align:center; color:var(--text-muted);">
                    <i class="fas fa-calendar-times" style="font-size:3rem; opacity:0.2; margin-bottom:1rem; display:block;"></i>
                    Ainda nao concluiu nenhum treino.
                </div>
            ` : history.map(session => `
                <div class="glass-panel" style="padding:1.5rem; margin-bottom:1.5rem; border-left:4px solid var(--accent); position:relative;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                        <div>
                            <strong style="color:var(--accent);">${session.date}</strong>
                            <span style="color:var(--text-muted); font-size:0.8rem; margin-left:10px;">${session.time}</span>
                            <h3 style="margin:5px 0 0 0; color:#fff;">${session.title}</h3>
                        </div>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger); padding:5px 10px;" onclick="app.deleteTrainingSession(${history.indexOf(session)})">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr; gap:0.75rem;">
                        ${(session.exercises || []).map(ex => `
                            <div style="padding:10px; background:rgba(255,255,255,0.03); border-radius:10px;">
                                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                    <strong style="font-size:0.9rem;">${ex.name}</strong>
                                    <small style="color:var(--text-muted);">${ex.sets}x${ex.reps}</small>
                                </div>
                                <div style="display:flex; gap:5px; flex-wrap:wrap;">
                                    ${(ex.weights || []).map((w, idx) => `
                                        <div style="font-size:0.75rem; background:rgba(0,0,0,0.2); padding:3px 8px; border-radius:4px; border:1px solid rgba(255,255,255,0.05);">
                                            S${idx + 1}: <span style="color:var(--accent); font-weight:bold;">${w || '-'}kg</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')
            }
        `;
    }

    renderProfileView(container) {
        const user = this.currentUser;
        if (!user) return;

        container.innerHTML = `
            <h2 class="animate-fade-in"><i class="fas fa-user-circle"></i> O Meu Perfil</h2>
            <p style="color:var(--text-muted); margin-bottom:2rem;">Atualize os seus dados de contacto e palavra-passe.</p>

            <div class="glass-panel" style="padding:2rem; max-width:600px;">
                <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:2rem;">
                    <div id="profile-photo-preview" style="width: 120px; height: 120px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 2.5rem; border: 4px solid var(--surface-border); overflow: hidden; margin-bottom:1rem; cursor:pointer;" onclick="document.getElementById('photo-upload').click()">
                        ${user.photoUrl ? `<img src="${user.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
                    </div>
                    <input type="file" id="photo-upload" style="position: absolute; opacity: 0; pointer-events: none;" accept="image/*" onchange="app.handlePhotoUpload(this)">
                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('photo-upload').click()">
                        <i class="fas fa-camera"></i> Alterar Foto
                    </button>
                </div>
                <div style="margin-bottom:1.5rem;">
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Nome Completo</label>
                    <input type="text" id="edit-name" value="${user.name}" 
                        style="width:100%; height:45px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 15px;">
                </div>

                <div style="margin-bottom:1.5rem;">
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Email de Acesso</label>
                    <input type="email" id="edit-email" value="${user.email}" 
                        style="width:100%; height:45px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 15px;">
                </div>

                <div style="margin-bottom:1.5rem;">
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Contacto Telefonico</label>
                    <input type="tel" id="edit-phone" value="${user.phone || ''}" placeholder="Ex: 912345678"
                        style="width:100%; height:45px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 15px;">
                </div>

                ${this.role === 'client' ? `
                <div style="margin-bottom:1.5rem;">
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Profissao</label>
                    <input type="text" id="edit-job" value="${user.job || ''}" placeholder="Ex: Engenheiro, Professor..."
                        style="width:100%; height:45px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 15px;">
                </div>
                ` : ''}

                ${this.role === 'client' ? `
                <div style="margin-bottom:1.5rem;">
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Data de Nascimento</label>
                    <input type="date" id="edit-dob" value="${user.birthDate || ''}" 
                        style="width:100%; height:45px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 15px; color-scheme:dark;">
                </div>
                ` : ''}

                <div style="margin-top:2rem; padding-top:1rem; border-top:1px dashed var(--surface-border);">
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Nova Palavra-passe</label>
                    <div style="position:relative;">
                        <input type="password" id="edit-pass" value="${user.password}" 
                            style="width:100%; height:45px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 15px;">
                        <i class="fas fa-eye" style="position:absolute; right:15px; top:15px; cursor:pointer; color:var(--text-muted);" 
                            onclick="const i = this.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'"></i>
                    </div>
                    <small style="color:var(--text-muted);">Mantenha ou altere para uma nova.</small>
                </div>

                ${(() => {
                const qrInfo = (this.state.qrClients || []).find(q => q.clientId === user.id && q.type === this.role);
                const displayId = qrInfo ? qrInfo.id : (this.role === 'client' ? "K" + user.id : null);

                if (!displayId && !qrInfo) return '';

                return `
                    <div class="glass-card" style="margin-top:2rem; padding:1.5rem; text-align:center; border: 1px dashed var(--accent); background: rgba(196, 162, 77, 0.05);">
                        <h4 style="margin-bottom:1rem; color:var(--accent);"><i class="fas fa-qrcode"></i> O Meu Codigo de Acesso</h4>
                        <div id="profile-qr-container" style="background: white; padding: 12px; border-radius: 12px; display: inline-block; margin-bottom: 1rem; box-shadow: 0 4px 15px rgba(0,0,0,0.2);"></div>
                        <p style="font-size:0.8rem; color:var(--text-muted);">Apresente este codigo na rececao para registar a sua entrada.</p>
                        <div style="font-size: 0.7rem; color: var(--accent); opacity: 0.8; font-family: monospace; font-weight: 700;">ID: ${displayId}</div>
                    </div>
                `;
            })()}

                <button class="btn btn-primary" onclick="app.updateProfile()" style="width:100%; height:50px; font-size:1.1rem; margin-top:2rem;">
                    <i class="fas fa-save"></i> Guardar Alteracoes
                </button>
            </div>
        `;

        // Gerar o QR Code para qualquer utilizador que tenha acesso QR ativo
        setTimeout(() => {
            const qrContainer = document.getElementById('profile-qr-container');
            if (qrContainer) {
                qrContainer.innerHTML = "";
                const qrInfo = (this.state.qrClients || []).find(q => q.clientId === user.id && q.type === this.role);
                const textId = qrInfo ? qrInfo.id : (this.role === 'client' ? "K" + user.id : null);

                if (textId) {
                    new QRCode(qrContainer, {
                        text: textId,
                        width: 180,
                        height: 180,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.H
                    });
                }
            }
        }, 100);
    }

    processImage(file, maxSize, quality, callback) {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            alert("A imagem e demasiado grande (Max 5MB).");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                callback(compressedBase64);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    handlePhotoUpload(input) {
        if (input.files && input.files[0]) {
            this.processImage(input.files[0], 400, 0.7, (base64) => {
                this.currentUser.photoUrl = base64;
                const preview = document.getElementById('profile-photo-preview');
                if (preview) {
                    preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:cover;">`;
                }
            });
        }
    }

    async updateProfile() {
        const name = document.getElementById('edit-name').value.trim();
        const email = document.getElementById('edit-email').value.trim();
        const phone = document.getElementById('edit-phone').value.trim();
        const jobInput = document.getElementById('edit-job');
        const job = jobInput ? jobInput.value.trim() : '';
        const pass = document.getElementById('edit-pass').value;
        const btn = document.querySelector('button[onclick="app.updateProfile()"]');

        if (!name || !email || !pass || (this.role === 'client' && !job)) {
            return alert('Nome, Email, Palavra-passe' + (this.role === 'client' ? ' e Profissao' : '') + ' sao obrigatorios.');
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A gravar...';
        }

        try {
            // Atualizar no estado global (procurar em clientes, professores ou admins)
            let user = this.state.clients.find(c => c.id === this.currentUser.id);
            if (!user) user = this.state.teachers.find(t => t.id === this.currentUser.id);
            if (!user) user = this.state.admins.find(a => a.id === this.currentUser.id);

            if (user) {
                user.name = name;
                user.email = email;
                user.phone = phone;
                if (this.role === 'client') {
                    user.job = job;
                }
                user.password = pass;

                const dobInput = document.getElementById('edit-dob');
                if (dobInput) {
                    user.birthDate = dobInput.value;
                }
                if (this.currentUser.photoUrl) {
                    user.photoUrl = this.currentUser.photoUrl;
                }

                // Atualizar utilizador atual na sessao
                this.currentUser = { ...user };
                await this.saveState();
                this.persistLogin();
                this.renderUserProfile(); // Atualizar avatar no topo

                alert('Perfil atualizado com sucesso! ');
                this.setView('dashboard');
            }
        } catch (err) {
            console.error("Erro ao atualizar perfil:", err);
            alert("Erro ao guardar perfil. A imagem pode ser demasiado grande.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Guardar Alteracoes';
            }
        }
    }

    switchAdminTab(tab) {
        const listContainer = document.getElementById('admin-user-list');
        const tabT = document.getElementById('tab-teachers');
        const tabC = document.getElementById('tab-clients');
        const tabA = document.getElementById('tab-admins');

        if (!listContainer) return;

        // Reset borders
        if (tabT) tabT.style.borderBottom = "none";
        if (tabC) tabC.style.borderBottom = "none";
        if (tabA) tabA.style.borderBottom = "none";

        if (tab === 'teachers') {
            if (tabT) tabT.style.borderBottom = "2px solid var(--primary)";
            listContainer.innerHTML = `<div class="client-list animate-fade-in">${(this.state.teachers || []).map(t => this.renderUserCard(t, 'teacher')).join('')}</div>`;
        } else if (tab === 'admins') {
            if (tabA) tabA.style.borderBottom = "2px solid var(--accent)";
            listContainer.innerHTML = `<div class="client-list animate-fade-in">${(this.state.admins || []).map(a => this.renderUserCard(a, 'admin')).join('')}</div>`;
        } else {
            if (tabC) tabC.style.borderBottom = "2px solid var(--secondary)";
            listContainer.innerHTML = `<div class="client-list animate-fade-in">${(this.state.clients || []).map(c => this.renderUserCard(c, 'client')).join('')}</div>`;
        }
    }

    getPlanLabel(plan) {
        const plans = {
            total: { label: 'Plano Total', color: 'var(--accent)', icon: 'fa-star' },
            musculacao: { label: 'Musculacao', color: '#4A90E2', icon: 'fa-dumbbell' },
            aulas: { label: 'Aulas Gerais', color: 'var(--success)', icon: 'fa-calendar-check' },
            pilates: { label: 'Pilates', color: '#9B59B6', icon: 'fa-spa' }
        };
        return plans[plan] || plans['total'];
    }

    canClientEnrollInClass(client, cls) {
        const plan = client.plan || 'total';
        const className = (cls.name || '').toLowerCase();
        const isPilates = className.includes('pilates');

        if (plan === 'total') return { allowed: true };
        if (plan === 'musculacao') return { allowed: false, reason: 'O seu plano é de Musculacao e nao inclui reserva de aulas.' };
        if (plan === 'pilates') {
            return isPilates
                ? { allowed: true }
                : { allowed: false, reason: 'O seu plano só permite reservar aulas de Pilates.' };
        }
        if (plan === 'aulas') {
            return isPilates
                ? { allowed: false, reason: 'O seu plano nao inclui aulas de Pilates. Contacte a recepçao para fazer upgrade.' }
                : { allowed: true };
        }
        return { allowed: true };
    }

    renderUserCard(user, type) {
        if (!user) return '';
        const isTeacher = type === 'teacher';
        const isAdmin = type === 'admin';
        const isClient = type === 'client';

        let color = 'var(--secondary)';
        let icon = 'fa-user';

        if (isTeacher) {
            color = 'var(--primary)';
            icon = 'fa-user-tie';
        } else if (isAdmin) {
            color = 'var(--accent)';
            icon = 'fa-user-shield';
        }

        const initials = (user.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

        return `
            <div class="glass-card animate-fade-in" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; border-left: 3px solid ${color};">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="color: ${color}; background: rgba(255,255,255,0.05); width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--surface-border);">
                        ${user.photoUrl ? `<img src="${user.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas ${icon}"></i>`}
                    </div>
                    <div>
                        <strong style="font-size: 1.1rem;">${user.name || 'Sem Nome'}</strong>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${user.email || ''}</div>
                        ${isClient && this.role === 'admin' ? `
                            <div class="teacher-assign-tag">
                                <i class="fas fa-user-tie"></i>
                                <select onchange="app.assignTeacher(${user.id}, this.value)">
                                    <option value="">Sem Professor</option>
                                    ${(this.state.teachers || []).map(t => `<option value="${t.id}" ${user.teacherId === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                                </select>
                                <i class="fas fa-chevron-down" style="font-size:0.6rem; opacity:0.5; margin-left:-5px;"></i>
                            </div>
                        ` : ''}
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${user.phone || 'Sem contacto'}</div>
                        ${isClient && user.job ? `
                            <div style="font-size: 0.75rem; color: var(--accent); font-weight: 500; margin-top:2px;">
                                <i class="fas fa-briefcase" style="font-size:0.7rem;"></i> ${user.job}
                            </div>
                        ` : ''}
                        ${isClient ? (() => { const p = this.getPlanLabel(user.plan); return `<div style="font-size:0.7rem; font-weight:600; margin-top:4px; color:${p.color};"><i class="fas ${p.icon}" style="font-size:0.6rem;"></i> ${p.label}</div>`; })() : ''}
                        <div style="margin-top:5px;"><span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-muted);"></span></div>
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    ${isClient ? `
                        <button class="btn btn-ghost" style="color:var(--primary);" onclick="app.spyClient(${user.id})" title="Ver Plano"><i class="fas fa-eye"></i></button>
                        <button class="btn btn-ghost" style="color:var(--accent);" onclick="app.enableQRForClient(${user.id})" title="Ativar/Ver QR"><i class="fas fa-qrcode"></i></button>
                    ` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="app.resetPass('${type}', ${user.id}, '${user.name || ''}')"><i class="fas fa-key"></i></button>
                    <button class="btn btn-secondary btn-sm" style="color:var(--danger);" onclick="app.deleteUser('${type}', ${user.id}, '${user.name || ''}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            `;
    }

    renderChat(container) {
        const myId = Number(this.currentUser.id);
        const notifications = (this.state.notifications || []).filter(n => n.targetUserId === myId || n.senderId === myId);

        // Agrupar conversas por utilizador
        const threads = {};

        // 1. Adicionar contatos proativos baseados no papel (role)
        if (this.role === 'client') {
            // Aluno: Sempre ter o seu professor disponivel
            const tid = this.currentUser.teacherId;
            if (tid) {
                const teacher = this.state.teachers.find(t => t.id === tid);
                if (teacher) {
                    threads[tid] = { id: tid, messages: [], user: teacher, lastMsg: { body: 'Sem mensagens anteriores.', createdAt: new Date(0).toISOString() } };
                }
            }
            // Tambem incluir Admin se houve conversas
        } else if (this.role === 'teacher') {
            // Professor: Ver todos os seus alunos por omissao
            const myClients = this.state.clients.filter(c => c.teacherId === myId);
            myClients.forEach(c => {
                threads[c.id] = { id: c.id, messages: [], user: c, lastMsg: { body: 'Inicie uma conversa...', createdAt: new Date(0).toISOString() } };
            });
        }

        // 2. Preencher com mensagens existentes
        notifications.forEach(n => {
            if (!n.senderId && !n.targetUserId) return;

            let otherId;
            if (n.senderId === myId) otherId = n.targetUserId;
            else otherId = n.senderId || 'system';

            if (!threads[otherId]) {
                threads[otherId] = { id: otherId, messages: [], user: null, lastMsg: null };
            }
            threads[otherId].messages.push(n);
        });

        // 3. Encontrar info dos utilizadores e ordenar mensagens
        Object.keys(threads).forEach(id => {
            const t = threads[id];
            if (id === 'system') {
                t.user = { name: 'Sistema KandalGym', photoUrl: null, role: 'system' };
            } else if (!t.user) {
                const uid = Number(id);
                t.user = this.state.clients.find(c => c.id === uid) ||
                    this.state.teachers.find(tr => tr.id === uid) ||
                    this.state.admins.find(a => a.id === uid) ||
                    { name: 'Utilizador Desconhecido', photoUrl: null };
            }

            if (t.messages.length > 0) {
                t.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                t.lastMsg = t.messages[t.messages.length - 1];
            }
        });

        // 4. Ordenar threads: Conversas reais primeiro, depois ordem alfabetica
        const sortedThreads = Object.values(threads).sort((a, b) => {
            const dateA = new Date(a.lastMsg?.createdAt || 0);
            const dateB = new Date(b.lastMsg?.createdAt || 0);
            if (dateA > 0 || dateB > 0) return dateB - dateA;
            return (a.user.name || '').localeCompare(b.user.name || '');
        });

        const activeChatId = this.activeChatUserId; // Estado temporario na classe
        const isMobile = window.innerWidth <= 768;
        const containerClass = activeChatId ? 'chat-container active-chat' : 'chat-container';

        // Renderizacao
        container.innerHTML = `
            <div class="${containerClass}">
                <!-- Sidebar -->
                <div class="chat-sidebar">
                    <div style="padding:1rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <h2 style="margin:0; font-size:1.2rem;">Mensagens</h2>
                    </div>
                    ${sortedThreads.length === 0 ?
                `<div style="padding:1rem; text-align:center; color:var(--text-muted);">Sem conversas.</div>` :
                sortedThreads.map(th => {
                    const isActive = activeChatId == th.id ? 'active' : '';
                    const lastDate = new Date(th.lastMsg.createdAt);
                    const timeStr = lastDate.toLocaleDateString() === new Date().toLocaleDateString()
                        ? lastDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : lastDate.toLocaleDateString([], { day: '2-digit', month: '2-digit' });

                    return `
                                <div class="chat-thread-item ${isActive}" onclick="app.openChat('${th.id}')">
                                    <div class="chat-avatar">
                                        ${th.user.photoUrl ? `<img src="${th.user.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` :
                            (th.id === 'system' ? '<i class="fas fa-bell"></i>' :
                                (th.user.name ? th.user.name.charAt(0).toUpperCase() : '?'))}
                                    </div>
                                    <div class="chat-thread-info">
                                        <div style="display:flex; justify-content:space-between;">
                                            <div class="chat-thread-name">${th.user.name}</div>
                                            <div style="font-size:0.7rem; color:var(--text-muted);">${timeStr}</div>
                                        </div>
                                        <div class="chat-thread-last-msg">
                                            ${th.lastMsg.senderId === myId ? 'Tu: ' : ''}${th.lastMsg.body || th.lastMsg.title}
                                        </div>
                                    </div>
                                </div>
                            `;
                }).join('')
            }
                </div>

                <!-- Main Chat -->
                <div class="chat-main" id="chat-main-view">
                    ${this.renderActiveChat(activeChatId, sortedThreads)}
                </div>
            </div>
        `;

        // Scroll to bottom if chat matches
        if (activeChatId) {
            const msgsContainer = document.querySelector('.chat-messages');
            if (msgsContainer) msgsContainer.scrollTop = msgsContainer.scrollHeight;
        }
    }

    renderActiveChat(activeChatId, threads) {
        if (!activeChatId) {
            return `
                <div class="chat-empty-state">
                    <i class="far fa-comments" style="font-size:4rem; margin-bottom:1rem; opacity:0.3;"></i>
                    <p>Selecione uma conversa para comecar.</p>
                </div>
            `;
        }

        let thread = threads.find(t => t.id == activeChatId);
        // Fallback: se a thread nao existe (ex: aluno <-> professor novo), cria objeto temporario
        if (!thread) {
            // Tentar encontrar user info
            const uid = Number(activeChatId);
            const user = this.state.clients.find(c => c.id === uid) ||
                this.state.teachers.find(tr => tr.id === uid) ||
                this.state.admins.find(a => a.id === uid);

            if (user) {
                thread = { id: uid, user: user, messages: [] };
            } else {
                return '<div class="chat-empty-state">Utilizador nao encontrado.</div>';
            }
        }

        const msgs = thread.messages || [];

        return `
            <div class="chat-header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <button class="btn btn-ghost btn-sm mobile-only" onclick="app.closeChat()" style="color:var(--text-muted); margin-right:5px;">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div class="chat-avatar" style="width:35px; height:35px; font-size:0.9rem;">
                         ${thread.user.photoUrl ? `<img src="${thread.user.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` :
                (thread.id === 'system' ? '<i class="fas fa-bell"></i>' :
                    thread.user.name.charAt(0).toUpperCase())}
                    </div>
                    <strong>${thread.user.name}</strong>
                </div>
                <button class="btn btn-ghost btn-sm" onclick="app.deleteAllMessagesInChat('${activeChatId}')" style="color:var(--danger); font-size:0.75rem;" title="Limpar conversa">
                    <i class="fas fa-trash-alt"></i> <span class="desktop-only" style="margin-left:5px;">Limpar</span>
                </button>
            </div>

            <div class="chat-messages">
                ${msgs.length === 0 ? '<div style="text-align:center; color:var(--text-muted); margin-top:2rem;">Inicio da conversa.</div>' : ''}
                ${msgs.map(m => {
                        const isMe = m.senderId === Number(this.currentUser.id);
                        const isSystem = !m.senderId;
                        const isDeleted = m.deleted;
                        const bubbleClass = isSystem ? 'message-received' : (isMe ? 'message-sent' : 'message-received');

                        return `
                        <div class="message-bubble ${bubbleClass}" style="${isSystem ? 'background: #334155; width:100%; max-width:100%; text-align:center; font-size:0.85rem;' : ''} ${isDeleted ? 'font-style: italic; opacity: 0.7;' : ''}">
                            ${m.replyTo ? `
                                <div class="reply-quote" style="background: rgba(0,0,0,0.1); border-left: 3px solid var(--accent); padding: 5px 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.75rem; cursor: pointer;" onclick="app.jumpToMessage('${m.replyTo.id}')">
                                    <div style="font-weight: bold; color: var(--accent); margin-bottom: 2px;">${m.replyTo.senderName}</div>
                                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.8;">${m.replyTo.body}</div>
                                </div>
                            ` : ''}
                            ${isSystem ? `<strong style="display:block; margin-bottom:4px; color:var(--accent);">${m.title}</strong>` : ''}
                            ${!isSystem && !isMe && !isDeleted ? `<div style="font-size:0.7rem; color:var(--primary); font-weight:bold; margin-bottom:2px;">${thread.user.name}</div>` : ''}
                            <div id="msg-${m.id}">${m.body}</div>
                             <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:10px; margin-top:4px;">
                                <span class="message-time" style="margin:0;">
                                    ${new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                 <div class="msg-actions-container" style="display: flex; gap: 8px; align-items: center;">
                                    ${!isDeleted ? `
                                        <div class="desktop-only" style="display: flex; gap: 10px;">
                                            <i class="fas fa-reply" style="font-size:0.7rem; cursor:pointer; opacity:0.3;" 
                                            onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.3'"
                                            onclick="app.prepareReply('${m.id}', '${activeChatId}')" title="Responder"></i>
                                            ${(isMe || activeChatId === 'system') ? `
                                            <i class="fas fa-trash-alt" style="font-size:0.7rem; cursor:pointer; opacity:0.3;" 
                                            onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.3'"
                                            onclick="app.deleteMessage('${activeChatId}', '${m.createdAt}')" title="Eliminar mensagem"></i>
                                            ` : ''}
                                        </div>
                                        <i class="fas fa-ellipsis-v mobile-only msg-more-btn" 
                                           onclick="app.showMessageMenu(event, '${m.id}', '${activeChatId}', ${isMe || activeChatId === 'system'})"></i>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                    }).join('')}
            </div>

            ${activeChatId !== 'system' ? `
            <div id="reply-preview-container" style="display:none; background: rgba(0,0,0,0.2); padding: 10px 15px; border-top: 1px solid rgba(255,255,255,0.05); border-left: 4px solid var(--accent);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex:1;">
                        <div id="reply-preview-user" style="font-weight:bold; font-size:0.8rem; color:var(--accent); margin-bottom:2px;"></div>
                        <div id="reply-preview-text" style="font-size:0.75rem; opacity:0.8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:250px;"></div>
                    </div>
                    <i class="fas fa-times" style="cursor:pointer; opacity:0.5; font-size:0.9rem;" onclick="app.cancelReply()"></i>
                </div>
            </div>
            <div class="chat-input-area">
                <input type="text" id="chat-input-text" placeholder="Escreva uma mensagem..." onkeypress="app.handleChatInput(event, '${activeChatId}')">
                <button class="btn btn-primary btn-sm" style="border-radius:50%; width:40px; height:40px; padding:0; display:flex; align-items:center; justify-content:center;" 
                    onclick="app.sendMessageInChat('${activeChatId}')">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
            ` : '<div style="padding:1rem; text-align:center; color:var(--text-muted); background:rgba(0,0,0,0.2);">Este e um canal de notificacoes do sistema.</div>'}
        `;
    }

    deleteMessage(chatId, createdAt) {
        if (!confirm('Eliminar esta mensagem?')) return;
        
        const myId = Number(this.currentUser.id);
        const idx = (this.state.notifications || []).findIndex(n => {
            const isTarget = (n.targetUserId == myId && n.senderId == chatId) || (n.targetUserId == chatId && n.senderId == myId) || (chatId === 'system' && n.targetUserId == myId && !n.senderId);
            return isTarget && n.createdAt === createdAt;
        });

        if (idx !== -1) {
            // Se ja estiver apagada, removemos de vez
            if (this.state.notifications[idx].deleted) {
                this.state.notifications.splice(idx, 1);
                this.showToast('Mensagem removida permanentemente.');
            } else {
                this.state.notifications[idx].deleted = true;
                this.state.notifications[idx].body = "🚫 Esta mensagem foi apagada.";
                this.showToast('Mensagem apagada.');
            }
            this.saveState();
            this.renderContent();
        }
    }

    showMessageMenu(event, msgId, chatId, canDelete) {
        event.stopPropagation();
        
        // Find message to get body and sender
        const msg = (this.state.notifications || []).find(n => n.id == msgId);
        if (!msg) return;

        // Remove existing menu if any
        const existing = document.querySelector('.msg-context-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.className = 'msg-context-menu animate-fade-in';
        menu.style.cssText = `
            position: fixed;
            top: ${event.clientY}px;
            right: 20px;
            background: rgba(30, 41, 59, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            z-index: 9999;
            min-width: 150px;
            overflow: hidden;
        `;

        menu.innerHTML = `
            <div style="padding: 12px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid rgba(255,255,255,0.05);" 
                 onclick="app.prepareReply('${msgId}', '${chatId}'); this.parentElement.remove();">
                <i class="fas fa-reply" style="color: var(--accent);"></i> Responder
            </div>
            ${canDelete ? `
            <div style="padding: 12px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; color: #ff4444;" 
                 onclick="app.deleteMessage('${chatId}', '${msg.createdAt}'); this.parentElement.remove();">
                <i class="fas fa-trash-alt"></i> Apagar
            </div>
            ` : ''}
        `;

        document.body.appendChild(menu);

        // Click outside to close
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
    }

    prepareReply(msgId, chatId) {
        const msg = (this.state.notifications || []).find(n => n.id == msgId);
        if (!msg) return;

        let senderName = "Utilizador";
        if (!msg.senderId) {
            senderName = "Sistema";
        } else {
            const uid = Number(msg.senderId);
            const user = (this.state.clients || []).find(c => c.id === uid) || 
                         (this.state.teachers || []).find(t => t.id === uid) || 
                         (this.state.admins || []).find(a => a.id === uid);
            if (user) senderName = user.name;
        }

        this.replyContext = { id: msgId, senderName, body: msg.body };
        
        const preview = document.getElementById('reply-preview-container');
        const userEl = document.getElementById('reply-preview-user');
        const textEl = document.getElementById('reply-preview-text');
        
        if (preview && userEl && textEl) {
            userEl.innerText = `A responder a ${senderName}`;
            textEl.innerText = body;
            preview.style.display = 'block';
            document.getElementById('chat-input-text').focus();
        }
    }

    cancelReply() {
        this.replyContext = null;
        const preview = document.getElementById('reply-preview-container');
        if (preview) preview.style.display = 'none';
    }

    jumpToMessage(msgId) {
        const el = document.getElementById(`msg-${msgId}`);
        if (el) {
            el.closest('.message-bubble').style.transition = 'background 0.5s';
            el.closest('.message-bubble').style.background = 'rgba(255,255,255,0.2)';
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                if (el) el.closest('.message-bubble').style.background = '';
            }, 2000);
        }
    }

    deleteAllMessagesInChat(chatId) {
        if (!confirm('Tem a certeza que deseja apagar TODA a conversa? Esta acao nao pode ser revertida.')) return;

        const myId = Number(this.currentUser.id);
        this.state.notifications = (this.state.notifications || []).filter(n => {
            const isSystemChat = chatId === 'system' && n.targetUserId == myId && !n.senderId;
            const isUserChat = (n.targetUserId == myId && n.senderId == chatId) || (n.targetUserId == chatId && n.senderId == myId);
            return !(isSystemChat || isUserChat);
        });

        this.saveState();
        this.renderContent();
        this.showToast('Conversa limpa.');
    }

    openChat(userId) {
        this.activeChatUserId = userId;
        this.renderContent(); // Re-render to show chat view
    }

    closeChat() {
        this.activeChatUserId = null;
        this.renderContent();
    }

    handleChatInput(e, targetId) {
        if (e.key === 'Enter') {
            this.sendMessageInChat(targetId);
        }
    }

    sendMessageInChat(targetId) {
        const input = document.getElementById('chat-input-text');
        const text = input.value.trim();
        if (!text) return;

        // Add message with optional reply context
        this.addAppNotification(targetId, `Nova mensagem`, text, this.currentUser.id, 'message', true, this.replyContext);

        // Reset context
        this.cancelReply();

        // Refresh view
        input.value = ''; // Clean input first to feel responsive
        this.renderContent();

        // Timeout to ensure scroll happens after render
        setTimeout(() => {
            const msgsContainer = document.querySelector('.chat-messages');
            if (msgsContainer) {
                // For novos envios, usamos smooth scroll para uma experiencia fluida
                msgsContainer.style.scrollBehavior = 'smooth';
                msgsContainer.scrollTop = msgsContainer.scrollHeight;
                // Reset scroll behavior back to auto after scroll finishes
                setTimeout(() => {
                    if (msgsContainer) msgsContainer.style.scrollBehavior = 'auto';
                }, 500);
            }
        }, 50);
    }

    showReplyModal(senderId, originalTitle) {
        // Find sender name from clients or teachers or admins
        let sender = this.state.clients.find(c => c.id == senderId);
        if (!sender) sender = this.state.teachers.find(t => t.id == senderId);
        if (!sender) sender = this.state.admins.find(a => a.id == senderId);

        const senderName = sender ? sender.name : 'Utilizador';
        const replySubject = originalTitle.startsWith('Re: ') ? originalTitle : `Re: ${originalTitle}`;

        this.showModal(`
            <h3 style="margin-top:0;">Responder a Mensagem</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">Para: <strong>${senderName}</strong></p>
            
            <div style="display:flex; flex-direction:column; gap:1rem;">
                <div>
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Assunto</label>
                    <input type="text" id="reply-subject" value="${replySubject}" class="search-bar">
                </div>
                <div>
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Mensagem</label>
                    <textarea id="reply-body" class="search-bar" style="height:120px; padding:15px; resize:vertical;" placeholder="Escreva a sua resposta..."></textarea>
                </div>
                <button class="btn btn-primary" onclick="app.sendReply(${senderId})">
                    <i class="fas fa-paper-plane"></i> Enviar Resposta
                </button>
            </div>
        `);
    }

    sendReply(targetId) {
        const subject = document.getElementById('reply-subject').value.trim();
        const body = document.getElementById('reply-body').value.trim();

        if (!subject || !body) return alert('Preencha o assunto e a mensagem.');

        this.addAppNotification(targetId, subject, body, this.currentUser.id, 'message');

        this.closeModal();
        alert('Resposta enviada com sucesso! ');
    }

    showSendMessageModal() {
        const teacherId = this.currentUser.teacherId;
        const teacher = this.state.teachers.find(t => t.id === teacherId);

        if (!teacher) return alert('Nao tem professor atribuido.');

        this.showModal(`
            <h3 style="margin-top:0;">Nova Mensagem</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">Para: <strong>${teacher.name}</strong></p>
            
            <div style="display:flex; flex-direction:column; gap:1rem;">
                <div>
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Assunto</label>
                    <input type="text" id="msg-subject" class="search-bar" placeholder="Ex: Duvida no treino...">
                </div>
                <div>
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Mensagem</label>
                    <textarea id="msg-body" class="search-bar" style="height:120px; padding:15px; resize:vertical;" placeholder="Escreva a sua mensagem aqui..."></textarea>
                </div>
                <button class="btn btn-primary" onclick="app.sendMessageToTeacher(${teacherId})">
                    <i class="fas fa-paper-plane"></i> Enviar
                </button>
            </div>
        `);
    }

    sendMessageToTeacher(teacherId) {
        const subject = document.getElementById('msg-subject').value.trim();
        const body = document.getElementById('msg-body').value.trim();

        if (!subject || !body) return alert('Preencha o assunto e a mensagem.');

        // Enviar notificacao para o professor
        this.addAppNotification(teacherId, `Mensagem de ${this.currentUser.name}`, `${subject}\n\n${body}`, this.currentUser.id, 'message');

        this.closeModal();
        alert('Mensagem enviada com sucesso! ');
    }

    deleteNotification(createdAt, userId) {
        if (!confirm('Eliminar esta mensagem?')) return;

        // Encontrar indice (usar == para garantir que string vs number timestamp funciona)
        const idx = this.state.notifications.findIndex(n => n.targetUserId == userId && n.createdAt == createdAt);
        if (idx !== -1) {
            this.state.notifications.splice(idx, 1);
            this.saveState();
            this.renderChat(document.getElementById('main-content'));
        }
    }

    clearAllNotifications() {
        if (!confirm('Tem a certeza que deseja apagar todas as mensagens?')) return;

        const userId = this.currentUser.id;
        this.state.notifications = (this.state.notifications || []).filter(n => n.targetUserId != userId);
        this.saveState();
        this.renderChat(document.getElementById('main-content'));
    }

    resetPass(type, id, name) {
        const newPass = prompt(`Nova password para ${name}: `, "123");
        if (newPass) {
            let list = this.state.clients;
            if (type === 'teacher') list = this.state.teachers;
            if (type === 'admin') list = this.state.admins;

            const user = list.find(u => u.id === id);
            if (user) {
                user.password = newPass;
                this.saveState();
                alert('Palavra-passe atualizada com sucesso!');
                // Refresh list if we are in users view
                if (this.activeView === 'users') {
                    this.switchAdminTab(type === 'client' ? 'clients' : (type === 'admin' ? 'admins' : 'teachers'));
                } else {
                    this.renderContent();
                }
            }
        }
    }

    assignTeacher(clientId, teacherId) {
        if (!teacherId) return;
        const client = this.state.clients.find(c => c.id === clientId);
        if (client) {
            client.teacherId = Number(teacherId);
            this.saveState();
            alert('Professor atribuido com sucesso!');
            this.switchAdminTab('clients');
        }
    }

    async updateClientPlan(clientId, plan) {
        const client = this.state.clients.find(c => Number(c.id) === Number(clientId));
        if (!client) return;
        client.plan = plan;
        await this.saveState();
        const p = this.getPlanLabel(plan);
        this.showToast(`Plano alterado para: ${p.label}`);
        this.renderContent();
    }

    async updateClientPlanFromQR(clientId, plan) {
        if (!clientId) return;
        const client = this.state.clients.find(c => Number(c.id) === Number(clientId));
        if (!client) return;
        client.plan = plan;
        await this.saveState();
        const p = this.getPlanLabel(plan);
        this.showToast(`${client.name}: Mensalidade alterada para ${p.label}`);
    }

    deleteUser(type, id, name) {
        if (confirm(`Tem a certeza que deseja eliminar o utilizador ${name}?\nAVISO: Todos os planos, historico e avaliacoes associados serao removidos permanentemente.`)) {
            if (type === 'admin') {
                if (id === 1) return alert('O administrador principal nao pode ser removido.');
                if (id === this.currentUser.id) return alert('Nao pode remover a sua propria conta enquanto estiver logado.');
                this.state.admins = this.state.admins.filter(u => u.id !== id);
            } else if (type === 'teacher') {
                this.state.teachers = this.state.teachers.filter(u => u.id !== id);
            } else {
                // Eliminar o cliente
                this.state.clients = this.state.clients.filter(u => u.id !== id);

                // Limpeza profunda de dados associados para libertar espaco no Firebase
                const sid = String(id);
                if (this.state.trainingPlans) delete this.state.trainingPlans[sid];
                if (this.state.mealPlans) delete this.state.mealPlans[sid];
                if (this.state.evaluations) delete this.state.evaluations[sid];
                if (this.state.trainingHistory) delete this.state.trainingHistory[sid];
                if (this.state.anamnesis) delete this.state.anamnesis[sid];

                // Limpar mensagens trocadas com este cliente
                if (this.state.notifications) {
                    this.state.notifications = this.state.notifications.filter(n => n.targetUserId !== id && n.senderId !== id);
                }
            }
            this.saveState();
            alert('Utilizador e todos os seus dados eliminados com sucesso! ');

            if (this.activeView === 'users') {
                this.switchAdminTab(type === 'client' ? 'clients' : (type === 'admin' ? 'admins' : 'teachers'));
            } else {
                this.renderContent();
            }
        }
    }

    showTransferClientModal(clientId) {
        const client = this.state.clients.find(c => c.id == clientId);
        if (!client) return;

        // Filter teachers, exclude current one
        const otherTeachers = this.state.teachers.filter(t => t.id !== this.currentUser.id);

        if (otherTeachers.length === 0) return alert('Nao existem outros professores para transferir.');

        const options = otherTeachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Transferir Aluno</h2>
                <p>Selecione o novo professor para <strong>${client.name}</strong>:</p>
                
                <select id="transfer-teacher-select" style="width:100%; padding:10px; border-radius:8px; margin-bottom:1.5rem; background:#1e293b; color:white; border:1px solid #444;">
                    ${options}
                </select>

                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1.5rem;">
                    <i class="fas fa-info-circle"></i> O historico, planos e avaliacoes serao mantidos. Os administradores serao notificados desta transferencia.
                </p>

                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.transferClient(${clientId})">Confirmar Transferencia</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    transferClient(clientId) {
        const newTeacherId = document.getElementById('transfer-teacher-select').value;
        if (!newTeacherId) return;

        const client = this.state.clients.find(c => c.id == clientId);
        const newTeacher = this.state.teachers.find(t => t.id == newTeacherId);

        if (client && newTeacher) {
            const oldTeacherName = this.currentUser.name;
            client.teacherId = Number(newTeacherId);

            // Notify Admins
            const msgText = ` TRANSFERENCIA DE ALUNO: O aluno ${client.name} foi transferido de ${oldTeacherName} para ${newTeacher.name} em ${new Date().toLocaleString()}.`;

            // Allow storing admin notifications in messages or a separate log. 
            // Using 'messages' with specific 'to' for admin viewing if implemented, 
            // or just rely on 'admin' role checking messages. 
            // For now, let's just push a message addressed to 'admin' (virtual).
            this.state.messages.push({
                from: 'Sistema',
                to: 'admin', // target 'admin' box
                text: msgText,
                time: new Date().toLocaleString()
            });

            this.saveState();
            document.querySelector('.modal-overlay').remove();
            alert(`Aluno transferido com sucesso para ${newTeacher.name}.`);
            this.setView('clients'); // Go back to list as client is no longer ours
        }
    }

    spyClient(id) {
        this.currentClientId = Number(id);

        // Self-healing: Garantir estruturas base (sem apagar planos existentes)
        if (!this.state.trainingPlans) this.state.trainingPlans = {};
        if (!this.state.mealPlans) this.state.mealPlans = {};
        if (!this.state.evaluations) this.state.evaluations = {};
        if (!this.state.trainingHistory) this.state.trainingHistory = {};
        if (!this.state.mealPlans[this.currentClientId]) this.state.mealPlans[this.currentClientId] = { title: 'Plano Alimentar', meals: [] };
        if (!this.state.evaluations[this.currentClientId]) this.state.evaluations[this.currentClientId] = [];
        if (!this.state.trainingHistory[this.currentClientId]) this.state.trainingHistory[this.currentClientId] = [];

        this.spySubView = 'training'; // Reset para treinos ao abrir nova ficha
        this.setView('spy_view');
    }

    normalizeText(text) {
        return text ? text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
    }

    getNutritionFromText(text) {
        if (!text) return { kcal: 0, prot: 0, carb: 0, fat: 0 };
        const lines = text.split('\n');
        let total = { kcal: 0, prot: 0, carb: 0, fat: 0 };
        const unitWeights = {
            'g': 1,
            'ml': 1,
            'l': 1000,
            'un': 50,
            'fatia(s)': 30,
            'c. sopa': 15,
            'c. sobremesa': 10,
            'c. cafe': 5,
            'chavena': 200,
            'copo': 200
        };

        lines.forEach(line => {
            // Regex melhorado para suportar ":" ou "-" como separador e unidades extras como "L"
            const match = line.match(/^-?\s*(.*?)(?::|-)\s*(\d+(?:\.\d+)?)\s*(g|ml|l|un|c\. sopa|c\. sobremesa|c\. cafe|fatia(?:\(s\))?|chavena|copo)$/i);
            if (match) {
                const name = match[1].trim();
                const qty = parseFloat(match[2]);
                const unit = match[3].trim().toLowerCase();

                let normalizedUnit = unit;
                if (unit === 'fatia') normalizedUnit = 'fatia(s)';

                const food = this.state.foods.find(f => f.name.toLowerCase() === name.toLowerCase());
                if (food) {
                    // Se o alimento tiver um peso especifico por unidade (portionWeight), usamos esse para "un"
                    let weightInGrams = unitWeights[normalizedUnit] || 1;
                    if (normalizedUnit === 'un' && food.portionWeight) {
                        weightInGrams = food.portionWeight;
                    }

                    const multiplier = weightInGrams * (qty / 100);

                    total.kcal += (food.kcal || 0) * multiplier;
                    total.prot += (food.protein || 0) * multiplier;
                    total.carb += (food.carbs || 0) * multiplier;
                    total.fat += (food.fat || 0) * multiplier;
                }
            }
        });
        return total;
    }

    renderTeacherClientsList(query = '') {
        const container = document.getElementById('teacher-clients-list');
        if (!container) return;

        const q = this.normalizeText(query);
        const clients = this.state.clients.filter(c =>
            c.teacherId === this.currentUser.id &&
            (this.normalizeText(c.name).includes(q) || this.normalizeText(c.email).includes(q))
        );

        if (clients.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:1rem;">Nenhum aluno encontrado.</p>';
            return;
        }

        container.innerHTML = clients.map(c => {
            const initials = c.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            return `
            <div class="glass-card" style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:1rem;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; overflow: hidden; border: 1px solid var(--surface-border);">
                        ${c.photoUrl ? `<img src="${c.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : initials}
                    </div>
                    <strong>${c.name}</strong>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="app.spyClient('${c.id}')">Gerir</button>
            </div> `;
        }).join('');
    }

    renderAnamnesisList(query = '') {
        const container = document.getElementById('anamnesis-list');
        if (!container) return;

        const q = this.normalizeText(query);
        const myClients = this.state.clients.filter(c => c.teacherId === this.currentUser.id);
        const myClientIds = myClients.map(c => c.id);

        let anamnesisEntries = [];
        Object.entries(this.state.anamnesis || {}).forEach(([clientId, entries]) => {
            if (myClientIds.includes(Number(clientId))) {
                entries.forEach((entry, idx) => {
                    const client = myClients.find(c => c.id == clientId);
                    if (this.normalizeText(client.name).includes(q) || this.normalizeText(entry.date).includes(q)) {
                        anamnesisEntries.push({ ...entry, clientId, idx, clientName: client.name });
                    }
                });
            }
        });

        // Ordenar por data decrescente
        anamnesisEntries.sort((a, b) => {
            const dateA = a.date.split('/').reverse().join('-');
            const dateB = b.date.split('/').reverse().join('-');
            return dateB.localeCompare(dateA);
        });

        if (anamnesisEntries.length === 0) {
            container.innerHTML = '<div class="glass-card animate-fade-in" style="text-align:center; padding:2rem;"><p style="color:var(--text-muted); margin:0;">Nenhuma anamnese registada.</p></div>';
            return;
        }

        container.innerHTML = anamnesisEntries.map(entry => `
            <div class="glass-card animate-scale-in" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                <div>
                    <strong>${entry.clientName}</strong>
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
                        <i class="far fa-calendar-alt"></i> ${entry.date}
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-ghost btn-sm" onclick="app.downloadAnamnesisPDF(${entry.clientId}, ${entry.idx})" title="Exportar PDF"><i class="fas fa-file-pdf"></i></button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--primary);" onclick="app.showAnamnesisModal(${entry.clientId}, ${entry.idx})" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.deleteAnamnesis(${entry.clientId}, ${entry.idx})" title="Remover"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    }

    renderAnamnesisView(container, clientId) {
        const cid = String(clientId);
        if (!this.state.anamnesis) this.state.anamnesis = {};
        if (!this.state.anamnesis[cid]) this.state.anamnesis[cid] = [];
        const entries = this.state.anamnesis[cid];
        const isTeacher = this.role === 'teacher';

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h3 style="margin:0;"><i class="fas fa-history"></i> Historico de Anamneses</h3>
                ${isTeacher ? `<button class="btn btn-primary btn-sm" onclick="app.showAnamnesisModal(${clientId})"><i class="fas fa-plus"></i> Novo Registo</button>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${entries.length === 0 ? `
                    <div class="glass-card animate-fade-in" style="text-align:center; padding:3rem; opacity: 0.7;">
                        <i class="fas fa-notes-medical" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
                        <p style="margin:0;">Nenhum registo de anamnese disponivel.</p>
                    </div>
                ` :
                entries.map((entry, idx) => `
                    <div class="glass-card animate-scale-in anamnesis-item" style="margin-bottom:0;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="width: 45px; height: 45px; border-radius: 12px; background: rgba(145, 27, 43, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0;">
                                <i class="fas fa-file-alt"></i>
                            </div>
                            <div>
                                <div style="font-weight:700; font-size: 1.05rem;">${entry.date}</div>
                                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                                    <span style="color: var(--primary); font-weight: 600;">Objetivo:</span> ${entry.objective || 'Nao definido'}
                                </div>
                            </div>
                        </div>
                        <div class="actions" style="display:flex; gap:0.5rem;">
                             <button class="btn btn-ghost btn-sm" onclick="app.downloadAnamnesisPDF(${clientId}, ${idx})" title="Exportar PDF"><i class="fas fa-file-pdf"></i></button>
                             ${isTeacher ? `
                                <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="app.showAnamnesisModal(${clientId}, ${idx})"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.deleteAnamnesis(${clientId}, ${idx})"><i class="fas fa-trash"></i></button>
                             ` : ''}
                        </div>
                    </div>
                `).reverse().join('')}
            </div>
        `;
    }

    showAddAnamnesisModal() {
        const myClients = this.state.clients.filter(c => c.teacherId === this.currentUser.id);
        if (myClients.length === 0) return alert('Ainda nao tem alunos atribuidos.');

        this.showModal(`
            <h3 style="margin-top:0;">Nova Anamnese</h3>
            <p style="color:var(--text-muted); font-size:0.9rem;">Selecione o aluno para o qual deseja registar uma nova anamnese.</p>
            <div style="margin-top: 1.5rem;">
                <label style="display:block; margin-bottom:0.5rem; font-weight:600; font-size:0.85rem;">Aluno:</label>
                <select id="anam-client-id" class="search-bar" style="width:100%; margin-bottom:1.5rem; background:var(--surface); color:white; border:1px solid var(--surface-border); padding:10px; border-radius:8px;">
                    ${myClients.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
                <button class="btn btn-primary" style="width:100%;" onclick="const id = document.getElementById('anam-client-id').value; app.closeModal(); app.showAnamnesisModal(id)">
                    Continuar <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        `);
    }

    showAnamnesisModal(clientId, index = null) {
        let anam = {
            date: new Date().toISOString().split('T')[0],
            objective: '',
            activityLevel: 'Sedentario',
            isSmoker: 'Nao',
            healthHistory: '',
            medications: '',
            surgeriesInjuries: '',
            allergies: '',
            familyHistory: '',
            observations: ''
        };

        if (index !== null) {
            const entry = this.state.anamnesis[String(clientId)][index];
            let dateVal = entry.date;
            if (dateVal.includes('/')) {
                const [d, m, y] = dateVal.split('/');
                dateVal = `${y}-${m}-${d}`;
            }
            anam = { ...entry, date: dateVal };
        }

        const client = this.state.clients.find(c => c.id == clientId);

        this.showModal(`
            <div class="modal-sidebar-layout">
                <!-- Sidebar/Nav Area -->
                <div class="modal-sidebar-nav">
                    <div>
                        <div style="width: 50px; height: 50px; border-radius: 12px; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: #fff; margin-bottom: 1rem; box-shadow: 0 8px 16px rgba(145, 27, 43, 0.3);">
                            <i class="fas fa-notes-medical"></i>
                        </div>
                        <h2 style="margin:0; font-size: 1.4rem;">Anamnese</h2>
                        <p style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">Aluno: <span style="color:var(--primary); font-weight:700;">${client ? client.name : 'N/A'}</span></p>
                    </div>
                    
                    <button class="btn btn-ghost btn-sm" style="justify-content: flex-start;" onclick="document.getElementById('anam-section-1').scrollIntoView({behavior:'smooth'})">
                        <i class="fas fa-user-check" style="width: 20px;"></i> <span>Perfil & Objetivos</span>
                    </button>
                    <button class="btn btn-ghost btn-sm" style="justify-content: flex-start;" onclick="document.getElementById('anam-section-2').scrollIntoView({behavior:'smooth'})">
                        <i class="fas fa-heartbeat" style="width: 20px;"></i> <span>Historico Saude</span>
                    </button>
                    <button class="btn btn-ghost btn-sm" style="justify-content: flex-start;" onclick="document.getElementById('anam-section-3').scrollIntoView({behavior:'smooth'})">
                        <i class="fas fa-pills" style="width: 20px;"></i> <span>Meds & Outros</span>
                    </button>
                    
                    <div style="margin-top: auto; padding-top: 1.5rem; border-top: 1px solid var(--surface-border);">
                         <button class="btn btn-primary" style="width:100%; height: 50px; font-size: 1rem;" onclick="app.saveAnamnesis(${clientId}, ${index})">
                            <i class="fas fa-save"></i> GRAVAR
                        </button>
                        <button class="btn btn-ghost" style="width:100%; margin-top: 0.5rem;" onclick="app.closeModal()">Cancelar</button>
                    </div>
                </div>

                <!-- Content Area -->
                <div class="modal-sidebar-content">
                    <div id="anam-section-1" style="margin-bottom: 4rem;">
                        <h3 style="color: var(--primary); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2rem; display: flex; align-items: center; gap: 0.75rem;">
                            <span style="width: 30px; height: 30px; border-radius: 50%; background: rgba(145, 27, 43, 0.1); display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">1</span>
                            Perfil e Objetivos
                        </h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem;">
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Data do Registo</label>
                                <input type="date" id="anam-date" value="${anam.date}" class="search-bar" style="background: rgba(255,255,255,0.03);">
                            </div>
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Objetivo Principal</label>
                                <input type="text" id="anam-objective" value="${anam.objective}" class="search-bar" placeholder="Ex: Perda de Peso..." style="background: rgba(255,255,255,0.03);">
                            </div>
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Nivel Atividade</label>
                                <select id="anam-activity" class="search-bar" style="background: #1e293b;">
                                    <option ${anam.activityLevel === 'Sedentario' ? 'selected' : ''}>Sedentario</option>
                                    <option ${anam.activityLevel === 'Leve' ? 'selected' : ''}>Leve</option>
                                    <option ${anam.activityLevel === 'Moderado' ? 'selected' : ''}>Moderado</option>
                                    <option ${anam.activityLevel === 'Intenso' ? 'selected' : ''}>Intenso</option>
                                </select>
                            </div>
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Fumador?</label>
                                <select id="anam-smoker" class="search-bar" style="background: #1e293b;">
                                    <option ${anam.isSmoker === 'Nao' ? 'selected' : ''}>Nao</option>
                                    <option ${anam.isSmoker === 'Sim' ? 'selected' : ''}>Sim</option>
                                    <option ${anam.isSmoker === 'Ocasional' ? 'selected' : ''}>Ocasional</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div id="anam-section-2" style="margin-bottom: 4rem;">
                        <h3 style="color: var(--primary); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2rem; display: flex; align-items: center; gap: 0.75rem;">
                            <span style="width: 30px; height: 30px; border-radius: 50%; background: rgba(145, 27, 43, 0.1); display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">2</span>
                            Historico de Saude
                        </h3>
                        <div style="display: flex; flex-direction: column; gap: 2rem;">
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Historico de Saude / Doencas</label>
                                <textarea id="anam-health" class="search-bar" placeholder="Ex: Hipertensao, Diabetes..." style="height:120px; padding: 15px; background: rgba(255,255,255,0.03);">${anam.healthHistory}</textarea>
                            </div>
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Cirurgias ou Lesoes Recentes</label>
                                <textarea id="anam-surgeries" class="search-bar" placeholder="Descreva problemas ortopedicos ou intervencoes..." style="height:100px; padding: 15px; background: rgba(255,255,255,0.03);">${anam.surgeriesInjuries}</textarea>
                            </div>
                        </div>
                    </div>

                    <div id="anam-section-3">
                        <h3 style="color: var(--primary); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2rem; display: flex; align-items: center; gap: 0.75rem;">
                            <span style="width: 30px; height: 30px; border-radius: 50%; background: rgba(145, 27, 43, 0.1); display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">3</span>
                            Medicacao e Outros
                        </h3>
                        <div style="display: flex; flex-direction: column; gap: 2rem;">
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Medicamentacao Atual</label>
                                <input type="text" id="anam-meds" value="${anam.medications}" class="search-bar" placeholder="Liste medicamentos em uso..." style="background: rgba(255,255,255,0.03);">
                            </div>
                            <div class="input-group" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
                                <div>
                                    <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Alergias</label>
                                    <input type="text" id="anam-allergies" value="${anam.allergies}" class="search-bar" placeholder="Ex: Penicilina, Acaros..." style="background: rgba(255,255,255,0.03);">
                                </div>
                                <div>
                                    <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Historico Familiar</label>
                                    <input type="text" id="anam-family" value="${anam.familyHistory}" class="search-bar" placeholder="Ex: Problemas cardiacos..." style="background: rgba(255,255,255,0.03);">
                                </div>
                            </div>
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Observacoes Adicionais</label>
                                <textarea id="anam-obs" class="search-bar" style="height:100px; padding: 15px; background: rgba(255,255,255,0.03);">${anam.observations}</textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Visible only on mobile -->
                <div class="modal-mobile-footer" style="display: none;">
                    <button class="btn btn-secondary" style="flex: 1;" onclick="app.closeModal()">Fechar</button>
                    <button class="btn btn-primary" style="flex: 2;" onclick="app.saveAnamnesis(${clientId}, ${index})">
                        <i class="fas fa-save"></i> GRAVAR
                    </button>
                </div>

                <!-- PC Top-Right Close Button -->
                <button class="btn btn-ghost hide-mobile" style="position: absolute; right: 2rem; top: 1.5rem; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.05);" onclick="app.closeModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `, '1200px');
    }

    saveAnamnesis(clientId, index = null) {
        try {
            const dateInput = document.getElementById('anam-date').value;
            if (!dateInput) return alert('Por favor, indique a data.');

            const [y, m, d] = dateInput.split('-');
            const formattedDate = `${d}/${m}/${y}`;

            const entry = {
                date: formattedDate,
                objective: document.getElementById('anam-objective').value,
                healthHistory: document.getElementById('anam-health').value,
                medications: document.getElementById('anam-meds').value,
                surgeriesInjuries: document.getElementById('anam-surgeries').value,
                familyHistory: document.getElementById('anam-family').value,
                activityLevel: document.getElementById('anam-activity').value,
                isSmoker: document.getElementById('anam-smoker').value,
                allergies: document.getElementById('anam-allergies').value,
                observations: document.getElementById('anam-obs').value,
                author: this.currentUser.name,
                updatedAt: new Date().toLocaleDateString('pt-PT')
            };

            const cid = String(clientId);
            if (!this.state.anamnesis) this.state.anamnesis = {};
            if (!this.state.anamnesis[cid]) this.state.anamnesis[cid] = [];

            if (index !== null) {
                this.state.anamnesis[cid][index] = entry;
            } else {
                this.state.anamnesis[cid].push(entry);
            }

            this.saveState();
            this.closeModal();
            this.renderContent();
            this.showToast('Anamnese guardada com sucesso! ');
        } catch (err) {
            console.error('Error saving anamnesis:', err);
            alert('Erro ao guardar os dados. Verifique a consola.');
        }
    }

    deleteAnamnesis(clientId, index) {
        if (!confirm('Tem a certeza que deseja remover este registo de anamnese?')) return;
        this.state.anamnesis[String(clientId)].splice(index, 1);
        this.saveState();
        this.renderContent();
    }

    updateDashboardMonth(val) {
        this.dashboardMonth = val;
        this.renderContent();
    }

    renderAdminGlobalClientsList(query = '') {
        const container = document.getElementById('admin-global-clients-list');
        if (!container) return;

        const q = this.normalizeText(query);
        const clients = this.state.clients.filter(c =>
            this.normalizeText(c.name).includes(q) ||
            this.normalizeText(c.email).includes(q) ||
            (c.phone && c.phone.replace(/\s/g, '').includes(q))
        );

        if (clients.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:1rem;">Nenhum aluno encontrado.</p>';
            return;
        }

        container.innerHTML = clients.map(c => {
            const initials = c.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            const teacher = this.state.teachers.find(t => t.id === c.teacherId);
            return `
            <div class="glass-card" style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:1rem;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--secondary); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; overflow: hidden; border: 1px solid var(--surface-border);">
                        ${c.photoUrl ? `<img src="${c.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : initials}
                    </div>
                    <div>
                        <strong>${c.name}</strong><br>
                        <small style="color:var(--text-muted);">Professor: ${teacher ? teacher.name : 'Nenhum'}</small>
                    </div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="app.spyClient('${c.id}')">Ver Ficha</button>
            </div> `;
        }).join('');
    }

    calculateAge(dateString) {
        if (!dateString) return '';
        const today = new Date();
        const birthDate = new Date(dateString);
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const [year, month, day] = dateString.split('-');
        return `${day} /${month}/${year} `;
    }

    downloadTrainingPDF(clientId) {
        const client = this.state.clients.find(c => c.id == clientId);
        const plans = this.getTrainingDays(clientId);

        if (!client || !plans || !plans.length) return alert('Sem dados para exportar.');

        // 1. Criar um elemento temporario para impressao
        const element = document.createElement('div');
        element.style.position = 'fixed';
        element.style.left = '0';
        element.style.top = '0';
        element.style.width = '210mm';
        element.style.zIndex = '-9999';
        element.style.padding = '20px';
        element.style.background = 'white';
        element.style.color = '#333';
        element.style.fontFamily = 'Arial, sans-serif';

        document.body.appendChild(element);

        // 2. Build the HTML content
        let html = `
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #911B2B; padding-bottom: 10px;">
                <h1 style="color: #911B2B; margin: 0;">KandalGym</h1>
                <p style="color: #666; margin: 5px 0;">Plano de Treino Personalizado</p>
            </div>

                <div style="margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <h2 style="margin-top: 0; font-size: 18px; color: #333;">Aluno: ${client.name}</h2>
                    <p style="margin: 5px 0; font-size: 14px;"><strong>Data:</strong> ${new Date().toLocaleDateString('pt-PT')}</p>
                    <p style="margin: 5px 0; font-size: 14px;"><strong>Objetivo:</strong> ${client.goal || 'Geral'}</p>
                </div>
            `;

        plans.forEach(day => {
            html += `
                <div style="margin-bottom: 25px;">
                    <h3 style="background: #911B2B; color: white; padding: 10px; margin-bottom: 0; font-size: 16px;">${day.title}</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr style="background: #eee;">
                            <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Exercicio</th>
                            <th style="padding: 8px; text-align: center; border: 1px solid #ddd; width: 80px;">Series</th>
                            <th style="padding: 8px; text-align: center; border: 1px solid #ddd; width: 80px;">Reps</th>
                            <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Obs</th>
                        </tr>
            `;

            day.exercises.forEach(ex => {
                html += `
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>${ex.name}</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${ex.sets}</td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${ex.reps}</td>
                        <td style="padding: 8px; border: 1px solid #ddd; color: #555;">${ex.observations || '-'}</td>
                    </tr>
                `;
            });

            html += `
                    </table>
                </div>
            `;
        });

        html += `
            <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #999;">
                <p>Gerado por KandalGym App</p>
            </div>
            `;

        // 3. Imprimir usando o navegador (Reset para nativo)
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head><title>Treino - ${client.name}</title></head>
                <body onload="window.print(); window.close();">
                    ${html}
                </body>
            </html>
        `);
        printWindow.document.close();
    }

    downloadMealPDF(clientId) {
        const client = this.state.clients.find(c => c.id == clientId);
        const mealPlan = this.state.mealPlans[clientId];

        if (!client || !mealPlan || !mealPlan.meals || !mealPlan.meals.length) {
            return alert('Sem plano alimentar para exportar.');
        }

        // Calculate daily totals
        const dailyTotal = { kcal: 0, prot: 0, carb: 0, fat: 0 };
        mealPlan.meals.forEach(m => {
            const mN = this.getNutritionFromText(m.items);
            dailyTotal.kcal += mN.kcal;
            dailyTotal.prot += mN.prot;
            dailyTotal.carb += mN.carb;
            dailyTotal.fat += mN.fat;
        });

        // Build HTML content
        let htmlContent = `
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #911B2B; padding-bottom: 10px;">
                <h1 style="color: #911B2B; margin: 0;">KandalGym</h1>
                <p style="color: #666; margin: 5px 0;">Plano Alimentar Personalizado</p>
            </div>

            <div style="margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h2 style="margin: 0; font-size: 18px; color: #333;">Aluno: ${client.name}</h2>
                <p style="margin: 5px 0; font-size: 14px;"><strong>Data:</strong> ${new Date().toLocaleDateString('pt-PT')}</p>
                ${dailyTotal.kcal > 0 ? `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <div style="border: 1px solid #ddd; padding: 5px 10px; border-radius: 5px; background: white; text-align: center; flex: 1;">
                        <small style="display: block; color: #777; font-size: 10px;">KCAL</small>
                        <strong>${Math.round(dailyTotal.kcal)}</strong>
                    </div>
                    <div style="border: 1px solid #ddd; padding: 5px 10px; border-radius: 5px; background: white; text-align: center; flex: 1;">
                        <small style="display: block; color: #777; font-size: 10px;">PROT</small>
                        <strong>${Math.round(dailyTotal.prot)}g</strong>
                    </div>
                    <div style="border: 1px solid #ddd; padding: 5px 10px; border-radius: 5px; background: white; text-align: center; flex: 1;">
                        <small style="display: block; color: #777; font-size: 10px;">CARB</small>
                        <strong>${Math.round(dailyTotal.carb)}g</strong>
                    </div>
                    <div style="border: 1px solid #ddd; padding: 5px 10px; border-radius: 5px; background: white; text-align: center; flex: 1;">
                        <small style="display: block; color: #777; font-size: 10px;">GORD</small>
                        <strong>${Math.round(dailyTotal.fat)}g</strong>
                    </div>
                </div>
                ` : ''}
            </div>

            <h3 style="color: #911B2B; border-bottom: 1px solid #eee; padding-bottom: 5px; margin: 20px 0 15px 0;">${mealPlan.title || 'Plano Alimentar'}</h3>
        `;

        mealPlan.meals.forEach(m => {
            const mN = this.getNutritionFromText(m.items);
            htmlContent += `
                <div style="margin-bottom: 20px; page-break-inside: avoid;">
                    <div style="background: #911B2B; color: white; padding: 8px 12px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                        <span>${m.time} - ${m.name}</span>
                        ${mN.kcal > 0 ? `<span style="font-size: 12px;">${Math.round(mN.kcal)} kcal</span>` : ''}
                    </div>
                    <div style="padding: 12px; border: 1px solid #eee; border-top: none; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${m.items || 'Sem alimentos adicionados'}</div>
                    ${mN.kcal > 0 ? `
                    <div style="padding: 5px 12px; background: #fefefe; border: 1px solid #eee; border-top: none; font-size: 11px; color: #666;">
                        <strong>Macros:</strong> Prot: ${Math.round(mN.prot)}g | Carb: ${Math.round(mN.carb)}g | Gord: ${Math.round(mN.fat)}g
                    </div>
                    ` : ''}
                </div>
            `;
        });

        // 3. Imprimir usando o navegador (Reset para nativo)
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head><title>Dieta - ${client.name}</title></head>
                <body onload="window.print(); window.close();">
                    <div style="padding: 20px; font-family: Arial, sans-serif;">
                        ${htmlContent}
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
    }

    downloadEvaluationPDF(clientId, index = null) {
        const client = this.state.clients.find(c => c.id == clientId);
        const evals = this.state.evaluations[clientId] || [];

        if (!client || !evals.length) {
            return alert('Ainda nao existem avaliacoes para exportar.');
        }

        const evalsToPrint = index !== null ? [evals[index]] : evals;

        let html = `
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #911B2B; padding-bottom: 10px;">
                <h1 style="color: #911B2B; margin: 0;">KandalGym</h1>
                <p style="color: #666; margin: 5px 0;">Relatorio de Avaliação Fisica</p>
            </div>

            <div style="margin-bottom: 25px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h2 style="margin: 0; font-size: 18px; color: #333;">Aluno: ${client.name}</h2>
                <p style="margin: 5px 0; font-size: 14px;"><strong>Data de Emissao:</strong> ${new Date().toLocaleDateString('pt-PT')}</p>
            </div>
        `;

        evalsToPrint.forEach((ev) => {
            html += `
                <div style="margin-bottom: 30px; border: 1px solid #ddd; border-radius: 10px; overflow: hidden; page-break-inside: avoid;">
                    <div style="background: #911B2B; color: white; padding: 10px 15px; font-weight: bold; font-size: 16px; display: flex; justify-content: space-between;">
                        <span>Avaliação de ${ev.date}</span>
                    </div>
                    
                    <div style="padding: 15px;">
                        <h4 style="color: #911B2B; margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 5px; text-transform: uppercase; font-size: 12px;">Bioimpedancia</h4>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px;">
                            <tr>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0; width: 33%;"><strong>Peso:</strong> ${ev.weight || '-'} kg</td>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0; width: 33%;"><strong>Altura:</strong> ${ev.height || '-'} cm</td>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0; width: 33%;"><strong>Musculo:</strong> ${ev.muscleMass || '-'} kg</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;"><strong>Gordura:</strong> ${ev.fatPercentage || '-'} %</td>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;"><strong>Agua:</strong> ${ev.water || '-'} %</td>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;"><strong>Massa Ossea:</strong> ${ev.boneMass || '-'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;"><strong>Gord. Visceral:</strong> ${ev.visceralFat || '-'}</td>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;"><strong>Idade Met.:</strong> ${ev.metabolicAge || '-'}</td>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;"><strong>Met. Basal:</strong> ${ev.basalMetabolism || '-'}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            `;
        });

        // 3. Imprimir usando o navegador (Reset para nativo)
        const printWindow = window.open('', '_blank');
        const docTitle = index !== null ? `Avaliação - ${client.name}` : `Historico de Avaliacoes - ${client.name}`;
        printWindow.document.write(`
            <html>
                <head><title>${docTitle}</title></head>
                <body onload="window.print(); window.close();">
                    <div style="padding: 20px; font-family: Arial, sans-serif;">
                        ${html}
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
    }

    downloadAnamnesisPDF(clientId, index) {
        const client = this.state.clients.find(c => c.id == clientId);
        const entries = this.state.anamnesis[clientId] || [];
        const entry = entries[index];

        if (!client || !entry) return alert('Registo nao encontrado.');

        const html = `
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #911B2B; padding-bottom: 10px;">
                <h1 style="color: #911B2B; margin: 0;">KandalGym</h1>
                <p style="color: #666; margin: 5px 0;">Relatorio de Anamnese Fisica</p>
            </div>

            <div style="margin-bottom: 25px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h2 style="margin: 0; font-size: 18px; color: #333;">Aluno: ${client.name}</h2>
                <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:13px;">
                    <span><strong>Data do Registo:</strong> ${entry.date}</span>
                    <span><strong>Professor:</strong> ${entry.author || 'N/A'}</span>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                <div style="border:1px solid #eee; padding:15px; border-radius:8px;">
                     <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Perfil Geral</h4>
                     <p style="font-size:13px; margin:8px 0;"><strong>Objetivo:</strong> ${entry.objective || '-'}</p>
                     <p style="font-size:13px; margin:8px 0;"><strong>Nivel Atividade:</strong> ${entry.activityLevel || '-'}</p>
                     <p style="font-size:13px; margin:8px 0;"><strong>Fumador:</strong> ${entry.isSmoker || '-'}</p>
                </div>
                <div style="border:1px solid #eee; padding:15px; border-radius:8px;">
                     <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Dados Medicos</h4>
                     <p style="font-size:13px; margin:8px 0;"><strong>Alergias:</strong> ${entry.allergies || '-'}</p>
                     <p style="font-size:13px; margin:8px 0;"><strong>Historico Familiar:</strong> ${entry.familyHistory || '-'}</p>
                </div>
            </div>

            <div style="margin-top:20px; border:1px solid #eee; padding:15px; border-radius:8px;">
                <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Historico de Saude</h4>
                <div style="font-size:13px; white-space:pre-wrap; line-height:1.5;">${entry.healthHistory || 'Sem dados registados.'}</div>
            </div>

            <div style="margin-top:20px; border:1px solid #eee; padding:15px; border-radius:8px;">
                <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Cirurgias e Lesoes</h4>
                <div style="font-size:13px; white-space:pre-wrap; line-height:1.5;">${entry.surgeriesInjuries || 'Sem dados registados.'}</div>
            </div>

            <div style="margin-top:20px; border:1px solid #eee; padding:15px; border-radius:8px;">
                <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Medicamentacao</h4>
                <div style="font-size:13px; line-height:1.5;">${entry.medications || 'Nenhuma.'}</div>
            </div>

            <div style="margin-top:20px; border:1px solid #eee; padding:15px; border-radius:8px;">
                <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Observacoes</h4>
                <div style="font-size:13px; white-space:pre-wrap; line-height:1.5;">${entry.observations || '-'}</div>
            </div>

            <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #999;">
                <p>Gerado por KandalGym App</p>
            </div>
        `;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head><title>Anamnese - ${client.name}</title></head>
                <body onload="window.print(); window.close();">
                    <div style="padding: 20px; font-family: Arial, sans-serif;">
                        ${html}
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
    }

    // --- QR MANAGER FUNCTIONALITY ---
    renderQRManager(container) {
        if (!this.state.qrClients) this.state.qrClients = [];
        if (this.role !== 'admin') return container.innerHTML = '<div class="glass-card">Acesso restrito a administradores.</div>';

        try {
            container.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <h2 style="margin: 0;"><i class="fas fa-qrcode"></i> Gestao de Entradas</h2>
                        <p style="color:var(--text-muted); font-size:0.9rem; margin-top:5px;">Controle e validacao de acessos ao ginasio.</p>
                    </div>
                    <div>
                        <button class="btn btn-secondary" onclick="app.syncStaffQR()" style="height:45px;">
                            <i class="fas fa-user-shield"></i> Gerar QR Staff
                        </button>
                    </div>
                </div>

                <div class="stats-grid" style="margin-bottom: 2rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
                    <div class="glass-panel" style="padding: 1.5rem; border-left: 4px solid var(--primary);">
                        <h3 style="margin-top: 0; color: var(--primary); display: flex; align-items: center; gap: 10px; font-size: 1.1rem; margin-bottom:1rem;">
                            <i class="fas fa-camera"></i> Scanner em Tempo Real
                        </h3>
                        <div id="video-container" class="qr-scanner-container" style="border: 2px solid var(--surface-border); border-radius:15px; overflow:hidden; position:relative; aspect-ratio: 4/3; background:#000; margin-bottom:1rem;">
                            <video id="v-stream" class="qr-video" playsinline autoplay muted style="width:100%; height:100%; object-fit:cover;"></video>
                            <div id="scan-overlay" style="position:absolute; top:0; left:0; right:0; bottom:0; border:2px solid var(--primary); opacity:0.3; pointer-events:none; margin:20%; border-radius:10px;"></div>
                        </div>
                        <button class="btn btn-primary" style="width: 100%;" id="btnCam" onclick="app.iniciarLeitorQR()">
                            <i class="fas fa-video"></i> Ativar Camara
                        </button>
                        <div id="scan-status" style="margin-top: 15px; padding:10px; border-radius:10px; text-align:center; font-weight:600; font-size:0.9rem;"></div>
                    </div>

                    <div class="glass-panel" style="padding: 1.5rem; border-left: 4px solid var(--accent);">
                        <h3 style="margin-top: 0; color: var(--accent); display: flex; align-items: center; gap: 10px; font-size: 1.1rem; margin-bottom:1.5rem;">
                            <i class="fas fa-keyboard"></i> Entrada Manual & Info
                        </h3>
                        
                        <div style="margin-bottom: 2rem;">
                            <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase; font-weight:700;">Introduzir ID do Aluno</label>
                            <div style="display:flex; gap:10px;">
                                <input type="text" id="manual-qr-id" placeholder="Ex: K1" onkeyup="if(event.key==='Enter') app.processarManualQR()"
                                    style="flex:1; height:45px; background:rgba(0,0,0,0.3); border:1px solid var(--surface-border); border-radius:12px; color:#fff; padding:0 15px; font-weight:700;">
                                <button class="btn btn-accent" onclick="app.processarManualQR()" style="padding: 0 20px;">
                                    <i class="fas fa-check"></i>
                                </button>
                            </div>
                        </div>

                        <div style="display: grid; gap: 12px;">
                            <div style="display: flex; align-items: center; gap: 12px; font-size: 0.85rem; color: var(--text-muted);">
                                <div style="width:24px; height:24px; border-radius:50%; background:rgba(16, 185, 129, 0.1); display:flex; align-items:center; justify-content:center; color:var(--success);"><i class="fas fa-check" style="font-size:0.7rem;"></i></div>
                                <span>Conta deve estar <strong>Ativa</strong></span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 12px; font-size: 0.85rem; color: var(--text-muted);">
                                <div style="width:24px; height:24px; border-radius:50%; background:rgba(196, 162, 77, 0.1); display:flex; align-items:center; justify-content:center; color:var(--accent);"><i class="fas fa-calendar-alt" style="font-size:0.7rem;"></i></div>
                                <span>Validade superior a <strong>Hoje</strong></span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 12px; font-size: 0.85rem; color: var(--text-muted);">
                                <div style="width:24px; height:24px; border-radius:50%; background:rgba(145, 27, 43, 0.1); display:flex; align-items:center; justify-content:center; color:var(--primary);"><i class="fas fa-ticket-alt" style="font-size:0.7rem;"></i></div>
                                <span>Pelo menos <strong>1 Credito</strong></span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="glass-panel" style="padding: 0.5rem; display:flex; gap:0.5rem; margin-bottom:1.5rem; background:rgba(255,255,255,0.03); border-radius:15px;">
                    <button class="btn btn-sm ${this.qrActiveTab === 'clients' ? 'btn-primary' : 'btn-ghost'}" onclick="app.setQRTab('clients')" style="flex:1; border-radius:10px;">
                        <i class="fas fa-users"></i> Clientes
                    </button>
                    <button class="btn btn-sm ${this.qrActiveTab === 'staff' ? 'btn-primary' : 'btn-ghost'}" onclick="app.setQRTab('staff')" style="flex:1; border-radius:10px;">
                        <i class="fas fa-id-badge"></i> Admin & Staff
                    </button>
                </div>

                ${this.selectedQRClients.length > 0 ? `
                <div class="glass-panel animate-fade-in" style="margin-bottom: 1.5rem; padding: 1rem; border: 1px dashed var(--accent); background: rgba(196, 162, 77, 0.05); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="background:var(--accent); color:#000; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.8rem;">${this.selectedQRClients.length}</div>
                        <span style="font-weight:600; color:var(--accent);">Selecionados</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Nova Validade:</span>
                            <input type="date" id="bulk-qr-date" style="background:rgba(0,0,0,0.3); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:5px 10px; font-size:0.85rem;">
                        </div>
                        <button class="btn btn-primary btn-sm" onclick="app.applyBulkQRDateUpdate()">
                            <i class="fas fa-sync"></i> Atualizar Selecionados
                        </button>
                        <button class="btn btn-ghost btn-sm" onclick="app.clearQRSelection()" style="color:var(--text-muted);">
                            Cancelar
                        </button>
                    </div>
                </div>
                ` : ''}

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
                    <h3 style="font-weight: 700; margin:0; display:flex; align-items:center; gap:0.5rem;"><i class="fas fa-list" style="color:var(--primary);"></i> ${this.qrActiveTab === 'clients' ? 'Alunos Registados' : 'Staff Autorizado'}</h3>
                    <div class="search-container" style="margin:0; width: 100%; max-width: 400px; height: 45px;">
                        <i class="fas fa-search"></i>
                        <input type="text" class="search-bar" placeholder="Pesquisar..." oninput="app.filterQRList(this.value)">
                    </div>
                </div>
                
                <div class="glass-panel" style="padding: 0; overflow:hidden; border-radius:20px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; min-width: 900px;">
                            <thead>
                                <tr style="text-align: left; background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--surface-border);">
                                    <th style="padding: 1.25rem 0.5rem; width:40px; text-align:center;">
                                        <input type="checkbox" onclick="app.toggleAllQRSelections(this.checked)" 
                                            style="width:16px; height:16px; cursor:pointer;" 
                                            ${this.selectedQRClients.length > 0 && this.selectedQRClients.length === this.getCurrentQRListCount() ? 'checked' : ''}>
                                    </th>
                                    <th style="padding: 1.25rem 0.5rem; font-size: 0.72rem; color: var(--text-muted); text-transform:uppercase; letter-spacing:1px; width:70px;">ID</th>
                                    <th style="padding: 1.25rem 0.5rem; font-size: 0.72rem; color: var(--text-muted); text-transform:uppercase; letter-spacing:1px; min-width:180px;">Aluno / Colaborador</th>
                                    <th style="padding: 1.25rem 0.5rem; font-size: 0.72rem; color: var(--text-muted); text-transform:uppercase; letter-spacing:1px; text-align:center;">Status</th>
                                    <th style="padding: 1.25rem 0.5rem; font-size: 0.72rem; color: var(--text-muted); text-transform:uppercase; letter-spacing:1px; text-align:center;">Creditos</th>
                                    <th style="padding: 1.25rem 0.5rem; font-size: 0.72rem; color: var(--text-muted); text-transform:uppercase; letter-spacing:1px; text-align:center;">Entradas Hoje</th>
                                    <th style="padding: 1.25rem 0.5rem; font-size: 0.72rem; color: var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Validade</th>
                                    <th style="padding: 1.25rem 0.5rem; font-size: 0.72rem; color: var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Mensalidade</th>
                                    <th style="padding: 1.25rem 0.5rem; font-size: 0.72rem; color: var(--text-muted); text-transform:uppercase; letter-spacing:1px; text-align: right;">Acoes</th>
                                </tr>
                            </thead>
                            <tbody id="gridQRClientes">
                                ${this.renderQRClientCards()}
                            </tbody>
                        </table>
                    </div>
                </div>
                <!-- canvas movido para renderQRManager principal -->
                <canvas id="c-hidden" style="display:none;"></canvas>
            `;
        } catch (err) {
            console.error("Error in renderQRManager:", err);
            container.innerHTML = `<div class="glass-card" style="color:var(--danger);">Erro ao carregar Gestao de Entradas: ${err.message}</div>`;
        }

        // Reset scanner state when rendering
        this.qrScannerAtivo = false;
    }

    setQRTab(tab) {
        this.qrActiveTab = tab;
        this.selectedQRClients = []; // Limpar selecao ao trocar aba
        this.renderContent();
    }

    getCurrentQRListCount() {
        const qrList = (this.state.qrClients || []).filter(c => {
            if (this.qrActiveTab === 'clients' && (c.type === 'admin' || c.type === 'teacher')) return false;
            if (this.qrActiveTab === 'staff' && (c.type !== 'admin' && c.type !== 'teacher')) return false;
            return true;
        });
        return qrList.length;
    }

    toggleQRSelection(id, checked) {
        if (checked) {
            if (!this.selectedQRClients.includes(id)) this.selectedQRClients.push(id);
        } else {
            this.selectedQRClients = this.selectedQRClients.filter(i => i !== id);
        }
        this.renderContent();
    }

    toggleAllQRSelections(checked) {
        if (checked) {
            const qrList = (this.state.qrClients || []).filter(c => {
                if (this.qrActiveTab === 'clients' && (c.type === 'admin' || c.type === 'teacher')) return false;
                if (this.qrActiveTab === 'staff' && (c.type !== 'admin' && c.type !== 'teacher')) return false;
                return true;
            });
            this.selectedQRClients = qrList.map(c => c.id);
        } else {
            this.selectedQRClients = [];
        }
        this.renderContent();
    }

    clearQRSelection() {
        this.selectedQRClients = [];
        this.renderContent();
    }

    applyBulkQRDateUpdate() {
        const dateInput = document.getElementById('bulk-qr-date');
        if (!dateInput || !dateInput.value) return alert('Por favor, selecione uma data de validade.');

        const newDate = dateInput.value;
        let updatedCount = 0;

        this.state.qrClients.forEach(c => {
            if (this.selectedQRClients.includes(c.id)) {
                c.validade = newDate;
                updatedCount++;
            }
        });

        if (updatedCount > 0) {
            this.saveState();
            this.showToast(`${updatedCount} validades atualizadas com sucesso!`);
            this.selectedQRClients = [];
            this.renderContent();
        }
    }

    renderQRClientCards(filter = '') {
        const qrList = (this.state.qrClients || []).filter(c => {
            const f = this.normalizeText(filter);
            const nomeNormal = this.normalizeText(c.nome);
            const telNormal = this.normalizeText(c.tel || "");
            const idNormal = this.normalizeText(c.id);

            // Filter by active tab
            if (this.qrActiveTab === 'clients' && (c.type === 'admin' || c.type === 'teacher')) return false;
            if (this.qrActiveTab === 'staff' && (c.type !== 'admin' && c.type !== 'teacher')) return false;

            return nomeNormal.includes(f) || telNormal.includes(f) || idNormal.includes(f);
        });

        if (qrList.length === 0) {
            return `<tr><td colspan="7" style="padding: 4rem; text-align: center; color: var(--text-muted);"><i class="fas fa-search" style="font-size:2rem; margin-bottom:1rem; opacity:0.3; display:block;"></i> Nenhum registo encontrado nesta categoria.</td></tr>`;
        }

        const hoje = new Date().toISOString().split('T')[0];

        return qrList.map((c, idx) => {
            const entHj = (c.historico || []).filter(h => {
                const ts = typeof h === 'string' ? h : h.t;
                const type = typeof h === 'string' ? 'entrada' : h.type;
                return ts.startsWith(hoje) && type === 'entrada';
            }).length;
            const isInvalid = hoje > c.validade || !c.ativo;
            const isStaff = c.type === 'admin' || c.type === 'teacher';
            const isSelected = this.selectedQRClients.includes(c.id);

            return `
                <tr style="border-bottom: 1px solid var(--surface-border); transition: background 0.3s; ${isSelected ? 'background: rgba(196, 162, 77, 0.08);' : ''}" 
                    onmouseover="if(!this.dataset.selected) this.style.background='rgba(255,255,255,0.02)'" 
                    onmouseout="if(!this.dataset.selected) this.style.background='transparent'"
                    ${isSelected ? 'data-selected="true"' : ''}>
                    <td style="padding: 0.75rem 0.5rem; text-align:center;">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} 
                            onclick="app.toggleQRSelection('${c.id}', this.checked)"
                            style="width:16px; height:16px; cursor:pointer;">
                    </td>
                    <td style="padding: 0.75rem 0.5rem;">
                        <div style="background: ${c.type === 'admin' ? 'rgba(196,162,77,0.1)' : c.type === 'teacher' ? 'rgba(16,185,129,0.1)' : 'rgba(145,27,43,0.1)'}; 
                             color: ${c.type === 'admin' ? 'var(--accent)' : c.type === 'teacher' ? 'var(--success)' : 'var(--primary)'}; 
                             padding: 3px 8px; border-radius: 6px; font-weight: 700; font-family: monospace; display: inline-block; font-size: 0.85rem;">${c.id}</div>
                    </td>
                    <td style="padding: 0.75rem 0.5rem; min-width: 180px;">
                        <div style="display:flex; align-items:center; gap:5px;">
                            <input type="text" value="${c.nome}" onchange="app.updateQRClientField('${c.id}', 'nome', this.value)" 
                                style="background:transparent; border:none; color:#fff; font-weight:600; font-size:0.9rem; width:auto; flex:1; border-bottom: 1px dashed rgba(255,255,255,0.05); padding: 2px 5px; margin-bottom:2px;">
                            ${c.type === 'admin' ? '<span style="font-size:0.6rem; background:var(--accent); color:#000; padding:1px 4px; border-radius:4px; font-weight:700;">ADMIN</span>' : ''}
                            ${c.type === 'teacher' ? '<span style="font-size:0.6rem; background:var(--success); color:#fff; padding:1px 4px; border-radius:4px; font-weight:700;">STAFF</span>' : ''}
                        </div>
                        <input type="text" value="${c.tel}" onchange="app.updateQRClientField('${c.id}', 'tel', this.value)" 
                            style="background:transparent; border:none; color:var(--text-muted); font-size:0.7rem; width:100%; border-bottom: 1px dashed rgba(255,255,255,0.03); padding-left: 5px;">
                    </td>
                    <td style="padding: 0.75rem 0.5rem; text-align:center;">
                        <div style="display:flex; justify-content:center;">
                            <label class="switch" style="position:relative; display:inline-block; width:38px; height:20px;">
                                <input type="checkbox" ${c.ativo ? 'checked' : ''} onchange="app.toggleQRClientStatus('${c.id}')" style="opacity:0; width:0; height:0;">
                                <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:${c.ativo ? 'var(--success)' : '#475569'}; border-radius:20px; transition:0.3s;">
                                    <span style="position:absolute; content:''; height:14px; width:14px; left:3px; bottom:3px; background-color:white; border-radius:50%; transition:0.3s; transform:${c.ativo ? 'translateX(18px)' : 'translateX(0)'};"></span>
                                </span>
                            </label>
                        </div>
                    </td>
                    <td style="padding: 0.75rem 0.5rem;">
                        <div style="display: flex; align-items: center; justify-content:center; gap: 5px;">
                            ${isStaff ?
                    '<span style="color:var(--text-muted); font-size:0.8rem; font-weight:600;">Ilimitado</span>' :
                    `<button class="btn-circular-sm" onclick="app.editQRCredit('${c.id}', -1)" style="width:24px; height:24px;"><i class="fas fa-minus" style="font-size:0.6rem;"></i></button>
                                 <input type="number" value="${c.ent}" onchange="app.updateQRClientField('${c.id}', 'ent', parseInt(this.value) || 0)"
                                    style="background:rgba(255,255,255,0.03); border:1px solid var(--surface-border); border-radius:6px; color:${c.ent <= 5 ? 'var(--danger)' : '#fff'}; font-weight:700; width:60px; text-align:center; outline:none; font-size:0.85rem; height:30px;">
                                 <button class="btn-circular-sm" onclick="app.editQRCredit('${c.id}', 1)" style="width:24px; height:24px; color:var(--primary); background:rgba(145,27,43,0.1);"><i class="fas fa-plus" style="font-size:0.6rem;"></i></button>`
                }
                        </div>
                    </td>
                    <td style="padding: 0.75rem 0.5rem; text-align:center;">
                        <div style="display: flex; align-items: center; justify-content:center; gap: 8px;">
                            ${isStaff ?
                    `<div style="color:var(--success); font-weight:700; font-size:0.8rem;">Livre</div>` :
                    `<button class="btn-circular-sm" onclick="app.editQREntryHj('${c.id}', -1)" style="width:22px; height:22px;"><i class="fas fa-minus" style="font-size:0.5rem;"></i></button>
                                 <div style="color:${entHj >= 2 ? 'var(--danger)' : 'var(--accent)'}; font-weight:800; font-size:0.85rem; min-width:40px;">${entHj} / 2</div>
                                 <button class="btn-circular-sm" onclick="app.editQREntryHj('${c.id}', 1)" style="width:22px; height:22px;"><i class="fas fa-plus" style="font-size:0.5rem;"></i></button>`
                }
                        </div>
                    </td>
                    <td style="padding: 0.75rem 0.5rem;">
                        ${isStaff ?
                    '<span style="color:var(--text-muted); font-size:0.8rem;">Vitalicia</span>' :
                    `<input type="date" value="${c.validade}" onchange="app.updateQRClientField('${c.id}', 'validade', this.value)"
                                style="background:rgba(255,255,255,0.03); border:1px solid var(--surface-border); border-radius:6px; color:${hoje > c.validade ? 'var(--danger)' : 'inherit'}; font-size:0.8rem; padding:4px 8px; cursor:pointer;">`
                }
                    </td>
                    <td style="padding: 0.75rem 0.5rem;">
                        ${isStaff ? '<span style="color:var(--text-muted); font-size:0.8rem;">N/A</span>' : (() => {
                            const clientData = (this.state.clients || []).find(cl => Number(cl.id) === Number(c.clientId));
                            const currentPlan = clientData ? (clientData.plan || 'total') : 'total';
                            const p = this.getPlanLabel(currentPlan);
                            return `<select onchange="app.updateClientPlanFromQR(${c.clientId}, this.value)"
                                style="height:28px; font-size:0.72rem; padding:0 6px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid ${p.color}; color:${p.color}; font-weight:700; cursor:pointer;">
                                <option value="total" ${currentPlan === 'total' ? 'selected' : ''}>&#11088; Total</option>
                                <option value="musculacao" ${currentPlan === 'musculacao' ? 'selected' : ''}>&#128170; Musculacao</option>
                                <option value="aulas" ${currentPlan === 'aulas' ? 'selected' : ''}>&#128197; Aulas</option>
                                <option value="pilates" ${currentPlan === 'pilates' ? 'selected' : ''}>&#129472; Pilates</option>
                            </select>`;
                        })()}
                    </td>
                    <td style="padding: 0.75rem 0.5rem; text-align: right;">
                        <div style="display: flex; gap: 5px; justify-content: flex-end;">
                            <button class="btn btn-ghost btn-sm" onclick="app.showQRClientHistory('${c.id}')" style="background: rgba(255,255,255,0.05); border-radius:8px; height:34px; width:34px; color:var(--accent); font-size:0.8rem;" title="Ver Log de Entradas"><i class="fas fa-history"></i></button>
                            <button class="btn btn-ghost btn-sm" onclick="app.toggleQRCodeDisplay('qr-row-area-${idx}', '${c.id}')" style="background: rgba(255,255,255,0.05); border-radius:8px; height:34px; width:34px; color:var(--text-main); font-size:0.8rem;" title="Ver Codigo QR"><i class="fas fa-qrcode"></i></button>
                            <button class="btn btn-ghost btn-sm" onclick="app.deleteQRClient('${c.id}')" style="border-radius:8px; height:34px; width:34px; color:var(--danger); background:rgba(239, 68, 68, 0.05); font-size:0.8rem;" title="Eliminar"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
                <tr id="qr-row-area-${idx}" style="display:none; background: rgba(0,0,0,0.2);">
                    <td colspan="8" style="padding: 1.5rem 1rem; text-align: center;">
                        <div style="display:inline-flex; flex-direction:column; align-items:center; gap:1.2rem; background:rgba(255,255,255,0.02); padding:1.5rem; border-radius:20px; border:1px solid var(--surface-border);">
                            <div id="canvas-${idx}" style="background: white; padding: 15px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"></div>
                            <div style="text-align:center;">
                                <div style="font-weight: 800; color: var(--primary); font-family: monospace; font-size: 1.2rem; margin-bottom:3px;">${c.id}</div>
                                <div style="color:var(--text-muted); font-size:0.8rem;">Nome: ${c.nome}</div>
                            </div>
                            <button class="btn btn-primary" onclick="app.downloadQRCode('canvas-${idx}', '${c.id}', '${c.nome}')" style="padding: 10px 20px; border-radius:12px; font-size:0.9rem; box-shadow: 0 5px 15px rgba(145,27,43,0.3);">
                                <i class="fas fa-download"></i> Descarregar QR Code
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    filterQRList(val) {
        const body = document.getElementById("gridQRClientes");
        if (body) body.innerHTML = this.renderQRClientCards(val);
    }

    enableQRForClient(clientId, autoRedirect = true) {
        if (!this.state.qrClients) this.state.qrClients = [];

        const client = (this.state.clients || []).find(c => c.id === Number(clientId));
        if (!client) return;

        // Verificar se ja tem ID curto para este cliente
        const exists = this.state.qrClients.find(qc => qc.clientId === Number(clientId));
        if (exists) {
            if (autoRedirect) {
                this.setView('qr_manager');
                this.showToast('Este cliente ja tem acesso QR ativo.');
            }
            return;
        }

        // Encontrar proximo ID curto sequencial
        const usedIds = this.state.qrClients.map(c => {
            const m = c.id.match(/^K(\d+)$/);
            return m ? parseInt(m[1]) : 0;
        });
        const maxId = usedIds.length > 0 ? Math.max(...usedIds) : 0;
        const qrId = "K" + (maxId + 1);

        const validDate = new Date();
        validDate.setDate(validDate.getDate() + 30);

        this.state.qrClients.push({
            id: qrId,
            clientId: Number(clientId),
            nome: client.name,
            tel: client.phone || "Sem contacto",
            ativo: true,
            ent: 30,
            validade: validDate.toISOString().split('T')[0],
            historico: [],
            type: 'client'
        });

        if (autoRedirect) {
            this.saveState();
            this.showToast(`Acesso QR ativado para ${client.name}!`);
            if (this.activeView !== 'qr_manager' && this.activeView !== 'dashboard') {
                this.setView('qr_manager');
            }
        }
    }

    syncStaffQR() {
        if (!this.state.qrClients) this.state.qrClients = [];

        let changed = false;

        // Admins
        (this.state.admins || []).forEach(admin => {
            let qc = this.state.qrClients.find(qc => qc.clientId === admin.id && qc.type === 'admin');
            const expectedId = "A" + admin.id;

            if (!qc) {
                this.state.qrClients.push({
                    id: expectedId,
                    clientId: admin.id,
                    nome: admin.name,
                    tel: admin.email || "Admin",
                    ativo: true,
                    ent: 9999,
                    validade: '2099-12-31',
                    historico: [],
                    type: 'admin'
                });
                changed = true;
            } else if (qc.id !== expectedId) {
                qc.id = expectedId;
                changed = true;
            }
        });

        // Teachers (P for Professor)
        (this.state.teachers || []).sort((a, b) => a.id - b.id).forEach((t, idx) => {
            let qc = this.state.qrClients.find(qc => qc.clientId === t.id && qc.type === 'teacher');
            const expectedId = "P" + (idx + 1);

            if (!qc) {
                this.state.qrClients.push({
                    id: expectedId,
                    clientId: t.id,
                    nome: t.name,
                    tel: t.phone || "Professor",
                    ativo: true,
                    ent: 9999,
                    validade: '2099-12-31',
                    historico: [],
                    type: 'teacher'
                });
                changed = true;
            } else if (qc.id !== expectedId) {
                qc.id = expectedId;
                changed = true;
            }
        });

        if (changed) {
            this.saveState();
            this.showToast("QR Codes de Staff atualizados!");
            this.renderContent();
        } else {
            this.showToast("Os QR Codes do staff ja estao simplificados.");
        }
    }

    toggleQRClientStatus(id) {
        const idx = this.state.qrClients.findIndex(c => c.id === id);
        if (idx !== -1) {
            this.state.qrClients[idx].ativo = !this.state.qrClients[idx].ativo;
            this.saveState();
            this.renderContent();
        }
    }

    editQRCredit(id, val) {
        const idx = this.state.qrClients.findIndex(c => c.id === id);
        if (idx !== -1) {
            this.state.qrClients[idx].ent = Math.max(0, (this.state.qrClients[idx].ent || 0) + val);
            this.saveState();
            this.renderContent();
        }
    }

    editQREntryHj(id, v) {
        const idx = this.state.qrClients.findIndex(c => c.id === id);
        if (idx === -1) return;

        const hj = new Date().toISOString().split('T')[0];
        if (v === 1) {
            if (!this.state.qrClients[idx].historico) this.state.qrClients[idx].historico = [];
            this.state.qrClients[idx].historico.unshift(new Date().toISOString());
        } else {
            const hIdx = (this.state.qrClients[idx].historico || []).findIndex(h => h.startsWith(hj));
            if (hIdx !== -1) this.state.qrClients[idx].historico.splice(hIdx, 1);
        }
        this.saveState();
        this.renderContent();
    }

    updateQRClientField(id, field, value) {
        const idx = this.state.qrClients.findIndex(c => c.id === id);
        if (idx !== -1) {
            this.state.qrClients[idx][field] = value;
            this.saveState();
            // Don't re-render everything to avoid losing focus if editing
            // But some fields like credits might need it for consistency if using +/- buttons
            if (field === 'ent' || field === 'validade') {
                this.renderContent();
            }
        }
    }

    editQRClientData(id) {
        // Obsoleto - Usando edicao inline agora
    }

    showQRClientHistory(id) {
        const c = this.state.qrClients.find(cli => cli.id === id);
        if (!c) return;

        const history = c.historico || [];
        let html = `
            <div style="padding:1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                    <div>
                        <h3 style="margin:0; color:var(--primary);"><i class="fas fa-history"></i> Log de Acessos</h3>
                        <p style="margin:5px 0 0; color:var(--text-muted); font-size:0.85rem;">Historico para: <strong>${c.nome}</strong></p>
                    </div>
                    <div style="background:rgba(255,255,255,0.05); padding:8px 15px; border-radius:10px; font-size:0.8rem; border:1px solid var(--surface-border);">
                        Total de Visitas: <span style="color:var(--primary); font-weight:800;">${history.filter(h => (typeof h === 'string' ? 'entrada' : h.type) === 'entrada').length}</span>
                    </div>
                </div>
                
                <div style="max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius:15px; border:1px solid var(--surface-border);">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="text-align:left; background:rgba(255,255,255,0.03); border-bottom:1px solid var(--surface-border);">
                                <th style="padding:10px 15px; font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Data / Hora</th>
                                <th style="padding:10px 15px; font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; text-align:center;">Tipo</th>
                                <th style="padding:10px 15px; font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; text-align:right;">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (history.length === 0) {
            html += `<tr><td colspan="3" style="padding:3rem; text-align:center; color:var(--text-muted);">Ainda nao existem registos de acesso.</td></tr>`;
        } else {
            history.forEach(h => {
                const ts = typeof h === 'string' ? h : h.t;
                const type = typeof h === 'string' ? 'entrada' : h.type;
                const dateObj = new Date(ts);
                const dateStr = dateObj.toLocaleDateString('pt-PT');
                const timeStr = dateObj.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
                        <td style="padding:12px 15px; font-size:0.85rem;">
                            <div style="color:#fff; font-weight:600;">${dateStr}</div>
                            <div style="font-size:0.7rem; color:var(--text-muted);">${timeStr}</div>
                        </td>
                        <td style="padding:12px 15px; text-align:center;">
                            <span style="background:${type === 'entrada' ? 'rgba(16,185,129,0.1)' : 'rgba(145,27,43,0.1)'}; 
                                         color:${type === 'entrada' ? 'var(--success)' : 'var(--primary)'}; 
                                         padding:3px 8px; border-radius:6px; font-size:0.7rem; font-weight:700; text-transform:uppercase;">
                                ${type}
                            </span>
                        </td>
                        <td style="padding:12px 15px; text-align:right;">
                            <i class="fas fa-check-circle" style="color:var(--success); font-size:0.8rem;"></i>
                        </td>
                    </tr>
                `;
            });
        }

        html += `
                        </tbody>
                    </table>
                </div>
                
                <div style="margin-top:1.5rem; display:flex; gap:10px;">
                    <button class="btn btn-ghost" onclick="app.closeModal()" style="flex:1;">Fechar</button>
                    <button class="btn btn-ghost" onclick="if(confirm('Limpar todo o historico deste cliente?')) { app.clearQRClientHistory('${c.id}'); }" style="color:var(--danger); font-size:0.8rem;">
                        <i class="fas fa-trash-alt"></i> Limpar Log
                    </button>
                </div>
            </div>
        `;

        this.showModal(html);
    }

    clearQRClientHistory(id) {
        const c = this.state.qrClients.find(cli => cli.id === id);
        if (c) {
            c.historico = [];
            this.saveState();
            this.closeModal();
            this.renderContent();
            this.showToast("Historico limpo com sucesso!");
        }
    }

    deleteQRClient(id) {
        if (confirm("Deseja eliminar este cliente QR permanentemente?")) {
            this.state.qrClients = this.state.qrClients.filter(c => c.id !== id);
            this.saveState();
            this.renderContent();
        }
    }

    normalizeText(text) {
        return (text || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    downloadQRCode(canvasId, idCode, name) {
        if (this.role !== 'admin') {
            alert("Apenas administradores podem descarregar codigos QR.");
            return;
        }

        const container = document.getElementById(canvasId);
        const img = container.querySelector('img');
        const canvas = container.querySelector('canvas');

        let dataUrl = "";
        if (img && img.src) {
            dataUrl = img.src;
        } else if (canvas) {
            dataUrl = canvas.toDataURL("image/png");
        }

        if (!dataUrl) {
            alert("Nao foi possivel gerar a imagem para download.");
            return;
        }

        const link = document.createElement('a');
        link.download = `QR_${idCode}_${name.replace(/\s+/g, '_')}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showToast("QR Code descarregado com sucesso!");
    }

    toggleQRCodeDisplay(areaId, val) {
        const el = document.getElementById(areaId);
        const canvas = document.getElementById('canvas-' + areaId.split('-').pop());

        if (el.style.display === 'table-row') {
            el.style.display = 'none';
        } else {
            // Hide any other visible QR codes first
            document.querySelectorAll('[id^="qr-row-area-"]').forEach(area => area.style.display = 'none');

            canvas.innerHTML = "";
            new QRCode(canvas, {
                text: val,
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            el.style.display = 'table-row';

            // Scroll to view
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // --- LEITOR QR SCANNER ---

    async iniciarLeitorQR() {
        if (this.qrScannerAtivo) return;

        try {
            const video = document.getElementById("v-stream");
            const container = document.getElementById("video-container");
            const scanStatus = document.getElementById("scan-status");
            const btnCam = document.getElementById("btnCam");

            if (typeof jsQR === 'undefined') {
                throw new Error("A biblioteca de leitura de QR nao foi carregada. Verifique a sua ligacao a internet.");
            }

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                let errorMsg = "O seu navegador nao suporta acesso a camara.";
                if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                    errorMsg = " ERRO DE SEGURANCA: O scanner live so funciona em ligacoes seguras (HTTPS disponivel em KandalGym.com). Sugerimos usar o botao 'Tirar Foto' ou 'Entrada Manual'.";
                }
                throw new Error(errorMsg);
            }

            // Constraints mais flexiveis
            const constraints = {
                video: {
                    facingMode: "environment",
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                console.warn("Falha ao tentar camara traseira, tentando qualquer camara...", err);
                // Fallback para qualquer camara disponivel
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }

            video.srcObject = stream;

            // Garantir que o video carrega antes de iniciar o loop
            await new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    video.play().then(resolve);
                };
            });

            container.style.display = "block";
            btnCam.innerHTML = '<i class="fas fa-stop"></i> Parar Camara';
            btnCam.onclick = () => this.pararLeitorQR(stream);

            this.qrScannerAtivo = true;
            this.qrRequestAnimationFrameId = requestAnimationFrame(() => this.loopLeitorQR(video));

            scanStatus.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; gap:5px; padding: 5px;">
                    <span style="color: var(--success); font-weight: 800; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-check-circle pulse"></i> Scanner Ativo
                    </span>
                    <span style="font-size: 0.8rem; opacity: 0.8;">Aponte para o QR Code</span>
                </div>
            `;
            scanStatus.className = "";
        } catch (e) {
            console.error(e);
            let msg = "Erro ao aceder a camara: ";
            if (e.name === 'NotAllowedError') msg = " Permissao Negada: Por favor, autorize o acesso a camara nas definicoes do seu navegador.";
            else if (e.name === 'NotFoundError') msg = " Camara nao encontrada no dispositivo.";
            else msg = e.message;

            this.showQRMsg(msg, "bg-qr-danger");
            alert(msg);
        }
    }

    escanearPorFoto() {
        if (typeof jsQR === 'undefined') {
            return alert("A biblioteca de leitura de QR nao esta pronta. Tente novamente em instantes.");
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.setAttribute('capture', 'environment');

        // Adicionar temporariamente ao DOM para garantir funcionamento em alguns browsers
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) {
                if (document.body.contains(input)) document.body.removeChild(input);
                return;
            }

            this.showQRMsg("A processar foto...", "bg-qr-warning");

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext("2d", { willReadFrequently: true });

                    // Ratio para manter proporcao
                    const scale = Math.min(1000 / img.width, 1000 / img.height, 1);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;

                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert",
                    });

                    if (code) {
                        this.processarLeituraQR(code.data);
                    } else {
                        // Tentar com inversao se falhar (para alguns codigos)
                        const code2 = jsQR(imageData.data, imageData.width, imageData.height, {
                            inversionAttempts: "attemptBoth",
                        });
                        if (code2) {
                            this.processarLeituraQR(code2.data);
                        } else {
                            this.showQRMsg(" Nao detetado", "bg-qr-danger");
                            alert("Nao foi possivel encontrar um codigo QR na foto. Certifique-se de que o codigo esta bem visivel, focado e iluminado.");
                        }
                    }
                    if (document.body.contains(input)) document.body.removeChild(input);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    pararLeitorQR(stream) {
        if (!this.qrScannerAtivo) return;

        const video = document.getElementById("v-stream");
        const container = document.getElementById("video-container");
        const btnCam = document.getElementById("btnCam");
        const scanStatus = document.getElementById("scan-status");

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        } else if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        if (video) video.srcObject = null;
        if (container) container.style.display = "none";

        this.qrScannerAtivo = false;
        cancelAnimationFrame(this.qrRequestAnimationFrameId);

        if (btnCam) {
            btnCam.innerHTML = '<i class="fas fa-video"></i> Ativar Camara';
            btnCam.onclick = () => this.iniciarLeitorQR();
        }

        if (scanStatus) {
            scanStatus.innerHTML = "";
            scanStatus.className = "";
        }
    }

    loopLeitorQR(v) {
        if (!this.qrScannerAtivo) return;

        if (v.readyState === v.HAVE_ENOUGH_DATA) {
            const canvas = document.getElementById("c-hidden");
            const ctx = canvas.getContext("2d", { willReadFrequently: true });

            canvas.height = v.videoHeight;
            canvas.width = v.videoWidth;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
                this.processarLeituraQR(code.data);
            }
        }

        if (this.qrScannerAtivo) {
            this.qrRequestAnimationFrameId = requestAnimationFrame(() => this.loopLeitorQR(v));
        }
    }

    processarLeituraQR(id) {
        const st = document.getElementById("scan-status");

        // Prevent multiple processing of the same scan within 3 seconds
        if (this.lastProcessedQR === id && (Date.now() - this.lastProcessedTime < 3000)) return;

        const c = this.state.qrClients.find(cli => cli.id === id);

        if (!c) {
            this.showQRMsg(" Codigo nao reconhecido", "bg-qr-danger");
            this.lastProcessedQR = id;
            this.lastProcessedTime = Date.now();
            return;
        }

        if (!c.ativo) {
            this.showQRMsg(` ${c.nome}: Conta Inativa`, "bg-qr-danger");
            this.lastProcessedQR = id;
            this.lastProcessedTime = Date.now();
            return;
        }

        const agora = new Date();
        const hj = agora.toISOString().split('T')[0];

        // Validar data
        if (hj > c.validade) {
            this.showQRMsg(` ${c.nome}: Validade Expirada`, "bg-qr-warning");
            this.lastProcessedQR = id;
            this.lastProcessedTime = Date.now();
            return;
        }

        // Validar creditos
        if ((c.ent || 0) <= 0 && c.type !== 'admin' && c.type !== 'teacher') {
            this.showQRMsg(` ${c.nome}: Sem creditos`, "bg-qr-danger");
            this.lastProcessedQR = id;
            this.lastProcessedTime = Date.now();
            return;
        }

        // Validar cooldown (2 minutos)
        if (c.historico && c.historico.length > 0) {
            const lastEntry = new Date(c.historico[0]);
            const diffMin = (agora - lastEntry) / 1000 / 60;
            if (diffMin < 2) {
                const waitSec = Math.ceil(120 - diffMin * 60);
                this.showQRMsg(` ${c.nome}: Cooldown(${waitSec}s)`, "bg-qr-warning");
                this.lastProcessedQR = id;
                this.lastProcessedTime = Date.now();
                return;
            }
        }

        // Validar limite diario (Apenas para clientes)
        if (c.type !== 'admin' && c.type !== 'teacher') {
            const entriesHj = (c.historico || []).filter(h => {
                const ts = typeof h === 'string' ? h : h.t;
                const type = typeof h === 'string' ? 'entrada' : h.type;
                return ts.startsWith(hj) && type === 'entrada';
            }).length;

            if (entriesHj >= 2) {
                this.showQRMsg(` ${c.nome}: Limite diario atingido`, "bg-qr-warning");
                this.lastProcessedQR = id;
                this.lastProcessedTime = Date.now();
                return;
            }
        }

        // Determinar se e Entrada ou Saida
        if (!c.historico) c.historico = [];
        let eventType = 'entrada';
        const lastAccess = c.historico[0];
        if (lastAccess) {
            const lastDate = (typeof lastAccess === 'string' ? lastAccess : lastAccess.t).split('T')[0];
            if (lastDate === hj) {
                const lastType = (typeof lastAccess === 'string' ? 'entrada' : lastAccess.type);
                eventType = (lastType === 'entrada') ? 'saída' : 'entrada';
            }
        }

        // Processar sucesso
        if (c.type !== 'admin' && c.type !== 'teacher') {
            if (eventType === 'entrada') c.ent--;
        }

        c.historico.unshift({
            t: agora.toISOString(),
            type: eventType
        });

        const welcomeMsg = (c.type === 'admin' || c.type === 'teacher')
            ? ` Bem-vindo, ${c.nome}! Staff (${eventType.toUpperCase()})`
            : (eventType === 'entrada' 
                ? ` Bem-vindo, ${c.nome}! Entrada Validada.` 
                : ` Obrigado pela visita, ${c.nome}, bom descanso. Saída Registada.`);

        this.showQRMsg(welcomeMsg, eventType === 'entrada' ? "bg-qr-success" : "bg-qr-warning");
        this.lastProcessedQR = id;
        this.lastProcessedTime = Date.now();

        this.saveState();

        // Refresh markers or cards if they are visible
        const grid = document.getElementById("gridQRClientes");
        if (grid) grid.innerHTML = this.renderQRClientCards();
    }

    showQRMsg(text, cls) {
        const s = document.getElementById("scan-status");
        if (!s) return;

        s.innerHTML = text;
        s.className = cls;

        // Visual feedback for scan
        const container = document.getElementById("video-container");
        if (container) {
            container.style.boxShadow = `0 0 30px ${cls.includes('success') ? 'var(--success)' : cls.includes('warning') ? 'var(--accent)' : 'var(--danger)'} `;
            setTimeout(() => { if (container) container.style.boxShadow = 'none'; }, 1000);
        }

        // Clear message after 4 seconds
        setTimeout(() => {
            if (s && s.className === cls) {
                s.innerHTML = "Pronto para ler codigo...";
                s.className = "";
            }
        }, 4000);
    }

    processarManualQR() {
        const input = document.getElementById('manual-qr-id');
        if (!input) return;
        const id = input.value.trim().toUpperCase(); // Aceitar 'k1' ou 'K1'
        if (!id) return alert('Por favor, introduza um ID de aluno.');

        this.processarLeituraQR(id);
        input.value = ''; // Limpar apos processar
    }


    shortenExistingQRIds() {
        if (!this.state.qrClients || this.state.qrClients.length === 0) return;
        let changed = false;

        // 1. Garantir que todos os registos QR estao ligados a um ID de cliente interno (timestamp)
        this.state.qrClients.forEach(c => {
            if (!c.clientId) {
                // Tentar extrair do ID antigo se for longo (K + timestamp)
                if (c.id.startsWith("K") && c.id.length > 10) {
                    const extractedId = parseInt(c.id.substring(1));
                    if (!isNaN(extractedId)) {
                        c.clientId = extractedId;
                        changed = true;
                    }
                }
                // Se falhar e tivermos nome, procurar na lista de clientes
                if (!c.clientId && c.nome) {
                    const found = (this.state.clients || []).find(cli => cli.name === c.nome);
                    if (found) {
                        c.clientId = found.id;
                        changed = true;
                    }
                }
            }
        });

        // 2. Encontrar o maior ID curto existente para continuar a sequencia
        const existingShortIds = this.state.qrClients
            .map(c => {
                const m = c.id.match(/^K(\d+)$/);
                // Consideramos "curto" IDs com menos de 7 caracteres (ex: K12345)
                return (m && c.id.length <= 7) ? parseInt(m[1]) : 0;
            })
            .filter(n => n > 0);

        let nextAvailable = existingShortIds.length > 0 ? Math.max(...existingShortIds) + 1 : 1;

        // 3. Converter IDs longos para curtos sequenciais
        this.state.qrClients.forEach(c => {
            if (c.id.length > 8 || !c.id.startsWith("K")) {
                c.id = "K" + (nextAvailable++);
                changed = true;
            }
        });

        if (changed) {
            this.saveState();
            console.log("IDs QR simplificados e mapeados.");
        }
    }

    async installPWA() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                this.deferredPrompt = null;
                this.renderSidebar();
                this.renderNavbar();
            }
        } else {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                this.showModal(`
                    <div style="padding:1.5rem; text-align:center;">
                        <div style="font-size:3rem; margin-bottom:1rem;"></div>
                        <h3 style="margin:0 0 1rem; color:var(--primary);">Instalar no iPhone / iPad</h3>
                        <div style="background:rgba(255,255,255,0.05); border-radius:12px; padding:1.2rem; text-align:left; line-height:2;">
                            <p style="margin:0;"><strong>1.</strong> Toque no botao <strong>Partilhar</strong>  na barra do Safari</p>
                            <p style="margin:0;"><strong>2.</strong> Toque em <strong>"Adicionar ao Ecra Principal"</strong> </p>
                            <p style="margin:0;"><strong>3.</strong> Toque em <strong>"Adicionar"</strong> no canto superior direito</p>
                        </div>
                        <button class="btn btn-primary" onclick="app.closeModal()" style="width:100%; margin-top:1.5rem;">Entendido!</button>
                    </div>
                `);
            } else {
                this.showModal(`
                    <div style="padding:1.5rem; text-align:center;">
                        <div style="font-size:3rem; margin-bottom:1rem;"></div>
                        <h3 style="margin:0 0 1rem; color:var(--primary);">Instalar no Android</h3>
                        <div style="background:rgba(255,255,255,0.05); border-radius:12px; padding:1.2rem; text-align:left; line-height:2;">
                            <p style="margin:0;"><strong>1.</strong> Toque nos <strong>3 pontos</strong> no canto do Chrome </p>
                            <p style="margin:0;"><strong>2.</strong> Toque em <strong>"Adicionar ao ecra principal"</strong></p>
                            <p style="margin:0;"><strong>3.</strong> Confirme tocando em <strong>"Instalar"</strong></p>
                        </div>
                        <button class="btn btn-primary" onclick="app.closeModal()" style="width:100%; margin-top:1.5rem;">Entendido!</button>
                    </div>
                `);
            }
        }
    }

    // --- CLASSES & SCHEDULING ---

    async checkFinishedClasses() {
        // MUITO IMPORTANTE: Apenas o Administrador pode arquivar aulas.
        // Se um cliente o fizesse e tivesse o relogio errado, podia "matar" aulas prematuramente para todos.
        if (this.role !== 'admin' || !this.state.classes || this.state.classes.length === 0 || !this.hasLoadedData || this.isCheckingClasses) return;

        this.isCheckingClasses = true;
        const now = new Date();
        // Tolerancia de 30 min para evitar conflitos de relogios ligeiramente diferentes
        const gracePeriod = 30 * 60 * 1000;

        let changed = false;
        const remainingClasses = [];

        for (const c of this.state.classes) {
            if (!c.date) {
                remainingClasses.push(c);
                continue;
            }

            const classDateTime = new Date(`${c.date}T${c.time}`);
            const endDateTime = new Date(classDateTime.getTime() + 60 * 60 * 1000 + gracePeriod);

            if (endDateTime < now) {
                console.log(`Aula terminada detetada: ${c.name} (${c.date} ${c.time})`);
                changed = true;
                const participantsIds = this.state.enrollments[String(c.id)] || [];
                const teacher = (this.state.teachers || []).find(t => Number(t.id) === Number(c.teacherId));

                participantsIds.forEach(pid => {
                    const clientId = Number(pid);
                    if (!this.state.trainingHistory[clientId]) this.state.trainingHistory[clientId] = [];
                    this.state.trainingHistory[clientId].push({
                        date: c.date,
                        time: c.time,
                        type: 'class',
                        title: c.name,
                        teacher: teacher ? teacher.name : 'N/A',
                        completedAt: now.toISOString()
                    });
                });

                if (c.isRecurring) {
                    const nextDate = new Date(classDateTime.getTime() + 7 * 24 * 60 * 60 * 1000);
                    c.date = nextDate.toISOString().split('T')[0];
                    c.day = nextDate.getDay();
                    this.state.enrollments[String(c.id)] = [];
                    remainingClasses.push(c);
                } else {
                    delete this.state.enrollments[String(c.id)];
                }
            } else {
                remainingClasses.push(c);
            }
        }

        if (changed) {
            this.state.classes = remainingClasses;
            await this.saveState();
        }
        this.isCheckingClasses = false;
    }

    isClassFinished(c) {
        if (!c.date || !c.time) return false;
        try {
            const now = new Date();
            // Formato ISO seguro para todos os browsers
            const start = new Date(`${c.date}T${c.time}:00`);
            if (isNaN(start.getTime())) return false; // Falha no parsing

            // Bloquear inscricoes mal a hora passa (com 1 min de tolerancia apenas)
            return now.getTime() > (start.getTime() + 60000);
        } catch (e) {
            return false;
        }
    }

    formatFullDate(day, dateStr) {
        if (!dateStr) return this.getDayName(day);
        const dayName = this.getDayName(day);
        const parts = dateStr.split('-');
        const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
        return `${dayName}, ${formattedDate}`;
    }

    renderClassesView(container) {
        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2>Horario de Aulas</h2>
                    <p class="client-name">Consulte e inscreva-se nas aulas de grupo</p>
                </div>
                ${this.role === 'admin' ? `
                <button class="btn btn-primary" onclick="app.showClassModal()">
                    <i class="fas fa-plus"></i> <span class="hide-mobile">Nova Aula</span>
                </button>
                ` : ''}
            </div>
            <div id="classes-content" class="animate-fade-in"></div>
        `;
        const content = container.querySelector('#classes-content');
        if (this.role === 'admin') {
            this.renderAdminClasses(content);
        } else if (this.role === 'teacher') {
            this.renderTeacherClasses(content);
        } else {
            this.renderClientClasses(content);
        }
    }

    renderAdminClasses(container) {
        const classes = this.state.classes || [];
        if (classes.length === 0) {
            container.innerHTML = `
                <div class="glass-card" style="text-align:center; padding:3rem;">
                    <i class="fas fa-calendar-times" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                    <p>Ainda nao foram criadas aulas.</p>
                    <button class="btn btn-primary btn-sm" onclick="app.showClassModal()" style="margin-top:1rem;">Criar Primeira Aula</button>
                </div>
            `;
            return;
        }

        const sortedClasses = [...classes].sort((a, b) => {
            if (a.day !== b.day) return a.day - b.day;
            return a.time.localeCompare(b.time);
        });

        container.innerHTML = `
            <div class="glass-card">
                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; text-align:left;">
                        <thead>
                            <tr style="border-bottom:1px solid var(--surface-border); color:var(--text-muted); font-size:0.8rem;">
                                <th style="padding:1rem;">Data</th>
                                <th style="padding:1rem;">Hora</th>
                                <th style="padding:1rem;">Classe</th>
                                <th style="padding:1rem;">Professor</th>
                                <th style="padding:1rem;">Inscritos</th>
                                <th style="padding:1rem; text-align:right;">Acoes</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedClasses.map(c => {
            const teacher = (this.state.teachers || []).find(t => Number(t.id) === Number(c.teacherId));
            const classIdStr = String(c.id);
            const participants = this.state.enrollments[classIdStr] || this.state.enrollments[c.id] || [];
            return `
                                <tr style="border-bottom:1px solid var(--surface-border);">
                                    <td style="padding:1rem; font-weight:600;">
                                        ${this.formatFullDate(c.day, c.date)}
                                    </td>
                                    <td style="padding:1rem;">${c.time}</td>
                                    <td style="padding:1rem; color:var(--primary); font-weight:bold;">${c.name}</td>
                                    <td style="padding:1rem; font-size:0.9rem;">${teacher ? teacher.name : 'N/A'}</td>
                                    <td style="padding:1rem;">
                                        ${this.isClassFinished(c) ?
                    `<span class="badge badge-error">Finalizada</span>` :
                    `<span class="badge ${participants.length >= (c.capacity || 20) ? 'badge-purple' : 'badge-green'}">
                                                ${participants.length} / ${c.capacity || 20}
                                            </span>`
                }
                                    </td>
                                    <td style="padding:1rem; text-align:right; white-space:nowrap;">
                                        <button class="btn btn-ghost btn-sm" onclick="app.showParticipantsList('${classIdStr}')" title="Ver Inscritos"><i class="fas fa-users"></i></button>
                                        <button class="btn btn-ghost btn-sm" onclick="app.showClassModal(${c.id})" title="Editar"><i class="fas fa-edit"></i></button>
                                        <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.deleteClass(${c.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                                `;
        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderTeacherClasses(container) {
        if (!this.currentUser || !this.currentUser.id) {
            container.innerHTML = `<p style="text-align:center; padding:2rem;">Erro ao identificar professor.</p>`;
            return;
        }

        const currentUserid = Number(this.currentUser.id);
        const myClasses = (this.state.classes || []).filter(c => Number(c.teacherId) === currentUserid).sort((a, b) => {
            if (a.date && b.date) return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
            if (a.day !== b.day) return a.day - b.day;
            return a.time.localeCompare(b.time);
        });

        if (myClasses.length === 0) {
            container.innerHTML = `
                <div class="glass-card" style="text-align:center; padding:3rem;">
                    <i class="fas fa-calendar-day" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                    <p>Nao tem aulas atribuidas ao seu nome (ID: ${currentUserid}).</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="video-grid">
                ${myClasses.map(c => {
            const classIdStr = String(c.id);
            const participantsIds = this.state.enrollments[classIdStr] || [];
            const participants = participantsIds.map(pid => {
                const clientId = Number(pid);
                return (this.state.clients || []).find(cl => Number(cl.id) === clientId);
            }).filter(x => x);

            return `
                        <div class="glass-card" style="display:flex; flex-direction:column; padding:0.8rem;">
                            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.4rem;">
                                <span style="font-size:1rem; font-weight:800; color:var(--primary);">${c.time}</span>
                                <div class="badge badge-blue" style="font-size:0.6rem; padding:0.1rem 0.4rem;">${participants.length} Alunos</div>
                            </div>
                            <div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:0.2rem;">
                                <i class="fas fa-calendar-alt"></i> ${this.formatFullDate(c.day, c.date)}
                            </div>
                            <h4 style="margin-bottom:0.5rem; font-size:0.95rem; line-height:1.2; min-height:2.4em; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${c.name}</h4>
                            
                            <div style="margin-top:auto; padding-top:0.5rem; border-top:1px solid var(--surface-border);">
                                <button class="btn btn-primary btn-sm" style="width:100%; font-size:0.75rem; padding:0.5rem;" onclick='app.showParticipantsList("${classIdStr}")'>
                                    <i class="fas fa-users"></i> Ver Lista
                                </button>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    showParticipantsList(classId) {
        const classIdStr = String(classId);
        const cls = this.state.classes.find(c => String(c.id) === classIdStr);
        const enrolledIds = this.state.enrollments[classIdStr] || [];
        const participants = enrolledIds.map(pid => {
            return (this.state.clients || []).find(cl => Number(cl.id) === Number(pid));
        }).filter(x => x);

        let content = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <h2 style="margin:0;"><i class="fas fa-users" style="color:var(--primary);"></i> Inscritos</h2>
                <button class="btn btn-ghost" onclick="app.closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">Aula: <strong style="color:#fff;">${cls ? cls.name : 'N/A'}</strong></p>

            <!-- Pesquisa para adicionar novos alunos -->
            <div style="margin-bottom:2rem; padding:1.2rem; background:rgba(196,162,77,0.05); border:1px dashed var(--accent); border-radius:15px; position:relative;">
                <label style="display:block; font-size:0.7rem; color:var(--accent); font-weight:700; text-transform:uppercase; margin-bottom:8px; letter-spacing:1px;">Adicionar Aluno Manualmente</label>
                <div class="search-container" style="margin:0; width:100%; height:45px; position:relative;">
                    <i class="fas fa-search" style="position:absolute; left:15px; top:15px; color:var(--text-muted);"></i>
                    <input type="text" class="search-bar" placeholder="Pesquisar por nome ou ID..." id="search-enroll-client" 
                        style="width:100%; height:100%; background:rgba(0,0,0,0.3); border:1px solid var(--surface-border); border-radius:10px; color:#fff; padding:0 15px 0 45px;"
                        oninput="app.searchClientsForClass('${classIdStr}', this.value)">
                    <div id="enroll-search-results" style="position:absolute; top:100%; left:0; right:0; background:var(--surface); border:1px solid var(--surface-border); border-radius:0 0 12px 12px; z-index:1000; max-height:200px; overflow-y:auto; display:none; box-shadow:0 10px 30px rgba(0,0,0,0.5);"></div>
                </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:0.8rem; max-height:40vh; overflow-y:auto; padding-right:5px;">
                ${participants.length === 0 ? '<p style="text-align:center; color:var(--text-muted); padding:2rem; background:rgba(255,255,255,0.02); border-radius:12px;">Nenhum aluno inscrito ainda.</p>' :
                participants.map(p => `
                    <div style="display:flex; align-items:center; gap:0.75rem; padding:0.8rem; background:rgba(255,255,255,0.03); border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:bold; color:#fff; border:1px solid var(--surface-border);">
                            ${p.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div style="flex:1;">
                            <div style="font-size:0.95rem; font-weight:600; color:#fff;">${p.name}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">ID: ${p.id} ${p.phone ? '• ' + p.phone : ''}</div>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button class="btn btn-ghost btn-sm" onclick="app.closeModal(); app.openChat(${p.id})" title="Enviar Mensagem"><i class="fas fa-comment-alt" style="color:var(--primary);"></i></button>
                            <button class="btn btn-ghost btn-sm" onclick="app.removeFromClass('${classIdStr}', ${p.id})" title="Remover Aluno"><i class="fas fa-user-minus" style="color:var(--danger); font-size:0.8rem;"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        this.showModal(content);
    }

    searchClientsForClass(classId, query) {
        const resultsDiv = document.getElementById('enroll-search-results');
        if (!resultsDiv) return;

        if (!query || query.length < 2) {
            resultsDiv.style.display = 'none';
            return;
        }

        const q = this.normalizeText(query);
        const enrolledIds = (this.state.enrollments[classId] || []).map(id => Number(id));

        const matches = (this.state.clients || []).filter(c => {
            const nameMatch = this.normalizeText(c.name || '').includes(q);
            const idMatch = this.normalizeText(String(c.id)) === q;
            return (nameMatch || idMatch) && !enrolledIds.includes(Number(c.id));
        }).slice(0, 5);

        if (matches.length === 0) {
            resultsDiv.innerHTML = `<div style="padding:15px; font-size:0.8rem; color:var(--text-muted); text-align:center;">Nenhum aluno disponivel</div>`;
            resultsDiv.style.display = 'block';
            return;
        }

        resultsDiv.innerHTML = matches.map(m => `
            <div onclick="app.manualEnrollInClass('${classId}', ${m.id})" 
                style="padding:10px 15px; cursor:pointer; border-bottom:1px solid var(--surface-border); display:flex; align-items:center; gap:10px;" 
                onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                <div style="width:28px; height:28px; border-radius:50%; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:bold; color:#fff; border:1px solid var(--surface-border);">${m.name.substring(0, 2).toUpperCase()}</div>
                <div style="flex:1;">
                    <div style="font-size:0.85rem; font-weight:600; color:#fff;">${m.name}</div>
                    <div style="font-size:0.7rem; color:var(--text-muted);">ID: ${m.id}</div>
                </div>
                <i class="fas fa-user-plus" style="color:var(--accent); font-size:0.8rem;"></i>
            </div>
        `).join('');
        resultsDiv.style.display = 'block';
    }

    async manualEnrollInClass(classId, clientId) {
        const classIdStr = String(classId);
        if (!this.state.enrollments[classIdStr]) this.state.enrollments[classIdStr] = [];

        const participants = this.state.enrollments[classIdStr];
        if (!participants.map(id => Number(id)).includes(Number(clientId))) {
            participants.push(Number(clientId));
            await this.saveState();
            this.showToast('Aluno adicionado!');
            this.showParticipantsList(classId);
            this.renderContent();
        }
    }

    async removeFromClass(classId, clientId) {
        if (!confirm('Deseja remover este aluno da aula?')) return;

        const classIdStr = String(classId);
        if (this.state.enrollments[classIdStr]) {
            this.state.enrollments[classIdStr] = this.state.enrollments[classIdStr].filter(id => Number(id) !== Number(clientId));
            await this.saveState();
            this.showToast('Aluno removido.');
            this.showParticipantsList(classId);
            this.renderContent();
        }
    }

    renderClientClasses(container) {
        const classes = this.state.classes || [];
        if (classes.length === 0) {
            container.innerHTML = `
                <div class="glass-card" style="text-align:center; padding:3rem;">
                    <i class="fas fa-calendar-day" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                    <p>Nao existem aulas de grupo agendadas de momento.</p>
                </div>
            `;
            return;
        }

        const DAYS = [1, 2, 3, 4, 5, 6, 0]; // Seg a Dom

        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.5rem;">
                ${DAYS.map(dayIdx => {
            const dayClasses = (classes || [])
                .filter(c => Number(c.day) === dayIdx)
                .sort((a, b) => {
                    if (a.date && b.date) return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
                    return a.time.localeCompare(b.time);
                });
            if (dayClasses.length === 0) return '';

            return `
                        <div style="margin-bottom:1rem;">
                            <h3 style="border-left:4px solid var(--primary); padding-left:1rem; margin-bottom:1rem; font-size:1.1rem; color:#fff;">${this.getDayName(dayIdx)}</h3>
                            <div class="classes-grid">
                                ${dayClasses.map(c => {
                const classIdStr = String(c.id);
                const participants = this.state.enrollments[classIdStr] || [];
                const isEnrolled = participants.map(id => Number(id)).includes(Number(this.currentClientId));
                const isFull = participants.length >= (c.capacity || 20);
                const teacher = (this.state.teachers || []).find(t => Number(t.id) === Number(c.teacherId));

                return `
                                        <div class="glass-card" style="display:flex; flex-direction:column; padding:0.8rem; border-top:3px solid ${isEnrolled ? 'var(--success)' : 'var(--surface-border)'};">
                                            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.3rem;">
                                                <span style="font-size:1rem; font-weight:800; color:var(--primary);">${c.time}</span>
                                                ${isEnrolled ? '<span class="badge badge-green" style="font-size:0.55rem; padding:0.1rem 0.4rem;">Inscrito</span>' : ''}
                                            </div>
                                            <div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:0.2rem;">
                                                <i class="fas fa-calendar-alt"></i> ${this.formatFullDate(c.day, c.date)}
                                            </div>
                                            <h4 style="margin-bottom:0.3rem; font-size:0.9rem; line-height:1.2; min-height:2.4em; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${c.name}</h4>
                                            <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.8rem; display:flex; align-items:center; gap:5px; justify-content:space-between;">
                                                <div style="display:flex; align-items:center; gap:5px;">
                                                    ${teacher && teacher.photoUrl ? 
                                                        `<img src="${teacher.photoUrl}" style="width:20px; height:20px; border-radius:50%; object-fit:cover;">` : 
                                                        `<i class="fas fa-user-tie"></i>`
                                                    }
                                                    <span>${teacher ? teacher.name : 'N/A'}</span>
                                                </div>
                                                <div><i class="fas fa-users"></i> ${participants.length} / ${c.capacity || 20}</div>
                                            </div>
                                            
                                            <div style="margin-top:auto;">
                                                ${this.isClassFinished(c) ? `
                                                    <div style="text-align:center; padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:4px; font-size:0.7rem; color:var(--text-muted); border:1px solid var(--surface-border);">Finalizada</div>
                                                ` : (isEnrolled ? `
                                                    <button class="btn btn-secondary btn-sm" style="width:100%; color:var(--danger); font-size:0.7rem; padding:0.5rem;" onclick="app.leaveClass(${c.id})">
                                                        Sair
                                                     </button>
                                                ` : (isFull ? `
                                                    <button class="btn btn-ghost btn-sm" style="width:100%; font-size:0.75rem; padding:0.5rem;" disabled>Cheio</button>
                                                ` : `
                                                    <button class="btn btn-primary btn-sm" style="width:100%; font-size:0.75rem; padding:0.5rem;" onclick="app.enrollInClass(${c.id})">
                                                        Reservar
                                                    </button>
                                                `))}
                                            </div>
                                        </div>
                                    `;
            }).join('')}
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    showClassModal(classId = null) {
        // Garantir que classId e tratado corretamente (se vier do HTML pode vir como string "null")
        const actualClassId = (classId === null || classId === 'null') ? null : Number(classId);
        const c = actualClassId ? this.state.classes.find(x => Number(x.id) === actualClassId) : null;
        const teachers = this.state.teachers || [];

        const content = `
            <h2 style="margin-top:0;">${c ? 'Editar Aula' : 'Nova Aula'}</h2>
            <div style="display:flex; flex-direction:column; gap:1rem;">
                <div>
                    <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Nome da Aula</label>
                    <input type="text" id="cls-name" value="${c ? c.name : ''}" placeholder="Ex: Cross Training, Yoga, Pilates...">
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Data da Aula</label>
                        <input type="date" id="cls-date" value="${c ? c.date : new Date().toISOString().split('T')[0]}">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Hora</label>
                        <input type="time" id="cls-time" value="${c ? c.time : '18:00'}">
                    </div>
                </div>
                <div style="display:none;">
                    <select id="cls-day">
                        <option value="1">Segunda</option>
                    </select>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Professor</label>
                        <select id="cls-teacher">
                            <option value="">-- Selecionar --</option>
                            ${teachers.map(t => `<option value="${t.id}" ${c && c.teacherId == t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">lotação Max.</label>
                        <input type="number" id="cls-capacity" value="${c ? c.capacity : 20}">
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem; background:rgba(255,255,255,0.05); padding:0.8rem; border-radius:8px;">
                    <input type="checkbox" id="cls-recurring" ${c && c.isRecurring ? 'checked' : ''} style="width:20px; height:20px; cursor:pointer;">
                    <label for="cls-recurring" style="cursor:pointer; font-size:0.9rem;">Aula Recorrente (Repetir semanalmente)</label>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-top:1rem;">
                    <button class="btn btn-secondary" onclick="app.closeModal()">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.saveClass(${actualClassId})">${c ? 'Atualizar' : 'Guardar'}</button>
                </div>
            </div>
        `;
        this.showModal(content);
    }

    async saveClass(classId = null) {
        // Normalizar classId
        const actualClassId = (classId === null || classId === 'null') ? null : Number(classId);
        const name = document.getElementById('cls-name').value.trim();
        const date = document.getElementById('cls-date').value;
        const time = document.getElementById('cls-time').value;
        const teacherVal = document.getElementById('cls-teacher').value;
        const teacherId = teacherVal ? Number(teacherVal) : null;
        const capacity = Number(document.getElementById('cls-capacity').value);

        if (!name || !time || !date) {
            return alert('Preencha os campos obrigatorios (Nome, Data e Hora).');
        }

        const isRecurring = document.getElementById('cls-recurring').checked;
        const classDate = new Date(`${date}T${time}`);
        const now = new Date();

        if (classDate < now) {
            return alert('Nao pode criar ou editar uma aula com uma data/hora que ja passou.');
        }

        // Usar meio-dia para evitar desvios de fuso horario ao calcular o dia da semana
        const day = new Date(date + 'T12:00:00').getDay();

        if (!this.state.classes) this.state.classes = [];
        if (!this.state.enrollments) this.state.enrollments = {};

        if (actualClassId) {
            const idx = this.state.classes.findIndex(x => Number(x.id) === actualClassId);
            if (idx !== -1) {
                this.state.classes[idx] = { ...this.state.classes[idx], name, date, day, time, teacherId, capacity, isRecurring };
            }
        } else {
            const newId = Date.now();
            this.state.classes.push({ id: newId, name, date, day, time, teacherId, capacity, isRecurring });
            this.state.enrollments[String(newId)] = [];
        }

        await this.saveState();
        this.closeModal();
        this.renderContent();
        this.showToast('Horario atualizado com sucesso!');
    }

    async deleteClass(classId) {
        if (!confirm('Tem a certeza que deseja eliminar esta aula?')) return;

        const idToDelete = Number(classId);
        this.state.classes = this.state.classes.filter(x => Number(x.id) !== idToDelete);
        delete this.state.enrollments[idToDelete];

        await this.saveState();
        this.renderContent();
        this.showToast('Aula eliminada.', 'error');
    }

    async enrollInClass(classId) {
        console.log("Iniciando inscricao na aula:", classId);
        const actualClassId = Number(classId);
        const classIdStr = String(actualClassId);

        const cls = this.state.classes.find(x => Number(x.id) === actualClassId);
        if (cls && this.isClassFinished(cls)) {
            console.warn("Inscricao recusada: Aula ja terminou.");
            return alert('Esta aula ja terminou e nao aceita mais inscricoes.');
        }

        if (!this.state.enrollments[classIdStr]) this.state.enrollments[classIdStr] = [];

        const participants = this.state.enrollments[classIdStr];
        const clientId = Number(this.currentClientId);

        console.log("Client ID para inscricao:", clientId);
        if (!clientId) {
            console.error("Erro: currentClientId nao encontrado.");
            return alert("Sessao invalida. Por favor saia e entre novamente na conta.");
        }

        if (participants.map(id => Number(id)).includes(clientId)) return;

        // Verificar permissao do plano
        const client = this.state.clients.find(cl => Number(cl.id) === clientId);
        if (client && cls) {
            const check = this.canClientEnrollInClass(client, cls);
            if (!check.allowed) {
                return this.showModal(`
                    <div style="text-align:center; padding:1rem 0;">
                        <div style="font-size:3rem; margin-bottom:1rem;">🔒</div>
                        <h3 style="margin-bottom:0.5rem;">Acesso Restrito</h3>
                        <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">${check.reason}</p>
                        <button class="btn btn-secondary" onclick="app.closeModal()">Fechar</button>
                    </div>
                `, '380px');
            }
        }

        if (cls && participants.length >= (cls.capacity || 20)) {
            return alert('Esta aula ja atingiu a lotação maxima.');
        }

        participants.push(clientId);

        // Notificar professor
        if (cls && cls.teacherId) {
            this.addAppNotification(cls.teacherId, 'Nova Inscrição em Aula', `O aluno ${this.currentUser.name} inscreveu-se na aula de ${cls.name} (${this.getDayName(cls.day)} - ${cls.time}).`, null, 'notification', false);
        }

        await this.saveState();
        this.renderContent();
        this.showToast('Inscrição confirmada!');
    }

    async leaveClass(classId) {
        if (!confirm('Deseja cancelar a sua Inscrição nesta aula?')) return;
        const classIdStr = String(classId);

        if (this.state.enrollments[classIdStr]) {
            this.state.enrollments[classIdStr] = this.state.enrollments[classIdStr].filter(id => Number(id) !== Number(this.currentClientId));
            await this.saveState();
            this.renderContent();
            this.showToast('Inscrição cancelada.');
        }
    }

    getDayName(dayIndex) {
        const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        return days[dayIndex];
    }

}

const app = new FitnessApp();
