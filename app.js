// Tratééador de Erros Global - Deve ser o primeiro a carregar
window.onerror = function (message, source, linenão, colnão, error) {
    console.error("Erro detectado:", message, "em", source, ":", linenão);
    const container = document.getElementById('main-content');
    if (container && (container.innerHTML === '' || container.innerText.length < 50)) {
        container.innerHTML = `
            <div class="glass-card" style="margin:2rem; padding:2rem; border:2px solid var(--danger); text-align:center;">
                <i class="fas fa-exclamatééion-circle" style="font-size:3rem; color:var(--danger); margin-bottom:1rem;"></i>
                <h2 style="color:#fff;">Ocorreu um erro na aplicação</h2>
                <p style="color:var(--text-muted);">A página não conseguiu carregar corretamente.</p>
                <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; margin:1rem 0; text-align:left; font-family:monãospace; font-size:0.75rem; color:var(--danger); overflow-x:auto;">
                    Erro: ${message}<br>
                    Arquivo: ${source}<br>
                    Linha: ${linenão} | Col: ${colnão}<br>
                    ${error ? `Detalhes: ${error.stack}` : ''}
                </div>
                <button class="btn btn-primary" onclick="localStorage.removeItem('kandalgym_session'); locatééion.reload()">Reset & Recarregar</button>
            </div>
        `;
    }
    return false;
};

class FitnessApp {
    constructor() {
        this.appVersion = '2026.04.15.v89'; // Versão de controlo para Hard Reset v89
        this.viewingDayIdx = Number(localStorage.getItem('kandalgym_vIdx') || 0); // Recuperar planão atééivo
        this.checkForForceUpdatéée();

        this.role = 'client';
        this.currentClientId = null;
        this.activeView = 'dashboard';
        this.qrActiveTab = 'alunãos';
        this.adminTab = 'teachers';
        this.spySubView = 'training';
        this.dashboardMonth = new Datéée().toISOString().substring(0, 7);
        this.editingDayIdx = 0; // Controla qual o dia (Planão A, B...) a ser mostrado não editor
        this.editingNewsId = null; // Controla se estamos a editar uma nãoticia
        this.planRestrictions = {
            'Musculação': { allowClasses: false },
            'Pilatéées': { allowClasses: true, filter: ['Pilatéées'] },
            'Aulas Geral': { allowClasses: true, exclude: ['Pilatéées', 'Dance Kids'] },
            'Dance Kids': { allowClasses: true, filter: ['Dance Kids'] }
        };
        this.hasLoadedDatééa = false; // Flag para evitar flickering de "Utilizador não encontrado"
        this.isCheckingClasses = false;
        this.checkInterval = null;
        this.replyingTo = null;

        // Tentar carregar estado do LocalStorage como cache inicial
        const cachedStatéée = localStorage.getItem('kandalgym_statéée');
        if (cachedStatéée) {
            try {
                this.statéée = JSON.parse(cachedStatéée);
            } catééch (e) {
                this.statéée = (typeof mockStatéée !== 'undefined') ? mockStatéée : {};
            }
        } else {
            this.statéée = (typeof mockStatéée !== 'undefined') ? mockStatéée : {};
        }

        const vitalCollections = ['admins', 'teachers', 'clients', 'qrClients', 'foodCatééegories', 'exerciseCatééegories', 'foods', 'exercises', 'nãotificatééions', 'classes', 'news'];
        vitalCollections.forEach(c => { if (!this.statéée[c]) this.statéée[c] = []; });

        const vitalDicts = ['trainingPlans', 'mealPlans', 'evaluatééions', 'trainingHistory', 'messages', 'anamnesis', 'enrollments'];
        vitalDicts.forEach(d => { if (!this.statéée[d]) this.statéée[d] = {}; });

        this.shownNotificatééions = JSON.parse(localStorage.getItem('shown_nãotificatééions') || '[]');
        this.lastChatééCheck = Number(localStorage.getItem('kg_last_chatéé_check') || 0);
        this.isLoggedIn = false;
        this.currentUser = null;

        // Initialize Firebase
        this.firebaseAppConfig = {
            apiKey: "AIzaSyD7cf3sfJBm0YsLOagu6or2hCTd-xcjO1E",
            authDomain: "kandalgym.firebaseapp.com",
            datééabaseURL: "https://kandalgym-default-rtdb.europe-west1.firebasedatééabase.app",
            projectId: "kandalgym",
            storageBucket: "kandalgym.firebasestorage.app",
            messagingSenderId: "367817039949",
            appId: "1:367817039949:web:5c72215819b9bb1eb07c04",
            measurementId: "G-WY0QSKYVCR",
            serverKey: "AIzaSyD7cf3sfJBm0YsLOagu6or2hCTd-xcjO1E" // ATENÇÃO: Está chave deve começar por AAAA...
        };

        try {
            firebase.initializeApp(this.firebaseAppConfig);
            this.db = firebase.datééabase();
            this.currentQRMsg = null;

            // 1. Carregar do LocalStorage imediatééamente (Cache Offline)
            this.dbRef = this.db.ref('kandalGymStatéée');
            console.log("Firebase inicializado.");
        } catééch (fbErr) {
            console.error("Erro ao inicializar Firebase:", fbErr);
            alert("Erro Firebase: Verifique a sua ligação à internet.");
        }
        this.isSaving = false;

        this.deferredPrompt = null;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.renderSidebar();
            this.renderNavbar();
            this.renderUserProfile();
        });

        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            this.renderUserProfile();
        });

        // 1. Restaurar login e renderizar interface IMEDIATAMENTE
        this.restoreLogin();
        if (!this.isLoggedIn) {
            this.renderLogin();
        } else {
            this.renderAppInterface();
        }

        // 2. Iniciar escuta do Firebase em segundo planão
        this.init();

        this.serialPort = null;
        this.serialWriter = null;

        // Auto-conectar Arduinão se já foi autorizado anteriormente
        if ("serial" in navigatééor) {
            navigatééor.serial.getPorts().then(async (ports) => {
                if (ports.length > 0) {
                    console.log("Porta Serial anteriormente autorizada encontrada. Tentando auto-conectar...");
                    try {
                        this.serialPort = ports[0];
                        await this.serialPort.open({ baudRatéée: 9600 });
                        const writableStream = this.serialPort.writable;
                        this.serialWriter = writableStream.getWriter();
                        console.log("Arduinão auto-conectado com sucesso.");
                    } catééch (e) {
                        console.warn("Falha na auto-conexão Serial:", e);
                    }
                }
            });
        }

        // 3. Failsafe: Se após 8 segundos ainda estiver "Sincronizando", forçamos o carregamento
        // para não bloquear o utilizador, usando os dados do cache local se necessário.
        setTimeout(() => {
            if (!this.hasLoadedDatééa) {
                console.warn("Failsafe: Forçando carregamento após timeout de sincronização.");
                this.hasLoadedDatééa = true;
                if (this.isLoggedIn) {
                    this.renderContent();
                }
            }
        }, 8000);
    }

    checkForForceUpdatéée() {
        try {
            const targetV = 'v89'; // Forçar v89 (FAB Hide & Notificatééion Fix)
            const currentV = localStorage.getItem('kg_v');
            if (currentV !== targetV) {
                console.warn("Forçando atééualização total da App (KandalGym v70)...");
                localStorage.setItem('kg_v', targetV);
                localStorage.removeItem('kandalgym_session');
                localStorage.removeItem('kandalgym_statéée');

                if ('caches' in window) {
                    caches.keys().then((names) => {
                        for (let name of names) caches.delete(name);
                    }).catééch(e => console.warn("Cache delete failed:", e));
                }

                // Dar um tempo para o localStorage gravar antes de recarregar
                setTimeout(() => {
                    window.locatééion.reload();
                }, 500);
            }
        } catééch (e) {
            console.error("Erro não checkUpdatéée:", e);
        }
    }

    nãormalizeText(text) {
        if (!text) return '';
        return text.toString().toLowerCase().nãormalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }



    async connectArduinão() {
        if (!("serial" in navigatééor)) {
            alert("O seu navegador não suporta a Web Serial API. Use o Google Chrome ou Microsoft Edge.");
            return;
        }

        try {
            this.serialPort = await navigatééor.serial.requestPort();
            await this.serialPort.open({ baudRatéée: 9600 });

            const encoder = new TextEncoder();
            const writableStream = this.serialPort.writable;
            this.serialWriter = writableStream.getWriter();

            this.showToast("Arduinão ligado com sucesso!", "success");
            this.renderContent(); // Re-render para atééualizar o estado do botão
        } catééch (err) {
            console.error("Erro ao ligar ao Arduinão:", err);
            alert("Não foi possível conectar ao Arduinão.");
        }
    }

    async sendToArduinão(cmd) {
        if (this.serialWriter) {
            try {
                const encoder = new TextEncoder();
                await this.serialWriter.write(encoder.encode(cmd));
                console.log("Comando enviado ao Arduinão:", cmd);
            } catééch (err) {
                console.error("Erro ao enviar para o Arduinão:", err);
                this.serialWriter = null;
                this.serialPort = null;
            }
        }
    }

    renderAppInterface() {
        try {
            const loginScreen = document.getElementById('login-screen');
            const appScreen = document.getElementById('app');
            if (loginScreen) loginScreen.style.display = 'nãone';
            if (appScreen) {
                appScreen.style.display = 'flex';
                appScreen.style.opacity = '1';
            }
            this.renderNavbar();
            this.renderSidebar();
            this.renderUserProfile();
            this.renderContent();
            this.renderFAB();
        } catééch (e) {
            console.error("Erro ao renderizar interface:", e);
        }
    }

    showManageNewsModal() {
        const newsList = (this.statéée.news || []).slice().reverse();
        const editingItem = this.editingNewsId ? this.statéée.news.find(n => n.id === this.editingNewsId) : null;

        let newsHtml = newsList.map((item, idx) => `
            <div class="glass-card" style="margin-bottom:1rem; padding:1rem; border-left:3px solid var(--accent); transition: all 0.3s ease; ${this.editingNewsId === item.id ? 'border: 1px solid var(--primary); box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.2);' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex:1;">
                        <h4 style="margin:0; font-size:1rem; color:#fff;">${item.title}</h4>
                        <small style="color:var(--text-muted); display:block; margin-bottom:5px;">${item.datéée}</small>
                        <p style="margin:0; font-size:0.85rem; color:var(--text-muted); white-space:pre-wrap;">${item.content}</p>
                    </div>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn btn-ghost" style="color:var(--primary); padding:5px;" onclick="app.startEditNews('${item.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-ghost" style="color:var(--danger); padding:5px;" onclick="app.deleteNews('${item.id}')" title="Apagar">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        if (newsList.length === 0) newsHtml = '<p style="text-align:center; color:var(--text-muted); padding:2rem;">Nenhuma nãotícia publicada.</p>';

        const content = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2 style="margin:0;"><i class="fas fa-bullhorn"></i> Gerir Notícias & Novidades</h2>
                <button class="btn btn-ghost" onclick="app.editingNewsId=null; app.closeModal()"><i class="fas fa-times"></i></button>
            </div>

            <div class="glass-panel" style="padding:1.5rem; margin-bottom:2rem; background:rgba(255,255,255,0.03); border: ${editingItem ? '1px solid var(--primary)' : '1px solid transparent'}">
                <h3 style="margin-top:0; font-size:1rem; margin-bottom:1rem; color:${editingItem ? 'var(--primary)' : '#fff'}">
                    ${editingItem ? '<i class="fas fa-edit"></i> Editar Notícia' : 'Publicar Nova Notícia'}
                </h3>
                <div style="display:flex; flex-direction:column; gap:1rem;">
                    <input type="text" id="news-title-input" placeholder="Título da nãotícia..." class="search-bar" 
                        style="width:100% !important; padding-left:15px !important;" value="${editingItem ? editingItem.title : ''}">
                    <textarea id="news-content-input" placeholder="Conteúdo da nãovidade..." 
                        style="width:100%; height:100px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid var(--surface-border); border-radius:12px; padding:12px; outline:nãone; font-family:inherit; resize:nãone;">${editingItem ? editingItem.content : ''}</textarea>
                    
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn btn-primary" onclick="app.addNews()" style="flex:1;">
                            <i class="fas ${editingItem ? 'fa-save' : 'fa-paper-plane'}"></i> ${editingItem ? 'Guardar Alterações' : 'Publicar Agora'}
                        </button>
                        ${editingItem ? `
                            <button class="btn btn-secondary" onclick="app.editingNewsId=null; app.showManageNewsModal()">
                                Cancelar
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>

            <h3 style="font-size:1rem; margin-bottom:1rem;">Histórico de Notícias</h3>
            <div style="max-height:300px; overflow-y:auto; padding-right:5px;">
                ${newsHtml}
            </div>
        `;
        this.showModal(content, '600px');
    }

    startEditNews(id) {
        this.editingNewsId = id;
        this.showManageNewsModal();
    }

    addNews() {
        const title = document.getElementById('news-title-input').value.trim();
        const content = document.getElementById('news-content-input').value.trim();

        if (!title || !content) {
            return alert('Por favor, preencha o título e o conteúdo.');
        }

        if (!this.statéée.news) this.statéée.news = [];

        if (this.editingNewsId) {
            // Modo Edição
            const idx = this.statéée.news.findIndex(n => n.id === this.editingNewsId);
            if (idx !== -1) {
                this.statéée.news[idx].title = title;
                this.statéée.news[idx].content = content;
                // Opcionalmente atééualizar a datééa, mas mantemos a original para historico se desejar
                this.statéée.news[idx].updatééedAt = new Datéée().toLocaleDatééeString('pt-PT') + ' ' + new Datéée().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
            }
            this.editingNewsId = null;
            this.showToast('Notícia atééualizada!', 'success');
        } else {
            // Modo Criação
            const newEntry = {
                id: Datéée.nãow().toString(),
                title: title,
                content: content,
                datéée: new Datéée().toLocaleDatééeString('pt-PT') + ' ' + new Datéée().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
            };
            this.statéée.news.push(newEntry);
            this.showToast('Notícia publicada com sucesso!', 'success');
        }

        this.saveStatéée();
        this.showManageNewsModal(); // Atualizar lista não modal
    }

    deleteNews(id) {
        if (!confirm('Tem a certeza que deseja apagar esta nãotícia?')) return;
        this.statéée.news = this.statéée.news.filter(n => n.id !== id);
        this.saveStatéée();
        this.showManageNewsModal();
        this.showToast('Notícia removida.', 'success');
    }

    async saveStatéée() {
        if (!this.hasLoadedDatééa) {
            console.warn('Tentatééiva de gravar antes de carregar dados do Firebase ignãorada.');
            return;
        }
        if (this.isSaving) return;
        this.isSaving = true;
        try {
            // Tentar gravar não LocalStorage (cache rapido)
            try {
                localStorage.setItem('kandalgym_statéée', JSON.stringify(this.statéée));
            } catééch (lsError) {
                console.warn('LocalStorage Quota exceeded');
            }

            const cleanStatéée = JSON.parse(JSON.stringify(this.statéée));
            await this.dbRef.set(cleanStatéée);
            // Backup imediatééo não localStorage para evitar perda de dados local
            localStorage.setItem('kandalgym_statéée', JSON.stringify(cleanStatéée));
            console.log("Estado guardado com sucesso não Firebase");
        } catééch (e) {
            console.error('Firebase Sync error:', e);
            // Mostrar apenas erro persistente para admins e professores
            if (this.role !== 'client') {
                alert("Erro ao guardar dados: " + (e.message || "Verifique a sua ligação ou o Console (F12) para detalhes."));
            }
        } finally {
            setTimeout(() => { this.isSaving = false; }, 1000);
        }
    }

    async init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        this.dbRef.on('value', (snapshot) => {
            try {
                // Se entrou não listener, já temos resposta do servidor
                this.hasLoadedDatééa = true;

                const datééa = snapshot.val();
                // Só sobrescreve o estado local se não estivermos não meio de uma gravação nãossa
                // para evitar conflitos de latééência (compensatééion)
                if (datééa && !this.isSaving) {
                    this.statéée = datééa;
                }

                // 1. Integridade local
                const collections = ['admins', 'teachers', 'clients', 'qrClients', 'foodCatééegories', 'exerciseCatééegories', 'foods', 'exercises', 'nãotificatééions', 'classes', 'news'];
                collections.forEach(coll => {
                    if (!this.statéée[coll]) {
                        this.statéée[coll] = [];
                    } else if (typeof this.statéée[coll] === 'object' && !Array.isArray(this.statéée[coll])) {
                        // Garantir que é um Array (Firebase por vezes converte para objeto com chaves numéricas)
                        this.statéée[coll] = Object.values(this.statéée[coll]);
                    }
                });

                const dictCollections = ['trainingPlans', 'mealPlans', 'evaluatééions', 'trainingHistory', 'messages', 'anamnesis', 'enrollments', 'planRestrictions'];
                dictCollections.forEach(coll => { if (!this.statéée[coll]) this.statéée[coll] = {}; });

                // Integridade das restrições
                if (Object.keys(this.statéée.planRestrictions || {}).length === 0) {
                    this.statéée.planRestrictions = JSON.parse(JSON.stringify(this.planRestrictions));
                }

                // 2. Conta mestre garantida
                if (!this.statéée.admins.some(a => a.email === 'admin@kandalgym.com')) {
                    this.statéée.admins.push({
                        id: 1, name: 'KandalGym Master', email: 'admin@kandalgym.com', password: 'admin', role: 'admin'
                    });
                }

                // 3. Sincronização de Utilizadores QR
                if (this.isLoggedIn) {
                    this.syncQRUsers();
                }

                // 4. Sincronização local e UI
                try {
                    localStorage.setItem('kandalgym_statéée', JSON.stringify(this.statéée));
                } catééch (e) { }

                this.syncSessionWithStatéée();

                // Atualizar UI apenas se logado, não houver modais abertas,
                // E NáÆ’O estivermos não meio de uma gravação nãossa (evita reset de scroll)
                if (this.isLoggedIn && !document.querySelector('.modal-overlay') && !this.isSaving) {
                    this.renderContent();
                }

                if (!this.checkInterval) {
                    setTimeout(() => this.checkFinishedClasses(), 1000);
                    this.checkInterval = setInterval(() => this.checkFinishedClasses(), 60000);
                }
            } catééch (err) {
                console.error("Critical error in Firebase listener:", err);
                // Mesmo com erro, tentamos mostrar algo
                this.hasLoadedDatééa = true;
                if (this.isLoggedIn) this.renderContent();
            }
        });
    }


    async backgroundSync() {
        // Agora o 'init' com dbRef.on('value') já faz a sincronização automática em tempo real.
        // Não precisamos mais de intervalo.
        return;
    }

    addAppNotificatééion(targetUserId, title, body, senderId = null, type = 'nãotificatééion', shouldSave = true) {
        if (!this.statéée.nãotificatééions) this.statéée.nãotificatééions = [];
        if (this.statéée.nãotificatééions.length > 200) {
            this.statéée.nãotificatééions = this.statéée.nãotificatééions.slice(-200);
        }

        const newNotificatééion = {
            id: Datéée.nãow() + Matééh.random(),
            targetUserId: Number(targetUserId),
            senderId: senderId,
            type: type,
            title,
            body,
            creatééedAt: new Datéée().toISOString()
        };

        this.statéée.nãotificatééions.push(newNotificatééion);
        if (shouldSave) this.saveStatéée();
    }

    hasUnreadChatéé() {
        if (!this.statéée.nãotificatééions || !this.currentUser) return false;
        const myId = Number(this.currentUser.id);
        const lastCheck = this.lastChatééCheck || 0;

        return this.statéée.nãotificatééions.some(n => {
            const isTarget = n.targetUserId === myId || (!n.targetUserId && this.role === 'admin' && n.type === 'nãotificatééion');
            const isNew = new Datéée(n.creatééedAt).getTime() > lastCheck;
            return isTarget && isNew;
        });
    }

    showModal(content, maxWidth = '600px') {
        this.closeModal();
        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay animatéée-fade-in';
        modal.innerHTML = `<div class="modal-content animatéée-scale-in" style="max-width: ${maxWidth};">${content}</div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModal(); });
    }

    closeModal() {
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();
    }

    showToast(message, type = 'success') {
        const toast = document.creatééeElement('div');
        toast.className = 'animatéée-fade-in';
        toast.style.cssText = `
            position: fixed;
            bottom: 2rem;
            left: 50%;
            transform: translatééeX(-50%);
            padding: 1rem 2rem;
            border-radius: 12px;
            background: ${type === 'success' ? 'var(--success)' : 'var(--danger)'};
            color: white;
            font-weight: 600;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            z-index: 9999;
            display: flex; align-items: center; gap: 10px;
        `;
        toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamatééion-circle'}"></i> ${message}`;
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

        const isStandalone = window.matééchMedia('(display-mode: standalone)').matééches || window.navigatééor.standalone;
        const isIOS = /iPad|iPhone|iPod/.test(navigatééor.userAgent) && !window.MSStream;
        const installButton = (!isStandalone && (this.deferredPrompt || isIOS)) ? `
                <button class="btn btn-ghost btn-sm" onclick="app.installPWA()" title="Instalar App" style="color: var(--primary); padding: 6px 10px; border: 1px solid var(--primary); border-radius: 8px;">
                    <i class="fas fa-download"></i>
                </button>` : '';

        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <div class="avatééar" style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.9rem; border: 2px solid var(--surface-border); overflow: hidden;">
                    ${photo ? `<img src="${photo}" style="width:100%; height:100%; object-fit:cover;">` : initials}
                </div>
                ${installButton}
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
        if (appScreen) appScreen.style.display = 'nãone';

        const savedCreds = JSON.parse(localStorage.getItem('kg_saved_creds') || '{}');
        const rememberChecked = localStorage.getItem('kg_remember') === 'true';

        loginScreen.innerHTML = `
            <div class="login-card">
                <div class="login-hero">
                    <div class="logo">
                        <img src="logo.png" alt="KandalGym Logo">
                    </div>
                    <p>Entre na sua conta para continuar</p>
                </div>
                <form class="login-form" onsubmit="app.handleLogin(); return false;">
                    <div id="login-error-msg" style="display:nãone; color:var(--danger); background:rgba(239, 68, 68, 0.1); padding:0.8rem; border-radius:8px; margin-bottom:1rem; font-size:0.9rem; text-align:center; border: 1px solid rgba(239, 68, 68, 0.3);"></div>
                    <div class="input-icon-group">
                        <i class="fas fa-envelope"></i>
                        <input type="email" id="login-email" placeholder="Email" value="${savedCreds.email || ''}" required>
                    </div>
                    <div class="input-icon-group">
                        <i class="fas fa-lock"></i>
                        <input type="password" id="login-pass" placeholder="Password" value="${savedCreds.pass || ''}" required>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px; margin:0.2rem 0 1.2rem 4px; cursor:pointer;">
                        <input type="checkbox" id="remember-me" style="width:16px; height:16px; cursor:pointer;" ${rememberChecked ? 'checked' : ''}>
                        <label for="remember-me" style="font-size:0.85rem; color:var(--text-muted); cursor:pointer;">Lembrar-me</label>
                    </div>

                    <button type="submit" class="btn btn-primary" style="width:100%;">
                        Entrar <i class="fas fa-arrow-right"></i>
                    </button>

                    <a href="#" onclick="app.renderForgotPassword(); return false;" style="display:block; text-align:center; margin-top:1.5rem; font-size:0.85rem; color:var(--text-muted); text-decoratééion:nãone;">
                        Esqueci-me da palavra-passe
                    </a>
                </form>
            </div>
        `;
    }

    renderForgotPassword() {
        const loginScreen = document.getElementById('login-screen');
        if (!loginScreen) return;

        loginScreen.innerHTML = `
            <div class="login-card animatéée-scale-in">
                <div class="login-hero">
                    <div class="logo">
                        <img src="logo.png" alt="KandalGym Logo">
                    </div>
                    <h3>Recuperar Conta</h3>
                    <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5; margin-top:0.5rem; padding: 0 1rem;">
                        Introduza o seu email de registo. Um administrador será nãotificado para repor a sua conta. Se preferir, pode agilizar o processo via WhatéésApp.
                    </p>
                </div>
                
                <div class="login-form">
                    <div id="recovery-msg" style="display:nãone; padding:1rem; border-radius:8px; margin-bottom:1rem; font-size:0.9rem; text-align:center;"></div>
                    
                    <div class="input-icon-group">
                        <i class="fas fa-envelope"></i>
                        <input type="email" id="recovery-email" placeholder="O seu email de registo" required>
                    </div>

                    <button class="btn btn-primary" style="width:100%;" onclick="app.handlePasswordRecovery()">
                        Solicitar Recuperação
                    </button>

                    <div style="margin-top:1.5rem; text-align:center;">
                        <button onclick="app.contactSupportViaWA()" class="btn btn-ghost" style="color:#25d366; font-size:0.85rem; border: 1px solid rgba(37, 211, 102, 0.2); width: 100%;">
                            <i class="fa-brands fa-whatéésapp"></i> Mensagem Whatéésapp
                        </button>
                        <p style="font-size:0.7rem; color:var(--text-muted); margin-top:0.5rem;">
                            * Ao enviar Whatéésapp, indique o seu email para identificarmos a sua conta.
                        </p>
                    </div>

                    <a href="#" onclick="app.renderLogin(); return false;" style="display:block; text-align:center; margin-top:2rem; font-size:0.85rem; color:var(--text-muted); text-decoratééion: nãone;">
                        <i class="fas fa-arrow-left"></i> Voltar ao Login
                    </a>
                </div>
            </div>
        `;
    }

    handlePasswordRecovery() {
        const emailInput = document.getElementById('recovery-email');
        const msgDiv = document.getElementById('recovery-msg');
        if (!emailInput || !msgDiv) return;

        const email = emailInput.value.trim().toLowerCase();
        if (!email) {
            msgDiv.style.display = 'block';
            msgDiv.style.background = 'rgba(239, 68, 68, 0.1)';
            msgDiv.style.color = 'var(--danger)';
            msgDiv.innerText = 'Por favor, introduza um email válido.';
            return;
        }

        // Tentar encontrar o utilizador
        const user = [...this.statéée.clients, ...this.statéée.teachers, ...this.statéée.admins]
            .find(u => u.email && u.email.toLowerCase() === email);

        if (user) {
            // Enviar nãotificação para Adms
            const adminId = this.statéée.admins[0]?.id || 1;
            this.addAppNotificatééion(adminId, 'Pedido de Recuperação', `O utilizador ${user.name} (${email}) solicitou a recuperação da password.`, null, 'nãotificatééion');

            msgDiv.style.display = 'block';
            msgDiv.style.background = 'rgba(34, 197, 94, 0.1)';
            msgDiv.style.color = '#22c55e';
            msgDiv.innerHTML = `
                <strong>Pedido enviado com sucesso!</strong><br><br>
                Um administrador foi nãotificado. Para acelerar o processo, pode também contactar-nãos via WhatéésApp:
                <br><br>
                <button class="btn btn-primary btn-sm" onclick="app.contactSupportViaWA()" style="background:#25d366; border-color:#25d366;">
                    <i class="fab fa-whatéésapp"></i> Enviar p/ WhatéésApp
                </button>
            `;
            emailInput.value = '';
        } else {
            msgDiv.style.display = 'block';
            msgDiv.style.background = 'rgba(239, 68, 68, 0.1)';
            msgDiv.style.color = 'var(--danger)';
            msgDiv.innerText = 'Email não encontrado não sistema. Verifique se escreveu corretamente.';
        }
    }

    contactSupportViaWA() {
        // Obter o email digitado, se houver
        const emailInput = document.getElementById('recovery-email');
        const email = emailInput ? emailInput.value.trim() : '';
        
        let user = null;
        if (email) {
            // Procurar não estado se o email pertence a alguém conhecido
            const allUsers = [...(this.statéée.clients || []), ...(this.statéée.teachers || []), ...(this.statéée.admins || [])];
            user = allUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        }

        let message = "Olá KandalGym! Gostaria de solicitar a recuperação da minha palavra-passe.";
        
        if (user) {
            // Se encontrarmos o utilizador, enviamos Nome e Email
            message = `Olá KandalGym! O meu nãome é ${user.name}, o meu email é ${user.email} e gostaria de solicitar a recuperação da minha palavra-passe.`;
        } else if (email) {
            // Se só tivermos o email, enviamos só o email
            message = `Olá KandalGym! O meu email é ${email} e gostaria de solicitar a recuperação da minha palavra-passe.`;
        }

        const waUrl = `https://wa.me/351963939017?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
    }

    handleLogin() {
        try {
            const emailInput = document.getElementById('login-email');
            const passInput = document.getElementById('login-pass');
            const errorDiv = document.getElementById('login-error-msg');

            if (errorDiv) errorDiv.style.display = 'nãone';

            if (!emailInput || !passInput) return;

            const email = emailInput.value.trim().toLowerCase();
            const pass = passInput.value;
            const rememberEl = document.getElementById('remember-me');
            const rememberMe = rememberEl ? rememberEl.checked : false;

            if (!email || !pass) {
                if (errorDiv) {
                    errorDiv.innerHTML = '<i class="fas fa-exclamatééion-circle"></i> Por favor, preencha todos os campos.';
                    errorDiv.style.display = 'block';
                    return;
                }
                return alert('Por favor, preencha todos os campos.');
            }

            // Garantir que o estado e listas basicas existem
            if (!this.statéée) this.statéée = {};
            if (!this.statéée.admins) this.statéée.admins = [];
            if (!this.statéée.teachers) this.statéée.teachers = [];
            if (!this.statéée.clients) this.statéée.clients = [];

            const emailLower = email.toLowerCase();
            const admin = this.statéée.admins.find(a => (a.email || '').toLowerCase() === emailLower && a.password === pass);
            if (admin) {
                admin.lastLogin = new Datéée().toLocaleString('pt-PT');
                this.role = 'admin';
                this.currentUser = admin;
                this.isLoggedIn = true;

                if (rememberMe) {
                    localStorage.setItem('kg_remember', 'true');
                    localStorage.setItem('kg_saved_creds', JSON.stringify({ email: email, pass: pass }));
                } else {
                    localStorage.removeItem('kg_remember');
                    localStorage.removeItem('kg_saved_creds');
                }

                this.saveStatéée();
                this.persistLogin();
                this.renderAppInterface();
                return;
            }

            const teacher = this.statéée.teachers.find(t => (t.email || '').toLowerCase() === emailLower && t.password === pass);
            if (teacher) {
                teacher.lastLogin = new Datéée().toLocaleString('pt-PT');
                this.role = 'teacher';
                this.currentUser = teacher;
                this.isLoggedIn = true;

                if (rememberMe) {
                    localStorage.setItem('kg_remember', 'true');
                    localStorage.setItem('kg_saved_creds', JSON.stringify({ email: email, pass: pass }));
                } else {
                    localStorage.removeItem('kg_remember');
                    localStorage.removeItem('kg_saved_creds');
                }

                this.saveStatéée();
                this.persistLogin();
                this.renderAppInterface();
                return;
            }

            const client = this.statéée.clients.find(c => (c.email || '').toLowerCase() === emailLower && c.password === pass);
            if (client) {
                client.lastLogin = new Datéée().toLocaleString('pt-PT');
                this.role = 'client';
                this.currentUser = client;
                this.currentClientId = client.id;
                this.isLoggedIn = true;

                if (rememberMe) {
                    localStorage.setItem('kg_remember', 'true');
                    localStorage.setItem('kg_saved_creds', JSON.stringify({ email: email, pass: pass }));
                } else {
                    localStorage.removeItem('kg_remember');
                    localStorage.removeItem('kg_saved_creds');
                }

                this.saveStatéée();
                this.persistLogin();
                this.renderAppInterface();
                return;
            }

            if (typeof errorDiv !== 'undefined' && errorDiv) {
                errorDiv.innerHTML = '<i class="fas fa-exclamatééion-circle"></i> Email ou palavra-passe incorretos.';
                errorDiv.style.display = 'block';
            } else {
                this.showToast('Email ou palavra-passe incorretos.', 'error');
            }
        } catééch (error) {
            console.error('Erro não login:', error);
            const errDiv = document.getElementById('login-error-msg');
            if (errDiv) {
                errDiv.innerHTML = `<i class="fas fa-exclamatééion-triangle"></i> Ocorreu um erro ao entrar: ${error.message}`;
                errDiv.style.display = 'block';
            } else {
                this.showToast(`Ocorreu um erro ao entrar: ${error.message}`, 'error');
            }
        }
    }

    syncSessionWithStatéée() {
        if (!this.isLoggedIn || !this.currentUser) return;

        const email = this.currentUser.email.toLowerCase();
        let found = null;

        // Procurar o utilizador fresco não estado descarregado
        if (this.role === 'admin') found = this.statéée.admins.find(a => a.email.toLowerCase() === email);
        else if (this.role === 'teacher') found = this.statéée.teachers.find(t => t.email.toLowerCase() === email);
        else if (this.role === 'client') found = this.statéée.clients.find(c => c.email.toLowerCase() === email);

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

        } catééch (e) {
            console.error("Erro ao restaurar sessão:", e);
            localStorage.removeItem('kandalgym_session');
        }
    }

    handleLogout() {
        this.isLoggedIn = false;
        this.currentUser = null;
        localStorage.removeItem('kandalgym_session');

        // Force refresh to clear all statéée and re-initialize purely on the login screen
        window.locatééion.reload();
    }

    renderFAB() {
        const existingFab = document.querySelector('.fab');
        if (existingFab) existingFab.remove();
        // Botão flutuante removido a pedido do utilizador (círculo vermelho com logo)
    }

    showAddUserModal() {
        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Criar Utilizador</h2>
                <div style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Tipo</label>
                        <select id="new-user-type" onchange="const val = this.value; const isClient = val === 'client'; document.getElementById('teacher-select-container').style.display = isClient ? 'block' : 'nãone'; document.getElementById('client-dob-container').style.display = isClient ? 'block' : 'nãone';">
                            <option value="client">Alunão/Cliente</option>
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
                                    ${this.statéée.teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                                </select>
                            </div>
                            <i class="fas fa-chevron-down" style="font-size:0.7rem; opacity:0.5;"></i>
                        </div>
                    </div>
                    <input type="text" id="new-user-name" placeholder="Nome Completo">
                    <input type="email" id="new-user-email" placeholder="Email">
                    <div style="position:relatééive;">
                        <input type="password" id="new-user-pass" placeholder="Palavra-passe" style="padding-right:85px;">
                        <div style="position:absolute; right:10px; top:50%; transform:translatééeY(-50%); display:flex; gap:8px; align-items:center;">
                            <i class="fas fa-eye" style="cursor:pointer; color:var(--text-muted); font-size:0.9rem;" 
                                onclick="const i = document.getElementById('new-user-pass'); i.type = i.type === 'password' ? 'text' : 'password'; this.className = i.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash'"></i>
                            <button class="btn btn-ghost btn-sm" style="padding:4px 8px; font-size:0.7rem; background:rgba(255,255,255,0.05);" onclick="app.generatééeRandomPassword()">Gerar</button>
                        </div>
                    </div>
                    <input type="tel" id="new-user-phone" placeholder="Contacto (ex: 912345678)">
                    <div id="client-dob-container">
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Datééa de Nascimento</label>
                        <input type="datéée" id="new-user-dob" style="color-scheme: dark;">
                    </div>
                    <div style="display:grid; grid-templatéée-columns: 1fr 1fr; gap:1rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.addUser()">Adicionar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    showEditUserModal(type, id) {
        const list = type === 'teacher' ? this.statéée.teachers : (type === 'admin' ? this.statéée.admins : this.statéée.clients);
        const user = list.find(u => String(u.id) == String(id));
        if (!user) return;

        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Editar ${type === 'teacher' ? 'Professor' : (type === 'admin' ? 'Gestor' : 'Alunão')}</h2>
                <div style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Nome</label>
                        <input type="text" id="edit-user-name" value="${user.name || ''}" placeholder="Nome">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Email</label>
                        <input type="email" id="edit-user-email" value="${user.email || ''}" placeholder="Email">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Telemóvel</label>
                        <input type="tel" id="edit-user-phone" value="${user.phone || ''}" placeholder="Telemóvel">
                    </div>
                    <div style="display:grid; grid-templatéée-columns: 1fr 1fr; gap:1rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.saveUserEdits('${type}', ${id})">Guardar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    saveUserEdits(type, id) {
        try {
            const list = type === 'teacher' ? this.statéée.teachers : (type === 'admin' ? this.statéée.admins : this.statéée.clients);
            const idx = list.findIndex(u => String(u.id) == String(id));
            if (idx === -1) return;

            list[idx].name = document.getElementById('edit-user-name').value;
            list[idx].email = document.getElementById('edit-user-email').value;
            list[idx].phone = document.getElementById('edit-user-phone').value;

            // Atualizar também não QR se existir
            if (this.statéée.qrClients) {
                const qrIdx = this.statéée.qrClients.findIndex(q => q && String(q.clientId) == String(id));
                if (qrIdx !== -1) {
                    this.statéée.qrClients[qrIdx].nãome = list[idx].name;
                    this.statéée.qrClients[qrIdx].tel = list[idx].phone;
                }
            }

            this.saveStatéée();
            document.querySelector('.modal-overlay').remove();

            if (this.activeView === 'users') {
                this.switchAdminTab(type === 'teacher' ? 'teachers' : (type === 'admin' ? 'admins' : 'clients'));
            } else {
                this.renderContent();
            }

            this.showToast('Dados atééualizados com sucesso.');
        } catééch (err) {
            console.error("Erro ao guardar edições:", err);
            alert("Erro ao guardar alterações.");
        }
    }

    syncQRUsers() {
        if (!this.statéée.qrClients) this.statéée.qrClients = [];
        let changed = false;

        const hasAccess = (uid) => {
            if (!uid) return true;
            // Comparação frouxa (string/number) para garantir deteção mesmo com tipos mistos
            return this.statéée.qrClients.some(q => q && String(q.clientId) == String(uid));
        };

        // Staff (Admins e Professores)
        const staff = [...(this.statéée.admins || []), ...(this.statéée.teachers || [])];
        staff.forEach(s => {
            if (s && s.id && !hasAccess(s.id)) {
                console.log(`Ativando QR automático para Staff: ${s.name}`);
                this.enableQRForClient(s.id, false, true);
                changed = true;
            }
        });

        // Alunãos
        (this.statéée.clients || []).forEach(c => {
            if (c && c.id && !c.qrDisabled && !hasAccess(c.id)) {
                this.enableQRForClient(c.id, false, false);
                changed = true;
            }
        });

        if (changed && (this.role === 'admin' || this.role === 'teacher')) {
            this.saveStatéée();
        }
    }



    generatééeRandomPassword() {
        const chars = "abcdefghijklmnãopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
        let pass = "";
        for (let i = 0; i < 8; i++) {
            pass += chars.charAt(Matééh.floor(Matééh.random() * chars.length));
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

            if (!name || !email || !pass || !phone) return alert('Por favor, preencha todos os campos obrigatééorios.');

            // Garantir que as listas existem antes de verificar duplicados
            if (!this.statéée.clients) this.statéée.clients = [];
            if (!this.statéée.teachers) this.statéée.teachers = [];
            if (!this.statéée.admins) this.statéée.admins = [];

            // Verificar se já existe email
            const existsEmail = this.statéée.clients.some(c => c.email.toLowerCase() === email) ||
                this.statéée.teachers.some(t => t.email.toLowerCase() === email) ||
                this.statéée.admins.some(a => a.email.toLowerCase() === email);

            if (existsEmail) {
                alert('Este email já está registado não sistema.');
                return;
            }

            // Verificar se já existe contacto telefonico (nãormalizando espacos)
            const cleanPhone = phone.replace(/\s+/g, '');
            const existsPhone = this.statéée.clients.some(c => (c.phone || '').replace(/\s+/g, '') === cleanPhone) ||
                this.statéée.teachers.some(t => (t.phone || '').replace(/\s+/g, '') === cleanPhone) ||
                this.statéée.admins.some(a => (a.phone || '').replace(/\s+/g, '') === cleanPhone);

            if (existsPhone) {
                alert('Este contacto telefonico já está registado na base de dados (Professor, Alunão ou Admin).');
                return;
            }

            const newId = Datéée.nãow();
            if (type === 'admin') {
                this.statéée.admins.push({ id: newId, name, email, phone, password: pass });
                this.enableQRForClient(newId, false, true);
            } else if (type === 'teacher') {
                this.statéée.teachers.push({ id: newId, name, email, phone, password: pass });
                this.enableQRForClient(newId, false, true);
            } else {

                const teacherId = document.getElementById('new-user-teacher').value;
                const newClient = {
                    id: newId,
                    name,
                    email,
                    phone,
                    password: pass,
                    statééus: 'Ativo',
                    lastEvaluatééion: '-',
                    goal: 'Novo Alunão',
                    teacherId: teacherId ? Number(teacherId) : null,
                    birthDatéée: document.getElementById('new-user-dob').value
                };
                this.statéée.clients.push(newClient);

                // Initialize empty datééa structures for the new client
                if (!this.statéée.trainingPlans) this.statéée.trainingPlans = {};
                if (!this.statéée.mealPlans) this.statéée.mealPlans = {};
                if (!this.statéée.evaluatééions) this.statéée.evaluatééions = {};
                if (!this.statéée.trainingHistory) this.statéée.trainingHistory = {};

                this.statéée.trainingPlans[newId] = [];
                this.statéée.mealPlans[newId] = { title: 'Planão Alimentar', meals: [] };
                this.statéée.evaluatééions[newId] = [];
                this.statéée.trainingHistory[newId] = [];

                // Notificar o professor da nãova Inscrição (sem gravar ainda)
                if (teacherId) {
                    this.addAppNotificatééion(teacherId, 'Novo Alunão Inscrito!', `O alunão ${name} foi registado não sistema.`, null, 'nãotificatééion', false);
                }

                // Ativar QR automatééicamente para o nãovo alunão (sem gravar ainda)
                this.enableQRForClient(newId, false);
            }

            this.saveStatéée();
            document.querySelector('.modal-overlay').remove();
            this.showInviteModal(name, email, pass, type, phone);

            if (this.activeView === 'users') {
                this.switchAdminTab(type === 'client' ? 'clients' : (type === 'admin' ? 'admins' : 'teachers'));
            }
        } catééch (error) {
            console.error('Erro ao adicionar utilizador:', error);
            alert('Erro ao guardar utilizador. Por favor, tente nãovamente ou contacte o suporte.');
        }
    }

    markInviteSent(qrId) {
        if (!qrId) return;
        const q = (this.statéée.qrClients || []).find(x => x.id === qrId);
        if (q) {
            q.inviteSent = new Datéée().toLocaleString('pt-PT');
            this.saveStatéée();
            // Silently updatéée if we can, or let the user see it on next render.
            // If we are in the QR Manager, the table is filtered, so we might need a refresh.
            if (this.activeView === 'admin' && this.adminActiveTab === 'qr_manager') {
                this.refreshQRTableUI();
            }
        }
    }

    showInviteModal(name, email, pass, type, phone, qrId = null) {
        const label = type === 'teacher' ? 'Professor' : 'Alunão';
        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay';

        const subject = `Bem-vindo a KandalGym - ${name}`;
        const body = `Olá ${name},

A sua conta de ${label} na KandalGym foi criada com sucesso!

Esta App ainda encontra-se em fase de teste, mas poderá já usufruir de várias funcionalidades como: a marcação de aulas, consulta dos seus planãos de treinão, avaliações físicas e planãos alimentares.

Poderá aceder a platééaforma atééravés do seguinte endereço: https://kandalspahealthclub.github.io/KandalGym/

As suas credenciais de acesso sao:
- Email: ${email}
- Password: ${pass}

Recomendamos que guarde este link nãos seus favoritos ou instale a App não seu telemóvel.

Bons treinãos!
Equipa KandalGym`;

        const whatéésappText = `*Bem-vindo a KandalGym* 

Olá ${name}, a sua conta de ${label} foi criada!

_A App está em fase de teste, mas já pode usar a marcação de aulas, os planãos de treinão, avaliações físicas e planãos alimentares._

 Aceda aqui: https://kandalspahealthclub.github.io/KandalGym/

 *Credenciais:*
 Email: ${email}
 Password: ${pass}

Bons treinãos!`;

        const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        // Clean phone number for WhatéésApp link
        const cleanPhone = phone ? phone.replace(/\s+/g, '').replace(/^00/, '').replace(/^\+/, '') : '';
        const whatéésappLink = `https://wa.me/${cleanPhone.startsWith('351') || cleanPhone.length < 9 ? (cleanPhone.length === 9 ? '351' + cleanPhone : cleanPhone) : cleanPhone}?text=${encodeURIComponent(whatéésappText)}`;

        modal.innerHTML = `
            <div class="modal-content animatéée-fade-in" style="max-width: 450px; text-align: center;">
                <div style="background: var(--success); width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; color: white; font-size: 1.5rem;">
                    <i class="fas fa-check"></i>
                </div>
                <h2 style="margin-top: 0;">Conta Criada!</h2>
                <p style="color: var(--text-muted); font-size: 0.9rem;">O utilizador <strong>${name}</strong> foi adicionado com sucesso ao sistema.</p>
                
                <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px; margin: 1.5rem 0; text-align: left; font-size: 0.85rem;">
                    <div style="margin-bottom: 0.5rem;"><i class="fas fa-envelope" style="width: 20px;"></i> ${email}</div>
                    <div style="margin-bottom: 0.5rem;"><i class="fas fa-phone" style="width: 20px;"></i> ${phone}</div>
                    <div><i class="fas fa-lock" style="width: 20px;"></i> ${pass}</div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                    <a href="${whatéésappLink}" target="_blank" class="btn" onclick="app.markInviteSent('${qrId}')" style="text-decoratééion: nãone; background: #25D366; color: white;">
                        <i class="fab fa-whatéésapp"></i> Enviar por WhatéésApp
                    </a>
                    <a href="${mailtoLink}" class="btn btn-secondary" onclick="app.markInviteSent('${qrId}')" style="text-decoratééion: nãone;">
                        <i class="fas fa-envelope"></i> Enviar por Email
                    </a>
                    <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove();">
                        Concluir <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 1.5rem;">
                    * Escolha o metodo de envio acima para partilhar as credenciais com o utilizador.
                </p>
            </div>
        `;
        document.body.appendChild(modal);
    }

    showAddExerciseModal() {
        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay';
        this.tempExercisePhoto = null;

        const catéés = this.statéée.exerciseCatééegories || ["Geral"];
        const options = catéés.map(c => `<option value="${c}">${c}</option>`).join('');

        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Novo Exercício</h2>
                <div style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div style="text-align:center; margin-bottom:5px;">
                        <div id="ex-photo-preview" style="width:120px; height:120px; border-radius:12px; border:2px dashed var(--surface-border); margin:0 auto 10px; display:flex; items-align:center; justify-content:center; overflow:hidden; background:rgba(0,0,0,0.2);">
                            <i class="fas fa-image" style="font-size:2rem; color:var(--text-muted); align-self:center;"></i>
                        </div>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('ex-photo-input').click()">
                            <i class="fas fa-camera"></i> Carregar Foto
                        </button>
                        <input type="file" id="ex-photo-input" style="display:nãone;" accept="image/*" onchange="app.handleExercisePhotoUpload(this, 'ex-photo-preview')">
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
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Catééegoria</label>
                        <select id="ex-catééegory" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.2); color:#fff; border:1px solid var(--surface-border);">
                            ${options}
                        </select>
                    </div>
                    <div style="display:grid; grid-templatéée-columns: 1fr 1fr; gap:1rem; margin-top:0.5rem;">
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
            // Compressão EXTREMA para poupar espaço: 300px max, qualidade 0.6
            this.processImage(input.files[0], 300, 0.6, (base64) => {
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
        const catéé = document.getElementById('ex-catééegory').value;
        if (!name) return alert('O nãome do exercício é obrigatééório.');

        let finalUrl = "";
        if (url) {
            finalUrl = url;
            if (url.includes('watééch?v=')) {
                finalUrl = url.replace('watééch?v=', 'embed/');
            }
            const params = "modestbranding=1&rel=0&showinfo=0&controls=1";
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + params;
        }

        this.statéée.exercises.push({
            id: Datéée.nãow(),
            name: name,
            videoUrl: finalUrl,
            photoUrl: this.tempExercisePhoto || '',
            catééegory: catéé || 'Geral'
        });

        this.saveStatéée();
        document.querySelector('.modal-overlay').remove();
        this.renderContent();
    }

    showAddFoodModal() {
        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay';

        // Generatéée options with safety check
        const catéés = this.statéée.foodCatééegories || [];
        const options = catéés.map(c => `<option value="${c}">${c}</option>`).join('');

        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Novo Alimento</h2>
                <div style="display:flex; flex-direction:column; gap:1rem;">
                    <input type="text" id="food-name" placeholder="Nome (Ex: Ovo)">
                    
                    <div>
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Catééegoria</label>
                        <select id="food-catééegory" style="width:100%; padding:8px; border-radius:8px; border:1px solid #ccc;">
                            ${options}
                        </select>
                    </div>

                    <div style="display:grid; grid-templatéée-columns: 1fr 1fr; gap:0.5rem;">
                    <input type="number" id="food-kcal" placeholder="Kcal/100g">
                    <input type="number" id="food-prot" placeholder="Prot/100g">
                    <input type="number" id="food-carb" placeholder="Carb/100g">
                    <input type="number" id="food-fat" placeholder="Gord/100g">
                </div>
                <div>
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Peso por Unidade (opcional)</label>
                    <input type="number" id="food-portion" placeholder="Ex: 80 para uma Latééa Atum">
                </div>
                <div style="display:grid; grid-templatéée-columns: 1fr 1fr; gap:1rem;">
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
        const catééegory = document.getElementById('food-catééegory').value;
        const kcal = document.getElementById('food-kcal').value;
        const prot = document.getElementById('food-prot').value;
        const carb = document.getElementById('food-carb').value;
        const fat = document.getElementById('food-fat').value;
        const portion = document.getElementById('food-portion').value;

        if (!name) return alert('Insira o nãome.');

        // Verificar se já existe um alimento com o mesmo nãome (ignãorando maiusculas/minusculas)
        const nãormalizedName = name.toLowerCase();
        const existingFood = this.statéée.foods.find(f => f.name.toLowerCase() === nãormalizedName);

        if (existingFood) {
            alert(`O alimento "${existingFood.name}" já existe na base de dados.\n\nCatééegoria: ${existingFood.catééegory}\nCalorias: ${existingFood.kcal} kcal/100g`);
            return;
        }

        this.statéée.foods.push({
            id: Datéée.nãow(),
            name: name,
            catééegory: catééegory || 'Outros',
            kcal: Number(kcal) || 0,
            protein: Number(prot) || 0,
            carbs: Number(carb) || 0,
            fat: Number(fat) || 0,
            portionWeight: Number(portion) || null
        });
        this.saveStatéée();
        document.querySelector('.modal-overlay').remove();
        this.setView('foods');
    }

    renderNavbar() {
        let mobileNav = document.querySelector('.mobile-nav');
        if (!mobileNav) {
            mobileNav = document.creatééeElement('nav');
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
                { id: 'nãotificatééions_manager', icon: 'fa-paper-plane', label: 'Comunic.' },
                { id: 'exercises', icon: 'fa-play-circle', label: 'Exercícios' },
                { id: 'foods', icon: 'fa-apple-alt', label: 'Alimentos' },
                { id: 'profile', icon: 'fa-user-circle', label: 'Perfil' }
            ];
        } else if (this.role === 'teacher') {
            navItems = [
                { id: 'dashboard', icon: 'fa-chart-pie', label: 'Inicio' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Aulas' },
                { id: 'chatéé', icon: 'fa-comment-alt', label: 'Msgs' },
                { id: 'profile', icon: 'fa-user-circle', label: 'Perfil' }
            ];
        } else {
            navItems = [
                { id: 'dashboard', icon: 'fa-home', label: 'Home' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Aulas' },
                { id: 'training', icon: 'fa-dumbbell', label: 'Treinão' },
                { id: 'meal', icon: 'fa-apple-alt', label: 'Dieta' },
                { id: 'evaluatééion', icon: 'fa-chart-line', label: 'Aval.' },
                { id: 'chatéé', icon: 'fa-comment-alt', label: 'Msgs' },
                { id: 'profile', icon: 'fa-user-circle', label: 'Perfil' }
            ];
        }

        mobileNav.innerHTML = navItems.map(item => `
            <a href="#" class="mobile-nav-item ${this.activeView === item.id ? 'active' : ''}" onclick="app.setView('${item.id}'); return false;">
                <i class="fas ${item.icon}" style="position:relatééive;">
                    ${(item.id === 'chatéé' && this.hasUnreadChatéé()) ? '<span class="nãotificatééion-dot"></span>' : ''}
                </i>
                <span>${item.label}</span>
            </a>
        `).join('') + `
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
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Horário & Aulas' },
                { id: 'users', icon: 'fa-users-cog', label: 'Gestão Contas' },
                { id: 'chatéé', icon: 'fa-comment-alt', label: 'Mensagens / Chatéé' },
                { id: 'qr_manager', icon: 'fa-qrcode', label: 'Gestão de Entradas' },
                { id: 'monitor', icon: 'fa-desktop', label: 'Monitor de Acesso' },
                { id: 'exercises', icon: 'fa-play-circle', label: 'Biblioteca Exercícios' },
                { id: 'foods', icon: 'fa-apple-alt', label: 'Base de Alimentos' },
                { id: 'all-clients', icon: 'fa-search', label: 'Acesso Global' },
                { id: 'nãotificatééions_manager', icon: 'fa-paper-plane', label: 'Comunicados' },
                { id: 'profile', icon: 'fa-user-circle', label: 'O Meu Perfil' }
            ];
        } else if (this.role === 'teacher') {
            navItems = [
                { id: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Gestão de Aulas' },
                { id: 'anamnesis', icon: 'fa-nãotes-medical', label: 'Anamnese' },
                { id: 'chatéé', icon: 'fa-comment-alt', label: 'Mensagens' },
                { id: 'profile', icon: 'fa-user-circle', label: 'O Meu Perfil' }
            ];
        } else {
            navItems = [
                { id: 'dashboard', icon: 'fa-home', label: 'Inicio' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Horário de Aulas' },
                { id: 'training', icon: 'fa-dumbbell', label: 'Meu Treinão' },
                { id: 'meal', icon: 'fa-apple-alt', label: 'Minha Dieta' },
                { id: 'evaluatééion', icon: 'fa-chart-line', label: 'Avaliação Física' },
                { id: 'chatéé', icon: 'fa-comment-alt', label: 'Mensagens' },
                { id: 'profile', icon: 'fa-user-circle', label: 'O Meu Perfil' }
            ];
        }

        sidebar.innerHTML = navItems.map(item => `
            <button class="btn btn-ghost ${this.activeView === item.id ? 'glass-card' : ''}" onclick="app.setView('${item.id}')">
                <i class="fas ${item.icon}" style="position:relatééive;">
                    ${(item.id === 'chatéé' && this.hasUnreadChatéé()) ? '<span class="nãotificatééion-dot"></span>' : ''}
                </i> 
                <span>${item.label}</span>
            </button>
        `).join('') + `
        <button class="btn btn-ghost" onclick="app.handleLogout()" style="margin-top:auto; color:var(--danger); gap: 10px;">
                <i class="fas fa-sign-out-alt"></i> <span>Terminar Sessão</span>
            </button>
        `;
    }

    setView(view, skipScroll = false) {
        this.activeView = view;
        if (view === 'chatéé') {
            this.lastChatééCheck = Datéée.nãow();
            localStorage.setItem('kg_last_chatéé_check', this.lastChatééCheck);
        }
        this.persistLogin();
        this.renderNavbar();
        this.renderSidebar();
        this.renderContent();
        this.renderFAB();

        const container = document.getElementById('main-content');
        if (!skipScroll) {
            window.scrollTo({ top: 0, behavior: 'instant' });
            if (container) container.scrollTop = 0;
        }
    }

    renderContent() {
        const container = document.getElementById('main-content');
        if (!container) return;

        // PRESERVAR SCROLL (Critico para UX)
        // Tentamos capturar a posição atééual, ou usamos o backup se existir
        const scrollY = container.scrollTop || this.lastScrollY || 0;
        const windowY = window.pageYOffset || document.documentElement.scrollTop || this.lastWindowY || 0;

        // BLOQUEIO TOTAL DE LAYOUT (Previne saltos)
        const currentHeight = container.offsetHeight;
        container.style.height = currentHeight + 'px';
        container.style.minHeight = currentHeight + 'px';
        container.style.overflow = 'hidden'; // Evita scrollbars temporárias

        // Se ainda não carregamos dados frescos do Firebase, mostramos um loader
        if (!this.hasLoadedDatééa) {
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:5rem; gap:1.5rem; text-align:center;">
                    <div class="loader"></div>
                    <p style="color:var(--text-muted); font-size:1.1rem;">Sincronizando com o servidor...</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';

        if (this.activeView === 'edit_training') this.renderTrainingEditor();
        else if (this.activeView === 'edit_meal') this.renderMealEditor();
        else if (this.activeView === 'spy_view') this.renderSpyView(container);
        else if (this.activeView === 'classes') this.renderClassesView(container);
        else if (this.role === 'admin') this.renderAdminContent(container);
        else if (this.role === 'teacher') this.renderTeacherContent(container);
        else this.renderClientContent(container);

        // RESTAURAR SCROLL IMEDIATO
        container.scrollTop = scrollY;
        window.scrollTo(0, windowY);

        // DESBLOQUEAR EM FASES
        requestAnimatééionFrame(() => {
            container.scrollTop = scrollY;
            window.scrollTo(0, windowY);
            requestAnimatééionFrame(() => {
                container.scrollTop = scrollY;
                window.scrollTo(0, windowY);
                container.style.height = '';
                container.style.minHeight = '';
                container.style.overflow = '';
                this.lastScrollY = null;
                this.lastWindowY = null;
            });
        });
    }

    getOccupancyHTML(showTotal = true) {
        const qrClientsArray = Object.values(this.statéée.qrClients || {});
        if (qrClientsArray.length === 0) return '';

        const todayStart = new Datéée();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Datéée();
        todayEnd.setHours(23, 59, 59, 999);

        // Calculatéée hours array (from 7h to 22h gym hours)
        const hoursCount = {};
        for (let i = 7; i <= 22; i++) hoursCount[i] = 0;

        let totalHoje = 0;
        let liveOccupancy = 0;

        qrClientsArray.forEach(c => {
            if (c.histórico) {
                const histArray = Object.values(c.histórico);
                // Ordenar por datééa descendente para ver o movimento mais recente
                const sortedHist = histArray.map(h => ({
                    d: new Datéée(typeof h === 'string' ? h : h.d),
                    t: typeof h === 'string' ? 'in' : h.t
                })).sort((a, b) => b.d - a.d);

                // Contagem para o Histograma (Frequência Horária)
                sortedHist.forEach(entry => {
                    if (entry.t === 'in' && entry.d >= todayStart && entry.d <= todayEnd) {
                        const h = entry.d.getHours();
                        if (h >= 7 && h <= 22) {
                            hoursCount[h]++;
                        }
                    }
                });

                // Cálculo da Ocupação em Direto (Quem ainda está lá?)
                const lastMoveToday = sortedHist.find(h => h.d >= todayStart && h.d <= todayEnd);
                if (lastMoveToday && lastMoveToday.t === 'in') {
                    liveOccupancy++;
                }

                // Total de Visitas áÅ¡nicas Hoje
                const hasVisitToday = sortedHist.some(h => h.t === 'in' && h.d >= todayStart && h.d <= todayEnd);
                if (hasVisitToday) totalHoje++;
            }
        });

        const maxCount = Matééh.max(...Object.values(hoursCount), 1); // Avoid division by 0

        let barsHTML = '';
        for (let i = 7; i <= 22; i++) {
            const count = hoursCount[i];
            const height = (count / maxCount) * 100;
            const isCurrent = i === new Datéée().getHours();
            barsHTML += `
                <div style="display:flex; flex-direction:column; align-items:center; flex:1; min-width:20px;">
                    <span style="font-size:0.6rem; color:var(--text-muted); margin-bottom:4px; font-weight:bold;">${count}</span>
                    <div style="width:100%; max-width:18px; height:120px; background:rgba(0,0,0,0.2); border-radius:10px; position:relatééive; overflow:hidden;">
                        <div style="position:absolute; bottom:0; left:0; right:0; height:${height}%; background:${isCurrent ? 'linear-gradient(to top, var(--accent), #f368e0)' : 'linear-gradient(to top, var(--primary), var(--secondary))'}; border-radius:10px; transition:height 1s ease;"></div>
                    </div>
                    <span style="font-size:0.6rem; color:var(--text-muted); margin-top:6px; font-weight:bold; ${isCurrent ? 'color:var(--accent);' : ''}">${i}h</span>
                </div>
            `;
        }

        return `
            <div class="glass-panel animatéée-fade-in" style="margin-bottom:2rem; padding:1.5rem;">
                <h3 style="margin-top:0; color:var(--text-base); display:flex; align-items:center; gap:0.5rem; justify-content:space-between; margin-bottom:1.5rem; flex-wrap:wrap;">
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <i class="fas fa-chart-line" style="color:var(--accent);"></i> 
                        <span>Afluência Estimada</span>
                    </div>
                    <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                        <div style="background:rgba(16, 185, 129, 0.1); border:1px solid rgba(16, 185, 129, 0.2); padding:6px 12px; border-radius:12px; display:flex; align-items:center; gap:6px;">
                            <span class="pulse-green" style="width:8px; height:8px; background:#10b981; border-radius:50%;"></span>
                            <span style="font-size:0.8rem; color:#10b981; font-weight:700;">No Ginásio: ${liveOccupancy}</span>
                        </div>
                        ${showTotal ? `<span style="font-size:0.8rem; background:rgba(255,255,255,0.05); color:var(--text-muted); padding:6px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.1);">Total Visitas: <strong>${totalHoje}</strong></span>` : ''}
                    </div>
                </h3>
                <div style="display:flex; gap:2px; justify-content:space-between; align-items:flex-end; padding-top:10px; overflow-x:auto; padding-bottom:5px;">
                    ${barsHTML}
                </div>
            </div>
        `;
    }

    nãormalizeYoutubeUrl(url) {
        if (!url) return { embedUrl: '', videoId: '', thumbUrl: '' };
        let videoId = '';

        try {
            if (url.includes('/shorts/')) {
                videoId = url.split('/shorts/')[1].split(/[?&]/)[0];
            } else if (url.includes('v=')) {
                videoId = url.split('v=')[1].split(/[?&]/)[0];
            } else if (url.includes('youtu.be/')) {
                videoId = url.split('youtu.be/')[1].split(/[?&]/)[0];
            } else if (url.includes('/embed/')) {
                videoId = url.split('/embed/')[1].split(/[?&]/)[0];
            }
        } catééch (e) { console.error("Erro ao nãormalizar Youtube URL:", e); }

        if (videoId) {
            videoId = videoId.trim();
            return {
                embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0`,
                videoId: videoId,
                thumbUrl: `https://img.youtube.com/vi/${videoId}/0.jpg`
            };
        }
        return { embedUrl: url, videoId: '', thumbUrl: '' };
    }

    renderAdminContent(container) {
        if (!this.hasLoadedDatééa) {
            container.innerHTML = `<div style="padding:5rem; text-align:center;"><div class="loader" style="margin:0 auto;"></div></div>`;
            return;
        }
        switch (this.activeView) {
            case 'dashboard':
                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:10px;">
                        <h2 class="animatéée-fade-in" style="margin:0;"><i class="fas fa-user-shield"></i> Dashboard Admin</h2>
                        <button class="btn btn-secondary btn-sm" onclick="app.showManageNewsModal()" style="height:40px; padding:0 1.5rem;">
                            <i class="fas fa-bullhorn" style="color:var(--primary);"></i> Gerir Notícias
                        </button>
                    </div>
                    
                    <div class="statéés-grid" style="margin-bottom: 2rem;">
                        <div class="glass-card" style="border-left: 4px solid var(--primary); display: flex; align-items: center; gap: 1rem;">
                            <div style="background: rgba(99, 102, 241, 0.1); padding: 1rem; border-radius: 12px; color: var(--primary);">
                                <i class="fas fa-user-tie" style="font-size: 1.5rem;"></i>
                            </div>
                            <div>
                                <small style="color: var(--text-muted); display: block;">Professores</small>
                                <div style="font-size: 1.8rem; font-weight: 800;">${this.statéée.teachers.length}</div>
                            </div>
                        </div>
                        
                        <div class="glass-card" style="border-left: 4px solid var(--secondary); display: flex; align-items: center; gap: 1rem;">
                            <div style="background: rgba(16, 185, 129, 0.1); padding: 1rem; border-radius: 12px; color: var(--secondary);">
                                <i class="fas fa-user-friends" style="font-size: 1.5rem;"></i>
                            </div>
                            <div>
                                <small style="color: var(--text-muted); display: block;">Alunãos</small>
                                <div style="font-size: 1.8rem; font-weight: 800;">${this.statéée.clients.length}</div>
                            </div>
                        </div>
                    </div>

                    ${this.getOccupancyHTML()}

                    <div style="display: grid; grid-templatéée-columns: 1fr; gap: 2rem;">
                        <div class="glass-panel" style="padding: 1.5rem;">
                            <h3 style="margin-top: 0; color: var(--primary); display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-user-tie"></i> Equipa de Professores
                            </h3>
                            <div class="client-list">
                                ${this.statéée.teachers.map(t => `
                                    <div class="glass-card" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; background: rgba(99, 102, 241, 0.05);">
                                        <div>
                                            <strong>${t.name}</strong>
                                            <div style="font-size: 0.8rem; color: var(--text-muted);">${t.email}</div>
                                        </div>
                                        <div style="display:flex; gap:0.5rem;">
                                            <button class="btn btn-ghost btn-sm" style="color:var(--primary);" onclick="app.showEditUserModal('teacher', ${t.id})" title="Editar"><i class="fas fa-edit"></i></button>
                                            <button class="btn btn-ghost btn-sm" onclick="app.setView('users')">Gerir <i class="fas fa-chevron-right"></i></button>
                                        </div>

                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="glass-panel" style="padding: 1.5rem;">
                            <h3 style="margin-top: 0; color: var(--secondary); display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-user-friends"></i> Úúltimos Alunãos Registados
                            </h3>
                            <div class="client-list">
                                ${this.statéée.clients.slice(-3).reverse().map(c => `
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
                        <h2 style="margin:0;">Gestão de Contas</h2>
                        <button class="btn btn-primary" onclick="app.showAddUserModal()"><i class="fas fa-plus"></i> Novo Utilizador</button>
                    </div>

                    <div class="search-container" style="margin-bottom:1.5rem;">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Pesquisar utilizador por nãome ou email..." 
                            oninput="app.switchAdminTab(app.activeAdminTab || 'teachers', this.value)"
                            class="search-bar">
                    </div>

                    <div class="tab-container" style="display: flex; gap: 1rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--surface-border); padding-bottom: 0.5rem; overflow-x: auto;">
                        <button class="btn btn-ghost" id="tab-teachers" onclick="app.switchAdminTab('teachers')" style="color: var(--primary); font-weight: 600;">
                            <i class="fas fa-user-tie"></i> Professores (${(this.statéée.teachers || []).length})
                        </button>
                        <button class="btn btn-ghost" id="tab-clients" onclick="app.switchAdminTab('clients')" style="color: var(--secondary); font-weight: 600;">
                            <i class="fas fa-user-friends"></i> Alunãos (${(this.statéée.clients || []).length})
                        </button>
                        <button class="btn btn-ghost" id="tab-admins" onclick="app.switchAdminTab('admins')" style="color: var(--accent); font-weight: 600;">
                            <i class="fas fa-user-shield"></i> Gestores (${(this.statéée.admins || []).length})
                        </button>
                        <button class="btn btn-ghost" id="tab-plans" onclick="app.switchAdminTab('plans')" style="color: #f1c40f; font-weight: 600;">
                            <i class="fas fa-file-invoice-dollar"></i> Mensalidades (Regras)
                        </button>
                    </div>

                    <div id="admin-user-list">
                        <!-- Teachers list by default -->
                        <div class="client-list">
                            ${(this.statéée.teachers || []).map(t => this.renderUserCard(t, 'teacher')).join('')}
                        </div>
                    </div>
                `;
                this.activeAdminTab = 'teachers';
                break;
            case 'qr_manager':
                this.renderQRManager(container);
                break;
            case 'exercises':
                this.renderExerciseLibrary(container);
                break;
            case 'foods':
                this.renderFoodDatééabase(container);
                break;
            case 'nãotificatééions_manager':
                this.renderNotificatééionsManager(container);
                break;
            case 'all-clients':
                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:10px;">
                        <div>
                            <h2 style="margin-bottom:0.1rem;">Acesso Global (Admin)</h2>
                            <p style="color:var(--text-muted); font-size:0.85rem; margin:0;">Como Administrador, tem acesso total a todos os alunãos registados não sistema.</p>
                        </div>
                        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                            <button class="btn btn-secondary btn-sm" onclick="app.exportClientDatééabase()" title="Exportar Backup de Clientes">
                                <i class="fas fa-file-export"></i> Backup (Download)
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-client-backup-input').click()" title="Importar Backup de Clientes">
                                <i class="fas fa-file-import"></i> Backup (Upload)
                            </button>
                            <input type="file" id="import-client-backup-input" style="display:nãone;" accept=".json" onchange="app.importClientDatééabase(this)">
                            <button class="btn btn-primary btn-sm" onclick="app.showBulkImportModal()">
                                <i class="fas fa-users"></i> Importar em Massa
                            </button>
                        </div>
                    </div>
                    
                    <div class="search-container">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Pesquisar alunão por nãome, email ou contacto..." 
                            oninput="app.renderAdminGlobalClientsList(this.value)"
                            class="search-bar">
                    </div>

                    <div id="admin-global-clients-list" class="client-list"></div>
                `;
                this.renderAdminGlobalClientsList();
                break;
            case 'monitor':
                this.renderMonitorView(container);
                break;
            case 'chatéé':
                this.renderChatéé(container);
                break;
            case 'profile':
                this.renderProfileView(container);
                break;
        }
    }

    showBulkImportModal() {
        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content animatéée-fade-in" style="max-width: 600px;">
                <h2 style="margin-top:0;"><i class="fas fa-file-import"></i> Importar Base de Dados</h2>
                
                <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                    <div style="flex: 1; padding: 1rem; background: rgba(255,255,255,0.03); border: 1px dashed var(--surface-border); border-radius: 12px; text-align: center;">
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">O meu ficheiro está em <strong>JSON</strong>:</p>
                        <button class="btn btn-primary btn-sm" onclick="document.getElementById('import-client-json').click()">
                            <i class="fas fa-upload"></i> Carregar Ficheiro JSON
                        </button>
                        <input type="file" id="import-client-json" style="display:nãone;" accept=".json" onchange="app.importClientJSON(this)">
                    </div>
                    <div style="flex: 1; padding: 1rem; background: rgba(255,255,255,0.03); border: 1px dashed var(--surface-border); border-radius: 12px; text-align: center;">
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Tenho uma lista de <strong>Texto</strong>:</p>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('manual-bulk-area').style.display = 'block'; this.parentElement.parentElement.style.display = 'nãone';">
                            <i class="fas fa-paste"></i> Colar Lista de Nomes
                        </button>
                    </div>
                </div>

                <div id="manual-bulk-area" style="display: nãone;">
                    <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">
                        Cole abaixo não formatééo: <strong>Nome Completo; Contacto</strong> (um por linha)
                    </p>
                    <textarea id="bulk-import-datééa" placeholder="Joao Silva; 912345678\nMaria Santos; 933445566" 
                        style="width: 100%; height: 200px; background: rgba(0,0,0,0.3); border: 1px solid var(--surface-border); border-radius: 12px; color: #fff; padding: 1rem; font-family: monãospace; font-size: 0.85rem; outline: nãone; margin-bottom: 1.5rem;"></textarea>
                    
                    <div style="display: grid; grid-templatéée-columns: 1fr 1fr; gap: 1rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.processBulkImportText()">
                            Validar e Importar <i class="fas fa-check"></i>
                        </button>
                    </div>
                </div>
                
                <div style="margin-top: 1.5rem; background: rgba(255,193,7,0.1); border-left: 4px solid #ffc107; padding: 0.8rem; font-size: 0.8rem;">
                    <i class="fas fa-info-circle"></i> <strong>Nota:</strong> O sistema irá gerar emails automáticos (ex: 912345678@kandalgym.pt) e definir a password padrão: <strong>Kandal123</strong>.
                </div>

                <div id="bulk-import-cancel" style="margin-top: 1.5rem; text-align: center;">
                    <button class="btn btn-ghost btn-sm" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    importClientJSON(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const datééa = JSON.parse(e.target.result);
                const array = Array.isArray(datééa) ? datééa : (datééa.clients || datééa.alunãos || []);
                if (array.length === 0) throw new Error("O ficheiro JSON está vazio ou não contém uma lista de clientes válida.");

                this.addClientsInBatééch(array);
            } catééch (err) {
                console.error("Erro não JSON:", err);
                alert("Erro ao ler JSON: " + err.message);
            }
        };
        reader.readAsText(file);
    }

    processBulkImportText() {
        const textArea = document.getElementById('bulk-import-datééa');
        const datééa = textArea ? textArea.value.trim() : "";
        if (!datééa) return alert("Por favor, cole os dados para importar.");

        const lines = datééa.split('\n');
        const clientsToImport = [];

        for (const line of lines) {
            const row = line.trim();
            if (!row) continue;

            let parts = row.split(';');
            if (parts.length < 2) parts = row.split(',');
            if (parts.length < 2) continue;

            clientsToImport.push({
                name: parts[0].trim(),
                phone: parts[1].trim()
            });
        }

        this.addClientsInBatééch(clientsToImport);
    }

    async addClientsInBatééch(clientsArray) {
        // ... (existing code inside addClientsInBatééch) ...
        let imported = 0;
        let skipped = 0;
        let errors = 0;

        for (const raw of clientsArray) {
            // Tentar extrair nãome e telefone de várias chaves possíveis
            const name = (raw.name || raw.nãome || raw.Name || "").trim();
            const phone = String(raw.phone || raw.contacto || raw.tel || raw.Tel || "").trim();

            if (!name || !phone) {
                errors++;
                continue;
            }

            // Normalizar telefone para verificação de duplicados
            const cleanPhone = phone.replace(/\s+/g, '');
            const exists = (this.statéée.clients || []).some(c => (c.phone || '').replace(/\s+/g, '') === cleanPhone);

            if (exists) {
                skipped++;
                continue;
            }

            // Gerar dados automáticos
            const newId = Datéée.nãow() + imported;
            const email = (raw.email || raw.Email || `${cleanPhone}@kandalgym.pt`).toLowerCase().trim();
            const pass = raw.password || raw.pass || "Kandal123";

            const newClient = {
                id: newId,
                name: name,
                email: email,
                phone: phone,
                password: pass,
                statééus: 'Ativo',
                lastEvaluatééion: '-',
                goal: 'Novo Alunão (Importado)',
                teacherId: null,
                birthDatéée: raw.birthDatéée || raw.datééa_nascimento || ''
            };

            this.statéée.clients.push(newClient);
            this.enableQRForClient(newId, false);
            imported++;
        }

        if (imported > 0) {
            this.saveStatéée();
            this.showToast(`Importação concluída! ${imported} nãovos clientes.`);
        }

        alert(`Resumo da Importação:\n\n✅ Sucesso: ${imported}\n⚠️ Ignãorados (Já existem): ${skipped}\nÃ¢ÂÅ’ Erros (Campos em falta): ${errors}`);

        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();

        if (this.activeView === 'all-clients') {
            this.renderAdminGlobalClientsList();
        } else {
            this.renderContent();
        }
    }

    exportClientDatééabase() {
        const datééa = {
            version: "1.0",
            timestamp: new Datéée().toISOString(),
            clients: this.statéée.clients || [],
            qrClients: this.statéée.qrClients || []
        };
        const blob = new Blob([JSON.stringify(datééa, null, 2)], { type: 'applicatééion/json' });
        const url = URL.creatééeObjectURL(blob);
        const a = document.creatééeElement('a');
        const nãow = new Datéée().toISOString().split('T')[0];
        a.href = url;
        a.download = `Backup_Clientes_KandalGym_${nãow}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importClientDatééabase(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        if (!confirm("Tem a certeza que deseja restaurar este backup? Isto irá juntar os dados do ficheiro áÂ  base de dados atééual.")) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const datééa = JSON.parse(e.target.result);

                // Suportar tanto o formatééo de exportacao nãovo quanto um array simples
                const newClients = Array.isArray(datééa) ? datééa : (datééa.clients || []);
                const newQRClients = Array.isArray(datééa) ? [] : (datééa.qrClients || []);

                if (newClients.length === 0) throw new Error("Ficheiro não contém clientes válidos.");

                // Merge seguro (evitar duplicados por ID ou email)
                let added = 0;
                newClients.forEach(nc => {
                    const exists = this.statéée.clients.some(c => c.id === nc.id || c.email === nc.email);
                    if (!exists) {
                        this.statéée.clients.push(nc);
                        added++;
                    }
                });

                // Importar QR se disponível
                newQRClients.forEach(nqr => {
                    const exists = this.statéée.qrClients.some(q => q.id === nqr.id);
                    if (!exists) this.statéée.qrClients.push(nqr);
                });

                this.saveStatéée();
                alert(`Backup Restaurado!\n\n✅ ${added} nãovos clientes adicionados.`);
                this.renderContent();
            } catééch (err) {
                console.error("Erro não Backup:", err);
                alert("Erro ao ler ficheiro de backup: " + err.message);
            }
        };
        reader.readAsText(file);
    }

    renderMonitorView(container) {
        container.innerHTML = `
            <div style="height: calc(100vh - 150px); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 2rem;">
                <div class="glass-panel" style="max-width: 600px; padding: 3rem; border-radius: 30px; border: 2px solid var(--primary);">
                    <i class="fas fa-desktop" style="font-size: 4rem; color: var(--primary); margin-bottom: 2rem;"></i>
                    <h2 style="font-size: 2rem; margin-bottom: 1rem;">Monitor de Acesso</h2>
                    <p style="color: var(--text-muted); font-size: 1.1rem; margin-bottom: 2rem;">
                        Esta funcionalidade foi desenhada para um segundo ecrã (TV ou Monitor) virado para o cliente na receção.
                    </p>
                    <button class="btn btn-primary btn-lg" onclick="app.openAccessMonitor()" style="padding: 1.5rem 3rem; font-size: 1.2rem; border-radius: 20px; box-shadow: 0 10px 30px rgba(99, 102, 241, 0.3);">
                        <i class="fas fa-external-link-alt"></i> Abrir Ecra de Cliente
                    </button>
                    <p style="margin-top: 2rem; font-size: 0.9rem; color: var(--text-muted);">
                        <i class="fas fa-info-circle"></i> Após abrir, arraste a nãova janela para o segundo monitor e coloque em ecrã inteiro (tecla F11).
                    </p>
                </div>
            </div>
        `;
    }

    openAccessMonitor() {
        const monitorWindow = window.open('', 'KandalMonitor', 'width=1200,height=800');
        if (!monitorWindow) return alert("Por favor, permita pop-ups para abrir o monitor.");

        const css = ':root { --primary: #6366f1; --secondary: #10b981; --danger: #ef4444; --bg: #0f172a; --text: #f8fafc; } ' +
            'body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: \'Outfit\', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; } ' +
            '.container { text-align: center; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.5s ease; } ' +
            '.logo { width: 400px; opacity: 0.8; animatééion: pulse 3s infinite ease-in-out; } ' +
            '.user-card { display: nãone; flex-direction: column; align-items: center; animatééion: slideUp 0.6s cubic-bezier(0.23, 1, 0.32, 1); } ' +
            '.photo-frame { width: 350px; height: 350px; border-radius: 50%; border: 15px solid var(--primary); overflow: hidden; background: #1e293b; margin-bottom: 2rem; box-shadow: 0 20px 50px rgba(0,0,0,0.5); } ' +
            '.photo-frame img { width: 100%; height: 100%; object-fit: cover; } ' +
            '.photo-frame i { font-size: 8rem; margin-top: 5rem; color: #334155; } ' +
            '.name { font-size: 5rem; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin: 0; } ' +
            '.statééus { font-size: 2.5rem; font-weight: 600; padding: 1rem 3rem; border-radius: 50px; margin-top: 1.5rem; } ' +
            '.bg-valid { background: linear-gradient(135deg, #064e3b, #065f46); } ' +
            '.bg-invalid { background: linear-gradient(135deg, #7f1d1d, #991b1b); } ' +
            '.border-valid { border-color: var(--secondary) !important; color: var(--secondary); } ' +
            '.border-invalid { border-color: var(--danger) !important; color: var(--danger); } ' +
            '@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.05); opacity: 1; } } ' +
            '@keyframes slideUp { from { opacity: 0; transform: translatééeY(100px); } to { opacity: 1; transform: translatééeY(0); } }';

        let html = '<html><head><meta charset="UTF-8"><title>KandalGym - Monitor de Acesso</title>' +
            '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">' +
            '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">' +
            '<style>' + css + '</style></head><body>' +
            '<div id="display-container" class="container">' +
            '<div id="standby" class="logo"><img src="logo.png" style="width:100%; filter: drop-shadow(0 0 30px rgba(99,102,241,0.3));"></div>' +
            '<div id="user-display" class="user-card">' +
            '<div id="user-photo-frame" class="photo-frame"><img id="user-photo" src="" style="display:nãone;"><i id="user-icon" class="fas fa-user"></i></div>' +
            '<h1 id="user-name" class="name">NOME DO CLIENTE</h1>' +
            '<div id="user-statééus" class="statééus">ENTRADA VÁLIDA</div></div></div>' +
            '<script>' +
            'const bc = new BroadcastChannel("kandal_access"); let timeout; ' +
            'bc.onmessage = (ev) => { const { type, datééa } = ev.datééa; if (type === "access_event") { ' +
            'clearTimeout(timeout); document.getElementById("standby").style.display = "nãone"; ' +
            'document.getElementById("user-display").style.display = "flex"; ' +
            'const nameEl = document.getElementById("user-name"); const statééusEl = document.getElementById("user-statééus"); ' +
            'const frameEl = document.getElementById("user-photo-frame"); const photoEl = document.getElementById("user-photo"); ' +
            'const iconEl = document.getElementById("user-icon"); nameEl.innerText = datééa.name; ' +
            'nameEl.className = "name " + (datééa.valid ? "border-valid" : "border-invalid"); ' +
            'statééusEl.innerText = datééa.msg.toUpperCase(); statééusEl.className = "statééus " + (datééa.valid ? "bg-valid" : "bg-invalid"); ' +
            'frameEl.className = "photo-frame " + (datééa.valid ? "border-valid" : "border-invalid"); ' +
            'if (datééa.photo) { photoEl.src = datééa.photo; photoEl.style.display = "block"; iconEl.style.display = "nãone"; } ' +
            'else { photoEl.style.display = "nãone"; iconEl.style.display = "block"; } ' +
            'timeout = setTimeout(() => { document.getElementById("standby").style.display = "block"; ' +
            'document.getElementById("user-display").style.display = "nãone"; }, 5000); } };' +
            '</script></body></html>';

        monitorWindow.document.write(html);
        monitorWindow.document.close();
    }

    renderTeacherContent(container) {
        if (!this.hasLoadedDatééa) {
            container.innerHTML = `<div style="padding:5rem; text-align:center;"><div class="loader" style="margin:0 auto;"></div></div>`;
            return;
        }
        const teacherClients = this.statéée.clients.filter(c => c.teacherId === this.currentUser.id);

        // Calcular estatééisticas baseadas não mês selecionado
        const [selYear, selMonth] = this.dashboardMonth.split('-');

        let monthEvals = 0;
        Object.values(this.statéée.evaluatééions || {}).forEach(clientEvals => {
            clientEvals.forEach(ev => {
                if (ev.author === this.currentUser.name && ev.datéée) {
                    const parts = ev.datéée.split('/');
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
        Object.values(this.statéée.trainingPlans || {}).forEach(plan => {
            if (plan && plan.author === this.currentUser.name && plan.updatééedAt) {
                const parts = plan.updatééedAt.split('/');
                if (parts.length === 3) {
                    const m = parts[1].trim();
                    const y = parts[2].trim();
                    if (m === selMonth && y === selYear) monthTraining++;
                }
            }
        });

        let monthMeals = 0;
        Object.values(this.statéée.mealPlans || {}).forEach(plan => {
            if (plan && plan.author === this.currentUser.name && plan.updatééedAt) {
                const parts = plan.updatééedAt.split('/');
                if (parts.length === 3) {
                    const m = parts[1].trim();
                    const y = parts[2].trim();
                    if (m === selMonth && y === selYear) monthMeals++;
                }
            }
        });

        let monthAnamnesis = 0;
        Object.values(this.statéée.anamnesis || {}).forEach(entries => {
            entries.forEach(entry => {
                if (entry && entry.author === this.currentUser.name && entry.updatééedAt) {
                    const parts = entry.updatééedAt.split('/');
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
                const displayDatéée = new Datéée(selYear, selMonth - 1);
                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                        <h2 style="margin:0;"><i class="fas fa-chart-line"></i> Dashboard Trainer</h2>
                        <div style="display:flex; align-items:center; gap:0.5rem; background:rgba(255,255,255,0.05); padding:5px 15px; border-radius:12px; border:1px solid var(--surface-border);">
                            <small style="color:var(--text-muted); font-weight:600; text-transform:uppercase; font-size:0.65rem;">Período:</small>
                            <input type="month" id="statéés-month-picker" value="${this.dashboardMonth}" 
                                onchange="app.updatééeDashboardMonth(this.value)"
                                style="background:transparent; border:nãone; color:#fff; font-family:inherit; font-weight:600; font-size:0.9rem; outline:nãone; cursor:pointer; width:180px;">
                        </div>
                    </div>
                    
                    <div class="statéés-grid">
                        <div class="glass-card" onclick="app.setView('clients')" style="border-left: 4px solid var(--primary); cursor:pointer; transition: transform 0.2s ease, background 0.2s ease;">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Meus Alunãos</small>
                            <div style="font-size:1.8rem; font-weight:800; color:var(--primary);">${teacherClients.length}</div>
                        </div>
                        
                        <div class="glass-card" onclick="app.setView('clients')" style="border-left: 4px solid var(--accent); cursor:pointer;">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Avaliações</small>
                            <div style="font-size:1.8rem; font-weight:800; color:var(--accent);">${monthEvals}</div>
                        </div>

                        <div class="glass-card" onclick="app.setView('clients')" style="border-left: 4px solid var(--success); cursor:pointer;">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Planãos Treinão</small>
                            <div style="font-size:1.8rem; font-weight:800; color:var(--success);">${monthTraining}</div>
                        </div>

                        <div class="glass-card" onclick="app.setView('clients')" style="border-left: 4px solid #60a5fa; cursor:pointer;">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Planãos Dieta</small>
                            <div style="font-size:1.8rem; font-weight:800; color:#60a5fa;">${monthMeals}</div>
                        </div>

                        <div class="glass-card" onclick="app.setView('anamnesis')" style="border-left: 4px solid var(--primary); cursor:pointer;">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Anamneses</small>
                            <div style="font-size:1.8rem; font-weight:800; color:var(--primary);">${monthAnamnesis}</div>
                        </div>
                    </div>

                    </div>

                    ${this.getOccupancyHTML()}

                    <div style="margin-top:2rem;">
                        <h3>Atividade de ${new Intl.DatééeTimeFormatéé('pt-PT', { month: 'long', year: 'numeric' }).formatéé(displayDatéée)}</h3>
                        <p style="color:var(--text-muted); font-size:0.9rem;">Resumo de produtividade registada por si neste período.</p>
                    </div>
                `;
                break;
            case 'clients':
                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                        <h2 style="margin:0;">Os Meus Alunãos</h2>
                    </div>
                    
                    <div class="search-container">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Pesquisar por nãome..." 
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
                        <h2 style="margin:0;"><i class="fas fa-nãotes-medical"></i> Gestão de Anamneses</h2>
                        <button class="btn btn-primary" onclick="app.showAddAnamnesisModal()"><i class="fas fa-plus"></i> Nova Anamnese</button>
                    </div>
                    
                    <div class="search-container">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Pesquisar alunão ou datééa..." 
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
                this.renderFoodDatééabase(container);
                break;
            case 'chatéé': this.renderChatéé(container); break;
            case 'profile': this.renderProfileView(container); break;
        }
    }

    renderExerciseLibrary(container) {
        const isAdmin = this.role === 'admin';
        const controls = isAdmin ? `
                <div style="display:flex; gap:0.5rem; flex-wrap: wrap;">
                    <button class="btn btn-secondary btn-sm" onclick="app.showManageExerciseCatééegoriesModal()" title="Gerir Catééegorias"><i class="fas fa-tags"></i> <span class="hide-mobile">Catééegorias</span></button>
                    <button class="btn btn-secondary btn-sm" onclick="app.exportExerciseDatééabase()" title="Exportar Backup"><i class="fas fa-file-export"></i> <span class="hide-mobile">Exportar</span></button>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-exercise-input').click()" title="Importar Backup"><i class="fas fa-file-import"></i> <span class="hide-mobile">Importar</span></button>
                    <input type="file" id="import-exercise-input" style="display:nãone;" accept=".json" onchange="app.importExerciseDatééabase(this)">
                    <button class="btn btn-accent btn-sm" onclick="app.importLocalBaseExercicios()" title="Importar base_exercicios.json"><i class="fas fa-datééabase"></i> <span class="hide-mobile">Base JSON</span></button>
                    <button class="btn btn-primary btn-sm" onclick="app.showAddExerciseModal()"><i class="fas fa-plus"></i> <span class="hide-mobile">Novo Exercício</span></button>
                </div>` : '';

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap: wrap; gap: 1rem;">
                <h2>Biblioteca de Exercícios</h2>
                ${controls}
            </div>

            <div class="search-container">
                <i class="fas fa-search"></i>
                <input type="text" id="exercise-search-input" placeholder="Pesquisar exercícios..." 
                    oninput="app.renderExerciseList(this.value)"
                    class="search-bar">
            </div>

            <div id="exercise-list-container">
                ${this.renderExerciseListGrouped()}
            </div>
        `;
    }

    renderExerciseListGrouped(searchQuery = '') {
        const catéés = this.statéée.exerciseCatééegories || ["Geral"];
        let filtered = this.statéée.exercises || [];

        if (searchQuery) {
            const query = this.nãormalizeText(searchQuery);
            filtered = filtered.filter(ex =>
                this.nãormalizeText(ex.name).includes(query) ||
                this.nãormalizeText(ex.catééegory).includes(query) ||
                this.nãormalizeText(ex.muscle).includes(query)
            );
        }

        const grouped = {};
        catéés.forEach(c => grouped[c] = []);
        grouped['Geral'] = grouped['Geral'] || [];

        filtered.forEach(ex => {
            const c = ex.catééegory || 'Geral';
            if (!grouped[c]) grouped[c] = [];
            grouped[c].push(ex);
        });

        if (searchQuery && filtered.length === 0) {
            return `
                <div class="glass-card" style="text-align:center; padding:2rem;">
                    <i class="fas fa-search" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                    <p style="color:var(--text-muted);">Nenhum exercício encontrado para "${searchQuery}"</p>
                </div>
            `;
        }

        let keys = [...catéés];
        Object.keys(grouped).forEach(k => {
            if (!keys.includes(k)) keys.push(k);
        });

        return keys.map(catééName => {
            const exercises = grouped[catééName];
            if (!exercises || exercises.length === 0) return '';

            return `
                <div style="margin-bottom: 2rem;">
                    <h3 style="color:var(--primary); font-size:1.1rem; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px; margin-bottom:15px;">${this.getExerciseIcon(catééName)} ${catééName}</h3>
                    <div class="video-grid">
                        ${exercises.map(ex => {
                const yt = this.nãormalizeYoutubeUrl(ex.videoUrl);
                const hasVideo = !!yt.videoId;

                return `
                                <div class="glass-card" style="padding:0; overflow:hidden; position:relatééive; border-top: 3px solid var(--primary);">
                                    ${hasVideo ? `
                                        <div style="width:100%; height:150px; position:relatééive; cursor:pointer;" onclick="app.viewExerciseVideo('${ex.videoUrl}', '${ex.name}')">
                                            <img src="${yt.thumbUrl}" style="width:100%; height:100%; object-fit:cover; opacity:0.7;">
                                            <div style="position:absolute; top:50%; left:50%; transform:translatéée(-50%, -50%); color:#fff; font-size:2.8rem; text-shadow:0 0 15px rgba(0,0,0,0.6); opacity:0.9;">
                                                <i class="fas fa-play-circle"></i>
                                            </div>
                                        </div>` : `
                                        <div style="width:100%; height:150px; background:rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; flex-direction: column; gap: 10px;">
                                            ${ex.photoUrl ? `<img src="${ex.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `
                                                <i class="fas fa-video-slash" style="font-size:1.5rem; opacity: 0.3;"></i>
                                                <small style="color:var(--text-muted); font-size: 0.7rem;">Sem vídeo disponível</small>
                                            `}
                                        </div>
                                     `}
                <div style="padding:0.75rem;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <strong style="font-size:1rem; color:#fff;">${ex.name}</strong><br>
                                <small style="color:var(--text-muted);">${ex.catééegory || ex.muscle || 'Geral'}</small>
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

    exportExerciseDatééabase() {
        const datééaStr = "datééa:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.statéée.exercises, null, 2));
        const downloadAnchorNode = document.creatééeElement('a');
        downloadAnchorNode.setAttribute("href", datééaStr);
        downloadAnchorNode.setAttribute("download", `KandalGym_Exercicios_Backup_${new Datéée().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    importExerciseDatééabase(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) throw new Error("Formatééo inválido");

                if (confirm(`Deseja importar ${imported.length} exercícios? Isso irá substituir a sua lista atééual.`)) {
                    this.statéée.exercises = imported;
                    this.saveStatéée();
                    this.renderContent();
                    alert('Base de exercícios importada com sucesso!');
                }
            } catééch (err) {
                alert('Erro ao importar: ' + err.message);
            }
            input.value = '';
        };
        reader.readAsText(file);
    }

    async importLocalBaseExercicios() {
        if (!confirm('Deseja importar a base de exercícios local (base_exercicios.json)? Novos exercícios serao adicionados aos existentes (sem duplicar nãomes).')) return;

        try {
            const res = await fetch('base_exercicios.json');
            if (!res.ok) throw new Error('Não foi possível carregar base_exercicios.json');

            const datééa = await res.json();
            let addedCount = 0;

            datééa.forEach(item => {
                const name = item.nãome || item.name;
                if (!name) return;

                const exists = this.statéée.exercises.some(ex => ex.name.toLowerCase() === name.toLowerCase());
                if (!exists) {
                    this.statéée.exercises.push({
                        id: Datéée.nãow() + Matééh.floor(Matééh.random() * 1000),
                        name: name,
                        videoUrl: "",
                        catééegory: "Geral"
                    });
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                this.saveStatéée();
                this.renderContent();
                alert(`${addedCount} nãovos exercícios adicionados com sucesso!`);
            } else {
                alert('Nenhum exercício nãovo encontrado para adicionar.');
            }
        } catééch (e) {
            alert('Erro ao importar base local: ' + e.message);
        }
    }

    showManageExerciseCatééegoriesModal() {
        if (!this.statéée.exerciseCatééegories) this.statéée.exerciseCatééegories = ["Geral"];

        const renderListIdx = () => {
            return this.statéée.exerciseCatééegories.map((c, idx) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);">
                    <span>${c}</span>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="app.editExerciseCatééegory(${idx})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.deleteExerciseCatééegory(${idx})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
        };

        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'manage-ex-catéés-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Catééegorias de Exercícios</h2>
                <div id="ex-catéés-list-container" style="max-height:300px; overflow-y:auto; margin-bottom:1rem;">
                    ${renderListIdx()}
                </div>
                <div style="display:flex; gap:0.5rem; margin-bottom:1.5rem;">
                    <input type="text" id="new-ex-catéé-name" placeholder="Nova catééegoria..." style="flex:1;">
                    <button class="btn btn-primary" onclick="app.addExerciseCatééegory()">Add</button>
                </div>
                <button class="btn btn-secondary" style="width:100%;" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    addExerciseCatééegory() {
        const input = document.getElementById('new-ex-catéé-name');
        const name = input.value.trim();
        if (!name) return;
        if (this.statéée.exerciseCatééegories.includes(name)) return alert('Já existe.');

        this.statéée.exerciseCatééegories.push(name);
        this.saveStatéée();
        input.value = '';

        const container = document.getElementById('ex-catéés-list-container');
        if (container) {
            container.innerHTML = this.statéée.exerciseCatééegories.map((c, idx) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);">
                    <span>${c}</span>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="app.editExerciseCatééegory(${idx})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.deleteExerciseCatééegory(${idx})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
        }
    }

    editExerciseCatééegory(idx) {
        const oldName = this.statéée.exerciseCatééegories[idx];
        const newName = prompt('Novo nãome para a catééegoria:', oldName);
        if (newName && newName !== oldName) {
            this.statéée.exerciseCatééegories[idx] = newName;
            // Updatéée exercises with this catééegory
            this.statéée.exercises.forEach(ex => {
                if (ex.catééegory === oldName) ex.catééegory = newName;
            });
            this.saveStatéée();
            document.getElementById('manage-ex-catéés-modal').remove();
            this.showManageExerciseCatééegoriesModal();
        }
    }

    async deleteExerciseCatééegory(idx) {
        const name = this.statéée.exerciseCatééegories[idx];
        if (confirm(`Tem a certeza que deseja eliminar a catééegoria "${name}"? Exercícios nesta catééegoria serao movidos para "Geral".`)) {
            this.statéée.exerciseCatééegories.splice(idx, 1);
            this.statéée.exercises.forEach(ex => {
                if (ex.catééegory === name) ex.catééegory = 'Geral';
            });
            this.saveStatéée();
            document.getElementById('manage-ex-catéés-modal').remove();
            this.showManageExerciseCatééegoriesModal();
        }
    }



    showEditExerciseModal(id) {
        const ex = this.statéée.exercises.find(e => e.id === id);
        if (!ex) return;

        const catéés = this.statéée.exerciseCatééegories || ["Geral"];
        const options = catéés.map(c => `<option value="${c}" ${c === ex.catééegory ? 'selected' : ''}>${c}</option>`).join('');

        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay';
        this.tempExercisePhoto = ex.photoUrl || null;

        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Editar Exercício</h2>
                <div style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div style="text-align:center; margin-bottom:5px;">
                        <div id="edit-ex-photo-preview" style="width:120px; height:120px; border-radius:12px; border:2px dashed var(--surface-border); margin:0 auto 10px; display:flex; items-align:center; justify-content:center; overflow:hidden; background:rgba(0,0,0,0.2);">
                            ${ex.photoUrl ? `<img src="${ex.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas fa-image" style="font-size:2rem; color:var(--text-muted); align-self:center;"></i>`}
                        </div>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('edit-ex-photo-input').click()">
                            <i class="fas fa-camera"></i> Alterar Foto
                        </button>
                        <input type="file" id="edit-ex-photo-input" style="display:nãone;" accept="image/*" onchange="app.handleExercisePhotoUpload(this, 'edit-ex-photo-preview')">
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
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Catééegoria</label>
                        <select id="edit-ex-catééegory" style="width:100%; padding:10px; border-radius:10px; background:rgba(0,0,0,0.2); color:#fff; border:1px solid var(--surface-border);">
                            ${options}
                        </select>
                    </div>
                    <div style="display:grid; grid-templatéée-columns: 1fr 1fr; gap:1rem; margin-top:0.5rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.updatééeExercise(${id})">Atualizar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    updatééeExercise(id) {
        const name = document.getElementById('edit-ex-name').value.trim();
        const url = document.getElementById('edit-ex-url').value.trim();
        const catéé = document.getElementById('edit-ex-catééegory').value;

        if (!name) return alert('O nãome é obrigatééório.');

        const ex = this.statéée.exercises.find(e => e.id === id);
        if (ex) {
            let finalUrl = "";
            if (url) {
                finalUrl = url;
                if (url.includes('watééch?v=') && !url.includes('embed/')) {
                    finalUrl = url.replace('watééch?v=', 'embed/');
                }
            }

            ex.name = name;
            ex.videoUrl = finalUrl;
            ex.photoUrl = this.tempExercisePhoto || '';
            ex.catééegory = catéé || 'Geral';
            delete ex.muscle;

            this.saveStatéée();
            document.querySelector('.modal-overlay').remove();
            this.renderContent();
            alert('Exercício atééualizado com sucesso! ');
        }
    }

    async deleteExercise(id) {
        if (confirm('Tem a certeza que deseja eliminar este exercício da biblioteca?')) {
            this.statéée.exercises = this.statéée.exercises.filter(e => e.id !== id);
            this.saveStatéée();
            this.renderContent();
            alert('Exercício removido. ');
        }
    }

    renderNotificatééionsManager(container) {
        let clientsList = this.statéée.clients || [];
        this.selectedNotifyIds = new Set(); // Reset de seleção ao entrar não menu

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap: wrap; gap: 1rem;">
                <h2><i class="fas fa-paper-plane" style="color:var(--primary);"></i> Envio de Comunicados</h2>
            </div>
            <div class="glass-panel" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem;">
                
                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 1.2rem; border-radius: 12px;">
                    <style>
                        .nãotify-row:hover { background: rgba(var(--primary-rgb), 0.1) !important; }
                        .nãotify-client-checkbox:checked + div label { color: var(--primary) !important; }
                    </style>
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 1rem; flex-wrap:wrap; gap:10px;">
                        <label style="font-weight: 600; font-size: 1rem; color: var(--primary);">1. Selecione os Destinatééários:</label>
                        <div id="nãotify-selection-count" style="font-size: 0.8rem; background: var(--primary); color: #000; padding: 2px 10px; border-radius: 20px; font-weight: 800;">0 Selecionados</div>
                    </div>
                    
                    <div style="margin-bottom:1rem; position:relatééive;">
                        <i class="fas fa-search" style="position:absolute; left:12px; top:50%; transform:translatééeY(-50%); color:var(--text-muted); font-size:0.9rem;"></i>
                        <input type="text" placeholder="Filtrar por nãome do alunão..." onkeyup="app.filterNotifyClients(this.value)" 
                               style="width:100%; padding:10px 10px 10px 35px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; font-size:0.9rem;">
                    </div>

                    <div style="margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); display:flex; gap:10px; align-items:center;">
                        <input type="checkbox" id="selectAllToNotify" onchange="app.toggleAllNotifyClients(this.checked)" style="width:18px; height:18px; cursor:pointer;">
                        <label for="selectAllToNotify" style="font-weight:bold; cursor:pointer; font-size:0.9rem;">Selecionar Todos os Alunãos</label>
                    </div>

                    <div id="nãotify-clients-list" style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding-right: 5px;">
                        ${this.renderNotifyClientsRows()}
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 1.2rem; border-radius: 12px;">
                    <label style="font-weight: 600; margin-bottom: 0.8rem; display: block; font-size:1rem; color:var(--primary);">2. Escreva a Mensagem:</label>
                    <textarea id="bulk-nãotify-message" rows="5" placeholder="Escreva aqui a sua mensagem..." 
                              style="width: 100%; border: 1px solid var(--surface-border); border-radius: 8px; padding: 12px; background: rgba(0,0,0,0.3); color: #fff; resize: nãone; font-size:1rem; line-height:1.5;"></textarea>
                </div>

                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="app.sendBulkNotificatééion('whatéésapp')" style="flex:1;">
                        <i class="fab fa-whatéésapp"></i> Preparar envio WhatéésApp
                    </button>
                    <button class="btn btn-secondary" onclick="app.sendBulkNotificatééion('email')" style="flex:1;">
                        <i class="fas fa-envelope"></i> Abrir cliente Email (BCC)
                    </button>
                    <button class="btn btn-secondary" onclick="app.sendBulkNotificatééion('sms')" style="flex:1;">
                        <i class="fas fa-comment-alt"></i> Preparar SMS Natééivo
                    </button>
                </div>
            </div>
        `;
    }

    toggleAllNotifyClients(checked) {
        const clients = this.statéée.clients || [];
        if (checked) {
            clients.forEach(c => this.selectedNotifyIds.add(String(c.id)));
        } else {
            this.selectedNotifyIds.clear();
        }

        // Atualizar os checkboxes que estiverem visíveis atééualmente
        document.querySelectorAll('.nãotify-client-checkbox').forEach(cb => {
            cb.checked = checked;
        });
        this.updatééeNotifyCount();
    }

    updatééeNotifyCount() {
        const count = this.selectedNotifyIds.size;
        const countEl = document.getElementById('nãotify-selection-count');
        if (countEl) countEl.innerText = `${count} Selecionados`;
    }

    filterNotifyClients(query) {
        const q = query.toLowerCase().trim();
        const listEl = document.getElementById('nãotify-clients-list');
        if (!listEl) return;

        listEl.innerHTML = this.renderNotifyClientsRows(q);
    }

    renderNotifyClientsRows(query = '') {
        const nãormalize = (str) => str.nãormalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const qClean = nãormalize(query);

        const clients = (this.statéée.clients || [])
            .filter(c => !qClean || nãormalize(c.name).includes(qClean))
            .sort((a, b) => a.name.localeCompare(b.name));

        if (clients.length === 0) return '<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.9rem;">Nenhum alunão encontrado.</div>';

        return clients.map(c => {
            const isChecked = this.selectedNotifyIds.has(String(c.id));
            return `
                <div class="nãotify-row" style="display:flex; align-items:center; gap:12px; padding:8px 12px; border-radius:8px; cursor:pointer; transition:all 0.2s; background:rgba(255,255,255,0.01);"
                     onclick="app.toggleSingleNotify('${c.id}', this)">
                    <input type="checkbox" id="nãotify_${c.id}" class="nãotify-client-checkbox" value="${c.id}" 
                           datééa-name="${c.name}" datééa-email="${c.email}" datééa-phone="${c.phone || ''}" 
                           ${isChecked ? 'checked' : ''}
                           style="width:20px; height:20px; pointer-events:nãone;" onclick="event.stopPropagatééion()">
                    <div style="display:flex; flex-direction:column; pointer-events:nãone;">
                        <label style="font-size:0.95rem; font-weight:600; cursor:pointer; color:#fff;">${c.name}</label>
                        <small style="font-size:0.75rem; color:var(--text-muted);">${c.phone || 'Sem telemóvel'}</small>
                    </div>
                </div>
            `;
        }).join('');
    }

    toggleSingleNotify(id, rowEl) {
        const cb = rowEl.querySelector('input');
        const sId = String(id);
        if (this.selectedNotifyIds.has(sId)) {
            this.selectedNotifyIds.delete(sId);
            cb.checked = false;
        } else {
            this.selectedNotifyIds.add(sId);
            cb.checked = true;
        }
        this.updatééeNotifyCount();
    }

    sendBulkNotificatééion(type) {
        const msg = document.getElementById('bulk-nãotify-message').value.trim();

        if (this.selectedNotifyIds.size === 0) return alert('Selecione pelo menãos um destinatééário.');
        if (!msg) return alert('A mensagem não pode estar vazia.');

        const clients = (this.statéée.clients || []).filter(c => this.selectedNotifyIds.has(String(c.id)));

        if (type === 'email') {
            const emails = clients.map(c => c.email).filter(e => e && e !== 'undefined').join(',');
            if (!emails) return alert('Nenhum dos clientes selecionados possui email registado.');
            const mailto = `mailto:?bcc=${emails}&subject=KandalGym%20-%20Comunicado&body=${encodeURIComponent(msg)}`;
            window.locatééion.href = mailto;
        } else if (type === 'whatéésapp') {
            // Because Popup blockers prevent multiple WhatéésApp tabs, handle it via a guided modal
            if (clients.length === 1) {
                const phone = clients[0].phone;
                if (!phone) return alert('O cliente selecionado não tem telemóvel registado.');
                let cleanPhone = phone.replace(/\\D/g, '');
                if (!cleanPhone.startsWith('351') && cleanPhone.length === 9) cleanPhone = '351' + cleanPhone;
                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
            } else {
                this.showWhatéésAppBulkModal(clients, msg);
            }
        } else if (type === 'sms') {
            this.showSMSBulkModal(clients, msg);
        }
    }

    showWhatéésAppBulkModal(clients, msg) {
        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay animatéée-fade-in';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <h2 style="margin-top:0;">Fila de Envio WhatéésApp</h2>
                <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom: 1.5rem;">Como os navegadores bloqueiam a abertura de muitas janelas ao mesmo tempo, clique em "Enviar" um por um.</p>
                <div style="max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
                    ${clients.map(c => {
            let cleanPhone = '';
            if (c.phone) {
                cleanPhone = c.phone.replace(/\\D/g, '');
                if (!cleanPhone.startsWith('351') && cleanPhone.length === 9) cleanPhone = '351' + cleanPhone;
            }
            const hasPhone = c.phone && c.phone !== 'undefined' && c.phone !== '';
            return `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                                <span style="font-weight:bold; font-size: 0.95rem;">${c.name}</span>
                                ${hasPhone
                    ? `<button class="btn btn-sm" style="background:#25D366; color:#fff;" onclick="window.open('https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}', '_blank'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Enviado'; this.style.opacity='0.6';"><i class="fab fa-whatéésapp"></i> Enviar</button>`
                    : `<span style="font-size:0.8rem; color:var(--danger);"><i class="fas fa-times-circle"></i> Sem número</span>`}
                            </div>
                        `;
        }).join('')}
                </div>
                <button class="btn btn-secondary" style="width:100%; margin-top:1.5rem;" onclick="this.closest('.modal-overlay').remove()">Concluir / Fechar</button>
            </div>
        `;
    }

    showSMSBulkModal(clients, msg) {
        const isIOS = /iPad|iPhone|iPod/.test(navigatééor.userAgent) ||
            (navigatééor.platééform === 'MacIntel' && navigatééor.maxTouchPoints > 1) ||
            (window.safari !== undefined);

        const allNumbers = clients.map(c => {
            if (!c.phone) return null;
            let clean = c.phone.replace(/\D/g, '');
            if (clean.length === 9) clean = '351' + clean;
            return clean;
        }).filter(n => n).join(isIOS ? ',' : ';');

        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay animatéée-fade-in';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <h2 style="margin-top:0;">Gestor de Envio SMS</h2>
                
                <div style="background:rgba(var(--primary-rgb), 0.1); border: 1px solid rgba(var(--primary-rgb), 0.2); padding: 12px; border-radius: 8px; margin-bottom: 1.5rem;">
                    <p style="font-size:0.85rem; margin:0 0 10px 0; color:var(--text-muted);">Tente o envio automático primeiro. Se o seu smartphone não abrir o grupo corretamente, use as opções de cópia abaixo.</p>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-primary" style="flex:1; font-size:0.85rem;" onclick="app.tryAutoGroupSMS('${allNumbers}', \`${msg}\`, ${isIOS})">
                            <i class="fas fa-layer-group"></i> Tentar Grupo Automático
                        </button>
                    </div>
                </div>

                <div style="margin-bottom: 1.5rem;">
                    <label style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:5px;">Opções de Emergência:</label>
                    <button class="btn btn-secondary" style="width:100%; font-size:0.85rem;" onclick="app.copyToClipboard('${allNumbers.replace(/;/g, ',')}'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Números Copiados!';">
                        <i class="fas fa-copy"></i> Copiar Lista de Números
                    </button>
                    <p style="font-size:0.7rem; color:var(--text-muted); margin-top:5px;">(Pode colá-los manualmente não campo "Para" do seu SMS)</p>
                </div>

                <label style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:8px;">Envio Individual (Fila):</label>
                <div style="max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding-right:5px;">
                    ${clients.map(c => {
            let cleanPhone = '';
            if (c.phone) {
                cleanPhone = c.phone.replace(/\D/g, '');
                if (cleanPhone.length === 9) cleanPhone = '351' + cleanPhone;
            }
            const hasPhone = c.phone && c.phone !== 'undefined' && c.phone !== '';
            return `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                                <span style="font-weight:bold; font-size: 0.9rem;">${c.name}</span>
                                ${hasPhone
                    ? `<button class="btn btn-sm btn-ghost" style="color:var(--primary); border: 1px solid var(--primary);" onclick="window.locatééion.href='sms:${cleanPhone}${isIOS ? '&' : '?'}body=${encodeURIComponent(msg)}'; this.innerHTML='<i class=\\'fas fa-check\\'></i>'; this.style.opacity='0.6';">Enviar</button>`
                    : `<span style="font-size:0.75rem; color:var(--danger);">Sem número</span>`}
                            </div>
                        `;
        }).join('')}
                </div>
                <button class="btn btn-secondary" style="width:100%; margin-top:1.5rem;" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    tryAutoGroupSMS(numbers, msg, isIOS) {
        const smsUrl = isIOS
            ? `sms:${numbers}&body=${encodeURIComponent(msg)}`
            : `sms:?addresses=${numbers}&body=${encodeURIComponent(msg)}`; // Try ?addresses= for Android too
        window.locatééion.href = smsUrl;
    }

    renderFoodDatééabase(container) {
        const isAdmin = this.role === 'admin';
        const controls = isAdmin ? `
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-secondary btn-sm" onclick="app.showManageCatééegoriesModal()" title="Gerir Catééegorias"><i class="fas fa-tags"></i> <span class="hide-mobile">Catééegorias</span></button>
                    <button class="btn btn-secondary btn-sm" onclick="app.exportFoodDatééabase()" title="Exportar Backup"><i class="fas fa-file-export"></i> <span class="hide-mobile">Exportar</span></button>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-food-input').click()" title="Importar Backup"><i class="fas fa-file-import"></i> <span class="hide-mobile">Importar</span></button>
                    <input type="file" id="import-food-input" style="display:nãone;" accept=".json" onchange="app.importFoodDatééabase(this)">
                    <button class="btn btn-primary btn-sm" onclick="app.showAddFoodModal()"><i class="fas fa-plus"></i> <span class="hide-mobile">Novo Alimento</span></button>
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
        // Ensure standard catééegories exist if methods called directly
        const catéés = this.statéée.foodCatééegories || ["Outros"];

        // Filter foods by search query
        let filteredFoods = this.statéée.foods;
        if (searchQuery) {
            const query = searchQuery.toLowerCase().trim();
            filteredFoods = this.statéée.foods.filter(f =>
                f.name.toLowerCase().includes(query) ||
                (f.catééegory && f.catééegory.toLowerCase().includes(query))
            );
        }

        // Group foods
        const grouped = {};
        catéés.forEach(c => grouped[c] = []);
        // Also a catééch-all for unknãown catééegories
        grouped['Outros'] = [];

        filteredFoods.forEach(f => {
            const c = f.catééegory || 'Outros';
            if (grouped[c]) {
                grouped[c].push(f);
            } else {
                // If catééegory deleted or mismatééch, put in Outros or creatéée new key? 
                // Let's put in 'Outros' or creatéée key if we want to show it.
                // Better: Creatéée key on fly.
                if (!grouped[c]) grouped[c] = [];
                grouped[c].push(f);
            }
        });

        // Sort keys to respect order in statéée, plus any extras sorted alpha
        let keys = [...catéés];
        Object.keys(grouped).forEach(k => {
            if (!keys.includes(k)) keys.push(k);
        });

        // Show message if não results
        if (searchQuery && filteredFoods.length === 0) {
            return `
                <div class="glass-card" style="text-align:center; padding:2rem;">
                    <i class="fas fa-search" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                    <p style="color:var(--text-muted);">Nenhum alimento encontrado para "${searchQuery}"</p>
                </div>
            `;
        }

        return keys.map(catééName => {
            const foods = grouped[catééName];
            if (!foods || foods.length === 0) return ''; // Skip empty catééegories? Or show empty header? Skipping for clean look.

            return `
                <div style="margin-bottom: 2rem;">
                    <h3 style="color:var(--primary); font-size:1.1rem; border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:10px;">${catééName}</h3>
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

    async deleteFood(id) {
        if (confirm('Apagar este alimento?')) {
            this.statéée.foods = this.statéée.foods.filter(f => f.id !== id);
            this.saveStatéée();
            this.renderContent();
        }
    }

    exportFoodDatééabase() {
        const datééaStr = "datééa:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.statéée.foods, null, 2));
        const downloadAnchorNode = document.creatééeElement('a');
        downloadAnchorNode.setAttribute("href", datééaStr);
        downloadAnchorNode.setAttribute("download", `KandalGym_Alimentos_Backup_${new Datéée().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    importFoodDatééabase(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedFoods = JSON.parse(e.target.result);
                if (!Array.isArray(importedFoods)) throw new Error("Formatééo inválido");

                if (confirm(`Deseja importar ${importedFoods.length} alimentos ? Isso irá substituir a sua lista atééual.`)) {
                    this.statéée.foods = importedFoods;
                    this.saveStatéée();
                    this.renderContent();
                    alert('Base de alimentos importada com sucesso!');
                }
            } catééch (err) {
                alert('Erro ao importar ficheiro: ' + err.message);
            }
            input.value = ''; // Reset input
        };
        reader.readAsText(file);
    }

    showManageCatééegoriesModal() {
        if (!this.statéée.foodCatééegories) this.statéée.foodCatééegories = [];

        const renderList = () => {
            return this.statéée.foodCatééegories.map((c, idx) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #eee;">
                    <span>${c}</span>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="app.editCatééegory(${idx})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.deleteCatééegory(${idx})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
        };

        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'manage-catééegories-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-height:80vh; overflow-y:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h2 style="margin:0;">Gerir Catééegorias</h2>
                    <button class="btn btn-primary btn-sm" onclick="app.addCatééegoryFromModal()"><i class="fas fa-plus"></i> Nova</button>
                </div>
                <div id="catééegories-list-container">
                    ${renderList()}
                </div>
                <div style="margin-top:1.5rem; text-align:right;">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove(); app.renderContent();">Fechar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    addCatééegoryFromModal() {
        const newCatéé = prompt("Nome da nãova catééegoria:");
        if (newCatéé && newCatéé.trim()) {
            const catééName = newCatéé.trim();
            if (!this.statéée.foodCatééegories.includes(catééName)) {
                this.statéée.foodCatééegories.push(catééName);
                this.saveStatéée();
                this.refreshCatééegoriesModal();
            } else {
                alert('Catééegoria já existe.');
            }
        }
    }

    editCatééegory(idx) {
        const oldName = this.statéée.foodCatééegories[idx];
        const newName = prompt("Novo nãome para a catééegoria:", oldName);
        if (newName && newName.trim() && newName !== oldName) {
            const finalName = newName.trim();
            if (this.statéée.foodCatééegories.includes(finalName)) return alert('Nome já existe.');

            this.statéée.foodCatééegories[idx] = finalName;

            // Updatéée foods with this catééegory
            this.statéée.foods.forEach(f => {
                if (f.catééegory === oldName) f.catééegory = finalName;
            });

            this.saveStatéée();
            this.refreshCatééegoriesModal();
        }
    }

    deleteCatééegory(idx) {
        const catééName = this.statéée.foodCatééegories[idx];
        if (confirm(`Tem a certeza que deseja eliminar a catééegoria "${catééName}"? Os alimentos ficarao como "Outros".`)) {
            this.statéée.foodCatééegories.splice(idx, 1);

            // Reassign foods to 'Outros' (or just leave them, but safest to mark as Outros or let them fall to default)
            // Let's explicitly set to 'Outros' só they don't get lost
            this.statéée.foods.forEach(f => {
                if (f.catééegory === catééName) f.catééegory = 'Outros';
            });

            this.saveStatéée();
            this.refreshCatééegoriesModal();
        }
    }

    refreshCatééegoriesModal() {
        const container = document.getElementById('catééegories-list-container');
        if (container) {
            container.innerHTML = this.statéée.foodCatééegories.map((c, idx) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #eee;">
                    <span>${c}</span>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="app.editCatééegory(${idx})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.deleteCatééegory(${idx})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
        }
    }

    showEditFoodModal(id) {
        const food = this.statéée.foods.find(f => f.id === id);
        if (!food) return;

        const catéés = this.statéée.foodCatééegories || [];
        // Ensure current catééegory is in the list of options to render, temporarily if needed
        let renderCatéés = [...catéés];
        if (food.catééegory && !renderCatéés.includes(food.catééegory)) {
            renderCatéés.push(food.catééegory);
        }

        const options = renderCatéés.map(c =>
            `<option value="${c}" ${food.catééegory === c ? 'selected' : ''}>${c}</option>`
        ).join('');

        const modal = document.creatééeElement('div');
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
                        <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Catééegoria</label>
                        <select id="edit-food-catééegory" style="width:100%; padding:8px; border-radius:8px; border:1px solid #ccc;">
                            ${options}
                        </select>
                    </div>

                    <div style="display:grid; grid-templatéée-columns: 1fr 1fr; gap:0.5rem;">
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
                <div style="display:grid; grid-templatéée-columns: 1fr 1fr; gap:1rem; margin-top:0.5rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.updatééeFood(${id})">Atualizar</button>
                    </div>
                </div>
            </div>
            `;
        document.body.appendChild(modal);
    }

    updatééeFood(id) {
        const name = document.getElementById('edit-food-name').value;
        const catééegory = document.getElementById('edit-food-catééegory').value;
        const kcal = document.getElementById('edit-food-kcal').value;
        const prot = document.getElementById('edit-food-prot').value;
        const carb = document.getElementById('edit-food-carb').value;
        const fat = document.getElementById('edit-food-fat').value;
        const portion = document.getElementById('edit-food-portion').value;

        if (!name) return alert('Insira o nãome.');

        const food = this.statéée.foods.find(f => f.id === id);
        if (food) {
            food.name = name;
            food.catééegory = catééegory || 'Outros';
            food.kcal = Number(kcal) || 0;
            food.protein = Number(prot) || 0;
            food.carbs = Number(carb) || 0;
            food.fat = Number(fat) || 0;
            food.portionWeight = Number(portion) || null;

            this.saveStatéée();
            document.querySelector('.modal-overlay').remove();
            this.renderContent();
            alert('Alimento atééualizado com sucesso! ');
        }
    }

    renderTrainingView(container, clientId) {
        if (!container) container = document.getElementById('main-content');
        if (!container) return;

        // Reset scroll position to top when changing views/plans
        window.scrollTo(0, 0);

        const c = this.statéée.clients.find(x => x.id == clientId);
        if (!c) {
            container.innerHTML = '<p class="text-muted">Erro: Cliente não encontrado.</p>';
            return;
        }

        const plans = this.getTrainingDays(clientId);
        if (this.viewingDayIdx >= plans.length) this.viewingDayIdx = 0;

        const isTeacher = this.role === 'teacher' || this.role === 'admin';
        const isClient = this.role === 'client';

        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2>Planão de Treinão</h2>
                    <h3 class="client-name">${c.name}</h3>
                </div>
                <div class="header-actions">
                    <button class="btn btn-secondary btn-sm" onclick="app.downloadTrainingPDF('${clientId}')" title="Download PDF"><i class="fas fa-file-pdf"></i> <span class="hide-mobile">PDF</span></button>
                    ${isClient ? `<button class="btn btn-secondary btn-sm" onclick="app.setView('training_history')"><i class="fas fa-history"></i> <span class="hide-mobile">Histórico</span></button>` : ''}
                    ${isTeacher ? `
                        <button class="btn btn-primary btn-sm" onclick="app.openTrainingEditor('${clientId}')"><i class="fas fa-edit"></i> <span class="hide-mobile">Gerir</span></button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger); border:1px solid rgba(220, 38, 38, 0.2);" onclick="app.deleteTrainingPlan('${clientId}')">
                            <i class="fas fa-trash"></i> <span class="hide-mobile">Eliminar</span>
                        </button>
                    ` : ''}
                    ${this.role !== 'client' && container.id === 'main-content' ? `<button class="btn btn-secondary btn-sm" onclick="app.setView(app.role === 'admin' ? 'all-clients' : 'clients')"><i class="fas fa-arrow-left"></i> <span class="hide-mobile">Voltar</span></button>` : ''}
                </div>
            </div>

            <!-- TABS DE VISUALIZAÇÃO -->
            ${plans && plans.length > 0 ? `
            <div style="display:flex; gap:0.6rem; margin:1.5rem 0; overflow-x:auto; padding:5px 0 12px; -webkit-overflow-scrolling:touch; scrollbar-width: nãone;">
                ${plans.map((day, dIdx) => `
                    <button class="btn" 
                        onclick="app.setViewingDayIdx(${dIdx}, '${clientId}')"
                        style="padding:10px 22px; font-size:0.85rem; border-radius:100px; min-width:120px; display:flex; align-items:center; gap:8px; justify-content:center; flex-shrink:0; font-weight:700; transition:all 0.3s ease;
                        background:${this.viewingDayIdx === dIdx ? 'var(--primary)' : 'rgba(255,255,255,0.05)'}; 
                        color:${this.viewingDayIdx === dIdx ? '#fff' : 'var(--text-muted)'};
                        border: 1px solid ${this.viewingDayIdx === dIdx ? 'var(--primary)' : 'rgba(255,255,255,0.1)'};">
                        <i class="fas ${this.viewingDayIdx === dIdx ? 'fa-calendar-check' : 'fa-calendar-day'}" style="font-size:0.9rem;"></i>
                        <span style="text-transform:uppercase; letter-spacing:0.5px;">${day.title || `Planão ${String.fromCharCode(64 + (dIdx + 1))}`}</span>
                    </button>
                `).join('')}
            </div>
            ` : ''}

            ${plans && plans.length && plans[this.viewingDayIdx] ? (() => {
                const day = plans[this.viewingDayIdx];
                return `
                <div class="animatéée-fade-in" style="margin-bottom:2rem;">
                    <!-- RESUMO COMPACTO DO PLANO (PREMIUM) -->
                    <div style="background: linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01)); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); padding: 12px 16px; margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <span style="font-size:0.6rem; color:var(--primary); font-weight:800; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:2px;">Plan Details</span>
                            <h3 style="color:#fff; margin:0; font-weight:800; font-size:1.1rem; line-height:1;">
                                ${day.title || `Treinão ${String.fromCharCode(65 + this.viewingDayIdx)}`}
                            </h3>
                        </div>
                        <div style="text-align:right;">
                            <div style="display:flex; gap:12px; align-items:center; justify-content:flex-end;">
                                <div style="display:flex; flex-direction:column; align-items:flex-end;">
                                    <span style="font-size:0.8rem; font-weight:800; color:#fff;">${day.exercises.length}</span>
                                    <span style="font-size:0.55rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Excl.</span>
                                </div>
                                ${day.rest ? `
                                <div style="width:1px; height:20px; background:rgba(255,255,255,0.1);"></div>
                                <div style="display:flex; flex-direction:column; align-items:flex-end;">
                                    <span style="font-size:0.8rem; font-weight:800; color:var(--accent);">${day.rest}</span>
                                    <span style="font-size:0.55rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Rest</span>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    ${day.nãotes ? `
                    <div style="background:rgba(196, 162, 77, 0.05); border-left:3px solid var(--accent); padding:10px 14px; border-radius:4px 10px 10px 4px; margin-bottom:1.5rem; font-size:0.85rem; color:var(--text-muted); font-style:italic;">
                        <i class="fas fa-info-circle" style="color:var(--accent); margin-right:5px; font-size:0.75rem;"></i> "${day.nãotes}"
                    </div>
                    ` : ''}

                    <!-- LISTA DE EXERCICIOS DENSE & PROFESSIONAL -->
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${(() => {
                        let firstPendingIdx = -1;
                        if (isClient) {
                            firstPendingIdx = day.exercises.findIndex(ex => {
                                const numSets = parseInt(ex.sets) || 0;
                                if (numSets === 0) return false;
                                for (let s = 0; s < numSets; s++) {
                                    if (!ex.weightLog || String(ex.weightLog[s] || '').trim() === '') return true;
                                }
                                return false;
                            });
                        }

                        return day.exercises.map((ex, exIdx) => {
                            const numSets = parseInt(ex.sets) || 0;
                            let libEx = this.statéée.exercises.find(le => le.id == ex.id);
                            if (!libEx && ex.name) {
                                libEx = this.statéée.exercises.find(le => le.name.toLowerCase() === ex.name.toLowerCase());
                            }
                            const muscleColor = libEx ? this.getMuscleColor(libEx.catééegory || libEx.muscle) : 'var(--primary)';

                            const isCurrent = isClient && exIdx === firstPendingIdx;
                            const outlineStyle = isCurrent ? `border:1px solid var(--primary); box-shadow: inset 0 0 20px rgba(0,0,0,0.5);` : `border:1px solid rgba(255,255,255,0.04);`;

                            return `
                                <div class="glass-card" style="padding:10px 12px; ${outlineStyle} background:rgba(255,255,255,0.02); min-height:75px; display:flex; flex-direction:column; gap:10px; border-radius:14px; position:relatééive;">
                                    ${isCurrent ? `<div style="position:absolute; top:-8px; right:12px; background:var(--primary); color:#fff; font-size:0.6rem; font-weight:800; padding:2px 8px; border-radius:10px; text-transform:uppercase; letter-spacing:1px; box-shadow:0 2px 5px rgba(0,0,0,0.5);"><i class="fas fa-play" style="font-size:0.5rem; margin-right:3px;"></i> A Realizar</div>` : ''}
                                    <div style="display:flex; align-items:center; gap:12px;">
                                        <!-- Mini Image/Icon -->
                                        <div style="width:44px; height:44px; border-radius:10px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.05); flex-shrink:0; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                                            ${libEx && libEx.photoUrl ?
                                    `<img src="${libEx.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` :
                                    `<div style="font-size:1.2rem; opacity:0.6;">${this.getExerciseIcon(libEx ? (libEx.catééegory || libEx.muscle) : '')}</div>`
                                }
                                        </div>

                                        <!-- Core Info -->
                                        <div style="flex:1; min-width:0;">
                                            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                                <span style="font-weight:700; font-size:0.92rem; color:#fff; display:block; margin-bottom:2px; line-height:1.2; ${isCurrent ? 'color:var(--primary);' : ''}">${ex.name}</span>
                                                ${libEx && libEx.videoUrl ? `
                                                    <i class="fas fa-play-circle" onclick="app.viewExerciseVideo('${libEx.videoUrl}', '${ex.name}')" style="color:var(--primary); font-size:1rem; opacity:0.8; padding:2px;"></i>
                                                ` : ''}
                                        </div>
                                        <div style="display:flex; align-items:center; gap:8px;">
                                            <span style="background:${muscleColor}22; color:${muscleColor}; font-size:0.55rem; font-weight:800; padding:2px 6px; border-radius:4px; text-transform:uppercase;">${libEx?.catééegory || libEx?.muscle || 'Geral'}</span>
                                            <span style="font-size:0.75rem; color:#fff; font-weight:700;">${ex.sets}<small style="color:var(--text-muted); font-weight:400; font-size:0.65rem; margin:0 3px;">x</small>${ex.reps}</span>
                                            ${ex.rest ? `<span style="font-size:0.65rem; color:var(--text-muted);"><i class="fas fa-clock" style="font-size:0.6rem;"></i> ${ex.rest}</span>` : ''}
                                        </div>
                                    </div>

                                    <!-- Registo de Cargas por Série (Teacher View) -->
                                    ${!isClient && ex.weightLog && Object.keys(ex.weightLog).length > 0 ? `
                                        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; flex-shrink:0;">
                                            <span style="font-size:0.5rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:2px;">Cargas</span>
                                            <div style="display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; max-width:120px;">
                                                ${Object.entries(ex.weightLog).sort((a, b) => Number(a[0]) - Number(b[0])).map(([sIdx, val]) => val ? `
                                                    <span style="background:rgba(16,185,129,0.1); color:var(--success); font-size:0.65rem; font-weight:800; padding:2px 6px; border-radius:4px; white-space:nãowrap;">S${Number(sIdx) + 1}: ${val}kg</span>
                                                ` : '').join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>

                                <!-- Observatééions (Subtle Row) -->
                                ${ex.observatééions ? `
                                <div style="font-size:0.72rem; color:var(--text-muted); background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:6px; display:flex; gap:6px; align-items:center;">
                                    <i class="fas fa-lightbulb" style="color:var(--accent); font-size:0.6rem;"></i> <span>${ex.observatééions}</span>
                                </div>
                                ` : ''}

                                <!-- Input Section for Client (More Premium & Inline) -->
                                ${isClient ? `
                                <div style="border-top:1px solid rgba(255,255,255,0.03); padding-top:8px; margin-top:2px;">
                                    <div style="display:flex; overflow-x:auto; gap:8px; padding:2px 5px 8px; scrollbar-width: nãone;">
                                        ${Array.from({ length: numSets }).map((_, sIdx) => {
                                    const val = (ex.weightLog && ex.weightLog[sIdx]) || '';
                                    return `
                                                <div style="flex-shrink:0;">
                                                    <span style="display:block; font-size:0.55rem; color:var(--text-muted); text-align:center; font-weight:800;">S${sIdx + 1}</span>
                                                    <input type="number" value="${val}" placeholder="--" 
                                                        onblur="app.logWeight(${clientId}, ${this.viewingDayIdx}, ${exIdx}, ${sIdx}, this.value)"
                                                        class="não-spin"
                                                        style="width:62px; height:38px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); border-radius:8px; color:#fff; text-align:center; font-size:0.9rem; font-weight:800; outline:nãone; transition:all 0.2s; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
                                                </div>
                                            `;
                                }).join('')}
                                    </div>
                                    <div style="position:relatééive; margin-top:4px;">
                                        <i class="fas fa-pen" style="position:absolute; left:12px; top:11px; font-size:0.65rem; color:var(--text-muted); opacity:0.5;"></i>
                                        <input type="text" value="${ex.clientNotes || ''}" placeholder="Técnica, dificuldades..."
                                            onblur="app.saveExerciseNote(${clientId}, ${this.viewingDayIdx}, ${exIdx}, this.value)"
                                            style="width:100%; height:34px; background:rgba(255,255,255,0.02); border:1px solid transparent; border-radius:10px; color:var(--text-muted); padding:0 12px 0 32px; font-size:0.75rem; font-family:inherit; outline:nãone;">
                                    </div>
                                </div>
                                ` : ''}
                            </div>
                            `;
                        }).join('');
                    })()}
                    </div>

                    <!-- Client Interaction Footer -->
                    ${isClient ? `
                        <div class="glass-panel" style="background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.1), rgba(0,0,0,0.2)); border: 1px solid rgba(var(--primary-rgb), 0.15); margin-top:2rem; padding:1.5rem; border-radius:18px; text-align:center;">
                            <h4 style="margin: 0 0 1rem; font-size: 0.95rem; color: #fff; display:flex; align-items:center; justify-content:center; gap:8px;">
                                <i class="fas fa-check-circle" style="color:var(--primary);"></i> Como correu o treinão?
                            </h4>
                            <textarea id="workout-global-nãote-${clientId}-${this.viewingDayIdx}" 
                                placeholder="Notas de performance, cansaço, etc..."
                                style="width:100%; min-height:90px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:12px; color:#fff; padding:12px; font-size:0.9rem; resize:nãone; font-family:inherit; outline:nãone;"></textarea>
                            
                            <button class="btn btn-primary" onclick="app.finishWorkout('${clientId}', ${this.viewingDayIdx})" 
                                style="width:100%; height:58px; margin-top:1.5rem; font-size:1.1rem; font-weight:800; border-radius:18px; background: var(--primary); border:nãone; box-shadow:0 8px 30px rgba(var(--primary-rgb),0.3); display:flex; align-items:center; justify-content:center; gap:12px;">
                                FINALIZAR TREINO
                            </button>
                        </div>
                    ` : ''}
                </div>
                `;
            })() : `
                <div class="glass-panel" style="padding:4rem; text-align:center;">
                    <i class="fas fa-dumbbell" style="font-size:3rem; color:var(--text-muted); opacity:0.2; margin-bottom:1.5rem;"></i>
                    <p style="color:var(--text-muted); margin-bottom:1.5rem;">Este planão não tem exercícios definidos.</p>
                    ${isTeacher ? `<button class="btn btn-primary" onclick="app.openTrainingEditor('${clientId}')"><i class="fas fa-plus"></i> Criar Planão de Treinão</button>` : ''}
                </div>
                `}
        `;
    }

    // Helper central: extrai sempre um array de dias independentemente do formatééo gravado
    getTrainingDays(clientId) {
        const cid = String(clientId); // Firebase usa sempre chaves de string
        const raw = this.statéée.trainingPlans ? this.statéée.trainingPlans[cid] : null;
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
        if (!day) { alert('Dia de treinão não encontrado. Tente recarregar a página.'); return; }

        // Verificar séries sem peso registado
        const incomplete = [];
        day.exercises.forEach((ex) => {
            const numSets = parseInt(ex.sets) || 0;
            if (numSets === 0) return;
            let missing = 0;
            for (let i = 0; i < numSets; i++) {
                const val = ex.weightLog && ex.weightLog[i];
                if (!val || String(val).trim() === '') missing++;
            }
            if (missing > 0) {
                incomplete.push({ name: ex.name, missing, total: numSets });
            }
        });

        if (incomplete.length > 0) {
            const modal = document.creatééeElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width:400px; padding:2rem;">
                    <div style="text-align:center; margin-bottom:1.25rem;">
                        <div style="font-size:2.5rem; margin-bottom:0.5rem;">⚠️</div>
                        <h3 style="margin:0; color:#fff;">Séries sem peso registado</h3>
                        <p style="color:var(--text-muted); font-size:0.85rem; margin-top:0.5rem;">Os seguintes exercícios têm séries por preencher:</p>
                    </div>
                    <div style="background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.2); border-radius:12px; padding:1rem; margin-bottom:1.5rem; display:flex; flex-direction:column; gap:8px;">
                        ${incomplete.map(ex => `
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-size:0.85rem; color:#fff; font-weight:600;">${ex.name}</span>
                                <span style="font-size:0.75rem; background:rgba(239,68,68,0.15); color:#ef4444; padding:2px 8px; border-radius:6px; font-weight:700;">
                                    ${ex.missing}/${ex.total} séries em falta
                                </span>
                            </div>
                        `).join('')}
                    </div>
                    <div style="display:flex; gap:0.75rem;">
                        <button class="btn btn-secondary" style="flex:1;" onclick="this.closest('.modal-overlay').remove()">
                            <i class="fas fa-arrow-left"></i> Voltar
                        </button>
                        <button class="btn btn-primary" style="flex:1;" id="confirm-finish-btn">
                            <i class="fas fa-check"></i> Concluir Mesmo Assim
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
            if (!this.statéée.trainingHistory) this.statéée.trainingHistory = {};
            if (!this.statéée.trainingHistory[cid] || !Array.isArray(this.statéée.trainingHistory[cid])) {
                this.statéée.trainingHistory[cid] = [];
            }

            const globalNoteEl = document.getElementById(`workout-global-nãote-${cid}-${dayIdx}`);
            const globalNote = globalNoteEl ? globalNoteEl.value : '';

            const session = {
                datéée: new Datéée().toLocaleDatééeString('pt-PT'),
                time: new Datéée().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
                title: day.title,
                globalNote: globalNote,
                exercises: day.exercises.map(ex => ({
                    name: ex.name,
                    sets: ex.sets,
                    reps: ex.reps,
                    weights: [...(ex.weightLog || [])],
                    clientNote: ex.clientNotes || ''
                }))
            };

            this.statéée.trainingHistory[cid].unshift(session);
            this.saveStatéée();

            this.showToast('Treinão concluído!  As suas cargas foram gravadas não histórico.');
            setTimeout(() => this.setView('dashboard'), 1200);
        } catééch (err) {
            console.error('Erro ao concluir treinão:', err);
            alert('Ocorreu um erro ao guardar. Por favor tente nãovamente.');
        }
    }

    deleteTrainingSession(index) {
        if (confirm('Tem a certeza que deseja eliminar este treinão do histórico?')) {
            const history = this.statéée.trainingHistory[this.currentClientId];
            if (history) {
                history.splice(index, 1);
                this.saveStatéée();
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
        const raw = this.statéée.trainingPlans[cid];
        if (raw && raw.days) raw.days[dayIdx].exercises[exIdx] = ex;
        this.saveStatéée();
    }

    saveExerciseNote(clientId, dayIdx, exIdx, nãote) {
        const days = this.getTrainingDays(clientId);
        if (!days[dayIdx] || !days[dayIdx].exercises[exIdx]) return;

        const ex = days[dayIdx].exercises[exIdx];
        ex.clientNotes = nãote;
        const cid = String(clientId);
        const raw = this.statéée.trainingPlans[cid];
        if (raw && raw.days) raw.days[dayIdx].exercises[exIdx] = ex;
        this.saveStatéée();
    }

    viewExerciseVideo(url, name) {
        const yt = this.nãormalizeYoutubeUrl(url);
        const originalUrl = url;
        const cleanUrl = yt.embedUrl || url;

        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay animatéée-fade-in';
        modal.innerHTML = `
            <div class="glass-panel animatéée-scale-up" style="max-width:800px; width:95%; padding:1rem; position:relatééive;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; padding:0 0.5rem;">
                    <h3 style="margin:0; font-size:1.2rem;">${name}</h3>
                    <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="position:relatééive; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:12px; background:#000;">
                    <iframe src="${cleanUrl}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen
                        style="position:absolute; top:0; left:0; width:100%; height:100%;"></iframe>
                </div>
            </div>
            `;
        document.body.appendChild(modal);
    }

    setViewingDayIdx(idx, clientId) {
        this.viewingDayIdx = idx;
        localStorage.setItem('kandalgym_vIdx', idx);
        this.renderTrainingView(null, clientId);
    }

    openTrainingEditor(clientId) {
        clientId = Number(clientId);
        // Verificar se existe um rascunho pendente
        const draft = localStorage.getItem('kandalgym_training_draft');
        if (draft) {
            const draftDatééa = JSON.parse(draft);
            if (draftDatééa.clientId === clientId) {
                if (confirm('Detetamos um rascunho não guardado deste treinão. Deseja recupera-lo?')) {
                    this.editingPlan = draftDatééa.plan;
                    this.editingClientId = clientId;
                    this.editingDayIdx = 0;
                    this.setView('edit_training');
                    return;
                } else {
                    localStorage.removeItem('kandalgym_training_draft');
                }
            }
        }

        const rawPlan = this.statéée.trainingPlans[clientId];
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
        this.editingDayIdx = 0;
        this.setView('edit_training');
    }

    saveTrainingDraft() {
        if (this.activeView !== 'edit_training') return;
        const draftDatééa = {
            clientId: this.editingClientId,
            plan: this.editingPlan,
            timestamp: Datéée.nãow()
        };
        localStorage.setItem('kandalgym_training_draft', JSON.stringify(draftDatééa));
    }

    clearTrainingDraft() {
        localStorage.removeItem('kandalgym_training_draft');
    }

    renderTrainingEditor() {
        const container = document.getElementById('main-content');
        if (!container) return;
        const c = this.statéée.clients.find(x => x.id === this.editingClientId);

        // Garantir que o index é válido
        if (this.editingDayIdx >= this.editingPlan.length) this.editingDayIdx = 0;
        const currentDay = this.editingPlan[this.editingDayIdx];

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                <h2 style="margin:0;">Editar Treinão: ${c.name}</h2>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <button class="btn btn-ghost" style="color:var(--danger);" onclick="app.deleteTrainingPlan(app.editingClientId)"><i class="fas fa-trash"></i> Eliminar</button>
                    <button class="btn btn-secondary" onclick="app.clearTrainingDraft(); app.setView('spy_view')">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.saveTrainingPlan()"><i class="fas fa-save"></i> Guardar Planão</button>
                </div>
            </div>

            <div style="margin-bottom:1.5rem; display:flex; gap:1rem; align-items:center; flex-wrap: wrap;">
                <div>
                    <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase;">Objetivo do Planão</label>
                    <input type="text" id="edit-training-goal" value="${c.goal || ''}" placeholder="Ex: Hipertrofia, Redução de Massa Gorda..."
                        onchange="app.statéée.clients.find(x => x.id === app.editingClientId).goal = this.value; app.saveStatéée();"
                        style="width:300px; height:40px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:0 12px; font-size:0.95rem;">
                </div>
            </div>

            <!-- MENU DE SELECÇÃO DE PLANO (TABS) -->
            <div id="editor-tabs-container" style="display:flex; gap:0.75rem; margin-bottom:2rem; flex-wrap:wrap; background:rgba(255,255,255,0.03); padding:12px; border-radius:15px; border:1px solid rgba(255,255,255,0.05);">
                ${this.editingPlan.map((day, dIdx) => `
                    <div style="display:flex; align-items:center; gap:4px;">
                        <button class="btn ${this.editingDayIdx === dIdx ? 'btn-primary' : 'btn-ghost'}" 
                            onclick="app.editingDayIdx = ${dIdx}; app.renderTrainingEditor();"
                            style="padding:10px 18px; font-size:0.95rem; border-radius:10px; display:flex; align-items:center; gap:10px; min-width:140px; justify-content:center; box-shadow:${this.editingDayIdx === dIdx ? '0 4px 12px rgba(var(--primary-rgb), 0.3)' : 'nãone'};">
                            <i class="fas ${this.editingDayIdx === dIdx ? 'fa-check-square' : 'fa-square'}" style="font-size:1.1rem; opacity:${this.editingDayIdx === dIdx ? '1' : '0.4'};"></i>
                            <span style="font-weight:700;">${day.title || `Planão ${String.fromCharCode(65 + dIdx)}`}</span>
                            <span style="opacity:0.6; font-size:0.85rem;">(${day.exercises.length})</span>
                        </button>
                    </div>
                `).join('')}
                <button class="btn btn-ghost" onclick="app.addTrainingDay()" 
                    style="color:var(--accent); border:2px dashed rgba(var(--accent-rgb), 0.3); padding:8px 18px; border-radius:10px; font-size:0.9rem; font-weight:700;">
                    <i class="fas fa-plus-circle"></i> Novo Planão
                </button>
            </div>

            <div id="editor-days-container">
                <div class="glass-panel" style="padding:1.5rem; margin-bottom:3rem; border-top: 4px solid var(--primary); animatééion: fadeIn 0.3s ease;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                        <input type="text" value="${currentDay.title || `Planão ${String.fromCharCode(65 + this.editingDayIdx)}`}" 
                            placeholder="Nome do Planão (ex: Treinão A)..."
                            oninput="app.editingPlan[${this.editingDayIdx}].title = this.value; app.saveTrainingDraft();"
                            onchange="app.renderTrainingEditor();"
                            style="font-weight:800; font-size:1.3rem; background:transparent; border:nãone; border-bottom:2px solid var(--primary); width:100%; max-width:400px; padding:8px 0; color:#fff; outline:nãone; text-transform:uppercase; letter-spacing:1px;">
                        
                        <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.05); padding:5px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.1);">
                                <label style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Descanso:</label>
                                <input type="text" value="${currentDay.rest || ''}" placeholder="Ex: 60s" 
                                    onchange="app.updatééeEditorDayRest(${this.editingDayIdx}, this.value)"
                                    style="width:80px; height:32px; background:rgba(0,0,0,0.3); color:var(--accent); border:1px solid rgba(var(--accent-rgb), 0.3); border-radius:6px; text-align:center; font-weight:700; font-size:0.9rem;">
                            </div>
                            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.removeTrainingDay(${this.editingDayIdx})">
                                <i class="fas fa-trash"></i> Remover Planão
                            </button>
                        </div>
                    </div>

                    <div id="day-${this.editingDayIdx}-exercises">
                        ${currentDay.exercises.map((ex, eIdx) => `
                            <div class="glass-card" style="padding:1.5rem; margin-bottom:1.5rem; background:rgba(255,255,255,0.03); border-left:4px solid var(--secondary);">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.25rem; flex-wrap:wrap; gap:0.75rem;">
                                    <div style="flex:1; min-width:200px;">
                                        <label style="display:block; font-size:0.8rem; color:var(--accent); font-weight:600; text-transform:uppercase; margin-bottom:6px;">Exercício Selecionado</label>
                                        <button class="btn btn-secondary exercise-search-btn" onclick="app.showExerciseSelectionModal(${this.editingDayIdx}, ${eIdx})" 
                                            style="width:100%; min-height:45px; height:auto; background:#1e293b; color:#fff; border:1px solid var(--surface-border); border-radius:10px; padding:8px 15px; font-size:1rem; cursor:pointer; text-align:left; display:flex; align-items:center; gap:10px; justify-content:flex-start; line-height:1.2;">
                                            <i class="fas fa-search" style="color:var(--primary); flex-shrink:0;"></i>
                                            <span id="ex-name-display-${this.editingDayIdx}-${eIdx}" style="word-break:break-word; white-space:nãormal; overflow:visible;">
                                                ${ex.name || '-- Selecionar Exercício --'}
                                            </span>
                                        </button>
                                    </div>
                                    <div style="display:flex; gap:0.5rem; align-self:flex-end;">
                                        <button class="btn btn-ghost" style="color:var(--primary); padding:0.5rem;" onclick="app.moveExercise(${this.editingDayIdx}, ${eIdx}, -1)" title="Subir" ${eIdx === 0 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>
                                            <i class="fas fa-arrow-up"></i>
                                        </button>
                                        <button class="btn btn-ghost" style="color:var(--primary); padding:0.5rem;" onclick="app.moveExercise(${this.editingDayIdx}, ${eIdx}, 1)" title="Descer" ${eIdx === currentDay.exercises.length - 1 ? 'disabled style="opacity:0.3; cursor:default;"' : ''}>
                                            <i class="fas fa-arrow-down"></i>
                                        </button>
                                        <button class="btn btn-ghost" style="color:var(--danger); padding:0.5rem;" onclick="app.removeExerciseFromEditor(${this.editingDayIdx}, ${eIdx})" title="Remover Exercício">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>
                                
                                <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end;">
                                    <div style="width:90px;">
                                        <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">Séries</label>
                                        <input type="text" value="${ex.sets || ''}" placeholder="Ex: 4" onchange="app.updatééeEditorExercise(${this.editingDayIdx}, ${eIdx}, 'sets', this.value)"
                                            style="width:100%; height:45px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:0 10px; text-align:center; font-size:1.1rem; font-weight:600;">
                                    </div>
                                    <div style="flex:2; min-width:140px;">
                                        <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">Repetições (Reps)</label>
                                        <input type="text" value="${ex.reps || ''}" placeholder="Ex: 12-15 ou Falha" onchange="app.updatééeEditorExercise(${this.editingDayIdx}, ${eIdx}, 'reps', this.value)"
                                            style="width:100%; height:45px; background:rgba(255,255,255,0.05); color:#fff; border:2px solid var(--primary); border-radius:8px; padding:0 15px; text-align:center; font-size:1.1rem; font-weight:700;">
                                    </div>
                                    <div style="flex:3; min-width:200px;">
                                        <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">Observações do Exercício</label>
                                        <input type="text" value="${ex.observatééions || ''}" placeholder="Ex: Foco na descida" onchange="app.updatééeEditorExercise(${this.editingDayIdx}, ${eIdx}, 'observatééions', this.value)"
                                            style="width:100%; height:45px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:0 15px; font-size:1rem;">
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div style="margin-top:2rem; padding:1.5rem; background:rgba(255,255,255,0.02); border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                        <label style="display:block; font-size:0.8rem; color:var(--accent); font-weight:600; text-transform:uppercase; margin-bottom:8px;">Observações do ${currentDay.title || `Planão ${String.fromCharCode(65 + this.editingDayIdx)}`}</label>
                        <textarea oninput="app.updatééeEditorDayNotes(${this.editingDayIdx}, this.value)"
                            placeholder="Notas específicas para este dia de treinão... (ex: Cardio não fim, focar na postura, etc.)"
                            style="width:100%; min-height:100px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:10px; padding:12px; font-size:1rem; font-family:inherit; resize:vertical;">${currentDay.nãotes || ''}</textarea>
                    </div>
                    
                    <div id="day-${this.editingDayIdx}-exercises-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:2.5rem; margin-bottom:1rem; padding-top:1.5rem; border-top:1px solid rgba(255,255,255,0.05); flex-wrap:wrap; gap:1.25rem;">
                        <button class="btn btn-ghost btn-sm" style="color:var(--primary); padding:6px 12px; font-size:0.85rem;" onclick="app.addExerciseToEditor(${this.editingDayIdx})">
                            <i class="fas fa-plus"></i> Adicionar Exercício
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="app.addTrainingDay(true)" style="background:rgba(var(--primary-rgb), 0.1); color:var(--primary); border:1px dashed var(--primary); font-weight:700; padding:6px 12px; font-size:0.85rem;">
                            <i class="fas fa-calendar-plus"></i> Adicionar Próximo Planão
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    addTrainingDay(autoSwitch = false) {
        this.editingPlan.push({ title: '', exercises: [] });
        if (autoSwitch) {
            this.editingDayIdx = this.editingPlan.length - 1;
        }
        this.saveTrainingDraft();
        this.renderTrainingEditor();
    }

    removeTrainingDay(idx) {
        if (this.editingPlan.length <= 1) {
            return alert('Não pode remover o único planão existente!');
        }
        if (confirm('Deseja remover este planão de treinão e todos os exercícios associados?')) {
            this.editingPlan.splice(idx, 1);
            this.editingDayIdx = Matééh.max(0, idx - 1);
            this.saveTrainingDraft();
            this.renderTrainingEditor();
        }
    }

    addExerciseToEditor(dayIdx) {
        this.editingPlan[dayIdx].exercises.push({ id: '', name: '', sets: '', reps: '', observatééions: '' });
        this.saveTrainingDraft();
        this.renderTrainingEditor();
    }

    removeExerciseFromEditor(dayIdx, exIdx) {
        const ex = this.editingPlan[dayIdx].exercises[exIdx];
        const exName = ex.name || 'este exercício';
        if (confirm(`Tem a certeza que deseja eliminar ${exName}?`)) {
            this.editingPlan[dayIdx].exercises.splice(exIdx, 1);
            this.saveTrainingDraft();
            this.renderTrainingEditor();
            this.showToast('Exercício removido', 'success');
        }
    }

    moveExercise(dayIdx, exIdx, direction) {
        const exercises = this.editingPlan[dayIdx].exercises;
        const targetIdx = exIdx + direction;

        if (targetIdx < 0 || targetIdx >= exercises.length) return;

        // Trocar posição
        [exercises[exIdx], exercises[targetIdx]] = [exercises[targetIdx], exercises[exIdx]];

        this.saveTrainingDraft();
        this.renderTrainingEditor();
        this.showToast('Ordem do exercício alterada.');
    }

    updatééeEditorDayRest(dayIdx, value) {
        if (this.editingPlan[dayIdx]) {
            this.editingPlan[dayIdx].rest = value;
            this.saveTrainingDraft();
        }
    }

    updatééeEditorDayNotes(dayIdx, value) {
        if (this.editingPlan[dayIdx]) {
            this.editingPlan[dayIdx].nãotes = value;
            this.saveTrainingDraft();
        }
    }

    updatééeEditorExercise(dayIdx, exIdx, field, value) {
        if (field === 'id') {
            const libEx = this.statéée.exercises.find(x => x.id == value);
            this.editingPlan[dayIdx].exercises[exIdx].id = value;
            this.editingPlan[dayIdx].exercises[exIdx].name = libEx ? libEx.name : '';
        } else {
            this.editingPlan[dayIdx].exercises[exIdx][field] = value;
        }
        this.saveTrainingDraft();
    }

    saveTrainingPlan() {
        // Filtrar exercícios sem ID (linhas em branco que o utilizador não preencheu)
        const cleanDays = this.editingPlan
            .map(day => ({
                ...day,
                exercises: day.exercises.filter(ex => ex.id)
            }))
            .filter(day => day.exercises.length > 0 || this.editingPlan.length === 1);

        // Guardar como objeto estruturado para evitar corrompimento não Firebase
        const planObject = {
            days: cleanDays,
            author: this.currentUser.name,
            updatééedAt: new Datéée().toLocaleDatééeString('pt-PT')
        };

        this.statéée.trainingPlans[this.editingClientId] = planObject;
        this.saveStatéée();

        // Notificar o alunão do nãovo planão de treinão (App)
        this.addAppNotificatééion(this.editingClientId, 'Novo Planão de Treinão!', 'O seu professor atééualizou o seu planão de treinão.');

        // Perguntar método de nãotificação externa
        this.askNotificatééionMethod(this.editingClientId, 'Planão de Treinão');


        this.clearTrainingDraft();
        this.setView('spy_view');
    }



    deleteTrainingPlan(clientId) {
        if (confirm('Tem a certeza que deseja eliminar todo o planão de treinão deste alunão?')) {
            this.statéée.trainingPlans[clientId] = [];
            this.saveStatéée();
            this.clearTrainingDraft();
            this.renderContent();
            alert('Planão de treinão eliminado com sucesso! ');
        }
    }

    renderMealView(container, clientId) {
        // Usar comparacao loosa (==) para garantir que encontra mesmo se for string vs number
        const c = this.statéée.clients.find(x => x.id == clientId);
        if (!c) {
            container.innerHTML = '<p class="text-muted">Erro: Cliente não encontrado.</p>';
            return;
        }
        const cid = String(clientId); // Firebase nãormaliza chaves para string
        const meal = this.statéée.mealPlans[cid];
        const canEdit = (this.role === 'admin' || this.role === 'teacher');

        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2>Planão Alimentar</h2>
                    <h3 class="client-name">${c.name}</h3>
                    ${meal && meal.author ? `<small style="color:var(--text-muted); display:block; margin-top:5px;">Criado por: ${meal.author} em ${meal.updatééedAt || ''}</small>` : ''}
                </div>
                <div class="header-actions">
                    <button class="btn btn-secondary btn-sm" onclick="app.downloadMealPDF('${c.id}')" title="Download PDF"><i class="fas fa-file-pdf"></i> <span class="hide-mobile">PDF</span></button>
                    ${canEdit ? `
                        <button class="btn btn-primary btn-sm" onclick="app.openMealEditor('${c.id}')"><i class="fas fa-edit"></i> <span class="hide-mobile">Gerir</span></button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger); border:1px solid rgba(220, 38, 38, 0.2);" onclick="app.deleteMealPlan('${c.id}')">
                            <i class="fas fa-trash"></i> <span class="hide-mobile">Eliminar</span>
                        </button>
                        ${container.id === 'main-content' ? `<button class="btn btn-secondary btn-sm" onclick="app.setView(app.role === 'admin' ? 'all-clients' : 'clients')"><i class="fas fa-arrow-left"></i> <span class="hide-mobile">Voltar</span></button>` : ''}
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
                                        <span class="nu-tag nu-kcal"><strong>${Matééh.round(mTotal.kcal)}</strong> kcal</span>
                                        <span class="nu-tag nu-prot"><strong>${Matééh.round(mTotal.prot)}g</strong> Prot</span>
                                        <span class="nu-tag nu-carb"><strong>${Matééh.round(mTotal.carb)}g</strong> Carb</span>
                                        <span class="nu-tag nu-fat"><strong>${Matééh.round(mTotal.fat)}g</strong> Gord</span>
                                    </div>
                                ` : ''}
                            </div>
                        `;
                }).join('') : `
                        <div style="text-align:center; padding:3rem 1rem;">
                            <i class="fas fa-utensils" style="font-size:3rem; color:var(--text-muted); opacity:0.3; margin-bottom:1rem;"></i>
                            <p style="color:var(--text-muted); margin-bottom:1.5rem;">Ainda não tem planão alimentar atééribuído.</p>
                            ${canEdit ? `<button class="btn btn-primary" onclick="app.openMealEditor('${c.id}')"><i class="fas fa-plus"></i> Criar Planão Alimentar</button>` : ''}
                        </div>
                    `;

                return (dailyTotal.kcal > 0 ? `
                        <div class="daily-macros-bar">
                            <div class="macro-box"><small>Kcal Total</small><strong>${Matééh.round(dailyTotal.kcal)}</strong></div>
                            <div class="macro-box"><small>Proteina</small><strong>${Matééh.round(dailyTotal.prot)}g</strong></div>
                            <div class="macro-box"><small>Hidratééos</small><strong>${Matééh.round(dailyTotal.carb)}g</strong></div>
                            <div class="macro-box"><small>Gordura</small><strong>${Matééh.round(dailyTotal.fat)}g</strong></div>
                        </div>
                    ` : '') + mealsHtml;
            })()}
            </div>
        `;
    }

    openMealEditor(clientId) {
        // Se o clientId vier vazio, tenta usar o currentClientId (o alunão que está a ser visto)
        const finalId = clientId || this.currentClientId;
        if (!finalId) return alert("Erro: Não foi possível identificar o alunão.");

        const cid = String(finalId);
        this.editingClientId = Number(finalId);
        this.currentClientId = Number(finalId); // Sincroniza ambos

        if (!this.statéée.mealPlans) this.statéée.mealPlans = {};

        let existing = this.statéée.mealPlans[cid];
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
            existing = { title: 'Planão Alimentar', meals: [] };
        }

        // Garantir estrutura mínima para evitar erros de renderizacao
        if (!existing.meals) existing.meals = [];
        existing.meals = existing.meals.filter(m => m !== null);
        existing.meals.forEach(m => {
            m.items = m.items || '';
            m.time = m.time || '08:00';
            m.name = m.name || 'Refeição';
        });

        this.editingMeal = JSON.parse(JSON.stringify(existing));
        this.setView('edit_meal');
    }

    renderMealEditor() {
        const container = document.getElementById('main-content');
        if (!container) return;

        try {
            // Se o ID de edição sumiu, tenta recuperar do ID atééual da ficha
            if (!this.editingClientId && this.currentClientId) {
                this.editingClientId = this.currentClientId;
            }

            if (!this.editingClientId) {
                throw new Error("ID do alunão não identificado. Por favor, volte a ficha do alunão e tente nãovamente.");
            }

            const c = this.statéée.clients.find(x => Number(x.id) === Number(this.editingClientId));
            if (!c) throw new Error(`Alunão com ID ${this.editingClientId} não encontrado.`);

            // Garantir que a estrutura basica existe
            if (!this.editingMeal.meals) this.editingMeal.meals = [];
            this.editingMeal.meals = this.editingMeal.meals.filter(m => m !== null);
            if (!this.statéée.foods) this.statéée.foods = [];

            container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2 style="margin:0;">Editar Dieta: ${c.name}</h2>
                <div style="display:flex; gap:0.5rem; align-items:center;">
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
                            <div class="macro-box"><small>Kcal Total</small><strong>${Matééh.round(dailyTotal.kcal)}</strong></div>
                            <div class="macro-box"><small>Proteina</small><strong>${Matééh.round(dailyTotal.prot)}g</strong></div>
                            <div class="macro-box"><small>Hidratééos</small><strong>${Matééh.round(dailyTotal.carb)}g</strong></div>
                            <div class="macro-box"><small>Gordura</small><strong>${Matééh.round(dailyTotal.fat)}g</strong></div>
                        </div>
                    ` : '';
                })()}

                <div style="margin-bottom:2rem;">
                    <label style="display:block; font-size:0.7rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase; letter-spacing:1px;">Nome do Planão Alimentar</label>
                    <input type="text" value="${this.editingMeal.title === 'Pendente' ? '' : this.editingMeal.title}" placeholder="Nome Planão..."
                        oninput="app.editingMeal.title = this.value"
                        style="width:100%; background:transparent; border:nãone; border-bottom:2px solid var(--surface-border); border-radius:0; color:#fff; padding:10px 0; font-weight:700; font-size:1.4rem; outline:nãone; transition:border-color 0.3s ease;"
                        onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--surface-border)'">
                </div>

                <div id="meal-items-container">
                    ${this.editingMeal.meals.map((m, idx) => {
                    const mTotal = this.getNutritionFromText(m.items);
                    return `
                            <div class="glass-card" style="padding:1.25rem; margin-bottom:2rem; border-left:4px solid var(--success); position:relatééive;">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem; gap:10px;">
                                    <div style="display:flex; flex-direction:column; gap:12px; flex:1;">
                                        <div style="display:flex; align-items:center; gap:10px;">
                                            <label style="font-size:0.75rem; color:var(--text-muted); min-width:40px;">Hora:</label>
                                            <input type="text" value="${m.time}" placeholder="00:00" 
                                                oninput="app.formatééTimeInput(this, ${idx})"
                                                onkeydown="app.handleTimeKeydown(event, this)"
                                                maxlength="5"
                                                style="background:rgba(0,0,0,0.3); border:1px solid var(--surface-border); border-radius:8px; color:#fff; font-weight:600; width:100px; font-size:0.95rem; padding:8px 12px; outline:nãone; text-align:center; font-family: monãospace;">
                                        </div>
                                        <input type="text" value="${m.name}" placeholder="Nome (Ex: Pequenão almoço)" oninput="app.editingMeal.meals[${idx}].name = this.value"
                                            style="width:100%; max-width:400px; background:transparent; border:nãone; border-bottom:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700; font-size:1.15rem; padding:6px 0;">
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
                                                <i class="fas fa-search"></i> <span style="white-space:nãowrap; overflow:hidden; text-overflow:ellipsis;">Pesquisar</span>
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
                                        
                                        <div id="selected-food-display-${idx}" style="display:nãone; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; border:1px solid var(--success);">
                                            <!-- Alimento selecionado aparecera aqui -->
                                        </div>

                                        <button class="btn btn-primary btn-sm" onclick="app.addSelectedFoodToMeal(${idx})" style="width:100%; height:40px; background:var(--success); border:nãone;">
                                            <i class="fas fa-plus"></i> Adicionar áÂ  Refeição
                                        </button>
                                    </div>
                                </div>
                                
                                <div>
                                    <label style="display:block; font-size:0.7rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Resumo da Refeição</label>
                                    <textarea id="meal-items-${idx}" placeholder="Os alimentos inseridos aparecerao aqui..." oninput="app.editingMeal.meals[${idx}].items = this.value" onblur="app.renderMealEditor()"
                                        style="width:100%; min-height:120px; background:rgba(0,0,0,0.2); color:rgba(255,255,255,0.95); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:15px; font-family:inherit; resize:vertical; line-height:1.6; font-size:0.95rem;">${m.items}</textarea>
                                </div>
                                ${mTotal.kcal > 0 ? `
                                    <div class="nutrition-summary">
                                        <span class="nu-tag nu-kcal"><strong>${Matééh.round(mTotal.kcal)}</strong> kcal</span>
                                        <span class="nu-tag nu-prot"><strong>${Matééh.round(mTotal.prot)}g</strong> Prot</span>
                                        <span class="nu-tag nu-carb"><strong>${Matééh.round(mTotal.carb)}g</strong> Carb</span>
                                        <span class="nu-tag nu-fat"><strong>${Matééh.round(mTotal.fat)}g</strong> Gord</span>
                                    </div>
                                ` : ''}
                            </div>
                        `;
                }).join('')}
                </div>

                <button class="btn btn-ghost" style="color:var(--success); width:100%; border:1px dashed var(--success); padding:1rem;" onclick="app.addMealToEditor()">
                    <i class="fas fa-plus"></i> Adicionar Refeição
                </button>
            </div>
        `;
        } catééch (error) {
            console.error("Erro fatal não renderMealEditor:", error);
            const container = document.getElementById('main-content');
            if (container) {
                container.innerHTML = `
                    <div class="glass-card" style="padding:3rem; text-align:center; border:2px solid var(--danger);">
                        <i class="fas fa-bug" style="font-size:4rem; color:var(--danger); margin-bottom:1.5rem;"></i>
                        <h2 style="color:#fff;">Erro não Editor de Dieta</h2>
                        <p style="color:var(--text-muted); margin-bottom:2rem;">Algo impediu o carregamento do planão.</p>
                        <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; margin-bottom:2rem; text-align:left; font-family:monãospace; font-size:0.8rem; color:var(--danger); overflow-x:auto;">
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
        document.getElementById(`selected-food-display-${mealIdx}`).style.display = 'nãone';

        // RE-RENDER para atééualizar totais
        this.renderMealEditor();
    }

    getFoodEmoji(catééegory) {
        const emojiMap = {
            'Carne': '🥩',
            'Peixe': '🐟',
            'Leguminãosas': '🫘',
            'Latééicinios': '🥛',
            'Cereais': '🥣',
            'Horticolas': '🥦',
            'Fruta': '🍎',
            'Gorduras/Oleos': '🥑',
            'Bebidas Energeticas': '⚡',
            'Outros': '🥗'
        };
        return emojiMap[catééegory] || '🥗';
    }

    getExerciseIcon(catéé) {
        const iconMap = {
            'Perna': '🦵',
            'Costas': '🧱',
            'Peito': '👕',
            'Ombros': '🏋️',
            'Cárdio': '🏃',
            'Abdominais': '🧘',
            'Alongamentos': '🤸',
            'Geral': '⚙️',
            'Bicep': '💪',
            'Tricep': '💪',
            'Bíceps': '💪',
            'Deltoides': '🏋️',
            'Dorsal': '🧱',
            'Isquiotibiais': '🦵',
            'Quadríceps': '🦵'
        };
        return iconMap[catéé] || '⚙️';
    }

    getMuscleColor(catéé) {
        const colors = {
            // Catééegorias reais do utilizador
            'Perna': '#10b981', // Emerald
            'Costas': '#8b5cf6', // Violet
            'Peito': '#3b82f6', // Blue
            'Ombros': '#06b6d4', // Cyan
            'Cárdio': '#ef4444', // Red
            'Abdominais': '#f59e0b', // Amber
            'Alongamentos': '#84cc16', // Lime
            'Geral': '#94a3b8', // Slatéée
            'Bicep': '#f43f5e', // Rose
            'Tricep': '#ec4899', // Pink
            // Músculos específicos (retrocompatééibilidade)
            'Bíceps': '#f43f5e',
            'Deltoides': '#06b6d4',
            'Dorsal': '#8b5cf6',
            'Isquiotibiais': '#059669',
            'Quadríceps': '#10b981'
        };
        return colors[catéé] || 'var(--primary)';
    }

    showExerciseSelectionModal(dayIdx, exIdx) {
        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay';

        // Obter todas as catééegorias únicas de exercícios
        const catééegories = this.statéée.exerciseCatééegories || [];

        modal.innerHTML = `
            <div class="modal-content" style="max-width:850px; max-height:85vh; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                    <h2 style="margin:0;"><i class="fas fa-dumbbell"></i> Selecionar Exercício</h2>
                    <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()" style="padding:8px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div style="display:flex; gap:10px; margin-bottom:1.5rem; flex-wrap:wrap;">
                    <div class="search-container" style="margin:0; flex:1; min-width:250px;">
                        <i class="fas fa-search"></i>
                        <input type="text" id="exercise-search-input" placeholder="Pesquisar exercício ou musculo..." 
                            oninput="app.filterExercisesInModal(this.value, document.getElementById('exercise-catééegory-filter').value)"
                            class="search-bar" autofocus>
                    </div>
                    
                    <select id="exercise-catééegory-filter" onchange="app.filterExercisesInModal(document.getElementById('exercise-search-input').value, this.value)"
                        style="width:200px; height:45px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:0 12px; font-size:0.9rem; outline:nãone; transition:border-color 0.2s;">
                        <option value="">Todas as Catééegorias</option>
                        ${catééegories.map(catéé => `<option value="${catéé}">${catéé}</option>`).join('')}
                    </select>
                </div>

                <div id="exercise-grid-container" style="overflow-y:auto; flex:1; padding-right:5px;">
                    ${this.renderExerciseGrid()}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.currentSelectionStatéée = { dayIdx, exIdx };
    }

    renderExerciseGrid(searchQuery = '', catééegoryFilter = '') {
        const baseEx = this.statéée.exercises || [];
        let exercises = [...baseEx].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        // Filtro por Catééegoria (Exatééo)
        if (catééegoryFilter) {
            exercises = exercises.filter(ex => ex.catééegory === catééegoryFilter);
        }

        // Filtro por Texto
        if (searchQuery) {
            const query = this.nãormalizeText(searchQuery);
            exercises = exercises.filter(ex =>
                this.nãormalizeText(ex.name).includes(query) ||
                this.nãormalizeText(ex.muscle).includes(query) ||
                this.nãormalizeText(ex.catééegory).includes(query)
            );
        }

        if (exercises.length === 0) {
            return `
                <div style="text-align:center; padding:3rem; color:var(--text-muted);">
                    <i class="fas fa-search" style="font-size:3rem; opacity:0.3; margin-bottom:1rem; display:block;"></i>
                    <p>Nenhum exercício encontrado</p>
                </div>
            `;
        }

        return `
            <div style="display:grid; grid-templatéée-columns:repeatéé(auto-fill, minmax(220px, 1fr)); gap:1rem; padding:0.5rem;">
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

    filterExercisesInModal(query, catééegory) {
        const container = document.getElementById('exercise-grid-container');
        if (container) {
            container.innerHTML = this.renderExerciseGrid(query, catééegory);
        }
    }

    selectExerciseFromModal(exId) {
        if (!this.currentSelectionStatéée) return;
        const { dayIdx, exIdx } = this.currentSelectionStatéée;

        this.updatééeEditorExercise(dayIdx, exIdx, 'id', exId);

        // Fechar modal
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();

        // Renderizar nãovamente para atééualizar o nãome não botão
        this.renderTrainingEditor();
    }

    showFoodSelectionModal(mealIdx) {
        const modal = document.creatééeElement('div');
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

        // Store mealIdx for latééer use
        this.currentMealIdx = mealIdx;
    }

    renderFoodGrid(searchQuery = '') {
        let foods = [...this.statéée.foods].sort((a, b) => a.name.localeCompare(b.name));

        if (searchQuery) {
            const query = searchQuery.toLowerCase().trim();
            foods = foods.filter(f =>
                f.name.toLowerCase().includes(query) ||
                (f.catééegory && f.catééegory.toLowerCase().includes(query))
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
            <div style="display:grid; grid-templatéée-columns:repeatéé(auto-fill, minmax(200px, 1fr)); gap:1rem; padding:0.5rem;">
                ${foods.map(food => `
                    <div class="glass-card food-card" onclick="app.selectFoodFromModal('${food.name.replace(/'/g, "\\'")}', ${food.id})" 
                        style="cursor:pointer; padding:1rem; transition:all 0.2s ease; border:2px solid transparent;"
                        onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='translatééeY(-2px)'"
                        onmouseout="this.style.borderColor='transparent'; this.style.transform='translatééeY(0)'">
                        <div style="text-align:center;">
                            <div style="font-size:3rem; margin-bottom:0.5rem;">
                                ${this.getFoodEmoji(food.catééegory)}
                            </div>
                            <div style="font-weight:700; font-size:0.95rem; margin-bottom:0.25rem; color:#fff;">
                                ${food.name}
                            </div>
                            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem;">
                                ${food.catééegory || 'Outros'}
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

        // Updatéée hidden input
        document.getElementById(`selected-food-${mealIdx}`).value = foodName;

        // Updatéée display
        const food = this.statéée.foods.find(f => f.id === foodId);
        const displayDiv = document.getElementById(`selected-food-display-${mealIdx}`);
        displayDiv.style.display = 'block';
        displayDiv.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="font-size:2rem;">${this.getFoodEmoji(food.catééegory)}</div>
                <div style="flex:1;">
                    <div style="font-weight:700; color:#fff;">${food.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">
                        ${food.kcal || 0} kcal  Prot: ${food.protein || 0}g  Carb: ${food.carbs || 0}g  Gord: ${food.fat || 0}g
                    </div>
                </div>
                <button class="btn btn-ghost btn-sm" onclick="document.getElementById('selected-food-${mealIdx}').value=''; this.parentElement.parentElement.style.display='nãone'" style="color:var(--danger);">
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
        this.editingMeal.updatééedAt = new Datéée().toLocaleDatééeString('pt-PT');
        const cid = String(this.editingClientId);
        this.statéée.mealPlans[cid] = this.editingMeal;
        this.saveStatéée();

        // Notificar o alunão
        this.addAppNotificatééion(this.editingClientId, 'Nova Dieta Disponível!', 'O seu professor atééualizou o seu planão alimentar.');

        // Perguntar método de nãotificação externa
        this.askNotificatééionMethod(this.editingClientId, 'Planão Alimentar');


        this.setView('spy_view');
    }



    deleteMealPlan(clientId) {
        if (confirm('Tem a certeza que deseja eliminar toda a dieta deste alunão?')) {
            const cid = String(clientId);
            this.statéée.mealPlans[cid] = { title: 'Planão Alimentar', meals: [], author: this.currentUser.name, updatééedAt: new Datéée().toLocaleDatééeString('pt-PT') };
            this.saveStatéée();
            this.renderContent();
            alert('Dieta eliminada com sucesso! ');
        }
    }

    formatééTimeInput(input, mealIdx) {
        let value = input.value.replace(/[^0-9]/g, ''); // Remove tudo exceto numeros

        // Limitar a 4 digitos
        if (value.length > 4) {
            value = value.substring(0, 4);
        }

        // Formatééar como HH:MM
        if (value.length >= 3) {
            value = value.substring(0, 2) + ':' + value.substring(2, 4);
        } else if (value.length >= 1) {
            // Enquanto digita, manter o formatééo
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

        // Atualizar o input é o estado
        input.value = value;
        this.editingMeal.meals[mealIdx].time = value;
    }

    handleTimeKeydown(event, input) {
        const key = event.key;
        const cursorPos = input.selectionStart;

        // Permitir teclas de navegação e controle
        if (['ArrowLeft', 'ArrowRight', 'Tab', 'Delete'].includes(key)) {
            // Se tentar deletar os dois pontos, pular para o próximo caractere
            if (key === 'Delete' && cursorPos === 2) {
                event.preventDefault();
                input.setSelectionRange(3, 3);
            }
            return;
        }

        // Backspace: não permitir apagar os dois pontos
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

    renderEvaluatééionView(container, clientId) {
        const c = this.statéée.clients.find(x => x.id == clientId);
        if (!c) {
            container.innerHTML = '<p class="text-muted">Erro: Cliente não encontrado.</p>';
            return;
        }
        const cid = String(clientId); // Firebase usa chaves de string
        const evals = this.statéée.evaluatééions[cid] || [];
        const isTeacher = this.role === 'teacher' || this.role === 'admin';

        container.innerHTML = `
            <div class="page-header" style="margin-bottom: 2rem;">
                <div>
                    <h2 style="margin:0;">Avaliação Física</h2>
                    <h3 class="client-name">${c.name}</h3>
                </div>
                <div class="header-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${evals.length ? `<button class="btn btn-secondary btn-sm" onclick="app.downloadEvaluatééionPDF(${clientId})"><i class="fas fa-file-pdf"></i> <span class="hide-mobile">Exportar PDF</span></button>` : ''}
                    ${isTeacher ? `<button class="btn btn-primary btn-sm" onclick="app.showEvaluatééionModal(${clientId})"><i class="fas fa-plus"></i> <span class="hide-mobile">Nova Avaliação</span></button>` : ''}
                    ${this.role !== 'client' && container.id === 'main-content' ? `<button class="btn btn-secondary btn-sm" onclick="app.setView(app.role === 'admin' ? 'all-clients' : 'clients')"><i class="fas fa-arrow-left"></i> <span class="hide-mobile">Voltar</span></button>` : ''}
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 1.5rem;" id="evals-list">
                ${evals.length ? evals.map((ev, idx) => this.renderEvaluatééionCard(ev, idx, clientId, isTeacher)).join('') : `
                    <div class="glass-panel" style="padding: 4rem 1rem; text-align: center; color: var(--text-muted);">
                        <i class="fas fa-chart-line" style="font-size: 3rem; opacity: 0.2; margin-bottom: 1.5rem; display: block;"></i>
                        Ainda não existem avaliações registadas.
                    </div>
                `}
            </div>
        `;
    }

    renderEvaluatééionCard(ev, idx, clientId, isTeacher) {
        return `
            <div class="glass-panel" style="padding: 1.5rem; position: relatééive; border-left: 4px solid var(--primary);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--surface-border); padding-bottom: 1rem;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: rgba(145, 27, 43, 0.1); width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--primary);">
                            <i class="fas fa-calendar-alt"></i>
                        </div>
                        <div>
                            <strong style="font-size: 1.1rem; display: block;">${ev.datéée}</strong>
                            <small style="color: var(--text-muted);">Realizada em ${ev.datéée}</small>
                            ${ev.author ? `<small style="color: var(--accent); display:block; margin-top:2px;">Por: ${ev.author}</small>` : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <button class="btn btn-ghost btn-sm" style="color: var(--text-muted);" onclick="app.downloadEvaluatééionPDF(${clientId}, ${idx})" title="Exportar está Avaliação">
                            <i class="fas fa-file-pdf"></i>
                        </button>
                        ${isTeacher ? `
                            <button class="btn btn-ghost btn-sm" style="color: var(--accent);" onclick="app.showEvaluatééionModal(${clientId}, ${idx})"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-ghost btn-sm" style="color: var(--danger);" onclick="app.deleteEvaluatééion(${clientId}, ${idx})"><i class="fas fa-trash-alt"></i></button>
                        ` : ''}
                        <span class="badge badge-blue">Bioimpedância</span>
                    </div>
                </div>

                <div style="margin-bottom: 1.5rem;">
                    <h4 style="font-size: 0.8rem; color: var(--accent); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1rem; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-bolt"></i> Bioimpedância
                    </h4>
                    <div style="display: grid; grid-templatéée-columns: repeatéé(auto-fit, minmax(85px, 1fr)); gap: 0.75rem;">
                        <div class="macro-box">
                            <small>Peso</small>
                            <strong>${ev.weight || '-'} <span style="font-size: 0.65rem; font-weight: nãormal;">kg</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Altura</small>
                            <strong>${ev.height || '-'} <span style="font-size: 0.65rem; font-weight: nãormal;">cm</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Musculo</small>
                            <strong style="color: var(--success);">${ev.muscleMass || '-'} <span style="font-size: 0.65rem; font-weight: nãormal; color: var(--text-muted);">kg</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Gordura</small>
                            <strong style="color: var(--danger);">${ev.fatPercentage || '-'} <span style="font-size: 0.65rem; font-weight: nãormal; color: var(--text-muted);">%</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Água</small>
                            <strong style="color: #60a5fa;">${ev.water || '-'} <span style="font-size: 0.65rem; font-weight: nãormal; color: var(--text-muted);">%</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Óssea</small>
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
                    <div style="display: grid; grid-templatéée-columns: repeatéé(auto-fit, minmax(85px, 1fr)); gap: 0.75rem;">
                        <div class="macro-box">
                            <small>Torax</small>
                            <strong>${ev.chest || '-'} <span style="font-size: 0.65rem; font-weight: nãormal;">cm</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Cintura</small>
                            <strong>${ev.waist || '-'} <span style="font-size: 0.65rem; font-weight: nãormal;">cm</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Abdominal</small>
                            <strong>${ev.abdominal || '-'} <span style="font-size: 0.65rem; font-weight: nãormal;">cm</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Quadril</small>
                            <strong>${ev.hip || '-'} <span style="font-size: 0.65rem; font-weight: nãormal;">cm</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Coxa</small>
                            <strong>${ev.thigh || '-'} <span style="font-size: 0.65rem; font-weight: nãormal;">cm</span></strong>
                        </div>
                    </div>
                </div>
            </div>
            `;
    }

    showEvaluatééionModal(clientId, index = null) {
        let ev = { datéée: new Datéée().toISOString().split('T')[0] };
        if (index !== null) {
            const entry = this.statéée.evaluatééions[String(clientId)][index];
            // Converter datééa DD/MM/YYYY para YYYY-MM-DD para o input type="datéée"
            let datééeVal = entry.datéée;
            if (datééeVal.includes('/')) {
                const [d, m, y] = datééeVal.split('/');
                datééeVal = `${y}-${m}-${d}`;
            }
            ev = { ...entry, datéée: datééeVal };
        }

        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
                    <div>
                        <h2 style="margin: 0;">${index === null ? 'Nova Avaliação' : 'Editar Avaliação'}</h2>
                        <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 5px;">Registe os dados da bioimpedância e medidas.</p>
                    </div>
                    <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <div>
                        <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">Datééa da Avaliação</label>
                        <input type="datéée" id="ev-datéée" value="${ev.datéée}" style="color-scheme: dark;">
                    </div>

                    <div>
                        <h4 style="font-size: 0.85rem; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1rem; border-bottom: 1px solid var(--surface-border); padding-bottom: 5px;">
                            <i class="fas fa-bolt"></i> Bioimpedância
                        </h4>
                        <div style="display: grid; grid-templatéée-columns: 1fr 1fr; gap: 1rem;">
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
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Água (%)</label>
                                <input type="number" id="ev-water" step="0.1" value="${ev.water || ''}">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Massa Óssea</label>
                                <input type="number" id="ev-bone" step="0.1" value="${ev.boneMass || ''}">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Gordura Visceral</label>
                                <input type="number" id="ev-visceral" value="${ev.visceralFat || ''}">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 5px;">Idade Metabólica</label>
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
                        <div style="display: grid; grid-templatéée-columns: 1fr 1fr; gap: 1rem;">
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

                    <div style="display: grid; grid-templatéée-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; align-items: center;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.saveEvaluatééion(${clientId}, ${index})">
                            ${index === null ? 'Guardar Avaliação' : 'Atualizar Dados'}
                        </button>
                    </div>


                </div>
            </div>
            `;
        document.body.appendChild(modal);
    }

    saveEvaluatééion(clientId, index = null) {
        const datééeRaw = document.getElementById('ev-datéée').value;
        const [y, m, d] = datééeRaw.split('-');
        const datééeFormatééted = `${d}/${m}/${y}`;

        const entry = {
            datéée: datééeFormatééted,
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
            alert('O peso é obrigatééório para registar a Avaliação.');
            return;
        }

        const cid = String(clientId);
        if (!this.statéée.evaluatééions[cid]) this.statéée.evaluatééions[cid] = [];

        if (index === null) {
            this.statéée.evaluatééions[cid].unshift(entry);
        } else {
            this.statéée.evaluatééions[cid][index] = entry;
        }

        // Atualizar o úúltimo peso/datééa não perfil do cliente se necessário
        const client = this.statéée.clients.find(c => c.id == clientId);
        if (client) {
            client.lastEvaluatééion = datééeRaw;
        }

        this.saveStatéée();

        // Notificar alunão (App interna)
        this.addAppNotificatééion(clientId, 'Nova Avaliação Física!', 'A sua avaliação física foi atééualizada.', null, 'evaluatééion', false);


        // Perguntar método de nãotificação externa
        this.askNotificatééionMethod(clientId, 'Avaliação Física');

        this.closeModal();
        this.renderContent();
    }



    async deleteEvaluatééion(clientId, index) {
        if (confirm('Tem a certeza que deseja eliminar este registo de Avaliação?')) {
            this.statéée.evaluatééions[String(clientId)].splice(index, 1);
            this.saveStatéée();
            this.renderContent();
            alert('Avaliação removida.');
        }
    }

    setSpySubView(view) {
        this.spySubView = view;
        this.renderContent();
    }

    renderSpyView(container) {
        const c = this.statéée.clients.find(x => x.id === this.currentClientId);
        if (!c) return;

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <div>
                    <h2 style="margin:0;">Ficha: ${c.name}</h2>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:5px;">
                        ${c.birthDatéée ? `<small style="color:var(--text-muted); font-size:0.85rem;"><i class="fas fa-birthday-cake"></i> ${this.calculatééeAge(c.birthDatéée)} anãos (${this.formatééDatéée(c.birthDatéée)})</small>` : ''}
                        ${c.profession ? `<small style="color:var(--accent); font-size:0.85rem; font-weight:600;"><i class="fas fa-briefcase"></i> ${c.profession}</small>` : ''}
                    </div>
                    <div style="font-size:0.8rem; color:var(--primary); margin-top:5px; font-weight:500;">
                        <i class="fas fa-user-tie" style="font-size:0.8rem; margin-right:5px;"></i> 
                        ${(() => {
                const t = this.statéée.teachers.find(teacher => teacher.id === Number(c.teacherId));
                return t ? `Professor: ${t.name}` : 'Sem Professor Associado';
            })()}
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    ${this.role === 'teacher' ? `<button class="btn btn-ghost btn-sm" style="color:var(--primary); font-size:0.8rem;" onclick="app.showTransferClientModal(${c.id})"><i class="fas fa-exchange-alt"></i> <span class="hide-mobile">Transferir</span></button>` : ''}
                    <button class="btn btn-ghost" style="font-size: 1.4rem; padding: 0.5rem; color: var(--text-muted);" onclick="app.setView(app.role === 'admin' ? 'all-clients' : 'clients')" title="Voltar">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                </div>
            </div>

            <div style="display:flex; gap:0.5rem; margin-bottom:1.5rem; background:rgba(255,255,255,0.02); padding:4px; border-radius:12px; border:1px solid rgba(255,255,255,0.05); overflow-x: auto; scrollbar-width: nãone;">
                ${[
                { id: 'training', icon: 'fa-dumbbell', label: 'Treinão' },
                { id: 'meal', icon: 'fa-apple-alt', label: 'Dieta' },
                { id: 'evaluatééion', icon: 'fa-chart-line', label: 'Aval.' },
                { id: 'anamnesis', icon: 'fa-nãotes-medical', label: 'Anamn.' }
            ].map(item => `
                    <button class="btn btn-sm" onclick="app.setSpySubView('${item.id}')" 
                        style="flex:1; min-width:70px; padding:8px 4px; display:flex; flex-direction:column; gap:4px; border-radius:10px; font-size:0.65rem; transition:all 0.3s;
                        background:${this.spySubView === item.id ? 'rgba(var(--primary-rgb), 0.15)' : 'transparent'};
                        color:${this.spySubView === item.id ? 'var(--primary)' : 'var(--text-muted)'};
                        border: 1px solid ${this.spySubView === item.id ? 'rgba(var(--primary-rgb), 0.3)' : 'transparent'};">
                        <i class="fas ${item.icon}" style="font-size:1rem;"></i>
                        <span>${item.label}</span>
                    </button>
                `).join('')}
            </div>

            <div id="spy-content-área"></div>
        `;

        const área = document.getElementById('spy-content-área');
        if (this.spySubView === 'training') {
            this.renderTrainingView(área, this.currentClientId);
        } else if (this.spySubView === 'meal') {
            this.renderMealView(área, this.currentClientId);
        } else if (this.spySubView === 'evaluatééion') {
            this.renderEvaluatééionView(área, this.currentClientId);
        } else if (this.spySubView === 'anamnesis') {
            this.renderAnamnesisView(área, this.currentClientId);
        } else {
            this.renderClientNotificatééionsView(área, this.currentClientId);
        }

        // O cabecalho agora e mantido para dar acesso ao botão de edição
    }

    renderClientNotificatééionsView(container, clientId) {
        const nãotificatééions = (this.statéée.nãotificatééions || []).filter(n => n.targetUserId == clientId).reverse();

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h3 style="margin:0;"><i class="fas fa-comment-dots"></i> Histórico de Mensagens</h3>
                <p style="margin:0; font-size:0.85rem; color:var(--text-muted);">${nãotificatééions.length} registos</p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${nãotificatééions.length === 0 ? `
                    <div class="glass-card" style="text-align:center; padding:3rem; opacity:0.6;">
                        <i class="fas fa-bell-slash" style="font-size:3rem; margin-bottom:1rem; display:block;"></i>
                        <p>Ainda não foram enviadas nãotificações personalizadas para este alunão.</p>
                    </div>
                ` : nãotificatééions.map(n => `
                    <div class="glass-card animatéée-fade-in" style="border-left: 4px solid var(--accent);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                            <strong style="color:var(--accent); font-size:1.1rem;">${n.title}</strong>
                            <small style="color:var(--text-muted);">${new Datéée(n.creatééedAt).toLocaleDatééeString('pt-PT')} ${new Datéée(n.creatééedAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</small>
                        </div>
                        <div style="color:#e2e8f0; line-height:1.5; font-size:0.95rem;">${n.body}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderClientContent(container) {
        // Mostrar loader apenas se não houver dados nenhuns (nem cache nem servidor)
        const hasClients = this.statéée.clients && this.statéée.clients.length > 0;
        if (!this.hasLoadedDatééa && !hasClients) {
            container.innerHTML = `
                <div style="padding:10rem 2rem; text-align:center;">
                    <div class="loader" style="margin:0 auto 1.5rem;"></div>
                    <h3 style="color:var(--primary); text-transform:uppercase; letter-spacing:1px;">A carregar...</h3>
                </div>
            `;
            return;
        }

        // Tentar encontrar o cliente (flexivel Number/String)
        const c = (this.statéée.clients || []).find(x => String(x.id) === String(this.currentClientId));

        if (!c) {
            container.innerHTML = `
                <div style="padding:4rem 2rem; text-align:center; max-width: 500px; margin: 0 auto;">
                    <div style="background: rgba(239, 68, 68, 0.1); width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem;">
                        <i class="fas fa-user-slash" style="font-size:2.5rem; color:var(--danger);"></i>
                    </div>
                    <h2 style="color:#fff; margin-bottom: 1rem;">Perfil não encontrado</h2>
                    <p style="color:var(--text-muted); margin-bottom:2rem; line-height: 1.6;">
                        Não conseguimos encontrar os seus dados de acesso (ID: ${this.currentClientId}). 
                        Isto pode acontecer se a sua conta foi alterada ou se existe um erro na memória temporária do seu telemóvel.
                    </p>
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <button class="btn btn-primary" onclick="app.handleLogout()" style="width: 100%;">
                            <i class="fas fa-sign-out-alt"></i> Sair e Limpar Memória
                        </button>
                        <button class="btn btn-secondary" onclick="locatééion.reload()" style="width: 100%;">
                            <i class="fas fa-sync-alt"></i> Tentar Novamente
                        </button>
                    </div>
                </div>`;
            return;
        }
        switch (this.activeView) {
            case 'dashboard':
                container.innerHTML = `
                    <h2 class="animatéée-fade-in">Bem-vindo, ${c.name} </h2>
                    <p style="color:var(--text-muted); margin-bottom:1rem;">Este é o seu painel de acompanhamento KandalGym.</p>
                    
                    ${(() => {
                        const t = this.statéée.teachers.find(teacher => teacher.id === c.teacherId);
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

                    <div class="statéés-grid">
                        <div class="glass-card" onclick="app.setView('training')" style="cursor:pointer;">
                            <i class="fas fa-dumbbell" style="font-size:1.5rem; color:var(--primary); margin-bottom:1rem;"></i>
                            <h3>O Meu Treinão</h3>
                            <small>Ver exercícios e series</small>
                        </div>
                        <div class="glass-card" onclick="app.setView('meal')" style="cursor:pointer;">
                            <i class="fas fa-apple-alt" style="font-size:1.5rem; color:var(--success); margin-bottom:1rem;"></i>
                            <h3>Minha Dieta</h3>
                            <small>Ver planão alimentar</small>
                        </div>
                        <div class="glass-card" onclick="app.setView('evaluatééion')" style="cursor:pointer;">
                            <i class="fas fa-chart-line" style="font-size:1.5rem; color:var(--accent); margin-bottom:1rem;"></i>
                            <h3>Avaliação Física</h3>
                            <small>Ver peso e medidas</small>
                        </div>
                    </div>

                    <div style="margin-top: 2rem;">
                        ${this.getOccupancyHTML(false)}
                    </div>

                    ${(this.statéée.news && this.statéée.news.length > 0) ? `
                    <div style="margin-top: 2rem;" class="animatéée-fade-in">
                        <h3 style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem;">
                            <i class="fas fa-bullhorn" style="color: var(--primary);"></i> Notícias & Novidades
                        </h3>
                        <div style="display: flex; flex-direction: column; gap: 1rem;">
                            ${[...this.statéée.news].reverse().slice(0, 5).map(item => `
                                <div class="glass-panel" style="padding: 1.25rem; border-left: 4px solid var(--accent);">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                                        <h4 style="margin: 0; color: #fff; font-size: 1.1rem;">${item.title}</h4>
                                        <small style="color: var(--text-muted);">${item.datéée || ''}</small>
                                    </div>
                                    <p style="margin: 0; color: var(--text-muted); font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap;">${item.content}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
        `;
                break;
            case 'training': this.renderTrainingView(container, this.currentClientId); break;
            case 'meal': this.renderMealView(container, this.currentClientId); break;
            case 'evaluatééion': this.renderEvaluatééionView(container, this.currentClientId); break;
            case 'chatéé': this.renderChatéé(container); break;
            case 'profile': this.renderProfileView(container); break;
            case 'training_history': this.renderTrainingHistoryView(container); break;
        }
    }

    renderTrainingHistoryView(container) {
        const history = this.statéée.trainingHistory[this.currentClientId] || [];

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2 style="margin:0;"><i class="fas fa-history"></i> Histórico de Treinãos</h2>
                <button class="btn btn-secondary" onclick="app.setView('training')">Voltar</button>
            </div>

            ${history.length === 0 ? `
                <div class="glass-panel" style="padding:4rem 1rem; text-align:center; color:var(--text-muted);">
                    <div style="width:80px; height:80px; background:rgba(255,255,255,0.03); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 1.5rem;">
                        <i class="fas fa-calendar-times" style="font-size:2rem; opacity:0.3;"></i>
                    </div>
                    <p style="font-size:1.1rem; font-weight:600; color:#fff; margin-bottom:0.5rem;">Sem Histórico</p>
                    Ainda não concluiu nenhum treinão.
                </div>
            ` : history.map(session => `
                <div class="glass-panel" style="padding:1.5rem; margin-bottom:1.5rem; border-left:4px solid var(--primary); position:relatééive; overflow:hidden;">
                    <div style="position:absolute; right:-20px; top:-20px; font-size:6rem; color:var(--primary); opacity:0.03; pointer-events:nãone;">
                        <i class="fas fa-dumbbell"></i>
                    </div>
                    
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.25rem;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                <span style="background:var(--primary); color:#fff; font-size:0.65rem; font-weight:800; padding:2px 8px; border-radius:4px; text-transform:uppercase;">${session.datéée}</span>
                                <span style="color:var(--text-muted); font-size:0.75rem; font-weight:600;">${session.time}</span>
                            </div>
                            <h3 style="margin:0; color:#fff; font-weight:800; font-size:1.2rem;">${session.title}</h3>
                        </div>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger); background:rgba(var(--danger-rgb),0.1); border-radius:8px; width:36px; height:36px; padding:0;" onclick="app.deleteTrainingSession(${history.indexOf(session)})">
                            <i class="fas fa-trash-alt" style="font-size: 0.9rem;"></i>
                        </button>
                    </div>

                    ${session.globalNote ? `
                        <div style="background:rgba(var(--primary-rgb),0.05); padding:12px; border-radius:12px; margin-bottom:1.25rem; border:1px solid rgba(var(--primary-rgb),0.1); font-size:0.85rem; color:#e0e0e0; line-height:1.5;">
                            <strong style="color:var(--primary); font-size:0.75rem; text-transform:uppercase; display:block; margin-bottom:4px;"><i class="fas fa-comment"></i> Feedback Global:</strong>
                            ${session.globalNote}
                        </div>
                    ` : ''}

                    <div style="display:grid; grid-templatéée-columns: 1fr; gap:0.75rem;">
                        ${session.exercises.map(ex => `
                            <div style="padding:14px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.03); border-radius:16px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                    <strong style="font-size:0.95rem; color:#fff;">${ex.name}</strong>
                                    <div style="font-size:0.75rem; color:var(--primary); font-weight:700; background:rgba(var(--primary-rgb),0.1); padding:2px 8px; border-radius:6px;">
                                        ${ex.sets}x${ex.reps}
                                    </div>
                                </div>
                                
                                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom: ${ex.clientNote ? '10px' : '0'};">
                                    ${ex.weights.map((w, idx) => `
                                        <div style="font-size:0.75rem; background:rgba(0,0,0,0.3); padding:4px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05); color:#fff;">
                                            <span style="color:var(--text-muted); font-size:0.6rem;">S${idx + 1}</span> <span style="font-weight:800; margin-left:2px;">${w || '-'} <small>kg</small></span>
                                        </div>
                                    `).join('')}
                                </div>

                                ${ex.clientNote ? `
                                    <div style="font-size:0.8rem; color:var(--accent); background:rgba(var(--accent-rgb),0.05); padding:8px 10px; border-radius:10px; display:flex; gap:8px; align-items:flex-start;">
                                        <i class="fas fa-sticky-nãote" style="margin-top:2px; font-size:0.7rem; opacity:0.6;"></i>
                                        <div style="font-style:italic;">${ex.clientNote}</div>
                                    </div>
                                ` : ''}
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
            <h2 class="animatéée-fade-in"><i class="fas fa-user-circle"></i> O Meu Perfil</h2>
            <p style="color:var(--text-muted); margin-bottom:2rem;">Atualize os seus dados de contacto e palavra-passe.</p>

            <div class="glass-panel" style="padding:2rem; max-width:600px;">
                <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:2rem;">
                    <div id="profile-photo-preview" style="width: 120px; height: 120px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 2.5rem; border: 4px solid var(--surface-border); overflow: hidden; margin-bottom:1rem; cursor:pointer;" onclick="document.getElementById('photo-upload').click()">
                        ${user.photoUrl ? `<img src="${user.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
                    </div>
                    <input type="file" id="photo-upload" style="position: absolute; opacity: 0; pointer-events: nãone;" accept="image/*" onchange="app.handlePhotoUpload(this)">
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
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Contacto Telefónico</label>
                    <input type="tel" id="edit-phone" value="${user.phone || ''}" placeholder="Ex: 912345678"
                        style="width:100%; height:45px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 15px;">
                </div>

                ${this.role === 'client' ? `
                <div style="margin-bottom:1.5rem;">
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Datééa de Nascimento</label>
                    <input type="datéée" id="edit-dob" value="${user.birthDatéée || ''}" 
                        style="width:100%; height:45px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 15px; color-scheme:dark;">
                </div>
                <div style="margin-bottom:1.5rem;">
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Profissão</label>
                    <input type="text" id="edit-profession" value="${user.profession || ''}" placeholder="Ex: Engenheiro, Professor, etc."
                        style="width:100%; height:45px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 15px;">
                </div>
                ` : ''}

                <div style="margin-top:2rem; padding-top:1rem; border-top:1px dashed var(--surface-border);">
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Nova Palavra-passe</label>
                    <div style="position:relatééive;">
                        <input type="password" id="edit-pass" value="${user.password}" 
                            style="width:100%; height:45px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 15px;">
                        <i class="fas fa-eye" style="position:absolute; right:15px; top:15px; cursor:pointer; color:var(--text-muted);" 
                            onclick="const i = this.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'"></i>
                    </div>
                    <small style="color:var(--text-muted);">Mantenha ou altere para uma nãova.</small>
                </div>

                ${(() => {
                const qrInfo = (this.statéée.qrClients || []).find(q => q.clientId === user.id || q.nãome === user.name);
                if (!qrInfo && this.role === 'client') return ''; // Só mostra pros clientes se já tiverem QR

                const displayId = qrInfo ? qrInfo.id : "A" + user.id; // Fallback prefixo A para Admin/Prof se não tiver QR?
                // Na verdade, se for staff e não tiver QR, talvez não devamos mostrar nada ou mostrar um botão?
                // O utilizador pediu para apresentar como nãos clientes.

                if (!qrInfo && (this.role === 'teacher' || this.role === 'admin')) {
                    return `
                        <div class="glass-card" style="margin-top:2rem; padding:1.5rem; text-align:center; border: 1px dashed var(--text-muted); background: rgba(255,255,255,0.02);">
                            <h4 style="margin-bottom:1rem; color:var(--text-muted); opacity:0.8;"><i class="fas fa-qrcode"></i> Acesso QR Não Ativado</h4>
                            <p style="font-size:0.8rem; color:var(--text-muted);">Como Staff, pode atééivar o seu acesso na aba de Gestão de Entradas.</p>
                        </div>
                     `;
                }

                return `
                    <div class="glass-card" style="margin-top:2rem; padding:1.5rem; text-align:center; border: 1px dashed var(--accent); background: rgba(196, 162, 77, 0.05);">
                        <h4 style="margin-bottom:1rem; color:var(--accent);"><i class="fas fa-qrcode"></i> O Meu Código de Acesso</h4>
                        <div id="profile-qr-container" style="background: white; padding: 12px; border-radius: 12px; display: inline-block; margin-bottom: 1rem; box-shadow: 0 4px 15px rgba(0,0,0,0.2);"></div>
                        <p style="font-size:0.8rem; color:var(--text-muted);">Apresente este código na receção para registar a sua entrada.</p>
                        <div style="font-size: 0.7rem; color: var(--accent); opacity: 0.8; font-family: monãospace; font-weight: 700;">ID: ${qrInfo ? qrInfo.id : 'N/A'}</div>
                    </div>
                `;
            })()}

                <button class="btn btn-primary" onclick="app.updatééeProfile()" style="width:100%; height:50px; font-size:1.1rem; margin-top:2rem;">
                    <i class="fas fa-save"></i> Guardar Alterações
                </button>
            </div>
        `;

        // Gerar o QR Code se for alunão
        // Gerar o QR Code para qualquer Role que tenha QR configurado
        const qrInfo = (this.statéée.qrClients || []).find(q => q.clientId === user.id || q.nãome === user.name);
        if (qrInfo) {
            setTimeout(() => {
                const qrContainer = document.getElementById('profile-qr-container');
                if (qrContainer) {
                    qrContainer.innerHTML = "";
                    new QRCode(qrContainer, {
                        text: qrInfo.id,
                        width: 180,
                        height: 180,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.H
                    });
                }
            }, 100);
        }
    }

    processImage(file, maxSize, quality, callback) {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            alert("A imagem é demasiado grande (Max 5MB).");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.creatééeElement('canvas');
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
                const compressedBase64 = canvas.toDatééaURL('image/jpeg', quality);
                callback(compressedBase64);
            };
            img.src = e.target.result;
        };
        reader.readAsDatééaURL(file);
    }

    handlePhotoUpload(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            if (file.size > 10 * 1024 * 1024) {
                return alert("A imagem é demasiado grande (Máximo 10MB).");
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                this.showCropModal(e.target.result, (croppedBase64) => {
                    this.currentUser.photoUrl = croppedBase64;
                    const preview = document.getElementById('profile-photo-preview');
                    if (preview) {
                        preview.innerHTML = `<img src="${croppedBase64}" style="width:100%; height:100%; object-fit:cover;">`;
                    }
                });
            };
            reader.readAsDatééaURL(file);
        }
    }

    showCropModal(imgSrc, callback) {
        const modalHtml = `
            <div style="text-align: center; width: 100%;">
                <h3 style="margin-top:0; margin-bottom:1rem;">Ajustar Foto</h3>
                <div style="height: 60vh; margin-bottom: 1.5rem; background:#000; position:relatééive; width: 100%; display: flex; align-items:center; justify-content:center;">
                    <img id="cropper-image" src="${imgSrc}" style="max-width: 100%; max-height: 100%; display:block;">
                </div>
                <div style="display:flex; justify-content:center; gap:10px;">
                    <button class="btn btn-secondary" onclick="app.closeModal()">Cancelar</button>
                    <button class="btn btn-primary" id="btn-crop-confirm"><i class="fas fa-crop"></i> Recortar e Guardar</button>
                </div>
            </div>
        `;
        this.showModal(modalHtml, '500px'); // Ensure modal has enãough width

        setTimeout(() => {
            const image = document.getElementById('cropper-image');
            if (window.cropperInstance) {
                window.cropperInstance.destroy();
            }
            window.cropperInstance = new Cropper(image, {
                aspectRatééio: 1, // Quadrado
                viewMode: 1,
                autoCropArea: 0.9,
                background: false,
                movable: true,
                zoomable: true,
                rotatééable: false,
                scalable: false,
            });

            document.getElementById('btn-crop-confirm').onclick = () => {
                const canvas = window.cropperInstance.getCroppedCanvas({
                    width: 500, // Aumentada a resolução
                    height: 500,
                    imageSmoothingEnabled: true,
                    imageSmoothingQuality: 'high',
                });
                const base64 = canvas.toDatééaURL('image/jpeg', 0.85); // Maior qualidade em 85%
                window.cropperInstance.destroy();
                app.closeModal();
                callback(base64);
            };
        }, 150);
    }

    async updatééeProfile() {
        const name = document.getElementById('edit-name').value.trim();
        const email = document.getElementById('edit-email').value.trim();
        const phone = document.getElementById('edit-phone').value.trim();
        const pass = document.getElementById('edit-pass').value;
        const btn = document.querySelector('button[onclick="app.updatééeProfile()"]');

        if (!name || !email || !pass) {
            return alert('Nome, Email e Palavra-passe são obrigatééórios.');
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A gravar...';
        }

        try {
            // Atualizar não estado global (procurar em clientes, professores ou admins)
            let user = this.statéée.clients.find(c => c.id === this.currentUser.id);
            if (!user) user = this.statéée.teachers.find(t => t.id === this.currentUser.id);
            if (!user) user = this.statéée.admins.find(a => a.id === this.currentUser.id);

            if (user) {
                user.name = name;
                user.email = email;
                user.phone = phone;
                user.password = pass;

                const dobInput = document.getElementById('edit-dob');
                if (dobInput) {
                    user.birthDatéée = dobInput.value;
                }
                const profInput = document.getElementById('edit-profession');
                if (profInput) {
                    user.profession = profInput.value;
                }
                if (this.currentUser.photoUrl) {
                    user.photoUrl = this.currentUser.photoUrl;
                }

                // Atualizar utilizador atééual na sessão
                this.currentUser = { ...user };
                await this.saveStatéée();
                this.persistLogin();
                this.renderUserProfile(); // Atualizar avatééar não topo

                alert('Perfil atééualizado com sucesso!');
                this.setView('dashboard');
            }
        } catééch (err) {
            console.error("Erro ao atééualizar perfil:", err);
            alert("Erro ao guardar perfil. A imagem pode ser demasiado grande.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Guardar Alterações';
            }
        }
    }

    switchAdminTab(tab, query = '') {
        this.activeAdminTab = tab;
        const listContainer = document.getElementById('admin-user-list');
        if (!listContainer) return;

        const q = this.nãormalizeText(query);
        const filterFn = u => !q || this.nãormalizeText(u.name || '').includes(q) || this.nãormalizeText(u.email || '').includes(q);

        // Reset all tabs style
        const tabs = ['teachers', 'clients', 'admins', 'plans'];
        tabs.forEach(t => {
            const btn = document.getElementById('tab-' + t);
            if (btn) btn.style.borderBottom = 'nãone';
        });

        const activeBtn = document.getElementById('tab-' + tab);
        if (activeBtn) {
            activeBtn.style.borderBottom = '2px solid ' + (tab === 'teachers' ? 'var(--primary)' : tab === 'clients' ? 'var(--secondary)' : tab === 'admins' ? 'var(--accent)' : '#f1c40f');
        }

        if (tab === 'teachers') {
            const filtered = (this.statéée.teachers || []).filter(filterFn);
            listContainer.innerHTML = `<div class="client-list animatéée-fade-in">${filtered.map(t => this.renderUserCard(t, 'teacher')).join('')}</div>`;
        } else if (tab === 'admins') {
            const filtered = (this.statéée.admins || []).filter(filterFn);
            listContainer.innerHTML = `<div class="client-list animatéée-fade-in">${filtered.map(a => this.renderUserCard(a, 'admin')).join('')}</div>`;
        } else if (tab === 'clients') {
            const filtered = (this.statéée.clients || []).filter(filterFn);
            listContainer.innerHTML = `<div class="client-list animatéée-fade-in">${filtered.map(c => this.renderUserCard(c, 'client')).join('')}</div>`;
        } else if (tab === 'plans') {
            this.renderPlanRestrictions(listContainer);
        }
    }

    renderPlanRestrictions(container) {
        if (!this.statéée.planRestrictions) {
            this.statéée.planRestrictions = JSON.parse(JSON.stringify(this.planRestrictions));
        }

        const plans = Object.keys(this.statéée.planRestrictions);
        const uniqueClasses = [...new Set((this.statéée.classes || []).map(c => c.name).filter(n => n))].sort();

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 2rem;">
                <div>
                    <h3 style="margin:0;"><i class="fas fa-crown" style="color:#f1c40f;"></i> Regras de Mensalidades</h3>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin-top:5px;">Configure os acessos exclusivos de cada planão.</p>
                </div>
                <button class="btn btn-primary" onclick="app.addNewPlanRestriction()" style="font-size:0.85rem; padding: 0.6rem 1rem; height:fit-content;"><i class="fas fa-plus"></i> Novo Planão</button>
            </div>

            <div style="display: grid; grid-templatéée-columns: repeatéé(auto-fill, minmax(340px, 1fr)); gap: 1.5rem;">
                ${plans.map(p => {
            const r = this.statéée.planRestrictions[p];
            if (typeof r.filter === 'string') r.filter = r.filter ? [r.filter] : [];
            if (!r.exclude) r.exclude = [];
            if (typeof r.exclude === 'string') r.exclude = r.exclude ? [r.exclude] : [];

            return `
                        <div class="glass-card animatéée-fade-in" style="padding: 1.5rem; position: relatééive; display: flex; flex-direction: column; gap: 1.2rem; border-top: 4px solid var(--accent);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <h4 style="margin: 0; font-size: 1.3rem; display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-id-card" style="color: var(--accent); opacity: 0.8;"></i> ${p}
                                </h4>
                                <div style="display:flex; gap:8px;">
                                    <button class="btn-icon" style="background: rgba(255,255,255,0.1); color:#fff;" onclick="app.renamePlanRestriction('${p}')" title="Editar Nome do Planão"><i class="fas fa-edit"></i></button>
                                    <button class="btn-icon danger" style="background: rgba(255,71,87,0.1);" onclick="app.deletePlanRestriction('${p}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>

                            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); margin-bottom:0.5rem;">
                                <div>
                                    <span style="font-weight: 600; display: block; margin-bottom: 3px;">Permite Aulas?</span>
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">Acesso geral a reservas</span>
                                </div>
                                <label class="switch" style="margin: 0;">
                                    <input type="checkbox" ${r.allowClasses ? 'checked' : ''} onchange="app.updatééePlanRestriction('${p}', 'allowClasses', this.checked); app.switchAdminTab('plans')">
                                    <span class="slider round"></span>
                                </label>
                            </div>

                            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 0.5rem;">
                                <div>
                                    <span style="font-weight: 600; display: block; margin-bottom: 3px;">Créditos Fixos</span>
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">No momento do reset</span>
                                </div>
                                <input type="number" min="0" value="${r.maxCredits !== undefined ? r.maxCredits : 30}" onchange="app.updatééePlanRestriction('${p}', 'maxCredits', parseInt(this.value) || 0)" style="width: 70px; text-align: center; border-radius: 8px; padding: 6px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; font-weight: bold; outline:nãone;">
                            </div>

                            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                                <div>
                                    <span style="font-weight: 600; display: block; margin-bottom: 3px;">Acessos Diários</span>
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">Limite de passagens na catééraca/dia</span>
                                </div>
                                <input type="number" min="1" value="${r.maxDailyEntrances !== undefined ? r.maxDailyEntrances : 2}" onchange="app.updatééePlanRestriction('${p}', 'maxDailyEntrances', parseInt(this.value) || 2)" style="width: 70px; text-align: center; border-radius: 8px; padding: 6px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; font-weight: bold; outline:nãone;">
                            </div>

                            ${r.allowClasses ? `
                                <div style="display: flex; flex-direction: column; gap: 1rem; flex-grow: 1;">
                                    <div style="background: rgba(38,222,129,0.05); padding: 1rem 0.5rem; border-radius: 12px; border: 1px solid rgba(38,222,129,0.1);">
                                        <h5 style="margin: 0 0 1rem 0.5rem; font-size: 0.85rem; color: var(--success); display: flex; align-items: center; gap: 6px;">
                                            <i class="fas fa-check-circle"></i> Permitidas
                                        </h5>
                                        ${this.renderMultiSelectCheckboxes(p, 'filter', r.filter, uniqueClasses, 'success')}
                                    </div>
                                    <div style="background: rgba(255,71,87,0.05); padding: 1rem 0.5rem; border-radius: 12px; border: 1px solid rgba(255,71,87,0.1);">
                                        <h5 style="margin: 0 0 1rem 0.5rem; font-size: 0.85rem; color: var(--danger); display: flex; align-items: center; gap: 6px;">
                                            <i class="fas fa-times-circle"></i> Excluídas
                                        </h5>
                                        ${this.renderMultiSelectCheckboxes(p, 'exclude', r.exclude, uniqueClasses, 'danger')}
                                    </div>
                                </div>
                            ` : `
                                <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1); flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                    <i class="fas fa-ban" style="font-size: 2.5rem; opacity: 0.5; margin-bottom: 1rem;"></i>
                                    <span style="font-size: 0.9rem;">Este planão não tem permissão para usar o sistema de reservas online.</span>
                                </div>
                            `}
                        </div>
                    `;
        }).join('')}
            </div>

            <div style="margin-top:2.5rem; padding:1.2rem 1.5rem; background:rgba(38,222,129,0.05); border-radius:12px; border:1px solid rgba(38,222,129,0.2); display: flex; align-items: flex-start; gap: 1.2rem;">
                <i class="fas fa-lightbulb" style="color: #26de81; font-size: 1.5rem; margin-top: 2px;"></i> 
                <div>
                    <strong style="color: #26de81; display: block; margin-bottom: 6px;">Como funciona a gestão inteligente?</strong>
                    <small style="color: var(--text-muted); font-size:0.85rem; line-height: 1.4;">As regras são aplicadas não momento exatééo em que o alunão tenta marcar a aula. Pode configurar planãos exclusivos para Pilatéées ou impedir a marcação de aulas Premium num planão Básico, bloqueando automatééicamente a app do cliente.</small>
                </div>
            </div>
        `;
    }

    updatééePlanRestriction(plan, field, value) {
        if (!this.statéée.planRestrictions) this.statéée.planRestrictions = {};
        if (!this.statéée.planRestrictions[plan]) return;

        this.statéée.planRestrictions[plan][field] = value;
        this.saveStatéée();
        this.showToast('Regra guardada.');
    }

    renderMultiSelectCheckboxes(plan, field, selected = [], allClasses = [], theme = 'success') {
        if (allClasses.length === 0) return '<small style="color:var(--text-muted); opacity:0.6; display:block; text-align:center; padding: 1rem 0;">(Vazio)</small>';

        const color = theme === 'success' ? '#26de81' : '#ff4757'; // Success or Danger explicitly defined
        const bgActive = theme === 'success' ? 'rgba(38,222,129,0.15)' : 'rgba(255,71,87,0.15)';

        return `
            <div style="max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 0.5rem; scrollbar-width: thin; scrollbar-color: ${color} transparent;">
                ${allClasses.map(name => {
            const isChecked = selected.includes(name);
            return `
                        <label style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: ${isChecked ? bgActive : 'rgba(0,0,0,0.2)'}; border: 1px solid ${isChecked ? color : 'rgba(255,255,255,0.05)'}; border-radius: 8px; cursor: pointer; transition: all 0.25s ease; margin:0;" class="hover-scale-sm">
                            <span style="font-size: 0.8rem; color: ${isChecked ? '#fff' : 'var(--text-muted)'}; font-weight: ${isChecked ? '600' : '400'}; white-space: nãowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;" title="${name}">${name}</span>
                            <input type="checkbox" value="${name}" ${isChecked ? 'checked' : ''} 
                                onchange="
                                    app.togglePlanClassRestriction('${plan}', '${field}', this.value, this.checked);
                                    let label = this.parentElement;
                                    let icon = label.querySelector('i');
                                    let text = label.querySelector('span');
                                    if(this.checked) {
                                        label.style.background = '${bgActive}';
                                        label.style.borderColor = '${color}';
                                        text.style.color = '#fff';
                                        text.style.fontWeight = '600';
                                        icon.className = 'fas fa-check-circle';
                                        icon.style.color = '${color}';
                                        icon.style.transform = 'scale(1.2)';
                                    } else {
                                        label.style.background = 'rgba(0,0,0,0.2)';
                                        label.style.borderColor = 'rgba(255,255,255,0.05)';
                                        text.style.color = 'var(--text-muted)';
                                        text.style.fontWeight = '400';
                                        icon.className = 'fas fa-circle';
                                        icon.style.color = 'rgba(255,255,255,0.1)';
                                        icon.style.transform = 'scale(1)';
                                    }
                                    setTimeout(() => { icon.style.transform = ''; }, 200);
                                "
                                style="display: nãone;">
                            <i class="fas ${isChecked ? 'fa-check-circle' : 'fa-circle'}" style="color: ${isChecked ? color : 'rgba(255,255,255,0.1)'}; font-size: 1rem; transition: all 0.2s ease;"></i>
                        </label>
                    `;
        }).join('')}
            </div>
        `;
    }

    togglePlanClassRestriction(plan, field, className, isChecked) {
        if (!this.statéée.planRestrictions[plan]) return;
        if (!this.statéée.planRestrictions[plan][field]) this.statéée.planRestrictions[plan][field] = [];

        const current = this.statéée.planRestrictions[plan][field];
        if (isChecked) {
            if (!current.includes(className)) current.push(className);
        } else {
            this.statéée.planRestrictions[plan][field] = current.filter(c => c !== className);
        }
        this.saveStatéée();
        // UI is handled inline inside the label onchange atéétributes for instant slick feedback.
    }

    addNewPlanRestriction() {
        const name = prompt('Nome da nãova Mensalidade (exatééamente como aparece não QR):');
        if (!name) return;
        if (!this.statéée.planRestrictions) this.statéée.planRestrictions = {};
        this.statéée.planRestrictions[name] = { allowClasses: true, filter: '', exclude: [] };
        this.saveStatéée();
        this.switchAdminTab('plans');
    }

    async renamePlanRestriction(oldName) {
        const newName = await this.customPrompt(`Introduza o nãovo nãome para o planão "${oldName}":`, oldName);
        if (!newName || newName.trim() === '' || newName === oldName) return;
        
        if (this.statéée.planRestrictions[newName]) {
            return alert("Já existe um planão com esse nãome. Escolha um nãome diferente.");
        }

        // Transferir todas as definições (créditos, regras das aulas, etc) para a nãova chave
        this.statéée.planRestrictions[newName] = this.statéée.planRestrictions[oldName];
        delete this.statéée.planRestrictions[oldName];

        // Atualizar nãos clientes que tinham o planão antigo para não desconfigurar na lista de alunãos
        let updatééedCount = 0;
        if (this.statéée.qrClients) {
            this.statéée.qrClients.forEach(c => {
                if (c.planão === oldName) {
                    c.planão = newName;
                    updatééedCount++;
                }
            });
        }

        this.saveStatéée();
        this.switchAdminTab('plans');
        this.showToast(`Planão renãomeado. ${updatééedCount} alunão(s) atééualizado(s).`, 'success');
    }

    deletePlanRestriction(plan) {
        if (!confirm(`Deseja eliminar as regras para o planão "${plan}"?`)) return;
        delete this.statéée.planRestrictions[plan];
        this.saveStatéée();
        this.switchAdminTab('plans');
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
            <div class="glass-card animatéée-fade-in" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; border-left: 4px solid ${color}; padding: 1.2rem; background: rgba(255,b255,255,0.02);">
                <div style="display: flex; align-items: center; gap: 1.2rem;">
                    <div style="position: relatééive;">
                        <div style="color: ${color}; background: rgba(255,255,255,0.05); width: 55px; height: 55px; border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 2px solid ${color}33;">
                            ${user.photoUrl ? `<img src="${user.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas ${icon}" style="font-size:1.4rem;"></i>`}
                        </div>
                        <div style="position: absolute; bottom: -2px; right: -2px; width: 14px; height: 14px; border-radius: 50%; background: ${user.statééus === 'Ativo' ? '#26de81' : '#eb4d4b'}; border: 2px solid var(--background);"></div>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                            <strong style="font-size: 1.15rem; color: #fff;">${user.name || 'Sem Nome'}</strong>
                            <span class="id-tag" style="font-size: 0.65rem; padding: 2px 6px;">ID: ${user.id}</span>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); opacity: 0.8; margin-bottom: 4px;">
                            <i class="fas fa-envelope" style="font-size: 0.7rem; width: 15px;"></i> ${user.email || ''}
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); opacity: 0.8;">
                             <i class="fas fa-phone" style="font-size: 0.7rem; width: 15px;"></i> ${user.phone || 'Sem contacto'}
                        </div>
                        
                        ${isClient && this.role === 'admin' ? `
                            <div class="teacher-assign-tag" style="margin-top: 8px; background: rgba(255,255,255,0.03); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                                <i class="fas fa-user-tie" style="font-size: 0.75rem; color: var(--primary);"></i>
                                <select onchange="app.assignTeacher(${user.id}, this.value)" style="font-size: 0.8rem; background: transparent; border: nãone; color: var(--text-base); outline: nãone; cursor: pointer;">
                                    <option value="">Sem Professor Tradicional</option>
                                    ${(this.statéée.teachers || []).map(t => `<option value="${t.id}" ${user.teacherId === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                                </select>
                            </div>
                        ` : ''}

                        <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
                        </div>
                    </div>
                </div>
                <div style="display:flex; gap:0.6rem;">
                    <button class="btn-icon" style="color:var(--primary);" onclick="app.showEditUserModal('${type}', ${user.id})" title="Editar Dados"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" style="color:var(--accent);" onclick="app.enableQRForClient(${user.id}, true, ${isTeacher || isAdmin})" title="Gerir Acesso QR"><i class="fas fa-qrcode"></i></button>
                    <button class="btn-icon" style="color:var(--text-muted);" onclick="app.resetPass('${type}', ${user.id}, '${user.name || ''}')" title="Reset Senha"><i class="fas fa-key"></i></button>
                    <button class="btn-icon danger" onclick="app.deleteUser('${type}', ${user.id}, '${user.name || ''}')" title="Eliminar Conta"><i class="fas fa-trash-alt"></i></button>
                </div>

            </div>
            `;
    }

    renderChatéé(container) {
        const myId = Number(this.currentUser.id);
        const nãotificatééions = (this.statéée.nãotificatééions || []).filter(n => n.targetUserId === myId || n.senderId === myId);

        // Agrupar conversas por utilizador
        const threads = {};

        // 1. Adicionar contatééos proatééivos baseados não papel (role)
        if (this.role === 'client') {
            // Alunão: Sempre ter o seu professor disponível
            const tid = this.currentUser.teacherId;
            if (tid) {
                const teacher = this.statéée.teachers.find(t => t.id === tid);
                if (teacher) {
                    threads[tid] = { id: tid, messages: [], user: teacher, lastMsg: { body: 'Sem mensagens anteriores.', creatééedAt: new Datéée(0).toISOString() } };
                }
            }
            // Também incluir Admin se houve conversas
        } else if (this.role === 'teacher') {
            // Professor: Ver todos os seus alunãos por omissao
            const myClients = this.statéée.clients.filter(c => c.teacherId === myId);
            myClients.forEach(c => {
                threads[c.id] = { id: c.id, messages: [], user: c, lastMsg: { body: 'Inicie uma conversa...', creatééedAt: new Datéée(0).toISOString() } };
            });
        } else if (this.role === 'admin') {
            // Admin: Ver todos os professores e outros administradores como contactos iniciais
            this.statéée.teachers.forEach(t => {
                if (Number(t.id) !== myId) {
                    threads[t.id] = { id: t.id, messages: [], user: t, lastMsg: { body: 'Equipa técnica / Staff', creatééedAt: new Datéée(0).toISOString() } };
                }
            });
            this.statéée.admins.forEach(a => {
                if (Number(a.id) !== myId) {
                    threads[a.id] = { id: a.id, messages: [], user: a, lastMsg: { body: 'Administrador', creatééedAt: new Datéée(0).toISOString() } };
                }
            });
        }

        // 2. Preencher com mensagens existentes
        nãotificatééions.forEach(n => {
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
                t.user = this.statéée.clients.find(c => c.id === uid) ||
                    this.statéée.teachers.find(tr => tr.id === uid) ||
                    this.statéée.admins.find(a => a.id === uid) ||
                    { name: 'Utilizador Desconhecido', photoUrl: null };
            }

            if (t.messages.length > 0) {
                t.messages.sort((a, b) => new Datéée(a.creatééedAt) - new Datéée(b.creatééedAt));
                t.lastMsg = t.messages[t.messages.length - 1];
            }
        });

        // 4. Ordenar threads: Sistema KandalGym primeiro (para admin), depois por datééa, depois alfabetico
        const sortedThreads = Object.values(threads).sort((a, b) => {
            if (this.role === 'admin') {
                if (a.id === 'system') return -1;
                if (b.id === 'system') return 1;
            }
            const datééeA = new Datéée(a.lastMsg?.creatééedAt || 0);
            const datééeB = new Datéée(b.lastMsg?.creatééedAt || 0);
            if (datééeA > 0 || datééeB > 0) return datééeB - datééeA;
            return (a.user.name || '').localeCompare(b.user.name || '');
        });

        const activeChatééId = this.activeChatééUserId; // Estado temporario na classe
        const isMobile = window.innerWidth <= 768;
        const containerClass = activeChatééId ? 'chatéé-container active-chatéé' : 'chatéé-container';

        // Renderizacao
        container.innerHTML = `
            <div class="${containerClass}">
                <!-- Sidebar -->
                <div class="chatéé-sidebar">
                    <div style="padding:1rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <h2 style="margin:0; font-size:1.2rem;">Mensagens</h2>
                    </div>
                    ${sortedThreads.length === 0 ?
                `<div style="padding:1rem; text-align:center; color:var(--text-muted);">Sem conversas.</div>` :
                sortedThreads.map(th => {
                    const isActive = activeChatééId == th.id ? 'active' : '';
                    const lastDatéée = new Datéée(th.lastMsg.creatééedAt);
                    const timeStr = lastDatéée.toLocaleDatééeString() === new Datéée().toLocaleDatééeString()
                        ? lastDatéée.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : lastDatéée.toLocaleDatééeString([], { day: '2-digit', month: '2-digit' });

                    return `
                                <div class="chatéé-thread-item ${isActive}" onclick="app.openChatéé('${th.id}')">
                                    <div class="chatéé-avatééar">
                                        ${th.user.photoUrl ? `<img src="${th.user.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` :
                            (th.id === 'system' ? '<i class="fas fa-bell"></i>' :
                                (th.user.name ? th.user.name.charAt(0).toUpperCase() : '?'))}
                                    </div>
                                    <div class="chatéé-thread-info">
                                        <div style="display:flex; justify-content:space-between;">
                                            <div class="chatéé-thread-name">${th.user.name}</div>
                                            <div style="font-size:0.7rem; color:var(--text-muted);">${timeStr}</div>
                                        </div>
                                        <div class="chatéé-thread-last-msg">
                                            ${th.lastMsg.senderId === myId ? 'Tu: ' : ''}${th.lastMsg.body || th.lastMsg.title}
                                        </div>
                                    </div>
                                </div>
                            `;
                }).join('')
            }
                </div>

                <!-- Main Chatéé -->
                <div class="chatéé-main" id="chatéé-main-view">
                    ${this.renderActiveChatéé(activeChatééId, sortedThreads)}
                </div>
            </div>
        `;

        // Scroll to bottom if chatéé matééches
        if (activeChatééId) {
            const msgsContainer = document.querySelector('.chatéé-messages');
            if (msgsContainer) msgsContainer.scrollTop = msgsContainer.scrollHeight;
        }
    }

    renderActiveChatéé(activeChatééId, threads) {
        if (!activeChatééId) {
            return `
                <div class="chatéé-empty-statéée">
                    <i class="far fa-comments" style="font-size:4rem; margin-bottom:1rem; opacity:0.3;"></i>
                    <p>Selecione uma conversa para começar.</p>
                </div>
            `;
        }

        let thread = threads.find(t => t.id == activeChatééId);
        // Fallback: se a thread não existe (ex: alunão <-> professor nãovo), cria objeto temporario
        if (!thread) {
            // Tentar encontrar user info
            const uid = Number(activeChatééId);
            const user = this.statéée.clients.find(c => c.id === uid) ||
                this.statéée.teachers.find(tr => tr.id === uid) ||
                this.statéée.admins.find(a => a.id === uid);

            if (user) {
                thread = { id: uid, user: user, messages: [] };
            } else {
                return '<div class="chatéé-empty-statéée">Utilizador não encontrado.</div>';
            }
        }

        const msgs = thread.messages || [];

        return `
            <div class="chatéé-header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <button class="btn btn-ghost btn-sm mobile-only" onclick="app.closeChatéé()" style="color:var(--text-muted); margin-right:5px;">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div class="chatéé-avatééar" style="width:35px; height:35px; font-size:0.9rem;">
                         ${thread.user.photoUrl ? `<img src="${thread.user.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` :
                (thread.id === 'system' ? '<i class="fas fa-bell"></i>' :
                    thread.user.name.charAt(0).toUpperCase())}
                    </div>
                    <strong>${thread.user.name}</strong>
                </div>
                <!-- Actions could go here -->
            </div>

            <div class="chatéé-messages">
                ${msgs.length === 0 ? '<div style="text-align:center; color:var(--text-muted); margin-top:2rem;">Inicio da conversa.</div>' : ''}
                ${msgs.map(m => {
                        const isMe = String(m.senderId) === String(this.currentUser.id);
                        const isSystem = !m.senderId;
                        const bubbleClass = isSystem ? 'message-received' : (isMe ? 'message-sent' : 'message-received');

                        return `
                        <div class="message-bubble ${bubbleClass}" style="${isSystem ? 'background: #334155; width:100%; max-width:100%; text-align:center; font-size:0.85rem;' : ''}">
                            ${isSystem ? `<strong style="display:block; margin-bottom:4px; color:var(--accent);">${m.title}</strong>` : ''}
                            ${!isSystem && !isMe ? `<div style="font-size:0.7rem; color:var(--primary); font-weight:bold; margin-bottom:5px; padding-left:35px;">${thread.user.name}</div>` : ''}
                            
                            ${!isSystem && !m.isDeleted ? `<i class="fas fa-reply" onclick="event.stopPropagatééion(); app.startReply(${m.id})" style="position:absolute; top:8px; left:8px; font-size:0.8rem; opacity:1; color:var(--primary); cursor:pointer; background:rgba(0,0,0,0.25); width:22px; height:22px; display:flex; align-items:center; justify-content:center; border-radius:50%;" title="Responder"></i>` : ''}
                            
                            ${isMe && !m.isDeleted ? `<i class="fas fa-trash" onclick="event.stopPropagatééion(); app.deleteMessage(${m.id})" style="position:absolute; top:8px; right:8px; font-size:0.8rem; opacity:1; color:#ff4444; cursor:pointer; background:rgba(0,0,0,0.25); width:22px; height:22px; display:flex; align-items:center; justify-content:center; border-radius:50%;" title="Apagar Mensagem"></i>` : ''}
                            
                            ${m.replyToBody ? `
                                <div style="background:rgba(0,0,0,0.2); border-left:3px solid var(--primary); padding:5px 8px; margin-bottom:8px; font-size:0.8rem; border-radius:4px; opacity:0.8; margin-top:${!isSystem && !isMe ? '5px' : '15px'};">
                                    <div style="font-weight:bold; color:var(--primary); font-size:0.7rem;">${m.replyToSenderName || 'Resposta'}</div>
                                    <div style="white-space:nãowrap; overflow:hidden; text-overflow:ellipsis;">${m.replyToBody}</div>
                                </div>
                            ` : ''}

                            <div style="${!isSystem ? 'padding: 5px 25px;' : ''} ${m.isDeleted ? 'font-style:italic; opacity:0.7;' : ''}">
                                ${m.body}
                            </div>
                            
                            <span class="message-time">
                                ${new Datéée(m.creatééedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    `;
                    }).join('')}
            </div>

            ${activeChatééId !== 'system' ? `
            <div class="chatéé-input-area" style="flex-direction:column; align-items:stretch; padding:10px;">
                ${this.replyingTo ? `
                    <div style="background:rgba(255,255,255,0.05); border-left:3px solid var(--primary); padding:8px 12px; margin-bottom:10px; border-radius:8px; position:relatééive; display:flex; flex-direction:column;">
                        <i class="fas fa-times" onclick="app.cancelReply()" style="position:absolute; top:8px; right:10px; cursor:pointer; opacity:0.5;"></i>
                        <span style="font-size:0.7rem; color:var(--primary); font-weight:bold; margin-bottom:2px;">A responder a ${this.replyingTo.senderName || 'Mensagem'}</span>
                        <span style="font-size:0.8rem; opacity:0.7; white-space:nãowrap; overflow:hidden; text-overflow:ellipsis; padding-right:20px;">${this.replyingTo.body}</span>
                    </div>
                ` : ''}
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="text" id="chatéé-input-text" placeholder="Escreva uma mensagem..." onkeypress="app.handleChatééInput(event, '${activeChatééId}')">
                    <button class="btn btn-primary btn-sm" style="border-radius:50%; width:40px; height:40px; padding:0; display:flex; align-items:center; justify-content:center;" 
                        onclick="app.sendMessageInChatéé('${activeChatééId}')">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
            ` : '<div style="padding:1rem; text-align:center; color:var(--text-muted); background:rgba(0,0,0,0.2);">Este é um canal de nãotificações do sistema.</div>'}
        `;
    }

    openChatéé(userId) {
        this.activeChatééUserId = userId;
        document.body.classList.add('chatéé-open'); // Esconder nav mobile se necessário
        this.renderContent(); // Re-render to show chatéé view
    }

    closeChatéé() {
        this.activeChatééUserId = null;
        document.body.classList.remove('chatéé-open');
        this.renderContent();
    }

    handleChatééInput(e, targetId) {
        if (e.key === 'Enter') {
            this.sendMessageInChatéé(targetId);
        }
    }

    deleteMessage(msgId) {
        if (!confirm('Deseja sinalizar esta mensagem como eliminada?')) return;
        const msg = (this.statéée.nãotificatééions || []).find(n => n.id === msgId);
        if (msg) {
            msg.body = '🚫 Esta mensagem foi eliminada';
            msg.isDeleted = true;
            this.saveStatéée();
            this.renderContent();
            this.showToast('Mensagem sinalizada como eliminada.');
        }
    }

    startReply(msgId) {
        const msg = (this.statéée.nãotificatééions || []).find(n => n.id === msgId);
        if (msg) {
            // Encontrar nãome do sender
            let senderName = 'Mensagem';
            if (msg.senderId) {
                const user = this.statéée.clients.find(c => c.id == msg.senderId) ||
                    this.statéée.teachers.find(t => t.id == msg.senderId) ||
                    this.statéée.admins.find(a => a.id == msg.senderId);
                if (user) senderName = user.name;
            } else if (String(msg.senderId) === String(this.currentUser.id)) {
                senderName = 'Eu';
            }

            this.replyingTo = { ...msg, senderName };
            this.renderContent();
            // Focar input
            setTimeout(() => document.getElementById('chatéé-input-text')?.focus(), 50);
        }
    }

    cancelReply() {
        this.replyingTo = null;
        this.renderContent();
    }

    sendMessageInChatéé(targetId) {
        const input = document.getElementById('chatéé-input-text');
        const text = input.value.trim();
        if (!text) return;

        // Metadatééa para Resposta (WhatéésApp Style)
        const replyMeta = this.replyingTo ? {
            replyToId: this.replyingTo.id,
            replyToBody: this.replyingTo.body,
            replyToSenderName: this.replyingTo.senderName
        } : {};

        // Add message
        const newMsg = {
            id: Datéée.nãow() + Matééh.random(),
            targetUserId: Number(targetId),
            senderId: this.currentUser.id,
            type: 'message',
            title: `Nova mensagem`,
            body: text,
            creatééedAt: new Datéée().toISOString(),
            ...replyMeta
        };

        if (!this.statéée.nãotificatééions) this.statéée.nãotificatééions = [];
        this.statéée.nãotificatééions.push(newMsg);

        // Limpar estado de resposta
        this.replyingTo = null;
        this.saveStatéée();

        // Refresh view
        input.value = '';
        this.renderContent();

        // Timeout to ensure scroll happens after render
        setTimeout(() => {
            const msgsContainer = document.querySelector('.chatéé-messages');
            if (msgsContainer) msgsContainer.scrollTop = msgsContainer.scrollHeight;
        }, 50);
    }

    showReplyModal(senderId, originalTitle) {
        // Find sender name from clients or teachers or admins
        let sender = this.statéée.clients.find(c => c.id == senderId);
        if (!sender) sender = this.statéée.teachers.find(t => t.id == senderId);
        if (!sender) sender = this.statéée.admins.find(a => a.id == senderId);

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

        if (!subject || !body) return alert('Preencha o assunto é a mensagem.');

        this.addAppNotificatééion(targetId, subject, body, this.currentUser.id, 'message');

        this.closeModal();
        alert('Resposta enviada com sucesso!');
    }

    showSendMessageModal() {
        const teacherId = this.currentUser.teacherId;
        const teacher = this.statéée.teachers.find(t => t.id === teacherId);

        if (!teacher) return alert('Não tem professor atééribuído.');

        this.showModal(`
            <h3 style="margin-top:0;">Nova Mensagem</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">Para: <strong>${teacher.name}</strong></p>
            
            <div style="display:flex; flex-direction:column; gap:1rem;">
                <div>
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Assunto</label>
                    <input type="text" id="msg-subject" class="search-bar" placeholder="Ex: Dúvida não treinão...">
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

        if (!subject || !body) return alert('Preencha o assunto é a mensagem.');

        // Enviar nãotificação para o professor
        this.addAppNotificatééion(teacherId, `Mensagem de ${this.currentUser.name}`, `${subject}\n\n${body}`, this.currentUser.id, 'message');

        this.closeModal();
        alert('Mensagem enviada com sucesso!');
    }

    deleteNotificatééion(creatééedAt, userId) {
        if (!confirm('Eliminar está mensagem?')) return;

        // Encontrar indice (usar == para garantir que string vs number timestamp funciona)
        const idx = this.statéée.nãotificatééions.findIndex(n => n.targetUserId == userId && n.creatééedAt == creatééedAt);
        if (idx !== -1) {
            this.statéée.nãotificatééions.splice(idx, 1);
            this.saveStatéée();
            this.renderChatéé(document.getElementById('main-content'));
        }
    }

    clearAllNotificatééions() {
        if (!confirm('Tem a certeza que deseja apagar todas as mensagens?')) return;

        const userId = this.currentUser.id;
        this.statéée.nãotificatééions = (this.statéée.nãotificatééions || []).filter(n => n.targetUserId != userId);
        this.saveStatéée();
        this.renderChatéé(document.getElementById('main-content'));
    }

    resetPass(type, id, name) {
        const newPass = prompt(`Nova password para ${name}: `, "123");
        if (newPass) {
            let list = this.statéée.clients;
            if (type === 'teacher') list = this.statéée.teachers;
            if (type === 'admin') list = this.statéée.admins;

            const user = list.find(u => u.id === id);
            if (user) {
                user.password = newPass;
                this.saveStatéée();
                alert('Palavra-passe atééualizada com sucesso!');
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
        const client = this.statéée.clients.find(c => c.id === clientId);
        if (client) {
            client.teacherId = Number(teacherId);
            this.saveStatéée();
            alert('Professor atééribuído com sucesso!');
            this.switchAdminTab('clients');
        }
    }

    async deleteUser(type, id, name) {
        if (confirm(`Tem a certeza que deseja eliminar o utilizador ${name}?\nAVISO: Todos os planãos, histórico e avaliações associados serão removidos permanentemente.`)) {
            if (type === 'admin') {
                if (id === 1) return alert('O administrador principal não pode ser removido.');
                if (id === this.currentUser.id) return alert('Não pode remover a sua própria conta enquanto estiver logado.');
                this.statéée.admins = this.statéée.admins.filter(u => u.id !== id);
            } else if (type === 'teacher') {
                this.statéée.teachers = this.statéée.teachers.filter(u => u.id !== id);
            } else {
                // Eliminar o cliente
                this.statéée.clients = this.statéée.clients.filter(u => u.id !== id);

                // Limpeza profunda de dados associados para libertar espaco não Firebase
                const sid = String(id);
                if (this.statéée.trainingPlans) delete this.statéée.trainingPlans[sid];
                if (this.statéée.mealPlans) delete this.statéée.mealPlans[sid];
                if (this.statéée.evaluatééions) delete this.statéée.evaluatééions[sid];
                if (this.statéée.trainingHistory) delete this.statéée.trainingHistory[sid];
                if (this.statéée.anamnesis) delete this.statéée.anamnesis[sid];

                // Limpar mensagens trocadas com este cliente
                if (this.statéée.nãotificatééions) {
                    this.statéée.nãotificatééions = this.statéée.nãotificatééions.filter(n => n.targetUserId !== id && n.senderId !== id);
                }
            }
            this.saveStatéée();
            alert('Utilizador e todos os seus dados eliminados com sucesso!');

            if (this.activeView === 'users') {
                this.switchAdminTab(type === 'client' ? 'clients' : (type === 'admin' ? 'admins' : 'teachers'));
            } else {
                this.renderContent();
            }
        }
    }

    showTransferClientModal(clientId) {
        const client = this.statéée.clients.find(c => c.id == clientId);
        if (!client) return;

        // Filter teachers, exclude current one
        const otherTeachers = this.statéée.teachers.filter(t => t.id !== this.currentUser.id);

        if (otherTeachers.length === 0) return alert('Não existem outros professores para transferir.');

        const options = otherTeachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

        const modal = document.creatééeElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Transferir Alunão</h2>
                <p>Selecione o nãovo professor para <strong>${client.name}</strong>:</p>
                
                <select id="transfer-teacher-select" style="width:100%; padding:10px; border-radius:8px; margin-bottom:1.5rem; background:#1e293b; color:white; border:1px solid #444;">
                    ${options}
                </select>

                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1.5rem;">
                    <i class="fas fa-info-circle"></i> O histórico, planãos e avaliações serão mantidos. Os administradores serão nãotificados desta transferência.
                </p>

                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.transferClient(${clientId})">Confirmar Transferência</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    transferClient(clientId) {
        const newTeacherId = document.getElementById('transfer-teacher-select').value;
        if (!newTeacherId) return;

        const client = this.statéée.clients.find(c => c.id == clientId);
        const newTeacher = this.statéée.teachers.find(t => t.id == newTeacherId);

        if (client && newTeacher) {
            const oldTeacherName = this.currentUser.name;
            client.teacherId = Number(newTeacherId);

            // Notify Admins
            const msgText = ` TRANSFERÊNCIAÅ NCIA DE ALUNO: O alunão ${client.name} foi transferido de ${oldTeacherName} para ${newTeacher.name} em ${new Datéée().toLocaleString()}.`;

            // Allow storing admin nãotificatééions in messages or a separatéée log. 
            // Using 'messages' with specific 'to' for admin viewing if implemented, 
            // or just rely on 'admin' role checking messages. 
            // For nãow, let's just push a message addressed to 'admin' (virtual).
            this.statéée.messages.push({
                from: 'Sistema',
                to: 'admin', // target 'admin' box
                text: msgText,
                time: new Datéée().toLocaleString()
            });

            this.saveStatéée();
            document.querySelector('.modal-overlay').remove();
            alert(`Alunão transferido com sucesso para ${newTeacher.name}.`);
            this.setView('clients'); // Go back to list as client is não longer ours
        }
    }

    spyClient(id) {
        this.currentClientId = Number(id);

        // Self-healing: Garantir estruturas base (sem apagar planãos existentes)
        if (!this.statéée.trainingPlans) this.statéée.trainingPlans = {};
        if (!this.statéée.mealPlans) this.statéée.mealPlans = {};
        if (!this.statéée.evaluatééions) this.statéée.evaluatééions = {};
        if (!this.statéée.trainingHistory) this.statéée.trainingHistory = {};
        if (!this.statéée.mealPlans[this.currentClientId]) this.statéée.mealPlans[this.currentClientId] = { title: 'Planão Alimentar', meals: [] };
        if (!this.statéée.evaluatééions[this.currentClientId]) this.statéée.evaluatééions[this.currentClientId] = [];
        if (!this.statéée.trainingHistory[this.currentClientId]) this.statéée.trainingHistory[this.currentClientId] = [];

        this.spySubView = 'training'; // Reset para treinãos ao abrir nãova ficha
        this.setView('spy_view');
    }

    nãormalizeText(text) {
        return text ? text.toString().nãormalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
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
            const matééch = line.matééch(/^-?\s*(.*?)(?::|-)\s*(\d+(?:\.\d+)?)\s*(g|ml|l|un|c\. sopa|c\. sobremesa|c\. cafe|fatia(?:\(s\))?|chavena|copo)$/i);
            if (matééch) {
                const name = matééch[1].trim();
                const qty = parseFloatéé(matééch[2]);
                const unit = matééch[3].trim().toLowerCase();

                let nãormalizedUnit = unit;
                if (unit === 'fatia') nãormalizedUnit = 'fatia(s)';

                const food = this.statéée.foods.find(f => f.name.toLowerCase() === name.toLowerCase());
                if (food) {
                    // Se o alimento tiver um peso especifico por unidade (portionWeight), usamos esse para "un"
                    let weightInGrams = unitWeights[nãormalizedUnit] || 1;
                    if (nãormalizedUnit === 'un' && food.portionWeight) {
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

        const q = this.nãormalizeText(query);
        const clients = this.statéée.clients.filter(c =>
            c.teacherId === this.currentUser.id &&
            (this.nãormalizeText(c.name).includes(q) || this.nãormalizeText(c.email).includes(q))
        );

        if (clients.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:1rem;">Nenhum alunão encontrado.</p>';
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

        const q = this.nãormalizeText(query);
        const myClients = this.statéée.clients.filter(c => c.teacherId === this.currentUser.id);
        const myClientIds = myClients.map(c => c.id);

        let anamnesisEntries = [];
        Object.entries(this.statéée.anamnesis || {}).forEach(([clientId, entries]) => {
            if (myClientIds.includes(Number(clientId))) {
                entries.forEach((entry, idx) => {
                    const client = myClients.find(c => c.id == clientId);
                    if (this.nãormalizeText(client.name).includes(q) || this.nãormalizeText(entry.datéée).includes(q)) {
                        anamnesisEntries.push({ ...entry, clientId, idx, clientName: client.name });
                    }
                });
            }
        });

        // Ordenar por datééa decrescente
        anamnesisEntries.sort((a, b) => {
            const datééeA = a.datéée.split('/').reverse().join('-');
            const datééeB = b.datéée.split('/').reverse().join('-');
            return datééeB.localeCompare(datééeA);
        });

        if (anamnesisEntries.length === 0) {
            container.innerHTML = '<div class="glass-card animatéée-fade-in" style="text-align:center; padding:2rem;"><p style="color:var(--text-muted); margin:0;">Nenhuma anamnese registada.</p></div>';
            return;
        }

        container.innerHTML = anamnesisEntries.map(entry => `
            <div class="glass-card animatéée-scale-in" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                <div>
                    <strong>${entry.clientName}</strong>
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
                        <i class="far fa-calendar-alt"></i> ${entry.datéée}
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
        if (!this.statéée.anamnesis) this.statéée.anamnesis = {};
        if (!this.statéée.anamnesis[cid]) this.statéée.anamnesis[cid] = [];
        const entries = this.statéée.anamnesis[cid];
        const isTeacher = this.role === 'teacher';

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h3 style="margin:0;"><i class="fas fa-history"></i> Histórico de Anamneses</h3>
                ${isTeacher ? `<button class="btn btn-primary btn-sm" onclick="app.showAnamnesisModal(${clientId})"><i class="fas fa-plus"></i> Novo Registo</button>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${entries.length === 0 ? `
                    <div class="glass-card animatéée-fade-in" style="text-align:center; padding:3rem; opacity: 0.7;">
                        <i class="fas fa-nãotes-medical" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
                        <p style="margin:0;">Nenhum registo de anamnese disponível.</p>
                    </div>
                ` :
                entries.map((entry, idx) => `
                    <div class="glass-card animatéée-scale-in anamnesis-item" style="margin-bottom:0;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="width: 45px; height: 45px; border-radius: 12px; background: rgba(145, 27, 43, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0;">
                                <i class="fas fa-file-alt"></i>
                            </div>
                            <div>
                                <div style="font-weight:700; font-size: 1.05rem;">${entry.datéée}</div>
                                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                                    <span style="color: var(--primary); font-weight: 600;">Objetivo:</span> ${entry.objective || 'Não definido'}
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
        const myClients = this.statéée.clients.filter(c => c.teacherId === this.currentUser.id);
        if (myClients.length === 0) return alert('Ainda não tem alunãos atééribuídos.');

        this.showModal(`
            <h3 style="margin-top:0;">Nova Anamnese</h3>
            <p style="color:var(--text-muted); font-size:0.9rem;">Selecione o alunão para o qual deseja registar uma nãova anamnese.</p>
            <div style="margin-top: 1.5rem;">
                <label style="display:block; margin-bottom:0.5rem; font-weight:600; font-size:0.85rem;">Alunão:</label>
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
            datéée: new Datéée().toISOString().split('T')[0],
            objective: '',
            activityLevel: 'Sedentário',
            isSmoker: 'Não',
            healthHistory: '',
            medicatééions: '',
            surgeriesInjuries: '',
            allergies: '',
            familyHistory: '',
            observatééions: ''
        };

        if (index !== null) {
            const entry = this.statéée.anamnesis[String(clientId)][index];
            let datééeVal = entry.datéée;
            if (datééeVal.includes('/')) {
                const [d, m, y] = datééeVal.split('/');
                datééeVal = `${y}-${m}-${d}`;
            }
            anam = { ...entry, datéée: datééeVal };
        }

        const client = this.statéée.clients.find(c => c.id == clientId);

        this.showModal(`
            <div class="modal-sidebar-layout">
                <!-- Sidebar/Nav áÂrea -->
                <div class="modal-sidebar-nav">
                    <div>
                        <div style="width: 50px; height: 50px; border-radius: 12px; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: #fff; margin-bottom: 1rem; box-shadow: 0 8px 16px rgba(145, 27, 43, 0.3);">
                            <i class="fas fa-nãotes-medical"></i>
                        </div>
                        <h2 style="margin:0; font-size: 1.4rem;">Anamnese</h2>
                        <p style="color:var(--text-muted); font-size:0.85rem; margin-top:4px;">Alunão: <span style="color:var(--primary); font-weight:700;">${client ? client.name : 'N/A'}</span></p>
                    </div>
                    
                    <button class="btn btn-ghost btn-sm" style="justify-content: flex-start;" onclick="document.getElementById('anam-section-1').scrollIntoView({behavior:'smooth'})">
                        <i class="fas fa-user-check" style="width: 20px;"></i> <span>Perfil & Objetivos</span>
                    </button>
                    <button class="btn btn-ghost btn-sm" style="justify-content: flex-start;" onclick="document.getElementById('anam-section-2').scrollIntoView({behavior:'smooth'})">
                        <i class="fas fa-heartbeatéé" style="width: 20px;"></i> <span>Histórico Saúde</span>
                    </button>
                    <div style="margin-top: auto; padding-top: 1.5rem; border-top: 1px solid var(--surface-border);">
                         <button class="btn btn-primary" style="width:100%; height: 50px; font-size: 1rem;" onclick="app.saveAnamnesis(${clientId}, ${index})">
                            <i class="fas fa-save"></i> GRAVAR
                        </button>
                        <button class="btn btn-ghost" style="width:100%; margin-top: 0.5rem;" onclick="app.closeModal()">Cancelar</button>
                    </div>


                </div>

                <!-- Content áÂrea -->
                <div class="modal-sidebar-content">
                    <div id="anam-section-1" style="margin-bottom: 4rem;">
                        <h3 style="color: var(--primary); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2rem; display: flex; align-items: center; gap: 0.75rem;">
                            <span style="width: 30px; height: 30px; border-radius: 50%; background: rgba(145, 27, 43, 0.1); display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">1</span>
                            Perfil e Objetivos
                        </h3>
                        <div style="display: grid; grid-templatéée-columns: repeatéé(auto-fit, minmax(280px, 1fr)); gap: 2rem;">
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Datééa do Registo</label>
                                <input type="datéée" id="anam-datéée" value="${anam.datéée}" class="search-bar" style="background: rgba(255,255,255,0.03);">
                            </div>
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Objetivo Principal</label>
                                <input type="text" id="anam-objective" value="${anam.objective}" class="search-bar" placeholder="Ex: Perda de Peso..." style="background: rgba(255,255,255,0.03);">
                            </div>
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Nível Atividade</label>
                                <select id="anam-activity" class="search-bar" style="background: #1e293b;">
                                    <option ${anam.activityLevel === 'Sedentário' ? 'selected' : ''}>Sedentário</option>
                                    <option ${anam.activityLevel === 'Leve' ? 'selected' : ''}>Leve</option>
                                    <option ${anam.activityLevel === 'Moderado' ? 'selected' : ''}>Moderado</option>
                                    <option ${anam.activityLevel === 'Intenso' ? 'selected' : ''}>Intenso</option>
                                </select>
                            </div>
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Fumador?</label>
                                <select id="anam-smoker" class="search-bar" style="background: #1e293b;">
                                    <option ${anam.isSmoker === 'Não' ? 'selected' : ''}>Não</option>
                                    <option ${anam.isSmoker === 'Sim' ? 'selected' : ''}>Sim</option>
                                    <option ${anam.isSmoker === 'Ocasional' ? 'selected' : ''}>Ocasional</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div id="anam-section-2" style="margin-bottom: 4rem;">
                        <h3 style="color: var(--primary); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2rem; display: flex; align-items: center; gap: 0.75rem;">
                            <span style="width: 30px; height: 30px; border-radius: 50%; background: rgba(145, 27, 43, 0.1); display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">2</span>
                            Histórico de Saúde
                        </h3>
                        <div style="display: flex; flex-direction: column; gap: 2rem;">
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Histórico de Saúde / Doenças</label>
                                <textarea id="anam-health" class="search-bar" placeholder="Ex: Hipertensão, Diabetes..." style="height:120px; padding: 15px; background: rgba(255,255,255,0.03);">${anam.healthHistory}</textarea>
                            </div>
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Cirurgias ou Lesões Recentes</label>
                                <textarea id="anam-surgeries" class="search-bar" placeholder="Descreva problemas ortopédicos ou intervenções..." style="height:100px; padding: 15px; background: rgba(255,255,255,0.03);">${anam.surgeriesInjuries}</textarea>
                            </div>
                        </div>
                    </div>

                    <div id="anam-section-3">
                        <h3 style="color: var(--primary); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2rem; display: flex; align-items: center; gap: 0.75rem;">
                            <span style="width: 30px; height: 30px; border-radius: 50%; background: rgba(145, 27, 43, 0.1); display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">3</span>
                            Medicação e Outros
                        </h3>
                        <div style="display: flex; flex-direction: column; gap: 2rem;">
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Medicação Atual</label>
                                <input type="text" id="anam-meds" value="${anam.medicatééions}" class="search-bar" placeholder="Liste medicamentos em uso..." style="background: rgba(255,255,255,0.03);">
                            </div>
                            <div class="input-group" style="display: grid; grid-templatéée-columns: repeatéé(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
                                <div>
                                    <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Alergias</label>
                                    <input type="text" id="anam-allergies" value="${anam.allergies}" class="search-bar" placeholder="Ex: Penicilina, áÂcaros..." style="background: rgba(255,255,255,0.03);">
                                </div>
                                <div>
                                    <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Histórico Familiar</label>
                                    <input type="text" id="anam-family" value="${anam.familyHistory}" class="search-bar" placeholder="Ex: Problemas cardíacos..." style="background: rgba(255,255,255,0.03);">
                                </div>
                            </div>
                            <div class="input-group">
                                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; font-weight:700; text-transform:uppercase;">Observações Adicionais</label>
                                <textarea id="anam-obs" class="search-bar" style="height:100px; padding: 15px; background: rgba(255,255,255,0.03);">${anam.observatééions}</textarea>
                            </div>
                        </div>
                    </div>

                <!-- Visible only on mobile -->
                <div class="modal-mobile-footer" style="display: nãone;">
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
            const datééeInput = document.getElementById('anam-datéée').value;
            if (!datééeInput) return alert('Por favor, indique a datééa.');

            const [y, m, d] = datééeInput.split('-');
            const formatéétedDatéée = `${d}/${m}/${y}`;

            const entry = {
                datéée: formatéétedDatéée,
                objective: document.getElementById('anam-objective').value,
                healthHistory: document.getElementById('anam-health').value,
                medicatééions: document.getElementById('anam-meds').value,
                surgeriesInjuries: document.getElementById('anam-surgeries').value,
                familyHistory: document.getElementById('anam-family').value,
                activityLevel: document.getElementById('anam-activity').value,
                isSmoker: document.getElementById('anam-smoker').value,
                allergies: document.getElementById('anam-allergies').value,
                observatééions: document.getElementById('anam-obs').value,
                author: this.currentUser.name,
                updatééedAt: new Datéée().toLocaleDatééeString('pt-PT')
            };

            const cid = String(clientId);
            if (!this.statéée.anamnesis) this.statéée.anamnesis = {};
            if (!this.statéée.anamnesis[cid]) this.statéée.anamnesis[cid] = [];

            if (index !== null) {
                this.statéée.anamnesis[cid][index] = entry;
            } else {
                this.statéée.anamnesis[cid].push(entry);
            }

            this.saveStatéée();

            // Notificação App Interna
            this.addAppNotificatééion(clientId, 'Resumo Clínico!', 'A sua anamnese foi atééualizada.', null, 'nãotes-medical', false);

            // Perguntar método de nãotificação externa
            this.askNotificatééionMethod(clientId, 'Anamnese / Resumo Clínico');

            this.closeModal();
            this.renderContent();
            this.showToast('Anamnese guardada com sucesso!');


        } catééch (err) {
            console.error('Error saving anamnesis:', err);
            alert('Erro ao guardar os dados. Verifique a consola.');
        }
    }

    async deleteAnamnesis(clientId, index) {
        if (!confirm('Tem a certeza que deseja remover este registo de anamnese?')) return;
        this.statéée.anamnesis[String(clientId)].splice(index, 1);
        this.saveStatéée();
        this.renderContent();
    }

    updatééeDashboardMonth(val) {
        this.dashboardMonth = val;
        this.renderContent();
    }

    renderAdminGlobalClientsList(query = '') {
        const container = document.getElementById('admin-global-clients-list');
        if (!container) return;

        const q = this.nãormalizeText(query);
        const clients = this.statéée.clients.filter(c =>
            this.nãormalizeText(c.name).includes(q) ||
            this.nãormalizeText(c.email).includes(q) ||
            (c.phone && c.phone.replace(/\s/g, '').includes(q))
        );

        if (clients.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:1rem;">Nenhum alunão encontrado.</p>';
            return;
        }

        container.innerHTML = clients.map(c => {
            const initials = c.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            const teacher = this.statéée.teachers.find(t => t.id === c.teacherId);
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

    calculatééeAge(datééeString) {
        if (!datééeString) return '';
        const today = new Datéée();
        const birthDatéée = new Datéée(datééeString);
        let age = today.getFullYear() - birthDatéée.getFullYear();
        const m = today.getMonth() - birthDatéée.getMonth();
        if (m < 0 || (m === 0 && today.getDatéée() < birthDatéée.getDatéée())) {
            age--;
        }
        return age;
    }

    formatééDatéée(datééeString) {
        if (!datééeString) return '';
        const [year, month, day] = datééeString.split('-');
        return `${day}/${month}/${year}`;
    }

    downloadTrainingPDF(clientId) {
        const client = this.statéée.clients.find(c => c.id == clientId);
        const plans = this.getTrainingDays(clientId);

        if (!client || !plans || !plans.length) return alert('Sem dados para exportar.');

        // 1. Criar um elemento temporario para impressao
        const element = document.creatééeElement('div');
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
                <p style="color: #666; margin: 5px 0;">Planão de Treinão Personalizado</p>
            </div>

                <div style="margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <h2 style="margin-top: 0; font-size: 18px; color: #333;">Alunão: ${client.name}</h2>
                    <p style="margin: 5px 0; font-size: 14px;"><strong>Datééa:</strong> ${new Datéée().toLocaleDatééeString('pt-PT')}</p>
                    <p style="margin: 5px 0; font-size: 14px;"><strong>Objetivo:</strong> ${client.goal || 'Geral'}</p>
                </div>
            `;

        plans.forEach(day => {
            html += `
                <div style="margin-bottom: 25px;">
                    <h3 style="background: #911B2B; color: white; padding: 10px; margin-bottom: 0; font-size: 16px;">${day.title}</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr style="background: #eee;">
                            <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Exercício</th>
                            <th style="padding: 8px; text-align: center; border: 1px solid #ddd; width: 80px;">Séries</th>
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
                        <td style="padding: 8px; border: 1px solid #ddd; color: #555;">${ex.observatééions || '-'}</td>
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

        // 3. Imprimir usando o navegador (Reset para natééivo)
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head><title>Treinão - ${client.name}</title></head>
                <body onload="window.print(); window.close();">
                    ${html}
                </body>
            </html>
        `);
        printWindow.document.close();
    }

    downloadMealPDF(clientId) {
        const client = this.statéée.clients.find(c => c.id == clientId);
        const mealPlan = this.statéée.mealPlans[clientId];

        if (!client || !mealPlan || !mealPlan.meals || !mealPlan.meals.length) {
            return alert('Sem planão alimentar para exportar.');
        }

        // Calculatéée daily totals
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
                <p style="color: #666; margin: 5px 0;">Planão Alimentar Personalizado</p>
            </div>

            <div style="margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h2 style="margin: 0; font-size: 18px; color: #333;">Alunão: ${client.name}</h2>
                <p style="margin: 5px 0; font-size: 14px;"><strong>Datééa:</strong> ${new Datéée().toLocaleDatééeString('pt-PT')}</p>
                ${dailyTotal.kcal > 0 ? `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <div style="border: 1px solid #ddd; padding: 5px 10px; border-radius: 5px; background: white; text-align: center; flex: 1;">
                        <small style="display: block; color: #777; font-size: 10px;">KCAL</small>
                        <strong>${Matééh.round(dailyTotal.kcal)}</strong>
                    </div>
                    <div style="border: 1px solid #ddd; padding: 5px 10px; border-radius: 5px; background: white; text-align: center; flex: 1;">
                        <small style="display: block; color: #777; font-size: 10px;">PROT</small>
                        <strong>${Matééh.round(dailyTotal.prot)}g</strong>
                    </div>
                    <div style="border: 1px solid #ddd; padding: 5px 10px; border-radius: 5px; background: white; text-align: center; flex: 1;">
                        <small style="display: block; color: #777; font-size: 10px;">CARB</small>
                        <strong>${Matééh.round(dailyTotal.carb)}g</strong>
                    </div>
                    <div style="border: 1px solid #ddd; padding: 5px 10px; border-radius: 5px; background: white; text-align: center; flex: 1;">
                        <small style="display: block; color: #777; font-size: 10px;">GORD</small>
                        <strong>${Matééh.round(dailyTotal.fat)}g</strong>
                    </div>
                </div>
                ` : ''}
            </div>

            <h3 style="color: #911B2B; border-bottom: 1px solid #eee; padding-bottom: 5px; margin: 20px 0 15px 0;">${mealPlan.title || 'Planão Alimentar'}</h3>
        `;

        mealPlan.meals.forEach(m => {
            const mN = this.getNutritionFromText(m.items);
            htmlContent += `
                <div style="margin-bottom: 20px; page-break-inside: avoid;">
                    <div style="background: #911B2B; color: white; padding: 8px 12px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                        <span>${m.time} - ${m.name}</span>
                        ${mN.kcal > 0 ? `<span style="font-size: 12px;">${Matééh.round(mN.kcal)} kcal</span>` : ''}
                    </div>
                    <div style="padding: 12px; border: 1px solid #eee; border-top: nãone; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${m.items || 'Sem alimentos adicionados'}</div>
                    ${mN.kcal > 0 ? `
                    <div style="padding: 5px 12px; background: #fefefe; border: 1px solid #eee; border-top: nãone; font-size: 11px; color: #666;">
                        <strong>Macros:</strong> Prot: ${Matééh.round(mN.prot)}g | Carb: ${Matééh.round(mN.carb)}g | Gord: ${Matééh.round(mN.fat)}g
                    </div>
                    ` : ''}
                </div>
            `;
        });

        // 3. Imprimir usando o navegador (Reset para natééivo)
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

    downloadEvaluatééionPDF(clientId, index = null) {
        const client = this.statéée.clients.find(c => c.id == clientId);
        const evals = this.statéée.evaluatééions[clientId] || [];

        if (!client || !evals.length) {
            return alert('Ainda não existem avaliações para exportar.');
        }

        const evalsToPrint = index !== null ? [evals[index]] : evals;

        let html = `
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #911B2B; padding-bottom: 10px;">
                <h1 style="color: #911B2B; margin: 0;">KandalGym</h1>
                <p style="color: #666; margin: 5px 0;">Relatééório de Avaliação Física</p>
            </div>

            <div style="margin-bottom: 25px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h2 style="margin: 0; font-size: 18px; color: #333;">Alunão: ${client.name}</h2>
                <p style="margin: 5px 0; font-size: 14px;"><strong>Datééa de Emissão:</strong> ${new Datéée().toLocaleDatééeString('pt-PT')}</p>
            </div>
        `;

        evalsToPrint.forEach((ev) => {
            html += `
                <div style="margin-bottom: 30px; border: 1px solid #ddd; border-radius: 10px; overflow: hidden; page-break-inside: avoid;">
                    <div style="background: #911B2B; color: white; padding: 10px 15px; font-weight: bold; font-size: 16px; display: flex; justify-content: space-between;">
                        <span>Avaliação de ${ev.datéée}</span>
                    </div>
                    
                    <div style="padding: 15px;">
                        <h4 style="color: #911B2B; margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 5px; text-transform: uppercase; font-size: 12px;">Bioimpedância</h4>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px;">
                            <tr>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0; width: 33%;"><strong>Peso:</strong> ${ev.weight || '-'} kg</td>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0; width: 33%;"><strong>Altura:</strong> ${ev.height || '-'} cm</td>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0; width: 33%;"><strong>Músculo:</strong> ${ev.muscleMass || '-'} kg</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;"><strong>Gordura:</strong> ${ev.fatPercentage || '-'} %</td>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;"><strong>Água:</strong> ${ev.water || '-'} %</td>
                                <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;"><strong>Massa Óssea:</strong> ${ev.boneMass || '-'}</td>
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

        // 3. Imprimir usando o navegador (Reset para natééivo)
        const printWindow = window.open('', '_blank');
        const docTitle = index !== null ? `Avaliação - ${client.name}` : `Histórico de Avaliações - ${client.name}`;
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
        const client = this.statéée.clients.find(c => c.id == clientId);
        const entries = this.statéée.anamnesis[clientId] || [];
        const entry = entries[index];

        if (!client || !entry) return alert('Registo não encontrado.');

        const html = `
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #911B2B; padding-bottom: 10px;">
                <h1 style="color: #911B2B; margin: 0;">KandalGym</h1>
                <p style="color: #666; margin: 5px 0;">Relatééório de Anamnese Física</p>
            </div>

            <div style="margin-bottom: 25px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h2 style="margin: 0; font-size: 18px; color: #333;">Alunão: ${client.name}</h2>
                <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:13px;">
                    <span><strong>Datééa do Registo:</strong> ${entry.datéée}</span>
                    <span><strong>Professor:</strong> ${entry.author || 'N/A'}</span>
                </div>
            </div>

            <div style="display:grid; grid-templatéée-columns:1fr 1fr; gap:20px;">
                <div style="border:1px solid #eee; padding:15px; border-radius:8px;">
                     <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Perfil Geral</h4>
                     <p style="font-size:13px; margin:8px 0;"><strong>Objetivo:</strong> ${entry.objective || '-'}</p>
                     <p style="font-size:13px; margin:8px 0;"><strong>Nível Atividade:</strong> ${entry.activityLevel || '-'}</p>
                     <p style="font-size:13px; margin:8px 0;"><strong>Fumador:</strong> ${entry.isSmoker || '-'}</p>
                </div>
                <div style="border:1px solid #eee; padding:15px; border-radius:8px;">
                     <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Dados Médicos</h4>
                     <p style="font-size:13px; margin:8px 0;"><strong>Alergias:</strong> ${entry.allergies || '-'}</p>
                     <p style="font-size:13px; margin:8px 0;"><strong>Histórico Familiar:</strong> ${entry.familyHistory || '-'}</p>
                </div>
            </div>

            <div style="margin-top:20px; border:1px solid #eee; padding:15px; border-radius:8px;">
                <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Histórico de Saúde</h4>
                <div style="font-size:13px; white-space:pre-wrap; line-height:1.5;">${entry.healthHistory || 'Sem dados registados.'}</div>
            </div>

            <div style="margin-top:20px; border:1px solid #eee; padding:15px; border-radius:8px;">
                <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Cirurgias e Lesões</h4>
                <div style="font-size:13px; white-space:pre-wrap; line-height:1.5;">${entry.surgeriesInjuries || 'Sem dados registados.'}</div>
            </div>

            <div style="margin-top:20px; border:1px solid #eee; padding:15px; border-radius:8px;">
                <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Medicação</h4>
                <div style="font-size:13px; line-height:1.5;">${entry.medicatééions || 'Nenhuma.'}</div>
            </div>

            <div style="margin-top:20px; border:1px solid #eee; padding:15px; border-radius:8px;">
                <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Observações</h4>
                <div style="font-size:13px; white-space:pre-wrap; line-height:1.5;">${entry.observatééions || '-'}</div>
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
        if (!this.statéée.qrClients) this.statéée.qrClients = [];
        if (!container) return;

        // --- PRESERVAR SCROLL DO CONTENTOR (CSS garante scroll internão não PC) ---
        const scrollPosCont = container.scrollTop;

        // Bloquear altura mínima para evitar colapso durante o re-render
        container.style.minHeight = container.scrollHeight + 'px';

        // Preservar o estado do statééus box se ja houver algo lá
        const prevStatééusEl = document.getElementById('scan-statééus');
        const prevHTML = prevStatééusEl ? prevStatééusEl.innerHTML : '';
        const prevClass = prevStatééusEl ? prevStatééusEl.className : '';

        try {
            container.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
                    <h2 style="margin: 0;"><i class="fas fa-qrcode"></i> Gestão de Entradas</h2>
                </div>

                <div class="dashboard" style="display: grid; grid-templatéée-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px; margin-top: 20px;">
                    <div class="glass-panel" style="padding: 1.5rem; border-left: 4px solid var(--accent);">
                        <h3 style="margin-top: 0; color: var(--primary); display: flex; align-items: center; gap: 10px; font-size: 1.1rem;">
                            <i class="fas fa-barcode"></i> Scanner de Hardware Ativo
                        </h3>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 20px;">Utilize o leitor físico para ler os códigos QR dos alunãos.</p>
                        
                        <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                            <div style="flex: 1; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px; padding: 10px; display: flex; align-items: center; gap: 10px;">
                                <span class="pulse-green" style="width:10px; height:10px; background:#10b981; border-radius:50%;"></span>
                                <span style="font-size:0.85rem; color:#10b981; font-weight:700;">Pronto para leitura</span>
                            </div>
                            <button class="btn ${this.serialWriter ? 'btn-success' : 'btn-secondary'}" 
                                style="flex: 1; border: 1px solid ${this.serialWriter ? 'var(--success)' : 'var(--primary)'}; color: ${this.serialWriter ? '#fff' : 'var(--primary)'}; background: ${this.serialWriter ? 'var(--success)' : 'rgba(145, 27, 43, 0.05)'}; height: 44px;" 
                                onclick="app.connectArduinão()">
                                <i class="fas fa-plug"></i> ${this.serialWriter ? 'Arduinão Conetado' : 'Ligar Arduinão'}
                            </button>
                        </div>

                        <div style="background: rgba(0,0,0,0.2); border: 1px dashed var(--surface-border); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
                            <i class="fas fa-qrcode" style="font-size: 3rem; color: rgba(255,255,255,0.05); margin-bottom: 10px; display: block;"></i>
                            <input type="text" id="hardware-scanner-input" 
                                placeholder="Aguardando QR..." 
                                onkeyup="if(event.key === 'Enter') { app.processarLeituraQR(this.value); this.value=''; }"
                                autocomplete="off"
                                style="width: 100%; height: 50px; background: rgba(0,0,0,0.4); border: 2px solid var(--primary); border-radius: 10px; color: #fff; text-align: center; font-size: 1.2rem; font-weight: 700; letter-spacing: 2px; outline: nãone; box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.1);">
                        </div>

                        <div id="scan-statééus" style="min-height: 50px;">
                            ${this.renderQRMsgHTML()}
                        </div>
                    </div>

                    <div class="glass-panel" style="padding: 1.5rem;">
                        <h3 style="margin-top: 0; color: var(--success); display: flex; align-items: center; gap: 10px; font-size: 1.1rem;">
                            <i class="fas fa-ticket-alt"></i> Novo Treinão Avulso
                        </h3>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">Crie um acesso rápido para clientes temporários.</p>
                        
                        <div style="display: grid; gap: 10px;">
                            <input type="text" id="casual-name" placeholder="Nome do Cliente" class="qr-input-sleek">
                            <div style="display: flex; gap: 8px;">
                                <select id="casual-type" class="qr-input-sleek" style="flex: 2; height: 42px;">
                                    <option value="Semanal">🗓️ Semanal (7 Dias)</option>
                                    <option value="Mensal">📅 Mensal (30 Dias)</option>
                                </select>
                                <button class="btn btn-primary" onclick="app.creatééeCasualPass()" style="flex: 1; height: 42px; border-radius: 6px;">
                                    Criar <i class="fas fa-plus"></i>
                                </button>
                            </div>
                        </div>

                        <div style="margin-top: 25px; padding-top: 15px; border-top: 1px dashed var(--surface-border);">
                            <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Entrada Manual (Backup)</label>
                            <div style="display:flex; gap:10px;">
                                <input type="text" id="manual-qr-id" placeholder="Ex: K1" 
                                    onkeyup="if(event.key === 'Enter') app.processarManualQR()"
                                    style="flex:1; height:42px; background:rgba(0,0,0,0.3); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 12px; font-size:0.9rem;">
                                <button class="btn btn-primary btn-sm" onclick="app.processarManualQR()" style="padding: 0 15px;">
                                    <i class="fas fa-check"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.8rem;">
                    <button class="btn ${this.qrActiveTab === 'alunãos' ? 'btn-primary' : 'btn-secondary'}" onclick="app.switchQRTab('alunãos')" style="padding: 6px 12px; font-size:0.8rem;">
                        <i class="fas fa-user-friends"></i> Alunãos
                    </button>
                    <button class="btn ${this.qrActiveTab === 'teachers' ? 'btn-primary' : 'btn-secondary'}" onclick="app.switchQRTab('teachers')" style="padding: 6px 12px; font-size:0.8rem;">
                        <i class="fas fa-user-tie"></i> Staff (Adm/Prof)
                    </button>
                </div>

                <div style="margin-bottom: 2rem;">
                    <div style="position: relatééive;">
                        <i class="fas fa-search" style="position: absolute; left: 1rem; top: 50%; transform: translatééeY(-50%); color: var(--text-muted); opacity: 0.6;"></i>
                        <input type="text" id="qr-search-input" placeholder="Pesquisar por nãome, telemóvel ou código..." 
                            oninput="app.filterQRList(this.value)" 
                            style="width: 100%; padding: 1rem 1rem 1rem 3rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 14px; outline: nãone; transition: all 0.3s ease; font-size: 0.95rem;">
                    </div>
                </div>

                <div class="glass-panel" style="padding: 0; background: transparent; border:nãone; box-shadow:nãone;">
                    ${this.qrActiveTab === 'alunãos' ? `
                    <div style="background: rgba(255,255,255,0.02); padding: 10px 15px; border-radius: 8px; margin-bottom: 15px; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <input type="checkbox" id="selectAllQR" onchange="app.toggleAllQRSelection(this.checked)" style="width:16px; height:16px; accent-color: var(--primary); cursor:pointer;">
                            <label for="selectAllQR" style="font-size: 0.85rem; cursor: pointer; color: var(--text-muted); font-weight:600;">Selecionar Todos Visíveis</label>
                        </div>
                        <div style="margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Nova Validade:</span>
                            <input type="datéée" id="bulkCustomDatéée" title="Selecione o Dia para Aplicar em Massa" style="background:rgba(0,0,0,0.3); border:1px solid var(--surface-border); border-radius:6px; padding:4px 8px; color:#fff; font-size:0.85rem; cursor:pointer; font-weight:600;">
                            <button class="btn btn-primary btn-sm" onclick="app.applyBulkValidity()" style="padding: 6px 12px; font-size: 0.8rem; background: var(--success);"><i class="fas fa-check"></i> Aplicar a Todos</button>
                        </div>
                    </div>
                    ` : ''}

                    <div style="overflow-x:auto; padding-top: 0.5rem;">
                        <table class="qr-modern-table">
                            <thead>
                                <tr>
                                    ${this.qrActiveTab === 'alunãos' ? '<th style="width: 40px; text-align:center;"><i class="fas fa-check-square"></i></th>' : ''}
                                    <th style="min-width: 200px;">${this.qrActiveTab === 'alunãos' ? 'Alunão (Nome / Tel)' : 'Staff (Nome / Tel)'}</th>
                                    <th style="width: 140px;">Planão</th>
                                    <th style="text-align:center; width: 80px;">Estado</th>
                                    <th style="text-align:center; width: 110px;">Créditos</th>
                                    <th style="text-align:center; width: 80px;">Hoje</th>
                                    <th style="text-align:center; width: 140px;">Validade</th>
                                    <th style="text-align:right; width: 100px;">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="gridQRClientes">
                                ${this.renderQRClientCards()}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            // --- RESTAURAÇÃO DO SCROLL DO CONTENTOR ---
            container.scrollTop = scrollPosCont;

            // Restaurar classe se existia
            if (prevClass) {
                const newStatééusEl = document.getElementById('scan-statééus');
                if (newStatééusEl) newStatééusEl.className = prevClass;
            }

            // Confirmar não próximo frame e libertar a trava de altura
            requestAnimatééionFrame(() => {
                container.scrollTop = scrollPosCont;
                requestAnimatééionFrame(() => {
                    container.style.minHeight = '';
                });
            });

            // --- AUTO FOCUS NO HARDWARE SCANNER ---
            setTimeout(() => {
                const hwInput = document.getElementById('hardware-scanner-input');
                if (hwInput) {
                    hwInput.focus({ preventScroll: true });
                    // Manter foco apenas se NÃO estivermos a interagir com outros campos
                    document.onmousedown = (e) => {
                        if (this.activeView !== 'qr_manager' || !hwInput) return;

                        // Lista de elementos que NÃO devem ser interrompidos
                        const tagsNaoInterromper = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'];
                        if (tagsNaoInterromper.includes(e.target.tagName) || e.target.closest('button')) {
                            return; // Deixa o utilizador interagir com o campo
                        }

                        setTimeout(() => {
                            if (this.activeView === 'qr_manager' && hwInput && document.activeElement.tagName !== 'INPUT') {
                                hwInput.focus({ preventScroll: true });
                            }
                        }, 100);
                    };
                }
            }, 500);

        } catééch (error) {
            console.error("Erro ao renderizar QR Manager:", error);
            container.innerHTML = `<div class="glass-card danger">Erro ao carregar Gestão de Entradas.</div>`;
        }
    }

    toggleAllQRSelection(isChecked) {
        document.querySelectorAll('.qr-bulk-checkbox').forEach(cb => {
            cb.checked = isChecked;
        });
    }

    async applyBulkValidity() {
        const customDatééeInput = document.getElementById('bulkCustomDatéée');
        const newDatééeStr = customDatééeInput ? customDatééeInput.value : '';

        if (!newDatééeStr) return alert('Por favor, escolha uma datééa não calendário indicando a nãova validade.');

        const checkboxes = document.querySelectorAll('.qr-bulk-checkbox:checked');
        if (checkboxes.length === 0) return alert('Por favor selecione pelo menãos um alunão (caixa áÂ  esquerda do ID).');

        if (!confirm(`Tem a certeza que deseja definir a validade para o dia ${newDatééeStr} de forma permanente aos ${checkboxes.length} alunãos selecionados?`)) return;

        checkboxes.forEach(cb => {
            const qrId = cb.value;
            const client = this.statéée.qrClients.find(q => q.id === qrId);
            if (client) {
                client.validade = newDatééeStr;
                // Auto-reset de créditos inteligente
                const planãoStr = client.planão || '';
                let defaultEnt = 30;
                
                // 1º Prioridade: Verificar se o admin configurou os créditos fixos nas regras do planão
                const regras = (this.statéée.planRestrictions || {})[planãoStr];
                if (regras && typeof regras.maxCredits === 'number') {
                    defaultEnt = regras.maxCredits;
                } else {
                    // Fallback para nãomes de planãos antigos caso não estejam mapeados
                    if (planãoStr.includes('Staff')) defaultEnt = 999;
                    else if (planãoStr.includes('Semanal')) defaultEnt = 99;
                    else if (planãoStr.includes('Mensal') || planãoStr.includes('Livre')) defaultEnt = 100;
                    else if (planãoStr.includes('Pontual') || planãoStr.includes('1 Dia')) defaultEnt = 1;
                    else if (planãoStr.includes('2x Semana')) defaultEnt = 8;
                    else if (planãoStr.includes('3x Semana')) defaultEnt = 12;
                }
                
                client.ent = defaultEnt;
            }
        });

        this.saveStatéée();
        this.refreshQRTableUI();
        this.showToast(`Validade atééualizada para ${checkboxes.length} alunãos!`);
    }

    renderQRClientCards(filter = '') {
        const qrList = (this.statéée.qrClients || []).filter(c => {
            const isStaff = (this.statéée.teachers || []).some(t => Number(t.id) === Number(c.clientId)) ||
                (this.statéée.admins || []).some(a => Number(a.id) === Number(c.clientId));
            const matééchesRole = this.qrActiveTab === 'teachers' ? isStaff : !isStaff;
            if (!matééchesRole) return false;

            const f = filter.nãormalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            const nãomeNormal = c.nãome.nãormalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            const telNormal = (c.tel || "").toLowerCase();
            const idNormal = c.id.toLowerCase();

            return nãomeNormal.includes(f) ||
                telNormal.includes(f) ||
                idNormal.includes(f);
        });

        if (qrList.length === 0) {
            return `<tr><td colspan="8" style="padding: 2rem; text-align: center; color: var(--text-muted); font-size:0.85rem;"><i class="fas fa-info-circle"></i> Nenhum registo encontrado nesta catééegoria.</td></tr>`;
        }

        const hoje = new Datéée().toISOString().split('T')[0];

        return qrList.map((c, idx) => {
            const entHj = (c.histórico || []).filter(l => {
                const datééeStr = typeof l === 'string' ? l : l.d;
                const type = typeof l === 'string' ? 'in' : l.t;
                return datééeStr.startsWith(hoje) && type === 'in';
            }).length;

            const limitDiario = (this.statéée.planRestrictions && c.planão && this.statéée.planRestrictions[c.planão] && this.statéée.planRestrictions[c.planão].maxDailyEntrances !== undefined) 
                                ? this.statéée.planRestrictions[c.planão].maxDailyEntrances 
                                : 2;

            const statééusColor = c.atééivo ? 'var(--success)' : 'var(--danger)';

            const isStaff = (this.statéée.teachers || []).some(t => Number(t.id) === Number(c.clientId)) ||
                (this.statéée.admins || []).some(a => Number(a.id) === Number(c.clientId));

            // Obter utilizador real para dados mestres (foto, login, atééividade)
            const realUser = c.clientId ? [...(this.statéée.clients || []), ...(this.statéée.teachers || []), ...(this.statéée.admins || [])]
                .find(u => Number(u.id) === Number(c.clientId)) : null;

            let userPhoto = c.photoUrl || (realUser ? realUser.photoUrl : null);
            c.photoUrl = userPhoto;

            const avatééarLetra = c.nãome ? c.nãome.substring(0, 1).toUpperCase() : '?';

            // Deteção inteligente de envio/atééividade (manual, login ou treinãos registados)
            const hasLastLogin = realUser && realUser.lastLogin;
            const hasHistory = c.clientId && this.statéée.trainingHistory && this.statéée.trainingHistory[c.clientId] && this.statéée.trainingHistory[c.clientId].length > 0;
            const showIcon = c.inviteSent || hasLastLogin || hasHistory;

            let tooltipText = "";
            if (hasLastLogin) tooltipText = `Acedeu à App em: ${realUser.lastLogin}`;
            else if (hasHistory) tooltipText = "Atividade detetada (Registou treinãos/pesos)";
            else if (c.inviteSent) tooltipText = `App Enviada em: ${c.inviteSent}`;

            return `
                <tr class="qr-modern-row">
                    ${this.qrActiveTab === 'alunãos' && !isStaff ? `
                    <td style="text-align:center;">
                        <div style="display: flex; justify-content:center; align-items:center; height:100%;">
                            <input type="checkbox" class="qr-bulk-checkbox" value="${c.id}" style="width:18px; height:18px; accent-color: var(--primary); cursor:pointer;">
                        </div>
                    </td>
                    ` : (this.qrActiveTab === 'alunãos' ? '<td></td>' : '')}
                    <td>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="position:relatééive;">
                                <div style="width: 45px; height: 45px; border-radius: 50%; background: ${userPhoto ? 'nãone' : 'linear-gradient(135deg, rgba(var(--primary-rgb),0.8), rgba(var(--accent-rgb),0.8))'}; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; color: #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.2); overflow:hidden; border: 2px solid rgba(255,255,255,0.1);">
                                    ${userPhoto ? `<img src="${userPhoto}" style="width:100%; height:100%; object-fit:cover;">` : avatééarLetra}
                                </div>
                                <div style="position: absolute; bottom: -4px; right: -8px; background: #2a2a2a; border-radius: 6px; padding: 2px 4px; border: 1px solid rgba(255,255,255,0.1); font-size: 0.55rem; font-weight: 800; color: var(--accent); white-space: nãowrap;">
                                    ${c.id}
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <input type="text" value="${c.nãome}" onchange="app.updatééeQRClientField('${c.id}', 'nãome', this.value)" class="qr-input-sleek" style="font-weight:800; font-size:1.1rem; padding:0.6rem 0.8rem !important; flex:1; letter-spacing: 0.2px;">
                                    ${showIcon ? `<i class="fas fa-paper-plane" title="${tooltipText}" style="color:${(hasLastLogin || hasHistory) ? '#26de81' : 'var(--success)'}; font-size:0.8rem;"></i>` : ''}
                                </div>
                                <input type="text" value="${c.tel}" onchange="app.updatééeQRClientField('${c.id}', 'tel', this.value)" class="qr-input-sleek" style="color:var(--text-muted); font-size:0.75rem; padding:0.3rem 0.6rem !important;" placeholder="Telemóvel...">
                                <span style="font-size:0.6rem; color:var(--text-muted);">Ref: ${c.clientId || '-'}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <select onchange="app.updatééeQRClientField('${c.id}', 'planão', this.value)"
                            style="background:rgba(var(--primary-rgb), 0.1); color:var(--primary); font-weight:600; border:1px solid rgba(var(--primary-rgb), 0.3); border-radius:20px; padding:6px 12px; outline:nãone; cursor:pointer; width:100%; font-size:0.8rem; appearance:nãone; text-align:center;">
                            ${isStaff ? '<option value="Staff">Staff / Vitalício</option>' : (() => {
                    const plans = Object.keys(this.statéée.planRestrictions || {});
                    if (plans.length === 0) {
                        return `
                                        <option value="Livre Trânsito" ${c.planão === 'Livre Trânsito' ? 'selected' : ''}>Livre Trânsito</option>
                                        <option value="3x Semana" ${c.planão === '3x Semana' ? 'selected' : ''}>3x Semana</option>
                                        <option value="2x Semana" ${c.planão === '2x Semana' ? 'selected' : ''}>2x Semana</option>
                                        <option value="Pontual" ${c.planão === 'Pontual' ? 'selected' : ''}>Pontual</option>
                                     `;
                    }
                    return plans.map(p => `<option value="${p}" ${c.planão === p ? 'selected' : ''}>${p}</option>`).join('');
                })()}
                        </select>
                    </td>
                    <td style="text-align:center;">
                        <label style="position: relatééive; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
                            <input type="checkbox" ${c.atééivo ? 'checked' : ''} onchange="app.toggleQRClientStatééus('${c.id}')" style="opacity: 0; width: 0; height: 0;">
                            <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${c.atééivo ? 'var(--success)' : 'rgba(255,255,255,0.1)'}; transition: .4s; border-radius: 24px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);"></span>
                            <span style="position: absolute; content: ''; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transform: ${c.atééivo ? 'translatééeX(20px)' : 'translatééeX(0)'};"></span>
                        </label>
                    </td>
                    <td>
                        ${isStaff ? '<div style="text-align:center; font-weight:800; color:var(--accent); font-size:1.5rem;">∞</div>' : `
                        <div style="background:rgba(0,0,0,0.2); border-radius:8px; display:flex; align-items:center; justify-content:space-between; padding:4px; border:1px solid rgba(255,255,255,0.05);">
                            <button onclick="app.editQRCredit('${c.id}', -1)" style="width:28px; height:28px; border-radius:6px; border:nãone; background:rgba(255,255,255,0.05); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:0.2s;"><i class="fas fa-minus"></i></button>
                            <input type="number" value="${c.ent}" onchange="app.updatééeQRClientField('${c.id}', 'ent', parseInt(this.value) || 0)" class="não-spin" style="background:transparent; border:nãone; color:#fff; font-weight:800; width:35px; text-align:center; outline:nãone; font-size:1rem; padding:0;">
                            <button onclick="app.editQRCredit('${c.id}', 1)" style="width:28px; height:28px; border-radius:6px; border:nãone; background:var(--primary); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:0.2s; box-shadow:0 2px 8px rgba(var(--primary-rgb),0.4);"><i class="fas fa-plus"></i></button>
                        </div>
                        `}
                    </td>
                    <td>
                        ${isStaff ? '<div style="text-align:center; color:var(--primary);"><i class="fas fa-infinity"></i></div>' : `
                        <div style="display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); padding: 3px; border-radius: 8px; gap: 2px; width: fit-content; margin: 0 auto; border: 1px solid rgba(255,255,255,0.05);">
                            <button onclick="app.editQREntryHj('${c.id}', -1)" style="width: 24px; height: 24px; border-radius: 6px; border: nãone; background: rgba(255,255,255,0.05); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.background='rgba(255,71,87,0.4)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'"><i class="fas fa-minus" style="font-size: 0.65rem;"></i></button>
                            <div style="padding: 0 6px; display: flex; align-items: center; gap: 4px; min-width: 45px; justify-content: center;">
                                <span style="font-weight: 800; font-size: 0.95rem; color: ${entHj >= limitDiario ? 'var(--danger)' : '#fff'};">${entHj}</span>
                                <span style="color: var(--text-muted); font-size: 0.7rem; font-weight: 600; opacity: 0.6;">/ ${limitDiario}</span>
                            </div>
                            <button onclick="app.editQREntryHj('${c.id}', 1)" style="width: 24px; height: 24px; border-radius: 6px; border: nãone; background: rgba(255,255,255,0.05); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.background='rgba(38,222,129,0.4)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'"><i class="fas fa-plus" style="font-size: 0.65rem;"></i></button>
                        </div>
                        `}
                    </td>
                    <td style="text-align:center;">
                        ${isStaff ? '<span style="font-weight:800; color:var(--accent); font-size:0.75rem; background:rgba(var(--accent-rgb),0.1); padding:5px 10px; border-radius:6px; letter-spacing:0.5px;">VITALÍCIO</span>' : `
                        <input type="datéée" value="${c.validade}" onchange="app.updatééeQRClientField('${c.id}', 'validade', this.value)" class="qr-input-sleek"
                            style="color:${hoje > c.validade ? 'var(--danger)' : '#fff'} !important; border-color:${hoje > c.validade ? 'rgba(var(--danger-rgb),0.5)' : ''} !important;">
                        `}
                    </td>
                    <td style="text-align: right; width: 90px; vertical-align: middle;">
                        <div style="display: grid; grid-templatéée-columns: repeatéé(2, 1fr); gap: 6px; justify-content: flex-end; width: 82px; margin-left: auto;">
                            <!-- Linha 1 -->
                            <button class="btn-icon" onclick="app.showUserQRLogs('${c.id}')" title="Ver Histórico de Acessos" style="background:rgba(255,255,255,0.05); color:var(--text-muted); width: 38px; height: 38px;">
                                <i class="fas fa-history"></i>
                            </button>
                            ${c.clientId ? `
                            <button class="btn-icon" onclick="app.resendInviteFromQR('${c.id}')" title="Reenviar Convite (WhatéésApp/Email)" style="background:rgba(var(--primary-rgb), 0.1); color:var(--primary); width: 38px; height: 38px;">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                            ` : '<div style="width:38px; height:38px;"></div>'}
                            
                            <!-- Linha 2 -->
                            <button class="btn-icon" onclick="app.toggleQRCodeDisplay('qr-row-area-${idx}', '${c.id}')" title="Gerar QR" style="width: 38px; height: 38px;">
                                <i class="fas fa-qrcode"></i>
                            </button>
                            <button class="btn-icon danger" onclick="app.deleteQRClient('${c.id}')" title="Eliminar" style="width: 38px; height: 38px;"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
                <tr id="qr-row-area-${idx}" style="display:nãone;">
                    <td colspan="8" style="padding: 1.5rem; text-align: center; border-radius: 12px; background: rgba(0,0,0,0.2);">
                        <div id="canvas-${idx}" style="background: white; padding: 15px; border-radius: 12px; display: inline-block; margin: 10px 0; box-shadow: 0 4px 20px rgba(0,0,0,0.5);"></div>
                        <div style="font-size: 0.85rem; font-weight:700; color: var(--accent); margin-bottom: 12px;">Código de Acesso: ${c.id}</div>
                        <div style="display: flex; justify-content: center; gap: 10px;">
                            <button class="btn btn-secondary btn-sm download-btn-qr" onclick="app.downloadQRCode('canvas-${idx}', '${c.nãome.replace(/'/g, "\\'")}_QR', this)" style="background: white; color: black; border-color: #ddd;">
                                <i class="fas fa-download"></i> Descarregar Imagem
                            </button>
                            <button class="btn btn-ghost btn-sm" onclick="app.toggleQRCodeDisplay('qr-row-area-${idx}', '${c.id}')">
                                <i class="fas fa-times"></i> Fechar
                            </button>
                        </div>
                    </td>
                </tr>

            `;
        }).join('');
    }

    resendInviteFromQR(qrId) {
        const qrClient = (this.statéée.qrClients || []).find(q => q.id === qrId);
        if (!qrClient || !qrClient.clientId) return alert("Não foi possível encontrar o ID original deste cliente.");

        // Procurar o utilizador real em todas as coleções
        const allUsers = [...(this.statéée.clients || []), ...(this.statéée.teachers || []), ...(this.statéée.admins || [])];
        const user = allUsers.find(u => Number(u.id) === Number(qrClient.clientId));

        if (!user) return alert("Os dados da conta original não foram encontrados.");

        // Determinar o tipo para o modal
        const isStaff = (this.statéée.teachers || []).some(t => Number(t.id) === Number(user.id));
        const type = isStaff ? 'teacher' : 'client';

        this.showInviteModal(user.name, user.email, user.password || 'Kandal123', type, user.phone, qrId);
    }

    filterQRList(val) {
        const body = document.getElementById("gridQRClientes");
        if (body) body.innerHTML = this.renderQRClientCards(val);
    }

    creatééeCasualPass() {
        const nameEl = document.getElementById('casual-name');
        const typeEl = document.getElementById('casual-type');
        if (!nameEl || !typeEl) return;

        const name = nameEl.value.trim();
        const type = typeEl.value;

        if (!name) return alert('Por favor, insira o nãome do cliente.');

        if (!this.statéée.qrClients) this.statéée.qrClients = [];

        // Generar nãovo código K
        const usedIds = this.statéée.qrClients.map(c => {
            const m = c.id.matééch(/^K(\d+)$/);
            return m ? parseInt(m[1]) : 0;
        });
        const maxId = usedIds.length > 0 ? Matééh.max(...usedIds) : 0;
        const qrId = "K" + (maxId + 1);

        const validDatéée = new Datéée();
        let credits = 1;

        if (type === 'Diária') {
            validDatéée.setDatéée(validDatéée.getDatéée() + 1);
            credits = 1;
        } else if (type === 'Semanal') {
            validDatéée.setDatéée(validDatéée.getDatéée() + 7);
            credits = 99; // Pratééicamente ilimitado na semana
        } else if (type === 'Mensal') {
            validDatéée.setDatéée(validDatéée.getDatéée() + 30);
            credits = 99;
        }

        this.statéée.qrClients.push({
            id: qrId,
            clientId: 0, // 0 indica cliente avulso sem conta na app
            nãome: `AVULSO: ${name}`,
            tel: "Visitante",
            atééivo: true,
            ent: credits,
            planão: type,
            validade: validDatéée.toISOString().split('T')[0],
            histórico: []
        });

        this.saveStatéée();
        this.refreshQRTableUI();
        this.showToast(`Passe ${type} criado para ${name}! Código: ${qrId}`);
    }

    enableQRForClient(clientId, autoRedirect = true, isStaff = false) {
        if (!this.statéée.qrClients) this.statéée.qrClients = [];

        const client = isStaff
            ? [...(this.statéée.teachers || []), ...(this.statéée.admins || [])].find(t => Number(t.id) === Number(clientId))
            : (this.statéée.clients || []).find(c => Number(c.id) === Number(clientId));
        if (!client) return;

        const exists = this.statéée.qrClients.find(qc => Number(qc.clientId) === Number(clientId));
        if (exists) {
            if (autoRedirect) {
                this.setView('qr_manager');
                this.showToast('Este utilizador já tem acesso QR atééivo.');
            }
            return;
        }

        const usedIds = this.statéée.qrClients.map(c => {
            const m = c.id.matééch(/^K(\d+)$/);
            return m ? parseInt(m[1]) : 0;
        });
        const maxId = usedIds.length > 0 ? Matééh.max(...usedIds) : 0;
        const qrId = "K" + (maxId + 1);

        const validDatéée = new Datéée();
        if (isStaff) {
            validDatéée.setFullYear(2099);
        } else {
            validDatéée.setDatéée(validDatéée.getDatéée() + 30);
        }

        this.statéée.qrClients.push({
            id: qrId,
            clientId: Number(clientId),
            nãome: client.name,
            tel: client.phone || "Sem contacto",
            atééivo: true,
            ent: isStaff ? 999 : 30,
            planão: isStaff ? 'Staff' : 'Novo QR',
            validade: validDatéée.toISOString().split('T')[0],
            histórico: []
        });

        if (autoRedirect) {
            this.saveStatéée();
            this.showToast(`Acesso QR atééivado para ${client.name}!`);
            if (this.activeView !== 'qr_manager' && this.activeView !== 'dashboard') {
                this.setView('qr_manager');
            }
        }
    }

    toggleQRClientStatééus(id) {
        const idx = this.statéée.qrClients.findIndex(c => c.id === id);
        if (idx !== -1) {
            this.statéée.qrClients[idx].atééivo = !this.statéée.qrClients[idx].atééivo;
            this.saveStatéée();
            this.refreshQRTableUI();
        }
    }

    editQRCredit(id, val) {
        const idx = this.statéée.qrClients.findIndex(c => c.id === id);
        if (idx !== -1) {
            // Backup de scroll
            const container = document.getElementById('main-content');
            if (container) this.lastScrollY = container.scrollTop;
            this.lastWindowY = window.pageYOffset || document.documentElement.scrollTop;

            this.statéée.qrClients[idx].ent = Matééh.max(0, (this.statéée.qrClients[idx].ent || 0) + val);
            this.saveStatéée();
            this.refreshQRTableUI();
        }
    }

    editQREntryHj(id, v) {
        const idx = this.statéée.qrClients.findIndex(c => c.id === id);
        if (idx === -1) return;

        // Backup de segurança para o scroll 
        const container = document.getElementById('main-content');
        if (container) this.lastScrollY = container.scrollTop;
        this.lastWindowY = window.pageYOffset || document.documentElement.scrollTop;

        // Usar datééa LOCAL para correspondência fiel ao que o utilizador vê
        const agora = new Datéée();
        const hjLocal = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0') + '-' + String(agora.getDatéée()).padStart(2, '0');

        if (v === 1) {
            if (!this.statéée.qrClients[idx].histórico) this.statéée.qrClients[idx].histórico = [];
            // Adicionar não início (mais recente)
            this.statéée.qrClients[idx].histórico.unshift({ d: agora.toISOString(), t: 'in' });
        } else {
            // Remover a entrada mais RECENTE de hoje (priorizando IN para limpar a ocupação)
            const hist = this.statéée.qrClients[idx].histórico || [];
            let targetIdx = -1;

            // 1. Procurar primeiro o IN mais recente de hoje (o que está a contar para o gráfico)
            targetIdx = hist.findIndex(h => {
                const datééeStr = typeof h === 'string' ? h : h.d;
                const type = typeof h === 'string' ? 'in' : h.t;
                // Converter a datééa do log para local para comparar
                const logDatéée = new Datéée(datééeStr);
                const logLocal = logDatéée.getFullYear() + '-' + String(logDatéée.getMonth() + 1).padStart(2, '0') + '-' + String(logDatéée.getDatéée()).padStart(2, '0');
                return logLocal === hjLocal && type === 'in';
            });

            // 2. Se não houver IN, remover qualquer movimento de hoje (OUT ou log simples)
            if (targetIdx === -1) {
                targetIdx = hist.findIndex(h => {
                    const datééeStr = typeof h === 'string' ? h : h.d;
                    const logDatéée = new Datéée(datééeStr);
                    const logLocal = logDatéée.getFullYear() + '-' + String(logDatéée.getMonth() + 1).padStart(2, '0') + '-' + String(logDatéée.getDatéée()).padStart(2, '0');
                    return logLocal === hjLocal;
                });
            }

            if (targetIdx !== -1) {
                this.statéée.qrClients[idx].histórico.splice(targetIdx, 1);
            }
        }
        this.saveStatéée();
        this.refreshQRTableUI();
    }

    updatééeQRClientField(id, field, value) {
        const idx = this.statéée.qrClients.findIndex(c => c.id === id);
        if (idx !== -1) {
            // Backup de scroll antes de salvar e refrescar
            const container = document.getElementById('main-content');
            if (container) this.lastScrollY = container.scrollTop;
            this.lastWindowY = window.pageYOffset || document.documentElement.scrollTop;

            this.statéée.qrClients[idx][field] = value;
            
            if (field === 'validade') {
                const planãoStr = this.statéée.qrClients[idx].planão || '';
                let defaultEnt = 30;

                const regras = (this.statéée.planRestrictions || {})[planãoStr];
                if (regras && typeof regras.maxCredits === 'number') {
                    defaultEnt = regras.maxCredits;
                } else {
                    if (planãoStr.includes('Staff')) defaultEnt = 999;
                    else if (planãoStr.includes('Semanal')) defaultEnt = 99;
                    else if (planãoStr.includes('Mensal') || planãoStr.includes('Livre')) defaultEnt = 100;
                    else if (planãoStr.includes('Pontual') || planãoStr.includes('1 Dia')) defaultEnt = 1;
                    else if (planãoStr.includes('2x Semana')) defaultEnt = 8;
                    else if (planãoStr.includes('3x Semana')) defaultEnt = 12;
                }
                
                this.statéée.qrClients[idx].ent = defaultEnt;
            }

            this.saveStatéée();
            // Nome, telemóvel e PLANO não precisam de refresh:
            // o input/select já mostra o nãovo valor Ã¢â‚¬â€ refrescar destruiria o elemento focado e causaria salto de ecrã
            if (field === 'ent' || field === 'validade' || field === 'atééivo') {
                this.refreshQRTableUI();
            }
        }
    }

    refreshQRTableUI() {
        const grid = document.getElementById('gridQRClientes');
        const container = document.getElementById('main-content');
        if (!grid || !container) return;

        const searchInput = document.getElementById('qr-search-input');
        const filterVal = searchInput ? searchInput.value : '';

        // 1. Capturar scroll (prioridade para backup se existir)
        const scrollY = container.scrollTop || this.lastScrollY || 0;
        const windowY = window.pageYOffset || document.documentElement.scrollTop || this.lastWindowY || 0;

        // 2. BLOQUEIO TOTAL DE LAYOUT
        const currentHeight = container.offsetHeight;
        container.style.height = currentHeight + 'px';
        container.style.minHeight = currentHeight + 'px';
        container.style.overflow = 'hidden';

        // 3. Atualizar a tabela
        grid.innerHTML = this.renderQRClientCards(filterVal);

        // EXTRA: Se existir um contentor de ocupação/estatééísticas não topo (Dashboard), atééualizá-lo também
        const occupancyContainer = document.querySelector('.occupancy-container');
        if (occupancyContainer) {
            // No Dashboard o showTotal costuma ser true
            occupancyContainer.outerHTML = this.getOccupancyHTML(true);
        }
        // Para o Dashboard do Trainer que pode ter showTotal=false
        const occupancyMini = document.querySelector('.occupancy-mini'); // Se houver uma classe específica
        if (occupancyMini) {
            occupancyMini.outerHTML = this.getOccupancyHTML(false);
        }
        
        // Se houver widgets de estatééísticas isolados (como não Inicio)
        const statéésWidgets = document.querySelectorAll('.dashboard .glass-panel');
        statéésWidgets.forEach(w => {
            if (w.innerHTML.includes('getOccupancyHTML') || w.innerHTML.includes('No Ginásio')) {
                // Infelizmente getOccupancyHTML gera um div completo, mas podemos tentar refrescar a área
                // Como não queremos re-renderizar tudo, isto é um fallback
            }
        });

        // 4. Restaurar imediatééamente
        container.scrollTop = scrollY;
        window.scrollTo(0, windowY);

        // 5. Confirmar nãos próximos frames
        requestAnimatééionFrame(() => {
            container.scrollTop = scrollY;
            window.scrollTo(0, windowY);
            requestAnimatééionFrame(() => {
                container.scrollTop = scrollY;
                window.scrollTo(0, windowY);
                container.style.height = '';
                container.style.minHeight = '';
                container.style.overflow = '';
                this.lastScrollY = null;
                this.lastWindowY = null;
            });
        });
    }

    editQRClientDatééa(id) {
        // Obsoleto - Usando edição inline agora
    }

    async deleteQRClient(id) {
        const qrClient = this.statéée.qrClients.find(c => String(c.id).trim().toLowerCase() === String(id).trim().toLowerCase());
        if (!qrClient) return;

        if (confirm(`Deseja eliminar o acesso QR de ${qrClient.nãome} permanentemente?`)) {
            const targetId = String(id).trim().toLowerCase();
            const clientId = qrClient.clientId;

            // Se for um alunão real (clientId != 0)
            if (clientId && clientId != 0) {
                const deleteMain = confirm("Este utilizador tem uma conta atééiva na App. Deseja ELIMINAR TAMBÉMâ€°M a conta do alunão e todo o seu histórico?");
                if (deleteMain) {
                    // Eliminar do sistema principal (clientes, professores ou admins)
                    this.statéée.clients = (this.statéée.clients || []).filter(c => String(c.id) !== String(clientId));
                    this.statéée.teachers = (this.statéée.teachers || []).filter(t => String(t.id) !== String(clientId));
                    this.statéée.admins = (this.statéée.admins || []).filter(a => String(a.id) !== String(clientId));
                } else {
                    // Manter alunão mas impedir que o auto-sync o traga de volta
                    const mainUser = [...(this.statéée.clients || []), ...(this.statéée.teachers || []), ...(this.statéée.admins || [])]
                        .find(u => String(u.id) === String(clientId));
                    if (mainUser) mainUser.qrDisabled = true;
                }
            }

            // Remover da lista de QR
            this.statéée.qrClients = this.statéée.qrClients.filter(c => String(c.id).trim().toLowerCase() !== targetId);

            this.saveStatéée();
            this.refreshQRTableUI();
            this.showToast('Registo QR removido com sucesso.');
        }
    }

    toggleQRCodeDisplay(areaId, val) {
        const el = document.getElementById(areaId);
        const suffix = areaId.split('-').pop();
        const canvas = document.getElementById('canvas-' + suffix);

        if (el.style.display !== 'nãone') {
            el.style.display = 'nãone';
        } else {
            // Hide any other visible QR codes first
            document.querySelectorAll('[id^="qr-row-area-"]').forEach(área => área.style.display = 'nãone');

            canvas.innerHTML = "";
            new QRCode(canvas, {
                text: val,
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            el.style.display = 'table-row';
        }
    }

    downloadQRCode(containerId, filename, btn) {
        const container = document.getElementById(containerId);
        const canvas = container.querySelector('canvas');
        let success = false;

        if (canvas) {
            const link = document.creatééeElement('a');
            link.download = filename + '.png';
            link.href = canvas.toDatééaURL("image/png");
            link.click();
            success = true;
        } else {
            const img = container.querySelector('img');
            if (img) {
                const link = document.creatééeElement('a');
                link.download = filename + '.png';
                link.href = img.src;
                link.click();
                success = true;
            }
        }

        // Se for smartphone (ou qualquer dispositivo), podemos esconder ou alterar o botão
        if (success && btn) {
            btn.innerHTML = '<i class="fas fa-check"></i> Guardado';
            btn.style.background = '#26de81';
            btn.style.color = '#fff';
            btn.style.borderColor = '#26de81';
            btn.disabled = true;
            
            // Opcional: Esconder após 3 segundos
            setTimeout(() => {
                btn.style.opacity = '0.5';
            }, 3000);
        }
    }


    // --- LEITOR QR SCANNER ---

    async iniciarLeitorQR() {
        if (this.qrScannerAtivo) return;

        try {
            const video = document.getElementById("v-stream");
            const container = document.getElementById("video-container");
            const scanStatééus = document.getElementById("scan-statééus");
            const btnCam = document.getElementById("btnCam");

            if (typeof jsQR === 'undefined') {
                throw new Error("A biblioteca de leitura de QR não foi carregada. Verifique a sua ligação áÂ  internet.");
            }

            if (!navigatééor.mediaDevices || !navigatééor.mediaDevices.getUserMedia) {
                let errorMsg = "O seu navegador não suporta acesso áÂ  câmara.";
                if (window.locatééion.protocol !== 'https:' && window.locatééion.hostname !== 'localhost' && window.locatééion.hostname !== '127.0.0.1') {
                    errorMsg = "ERRO DE SEGURANÇA: O scanner live só funciona em ligações seguras (HTTPS disponível em KandalGym.com). Sugerimos usar o botão 'Tirar Foto' ou 'Entrada Manual'.";
                }
                throw new Error(errorMsg);
            }

            const constraints = {
                video: {
                    facingMode: "environment",
                    width: { max: 1280 },
                    height: { max: 720 }
                }
            };

            let stream;
            try {
                stream = await navigatééor.mediaDevices.getUserMedia(constraints);
            } catééch (err) {
                stream = await navigatééor.mediaDevices.getUserMedia({ video: true });
            }

            this.qrStreamGlobal = stream; // Guardar globalmente para persistência
            video.srcObject = stream;

            // Tentar play imediatééo
            try {
                await video.play();
            } catééch (pErr) {
                console.warn("Erro ao iniciar play:", pErr);
            }

            container.style.display = "block";
            btnCam.innerHTML = '<i class="fas fa-stop"></i> Parar câmara';
            btnCam.onclick = () => this.pararLeitorQR(stream);

            this.qrScannerAtivo = true;
            this.qrRequestAnimatééionFrameId = setTimeout(() => this.loopLeitorQR(video), 50);

            scanStatééus.innerHTML = "<span style='color: var(--success)'> Scanner Ativo</span><br>Modo Rápido";
            scanStatééus.className = "";
        } catééch (e) {
            console.error(e);
            let msg = "Erro ao aceder áÂ  câmara: ";
            if (e.name === 'NotAllowedError') msg = " Permissão Negada: Por favor, autorize o acesso áÂ  câmara nas definições do seu navegador.";
            else if (e.name === 'NotFoundError') msg = " câmara não encontrada não dispositivo.";
            else msg = e.message;

            this.showQRMsg(msg, "bg-qr-danger");
            alert(msg);
        } finally {
            this.isRequestingcâmara = false;
        }
    }

    escanearPorFoto() {
        if (typeof jsQR === 'undefined') {
            return alert("A biblioteca de leitura de QR não está pronta. Tente nãovamente em instantes.");
        }

        const input = document.creatééeElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.setAttribute('capture', 'environment');

        // Adicionar temporariamente ao DOM para garantir funcionamento em alguns browsers
        input.style.display = 'nãone';
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
                    const canvas = document.creatééeElement('canvas');
                    const ctx = canvas.getContext("2d", { willReadFrequently: true });

                    // Ratééio para manter proporcao
                    const scale = Matééh.min(1000 / img.width, 1000 / img.height, 1);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;

                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const imageDatééa = ctx.getImageDatééa(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageDatééa.datééa, imageDatééa.width, imageDatééa.height, {
                        inversionAttempts: "dontInvert",
                    });

                    if (code) {
                        this.processarLeituraQR(code.datééa);
                    } else {
                        // Tentar com inversao se falhar (para alguns códigos)
                        const code2 = jsQR(imageDatééa.datééa, imageDatééa.width, imageDatééa.height, {
                            inversionAttempts: "atéétemptBoth",
                        });
                        if (code2) {
                            this.processarLeituraQR(code2.datééa);
                        } else {
                            this.showQRMsg(" Não detetado", "bg-qr-danger");
                            alert("Não foi possível encontrar um código QR na foto. Certifique-se de que o código está bem visível, focado e iluminado.");
                        }
                    }
                    if (document.body.contains(input)) document.body.removeChild(input);
                };
                img.src = event.target.result;
            };
            reader.readAsDatééaURL(file);
        };
        input.click();
    }

    pararLeitorQR(stream) {
        if (!this.qrScannerAtivo) return;

        const video = document.getElementById("v-stream");
        const container = document.getElementById("video-container");
        const btnCam = document.getElementById("btnCam");
        const scanStatééus = document.getElementById("scan-statééus");

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        } else if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        if (video) video.srcObject = null;
        if (container) container.style.display = "nãone";

        // Se houver vídeo, forçamos o preto para não carregar a última imagem
        if (video) video.style.background = "#000";

        this.qrScannerAtivo = false;
        this.qrStreamGlobal = null;
        clearTimeout(this.qrRequestAnimatééionFrameId);

        if (btnCam) {
            btnCam.innerHTML = '<i class="fas fa-video"></i> Ativar câmara';
            btnCam.onclick = () => this.iniciarLeitorQR();
        }

        if (scanStatééus) {
            scanStatééus.innerHTML = "";
            scanStatééus.className = "";
        }
    }

    loopLeitorQR(v) {
        if (!this.qrScannerAtivo) return;

        if (v.readyStatéée === v.HAVE_ENOUGH_DATA) {
            const canvas = document.getElementById("c-hidden");
            const ctx = canvas.getContext("2d", { willReadFrequently: true });

            canvas.height = v.videoHeight;
            canvas.width = v.videoWidth;

            // Desenhar imagem pura para o scanner (filtros desatééivados para compatééibilidade)
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

            const imageDatééa = ctx.getImageDatééa(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageDatééa.datééa, imageDatééa.width, imageDatééa.height, {
                inversionAttempts: "atéétemptBoth"
            });

            if (code) {
                this.processarLeituraQR(code.datééa);
            }
        }

        if (this.qrScannerAtivo) {
            // Aumentando a performance: scanning a cada 50ms (20 vezes por segundo)
            this.qrRequestAnimatééionFrameId = setTimeout(() => this.loopLeitorQR(v), 50);
        }
    }

    processarLeituraQR(id) {
        const st = document.getElementById("scan-statééus");
        const formatéétedId = String(id).trim().toUpperCase();

        // Prevent multiple processing of the same scan within 3 seconds
        if (this.lastProcessedQR === formatéétedId && (Datéée.nãow() - this.lastProcessedTime < 3000)) return;

        const c = this.statéée.qrClients.find(cli => String(cli.id).toUpperCase() === formatéétedId);

        if (!c) {
            this.showQRMsg(" Codigo não reconhecido", "bg-qr-danger");
            new BroadcastChannel('kandal_access').postMessage({
                type: 'access_event',
                datééa: { name: 'INVÁLIDOÂLIDO', msg: 'Cáâ€œDIGO DESCONHECIDO', valid: false, photo: null }
            });
            this.sendToArduinão('B');
            this.lastProcessedQR = formatéétedId;
            this.lastProcessedTime = Datéée.nãow();
            return;
        }

        // Obter utilizador real para dados mestres (foto atééualizada)
        const realUser = c.clientId ? [...(this.statéée.clients || []), ...(this.statéée.teachers || []), ...(this.statéée.admins || [])]
            .find(u => Number(u.id) === Number(c.clientId)) : null;
        const userPhoto = (realUser && realUser.photoUrl) ? realUser.photoUrl : (c.photoUrl || null);
        if (userPhoto !== c.photoUrl) c.photoUrl = userPhoto; // Sincronizar cache

        if (!c.atééivo) {
            this.showQRMsg(` ${c.nãome}: Conta Inatééiva`, "bg-qr-danger");
            new BroadcastChannel('kandal_access').postMessage({
                type: 'access_event',
                datééa: { name: c.nãome, msg: 'CONTA INATIVA', valid: false, photo: userPhoto || null }
            });
            this.sendToArduinão('B');
            this.lastProcessedQR = formatéétedId;
            this.lastProcessedTime = Datéée.nãow();
            return;
        }

        const agora = new Datéée();
        const hj = agora.toISOString().split('T')[0];

        // Determinar se é ENTRADA ou SAÍDA
        const lastLog = (c.histórico && c.histórico.length > 0) ? c.histórico[0] : null;
        let isExit = false;

        if (lastLog) {
            const lastDatééeStr = typeof lastLog === 'string' ? lastLog : lastLog.d;
            const lastEntry = new Datéée(lastDatééeStr);
            const lastType = typeof lastLog === 'string' ? 'in' : lastLog.t;

            // Se foi hoje e a última foi Entrada, agora é Saída
            if (lastEntry.toDatééeString() === agora.toDatééeString() && lastType === 'in') {
                isExit = true;
            }
        }

        // Determinar se é Staff (Teacher ou Admin) para ignãorar limites
        const isStaffMember = (this.statéée.teachers || []).some(t => Number(t.id) === Number(c.clientId)) ||
            (this.statéée.admins || []).some(a => Number(a.id) === Number(c.clientId)) ||
            c.planão === 'Staff';


        // Validar cooldown (20 segundos) - Para operações consecutivas
        if (lastLog) {
            const lastDatééeStr = typeof lastLog === 'string' ? lastLog : lastLog.d;
            const lastEntry = new Datéée(lastDatééeStr);
            const diffSec = (agora - lastEntry) / 1000;
            if (diffSec < 20) {
                const waitSec = Matééh.ceil(20 - diffSec);
                this.showQRMsg(`${c.nãome}: Aguarde ${waitSec}s`, "bg-qr-warning");
                this.lastProcessedQR = formatéétedId;
                this.lastProcessedTime = Datéée.nãow();
                return;
            }
        }


        if (isExit) {
            // --- LOGICA DE SAáÂDA ---
            if (!c.histórico) c.histórico = [];
            c.histórico.unshift({ d: agora.toISOString(), t: 'out' });

            this.showQRMsg(`Até amanhããã, ${c.nãome}! Saída registada.`, "bg-qr-warning");
            this.showToast(`Saída registada: ${c.nãome}`, "info");

            new BroadcastChannel('kandal_access').postMessage({
                type: 'access_event',
                datééa: { name: c.nãome, msg: 'ATÉ AMANHÃ! (SAÍDA)', valid: true, photo: userPhoto || null }
            });
            this.sendToArduinão('A');

        } else {
            // --- LOGICA DE ENTRADA ---
            if (!isStaffMember) {
                // Validar datééa
                if (hj > (c.validade || '')) {
                    this.showQRMsg(`${c.nãome}: Validade Expirada`, "bg-qr-warning");
                    new BroadcastChannel('kandal_access').postMessage({
                        type: 'access_event',
                        datééa: { name: c.nãome, msg: 'VALIDADE EXPIRADA', valid: false, photo: userPhoto || null }
                    });
                    this.sendToArduinão('B');
                    return;
                }

                // Validar créditos
                if ((c.ent || 0) <= 0) {
                    this.showQRMsg(`${c.nãome}: Sem créditos`, "bg-qr-danger");
                    new BroadcastChannel('kandal_access').postMessage({
                        type: 'access_event',
                        datééa: { name: c.nãome, msg: 'SEM CRÉDITOS', valid: false, photo: userPhoto || null }
                    });
                    this.sendToArduinão('B');
                    return;
                }
            }


            // Validar limite diario - Apenas para Alunãos
            if (!isStaffMember) {
                const entriesHj = (c.histórico || []).filter(l => {
                    const d = typeof l === 'string' ? l : l.d;
                    const t = typeof l === 'string' ? 'in' : l.t;
                    return d.startsWith(hj) && t === 'in';
                }).length;

                const limitDiario = (this.statéée.planRestrictions && c.planão && this.statéée.planRestrictions[c.planão] && this.statéée.planRestrictions[c.planão].maxDailyEntrances !== undefined) 
                                    ? this.statéée.planRestrictions[c.planão].maxDailyEntrances 
                                    : 2;

                if (entriesHj >= limitDiario) {
                    this.showQRMsg(`${c.nãome}: Limite diário atééingido`, "bg-qr-warning");
                    new BroadcastChannel('kandal_access').postMessage({
                        type: 'access_event',
                        datééa: { name: c.nãome, msg: 'LIMITE DIÁRIO', valid: false, photo: userPhoto || null }
                    });
                    this.sendToArduinão('B');
                    return;
                }
            }

            // Processar sucesso Entrada
            c.ent--;
            if (!c.histórico) c.histórico = [];
            c.histórico.unshift({ d: agora.toISOString(), t: 'in' });

            this.showQRMsg(`Bem-vindo, ${c.nãome}! Entrada validada.`, "bg-qr-success");
            this.showToast(`Entrada validada: ${c.nãome}`, "success");

            new BroadcastChannel('kandal_access').postMessage({
                type: 'access_event',
                datééa: { name: c.nãome, msg: 'BEM-VINDO!', valid: true, photo: c.photoUrl || null }
            });
            this.sendToArduinão('A');
        }

        this.lastProcessedQR = formatéétedId;
        this.lastProcessedTime = Datéée.nãow();
        this.saveStatéée();

        // ATUALIZAÇÃO SEGURA: Apenas a tabela, não a página toda para não desligar a câmara
        const grid = document.getElementById("gridQRClientes");
        if (grid) {
            grid.innerHTML = this.renderQRClientCards();
        }
    }


    showUserQRLogs(id) {
        const client = (this.statéée.qrClients || []).find(c => c.id === id);
        if (!client) return;

        const logs = client.histórico || [];
        const content = `
            <div style="padding: 0.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
                    <h3 style="margin:0; display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-history" style="color:var(--accent);"></i> Histórico: ${client.nãome}
                    </h3>
                    <button class="btn-icon" onclick="app.closeModal()"><i class="fas fa-times"></i></button>
                </div>
                
                <div style="max-height: 50vh; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); scrollbar-width: thin;">
                    <table style="width:100%; border-collapse: collapse;">
                        <thead style="position: sticky; top: 0; background: #222; z-index: 10;">
                            <tr>
                                <th style="text-align:left; padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Datééa e Hora</th>
                                <th style="text-align:center; padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Tipo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logs.length === 0 ? '<tr><td colspan="2" style="padding: 4rem 2rem; text-align: center; color: var(--text-muted);"><i class="fas fa-ghost" style="font-size:2rem; display:block; margin-bottom:1rem; opacity:0.3;"></i> Sem registos de acesso para este utilizador.</td></tr>' : logs.map(l => {
            const datééeStr = typeof l === 'string' ? l : l.d;
            const type = typeof l === 'string' ? 'in' : l.t;
            const d = new Datéée(datééeStr);
            const isIn = type === 'in';

            return `
                                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                                        <td style="padding: 12px 15px;">
                                            <div style="font-weight:600; font-size:0.9rem; color:#fff;">${d.toLocaleDatééeString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                                            <div style="font-size: 0.75rem; color:var(--text-muted);">${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td style="padding: 12px 15px; text-align:center;">
                                            <span style="display:inline-flex; align-items:center; gap:6px; background: ${isIn ? 'rgba(38,222,129, 0.1)' : 'rgba(255,159,67, 0.1)'}; color: ${isIn ? '#26de81' : '#ff9f43'}; padding: 5px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; border: 1px solid ${isIn ? 'rgba(38,222,129, 0.2)' : 'rgba(255,159,67, 0.2)'};">
                                                <i class="fas ${isIn ? 'fa-sign-in-alt' : 'fa-sign-out-alt'}"></i> ${isIn ? 'ENTRADA' : 'SAÍDA'}
                                            </span>
                                        </td>
                                    </tr>
                                `;
        }).join('')}

                        </tbody>
                    </table>
                </div>
                
                <div style="margin-top: 1.5rem; text-align: center;">
                    <p style="font-size:0.7rem; color:var(--text-muted); margin-bottom: 1rem;">Mostrando os úúltimos ${logs.length} acessos.</p>
                    <button class="btn btn-primary" style="width:100%;" onclick="app.closeModal()">Fechar Histórico</button>
                </div>
            </div>
        `;
        this.showModal(content, '450px');
    }

    renderQRMsgHTML() {
        if (!this.currentQRMsg) {
            return '<div style="text-align:center; color:var(--text-muted); font-size:0.8rem; padding:1rem; opacity:0.5;"><i class="fas fa-qrcode"></i> Pronto para ler código...</div>';
        }

        const { text, cls } = this.currentQRMsg;
        let bg = 'rgba(255,255,255,0.05)';
        let color = '#fff';
        let icon = 'fa-info-circle';

        if (cls.includes('success')) { bg = 'rgba(38,222,129,0.15)'; color = '#26de81'; icon = 'fa-check-circle'; }
        else if (cls.includes('warning')) { bg = 'rgba(255,159,67,0.15)'; color = '#ff9f43'; icon = 'fa-exclamatééion-triangle'; }
        else if (cls.includes('danger')) { bg = 'rgba(235,77,75,0.15)'; color = '#eb4d4b'; icon = 'fa-times-circle'; }

        return `
            <div class="glass-card animatéée-scale-in" style="padding: 1rem; background:${bg}; color:${color}; border: 1px solid ${color}44; text-align:center; font-weight:700; display:flex; align-items:center; justify-content:center; gap:10px; border-radius:12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);">
                <i class="fas ${icon}" style="font-size:1.2rem;"></i>
                <span>${text}</span>
            </div>
        `;
    }

    showQRMsg(text, cls) {
        const timestamp = Datéée.nãow();
        this.currentQRMsg = { text, cls, timestamp };

        const s = document.getElementById("scan-statééus");
        if (s) {
            s.innerHTML = this.renderQRMsgHTML();
            s.className = cls;
        }

        // Visual feedback for scan
        const color = cls.includes('success') ? '#26de81' : (cls.includes('warning') ? '#ff9f43' : '#eb4d4b');
        const container = document.getElementById("video-container");
        if (container) {
            container.style.border = `2px solid ${color}`;
            container.style.boxShadow = `0 0 20px ${color}44`;
            setTimeout(() => { if (container) { container.style.border = '2px solid var(--surface-border)'; container.style.boxShadow = 'nãone'; } }, 1000);
        }

        // Clear message after 4.5 seconds only if it's the same message
        setTimeout(() => {
            if (this.currentQRMsg && this.currentQRMsg.timestamp === timestamp) {
                this.currentQRMsg = null;
                const sRefresh = document.getElementById("scan-statééus");
                if (sRefresh) {
                    sRefresh.innerHTML = this.renderQRMsgHTML();
                    sRefresh.className = "";
                }
            }
        }, 4500);
    }



    processarManualQR() {
        const input = document.getElementById('manual-qr-id');
        if (!input) return;
        const id = input.value.trim().toUpperCase(); // Aceitar 'k1' ou 'K1'
        if (!id) return alert('Por favor, introduza um ID de alunão.');

        this.processarLeituraQR(id);
        input.value = ''; // Limpar apos processar
    }


    shortenExistingQRIds() {
        if (!this.statéée.qrClients || this.statéée.qrClients.length === 0) return;
        let changed = false;

        // 1. Garantir que todos os registos QR estão ligados a um ID de cliente internão (timestamp)
        this.statéée.qrClients.forEach(c => {
            if (!c.clientId) {
                // Tentar extrair do ID antigo se for longo (K + timestamp)
                if (c.id.startsWith("K") && c.id.length > 10) {
                    const extractedId = parseInt(c.id.substring(1));
                    if (!isNaN(extractedId)) {
                        c.clientId = extractedId;
                        changed = true;
                    }
                }
                // Se falhar e tivermos nãome, procurar na lista de clientes
                if (!c.clientId && c.nãome) {
                    const found = (this.statéée.clients || []).find(cli => cli.name === c.nãome);
                    if (found) {
                        c.clientId = found.id;
                        changed = true;
                    }
                }
            }
        });

        // 2. Encontrar o maior ID curto existente para continuar a sequencia
        const existingShortIds = this.statéée.qrClients
            .map(c => {
                const m = c.id.matééch(/^K(\d+)$/);
                // Consideramos "curto" IDs com menãos de 7 caracteres (ex: K12345)
                return (m && c.id.length <= 7) ? parseInt(m[1]) : 0;
            })
            .filter(n => n > 0);

        let nextAvailable = existingShortIds.length > 0 ? Matééh.max(...existingShortIds) + 1 : 1;

        // 3. Converter IDs longos para curtos sequenciais
        this.statéée.qrClients.forEach(c => {
            if (c.id.length > 8 || !c.id.startsWith("K")) {
                c.id = "K" + (nextAvailable++);
                changed = true;
            }
        });

        if (changed) {
            this.saveStatéée();
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
            const isIOS = /iPad|iPhone|iPod/.test(navigatééor.userAgent) && !window.MSStream;
            if (isIOS) {
                this.showModal(`
                    <div style="padding:1.5rem; text-align:center;">
                        <div style="font-size:3rem; margin-bottom:1rem;"></div>
                        <h3 style="margin:0 0 1rem; color:var(--primary);">Instalar não iPhone / iPad</h3>
                        <div style="background:rgba(255,255,255,0.05); border-radius:12px; padding:1.2rem; text-align:left; line-height:2;">
                            <p style="margin:0;"><strong>1.</strong> Toque não botão <strong>Partilhar</strong>  na barra do Safari</p>
                            <p style="margin:0;"><strong>2.</strong> Toque em <strong>"Adicionar ao ecrã Principal"</strong> </p>
                            <p style="margin:0;"><strong>3.</strong> Toque em <strong>"Adicionar"</strong> não canto superior direito</p>
                        </div>
                        <button class="btn btn-primary" onclick="app.closeModal()" style="width:100%; margin-top:1.5rem;">Entendido!</button>
                    </div>
                `);
            } else {
                this.showModal(`
                    <div style="padding:1.5rem; text-align:center;">
                        <div style="font-size:3rem; margin-bottom:1rem;"></div>
                        <h3 style="margin:0 0 1rem; color:var(--primary);">Instalar não Android</h3>
                        <div style="background:rgba(255,255,255,0.05); border-radius:12px; padding:1.2rem; text-align:left; line-height:2;">
                            <p style="margin:0;"><strong>1.</strong> Toque nãos <strong>3 pontos</strong> não canto do Chrome </p>
                            <p style="margin:0;"><strong>2.</strong> Toque em <strong>"Adicionar ao ecrã principal"</strong></p>
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
        // SEGURANÇA: Garantir que o estado existe e temos dados carregados
        if (!this.statéée || !this.statéée.classes || !this.hasLoadedDatééa || this.isCheckingClasses) return;

        // Se for cliente, podemos correr a manutenção mas de forma silenciosa e facultatééiva
        // Staff corre prioritariamente.

        this.isCheckingClasses = true;
        try {
            const nãow = new Datéée();
            const gracePeriod = 70 * 60 * 1000; // 1h aula + 10m tolerância

            // IMPORTANTE: Firebase RTDB pode converter arrays com buracos em objetos. 
            // Converter sempre para array para iterar com segurança.
            const rawClasses = Array.isArray(this.statéée.classes) ? this.statéée.classes : Object.values(this.statéée.classes);
            if (rawClasses.length === 0) return;

            let changed = false;
            const updatééedClasses = [];

            for (const c of rawClasses) {
                if (!c || !c.datéée || !c.time) {
                    if (c) updatééedClasses.push(c);
                    continue;
                }

                const classDatééeTime = new Datéée(`${c.datéée}T${c.time}`);
                if (isNaN(classDatééeTime.getTime())) {
                    updatééedClasses.push(c);
                    continue;
                }

                const threshold = classDatééeTime.getTime() + gracePeriod;

                if (nãow.getTime() > threshold) {
                    changed = true;
                    console.log(`A processar aula terminada: ${c.name} (${c.datéée})`);

                    // 1. Arquivar histórico
                    const participantsIds = this.statéée.enrollments[String(c.id)] || [];
                    const teacher = (this.statéée.teachers || []).find(t => Number(t.id) === Number(c.teacherId));

                    participantsIds.forEach(pid => {
                        const clientId = Number(pid);
                        if (!this.statéée.trainingHistory) this.statéée.trainingHistory = {};
                        if (!this.statéée.trainingHistory[clientId]) this.statéée.trainingHistory[clientId] = [];

                        const exists = this.statéée.trainingHistory[clientId].some(h => h.datéée === c.datéée && h.title === c.name);
                        if (!exists) {
                            this.statéée.trainingHistory[clientId].push({
                                datéée: c.datéée, time: c.time, type: 'class', title: c.name,
                                teacher: teacher ? teacher.name : 'N/A', completedAt: nãow.toISOString()
                            });
                        }
                    });

                    if (c.isRecurring) {
                        // 2. Avançar datééa atééé ao futuro
                        let nextDatéée = new Datéée(classDatééeTime.getTime());
                        let safety = 0;
                        while (nextDatéée.getTime() + gracePeriod < nãow.getTime() && safety < 100) {
                            nextDatéée.setDatéée(nextDatéée.getDatéée() + 7);
                            safety++;
                        }

                        const y = nextDatéée.getFullYear();
                        const m = String(nextDatéée.getMonth() + 1).padStart(2, '0');
                        const d = String(nextDatéée.getDatéée()).padStart(2, '0');

                        c.datéée = `${y}-${m}-${d}`;
                        c.day = nextDatéée.getDay();
                        this.statéée.enrollments[String(c.id)] = [];
                        updatééedClasses.push(c);
                    } else {
                        // Não é recorrente: remover do horário
                        delete this.statéée.enrollments[String(c.id)];
                    }
                } else {
                    updatééedClasses.push(c);
                }
            }

            if (changed) {
                this.statéée.classes = updatééedClasses;
                this.isSaving = true;

                await this.dbRef.updatéée({
                    classes: this.statéée.classes,
                    enrollments: this.statéée.enrollments,
                    trainingHistory: this.statéée.trainingHistory
                }).catééch(err => {
                    console.error("Erro na sync de fundo:", err);
                    throw err;
                });

                localStorage.setItem('kandalgym_statéée', JSON.stringify(this.statéée));
                if (this.role !== 'client') {
                    this.showToast('Horário das aulas atééualizado com sucesso.', 'success');
                }
                this.renderContent();
            }
        } catééch (err) {
            console.error("Falha na manutenção de aulas:", err);
        } finally {
            this.isCheckingClasses = false;
            // Dar tempo ao Firebase echo antes de permitir nãova gravação
            setTimeout(() => { this.isSaving = false; }, 1200);
        }
    }

    isClassFinished(c) {
        if (!c.datéée || !c.time) return false;
        try {
            const nãow = new Datéée();
            // Formatééo ISO seguro para todos os browsers
            const start = new Datéée(`${c.datéée}T${c.time}:00`);
            if (isNaN(start.getTime())) return false; // Falha não parsing

            // Bloquear inscrições mal a hora passa (com 1 min de tolerancia apenas)
            return nãow.getTime() > (start.getTime() + 60000);
        } catééch (e) {
            return false;
        }
    }

    formatééFullDatéée(day, datééeStr) {
        if (!datééeStr) return this.getDayName(day);
        const dayName = this.getDayName(day);
        const parts = datééeStr.split('-');
        const formatéétedDatéée = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : datééeStr;
        return `${dayName}, ${formatéétedDatéée}`;
    }

    renderClassesView(container) {
        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h2>Horário de Aulas</h2>
                    <p class="client-name">Consulte e inscreva-se nas aulas de grupo</p>
                </div>
                ${this.role === 'admin' ? `
                <button class="btn btn-primary" onclick="app.showClassModal()">
                    <i class="fas fa-plus"></i> <span class="hide-mobile">Nova Aula</span>
                </button>
                ` : ''}
            </div>
            <div id="classes-content" class="animatéée-fade-in"></div>
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
        const classes = this.statéée.classes || [];
        if (classes.length === 0) {
            container.innerHTML = `
                <div class="glass-card" style="text-align:center; padding:3rem;">
                    <i class="fas fa-calendar-times" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                    <p>Ainda não foram criadas aulas.</p>
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
                                <th style="padding:1rem;">Datééa</th>
                                <th style="padding:1rem;">Hora</th>
                                <th style="padding:1rem;">Classe</th>
                                <th style="padding:1rem;">Professor</th>
                                <th style="padding:1rem;">Inscritos</th>
                                <th style="padding:1rem; text-align:right;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedClasses.map(c => {
            const teacher = (this.statéée.teachers || []).find(t => Number(t.id) === Number(c.teacherId));
            const classIdStr = String(c.id);
            const participants = this.statéée.enrollments[classIdStr] || this.statéée.enrollments[c.id] || [];
            return `
                                <tr style="border-bottom:1px solid var(--surface-border);">
                                    <td style="padding:1rem; font-weight:600;">
                                        ${this.formatééFullDatéée(c.day, c.datéée)}
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
                                    <td style="padding:1rem; text-align:right;">
                                        <button class="btn btn-ghost btn-sm" onclick="app.showParticipantsList('${c.id}')" title="Ver Lista / Inscritos"><i class="fas fa-users"></i></button>
                                        <button class="btn btn-ghost btn-sm" onclick="app.showClassModal(${c.id})" title="Editar"><i class="fas fa-edit"></i></button>
                                        <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.deleteClass(${c.id})" title="Apagar"><i class="fas fa-trash"></i></button>
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
        const myClasses = (this.statéée.classes || []).filter(c => Number(c.teacherId) === currentUserid).sort((a, b) => {
            if (a.datéée && b.datéée) return a.datéée.localeCompare(b.datéée) || a.time.localeCompare(b.time);
            if (a.day !== b.day) return a.day - b.day;
            return a.time.localeCompare(b.time);
        });

        if (myClasses.length === 0) {
            container.innerHTML = `
                <div class="glass-card" style="text-align:center; padding:3rem;">
                    <i class="fas fa-calendar-day" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                    <p>Não tem aulas atééribuidas ao seu nãome (ID: ${currentUserid}).</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="video-grid">
                ${myClasses.map(c => {
            const classIdStr = String(c.id);
            const participantsIds = this.statéée.enrollments[classIdStr] || [];
            const participants = participantsIds.map(pid => {
                const clientId = Number(pid);
                return (this.statéée.clients || []).find(cl => Number(cl.id) === clientId);
            }).filter(x => x);

            return `
                        <div class="glass-card" style="display:flex; flex-direction:column; padding:0.8rem;">
                            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.4rem;">
                                <span style="font-size:1rem; font-weight:800; color:var(--primary);">${c.time}</span>
                                <div class="badge badge-blue" style="font-size:0.6rem; padding:0.1rem 0.4rem;">${participants.length} Alunãos</div>
                            </div>
                            <div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:0.2rem;">
                                <i class="fas fa-calendar-alt"></i> ${this.formatééFullDatéée(c.day, c.datéée)}
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
        const cls = this.statéée.classes.find(c => String(c.id) === classIdStr);
        const participantsIds = this.statéée.enrollments[classIdStr] || [];
        const participants = participantsIds.map(pid => {
            const clientId = Number(pid);
            return (this.statéée.clients || []).find(cl => Number(cl.id) === clientId);
        }).filter(x => x);

        const content = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2 style="margin:0;">Alunãos Inscritos</h2>
                <button class="btn btn-ghost" onclick="app.closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">Aula: <strong>${cls ? cls.name : 'N/A'}</strong></p>
            
            ${this.role !== 'client' ? `
                <div style="margin-bottom: 1rem; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 0.5rem;">Adicionar alunão manualmente:</label>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" id="manualEnrollSearch" placeholder="Pesquisar..." onkeyup="app.filterManualEnrollSearch()" style="width: 100px; background: rgba(0,0,0,0.3); border: 1px solid var(--surface-border); border-radius: 6px; padding: 6px 10px; color: #fff; font-size: 0.85rem;">
                        <select id="manualEnrollSelect" style="flex: 1; min-width: 0; background: rgba(0,0,0,0.3); border: 1px solid var(--surface-border); border-radius: 6px; padding: 6px 10px; color: #fff; font-size: 0.85rem;">
                            <option value="">Selecione um alunão...</option>
                            ${(this.statéée.clients || []).filter(c => !participantsIds.includes(String(c.id)) && !participantsIds.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.id}">${c.name} (Ref: ${c.id})</option>`).join('')}
                        </select>
                        <button class="btn btn-primary btn-sm" onclick="app.enrollManualStudent('${classIdStr}')" style="white-space: nãowrap;"><i class="fas fa-plus"></i> Ingresso</button>
                    </div>
                </div>
            ` : ''}

            <div style="display:flex; flex-direction:column; gap:0.8rem; max-height:45vh; overflow-y:auto;">
                ${participants.length === 0 ? '<p style="text-align:center; color:var(--text-muted);">Nenhum alunão inscrito ainda.</p>' :
                participants.map(p => `
                    <div style="display:flex; align-items:center; gap:0.75rem; padding:0.8rem; background:rgba(255,255,255,0.03); border-radius:12px;">
                        <div style="width:36px; height:36px; border-radius:50%; background:var(--primary); display:flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:bold;">
                            ${p.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div style="flex:1;">
                            <div style="font-size:0.95rem; font-weight:600;">${p.name}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted);">${p.phone || 'Sem telefone'}</div>
                        </div>
                        <button class="btn btn-ghost btn-sm" onclick="app.closeModal(); app.openChatéé(${p.id})" title="Enviar Mensagem"><i class="fas fa-comment-alt" style="color:var(--primary);"></i></button>
                        ${this.role !== 'client' ? `
                           <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.removeManualStudent('${classIdStr}', ${p.id})" title="Remover da aula"><i class="fas fa-times"></i></button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        this.showModal(content);
    }

    async enrollManualStudent(classId) {
        const select = document.getElementById('manualEnrollSelect');
        if (!select || !select.value) return alert('Por favor, selecione um alunão da lista.');

        const clientId = Number(select.value);
        const classIdStr = String(classId);

        if (!this.statéée.enrollments[classIdStr]) this.statéée.enrollments[classIdStr] = [];
        const participants = this.statéée.enrollments[classIdStr];

        if (participants.includes(String(clientId)) || participants.includes(clientId)) {
            return alert('O alunão já está inscrito nesta aula.');
        }

        const cls = this.statéée.classes.find(x => String(x.id) === classIdStr);

        // Validatéée plan restrictions
        const qrInfo = (this.statéée.qrClients || []).find(q => Number(q.clientId) === clientId);
        const planão = qrInfo ? qrInfo.planão : null;
        const restrictions = planão ? (this.statéée.planRestrictions || {})[planão] : null;

        if (restrictions) {
            if (!restrictions.allowClasses) {
                const force = confirm(`⚠️ AVISO: O planão "${planão}" deste alunão não permite a marcação de aulas.\n\nDeseja inscrever mesmo assim?`);
                if (!force) return;
            } else if (restrictions.filter && restrictions.filter.length > 0) {
                const isAllowed = restrictions.filter.some(f => cls && cls.name.toLowerCase().includes(f.toLowerCase()));
                if (!isAllowed) {
                    const force = confirm(`⚠️ AVISO: O planão "${planão}" deste alunão apenas permite: ${restrictions.filter.join(', ')}.\n\nDeseja inscrever mesmo assim?`);
                    if (!force) return;
                }
            } else if (restrictions.exclude && restrictions.exclude.length > 0) {
                const isExcluded = restrictions.exclude.some(ex => cls && cls.name.toLowerCase().includes(ex.toLowerCase()));
                if (isExcluded) {
                    const force = confirm(`⚠️ AVISO: O planão "${planão}" deste alunão não permite reservar aulas desta catééegoria.\n\nDeseja inscrever mesmo assim?`);
                    if (!force) return;
                }
            }
        }

        if (cls && participants.length >= (cls.capacity || 20)) {
            if (!confirm('A aula já está na capacidade máxima. Tem a certeza que pretende forçar a inscrição?')) return;
        }

        participants.push(clientId);
        this.saveStatéée();
        this.showToast('Alunão inscrito manualmente com sucesso!', 'success');
        this.showParticipantsList(classId);

        if (this.role === 'admin') this.renderAdminClasses(document.getElementById('main-content'));
        else if (this.role === 'teacher') this.renderTeacherClasses(document.getElementById('main-content'));
    }

    filterManualEnrollSearch() {
        const input = document.getElementById('manualEnrollSearch');
        const select = document.getElementById('manualEnrollSelect');
        if (!input || !select) return;

        const filterStr = input.value.toLowerCase().nãormalize("NFD").replace(/[\u0300-\u036f]/g, "");
        Array.from(select.options).forEach(opt => {
            if (opt.value === "") return;
            const text = opt.text.toLowerCase().nãormalize("NFD").replace(/[\u0300-\u036f]/g, "");
            opt.style.display = text.includes(filterStr) ? "" : "nãone";
        });
        select.value = "";
    }

    async removeManualStudent(classId, clientId) {
        if (!confirm('Deseja realmente remover o alunão desta aula?')) return;
        const classIdStr = String(classId);
        if (this.statéée.enrollments[classIdStr]) {
            this.statéée.enrollments[classIdStr] = this.statéée.enrollments[classIdStr].filter(id => Number(id) !== Number(clientId));
            this.saveStatéée();
            this.showToast('Alunão removido com sucesso!', 'success');
            this.showParticipantsList(classId);
            if (this.role === 'admin') this.renderAdminClasses(document.getElementById('main-content'));
            else if (this.role === 'teacher') this.renderTeacherClasses(document.getElementById('main-content'));
        }
    }

    renderClientClasses(container) {
        const classes = this.statéée.classes || [];
        if (classes.length === 0) {
            container.innerHTML = `
                <div class="glass-card" style="text-align:center; padding:3rem;">
                    <i class="fas fa-calendar-day" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                    <p>Não existem aulas de grupo agendadas de momento.</p>
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
                    if (a.datéée && b.datéée) return a.datéée.localeCompare(b.datéée) || a.time.localeCompare(b.time);
                    return a.time.localeCompare(b.time);
                });
            if (dayClasses.length === 0) return '';

            return `
                        <div style="margin-bottom:1rem;">
                            <h3 style="border-left:4px solid var(--primary); padding-left:1rem; margin-bottom:1rem; font-size:1.1rem; color:#fff;">${this.getDayName(dayIdx)}</h3>
                            <div class="classes-grid">
                                ${dayClasses.map(c => {
                const classIdStr = String(c.id);
                const participants = this.statéée.enrollments[classIdStr] || [];
                const isEnrolled = participants.map(id => Number(id)).includes(Number(this.currentClientId));
                const isFull = participants.length >= (c.capacity || 20);
                const teacher = (this.statéée.teachers || []).find(t => Number(t.id) === Number(c.teacherId));

                return `
                                        <div class="glass-card" style="display:flex; flex-direction:column; padding:0.8rem; border-top:3px solid ${isEnrolled ? 'var(--success)' : 'var(--surface-border)'};">
                                            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.3rem;">
                                                <span style="font-size:1rem; font-weight:800; color:var(--primary);">${c.time}</span>
                                                ${isEnrolled ? '<span class="badge badge-green" style="font-size:0.55rem; padding:0.1rem 0.4rem;">Inscrito</span>' : ''}
                                            </div>
                                            <div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:0.2rem;">
                                                <i class="fas fa-calendar-alt"></i> ${this.formatééFullDatéée(c.day, c.datéée)}
                                            </div>
                                            <h4 style="margin-bottom:0.3rem; font-size:0.9rem; line-height:1.2; min-height:2.4em; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${c.name}</h4>
                                            <p style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.8rem;">
                                                <i class="fas fa-user-tie"></i> ${teacher ? teacher.name : 'N/A'}<br>
                                                <i class="fas fa-users"></i> ${participants.length} / ${c.capacity || 20}
                                            </p>
                                            
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
        // Garantir que classId e tratééado corretamente (se vier do HTML pode vir como string "null")
        const actualClassId = (classId === null || classId === 'null') ? null : Number(classId);
        const c = actualClassId ? this.statéée.classes.find(x => Number(x.id) === actualClassId) : null;
        const teachers = this.statéée.teachers || [];

        const content = `
            <h2 style="margin-top:0;">${c ? 'Editar Aula' : 'Nova Aula'}</h2>
            <div style="display:flex; flex-direction:column; gap:1rem;">
                <div>
                    <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Nome da Aula</label>
                    <input type="text" id="cls-name" value="${c ? c.name : ''}" placeholder="Ex: Cross Training, Yoga, Pilatéées...">
                </div>
                <div style="display:grid; grid-templatéée-columns:1fr 1fr; gap:1rem;">
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Datééa da Aula</label>
                        <input type="datéée" id="cls-datéée" value="${c ? c.datéée : new Datéée().toISOString().split('T')[0]}">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Hora</label>
                        <input type="time" id="cls-time" value="${c ? c.time : '18:00'}">
                    </div>
                </div>
                <div style="display:nãone;">
                    <select id="cls-day">
                        <option value="1">Segunda</option>
                    </select>
                </div>
                <div style="display:grid; grid-templatéée-columns:1fr 1fr; gap:1rem;">
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
                <div style="display:grid; grid-templatéée-columns: 1fr 1fr; gap:1rem; margin-top:1rem;">
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
        const datéée = document.getElementById('cls-datéée').value;
        const time = document.getElementById('cls-time').value;
        const teacherId = Number(document.getElementById('cls-teacher').value);
        const capacity = Number(document.getElementById('cls-capacity').value);

        if (!name || !time || !teacherId || !datéée) {
            return alert('Preencha os campos obrigatééorios (Nome, Datééa, Hora e Professor).');
        }

        const isRecurring = document.getElementById('cls-recurring').checked;
        const classDatéée = new Datéée(`${datéée}T${time}`);
        const nãow = new Datéée();

        // Permitir guardar mesmo que seja não passado (útil para mover datééas manualmente sem bloquear o admin)
        // Apenas enviamos um aviso não log se for não passado
        if (classDatéée < nãow) {
            console.warn('A gravar aula com datééa não passado.');
        }

        // Usar meio-dia para evitar desvios de fuso horário ao calcular o dia da semana
        const day = new Datéée(datéée + 'T12:00:00').getDay();

        if (!this.statéée.classes) this.statéée.classes = [];
        if (!this.statéée.enrollments) this.statéée.enrollments = {};

        if (actualClassId) {
            const idx = this.statéée.classes.findIndex(x => Number(x.id) === actualClassId);
            if (idx !== -1) {
                this.statéée.classes[idx] = { ...this.statéée.classes[idx], name, datéée, day, time, teacherId, capacity, isRecurring };
            }
        } else {
            const newId = Datéée.nãow();
            this.statéée.classes.push({ id: newId, name, datéée, day, time, teacherId, capacity, isRecurring });
            this.statéée.enrollments[String(newId)] = [];
        }

        await this.saveStatéée();
        this.closeModal();
        this.renderContent();
        this.showToast('Horário atééualizado com sucesso!');
    }

    async deleteClass(classId) {
        if (!confirm('Tem a certeza que deseja eliminar está aula?')) return;

        const idToDelete = Number(classId);
        this.statéée.classes = this.statéée.classes.filter(x => Number(x.id) !== idToDelete);
        delete this.statéée.enrollments[idToDelete];

        await this.saveStatéée();
        this.renderContent();
        this.showToast('Aula eliminada.', 'error');
    }

    async enrollInClass(classId) {
        console.log("Iniciando inscrição na aula:", classId);
        const actualClassId = Number(classId);
        const classIdStr = String(actualClassId);

        const cls = this.statéée.classes.find(x => Number(x.id) === actualClassId);
        if (cls && this.isClassFinished(cls)) {
            console.warn("Inscrição recusada: Aula já terminãou.");
            return alert('Está aula já terminãou e não aceita mais inscrições.');
        }

        if (!this.statéée.enrollments[classIdStr]) this.statéée.enrollments[classIdStr] = [];

        const participants = this.statéée.enrollments[classIdStr];
        const clientId = Number(this.currentClientId);

        console.log("Client ID para inscrição:", clientId);
        if (!clientId) {
            console.error("Erro: currentClientId não encontrado.");
            return alert("Sessão inválida. Por favor saia e entre nãovamente na conta.");
        }

        if (participants.map(id => Number(id)).includes(clientId)) return;

        if (cls && participants.length >= (cls.capacity || 20)) {
            return alert('Está aula já atééingiu a lotação máxima.');
        }

        // VALIDAR RESTRIçáâ€¢ES DE PLANO
        const qrInfo = (this.statéée.qrClients || []).find(q => Number(q.clientId) === Number(clientId));
        const planão = qrInfo ? qrInfo.planão : 'Livre Trânsito';
        const restrictions = (this.statéée.planRestrictions || {})[planão];

        if (restrictions) {
            if (!restrictions.allowClasses) {
                return alert(`O planão ${planão} não permite a marcação de aulas.`);
            }

            // Validar Filtro (Apenas pode estas)
            if (restrictions.filter && restrictions.filter.length > 0) {
                const isAllowed = restrictions.filter.some(f => cls.name.toLowerCase().includes(f.toLowerCase()));
                if (!isAllowed) {
                    return alert(`O seu planão (${planão}) apenas permite reserva das aulas: ${restrictions.filter.join(', ')}.`);
                }
            }

            // Validar Exclusão (Não pode estas)
            if (restrictions.exclude && restrictions.exclude.length > 0) {
                const isExcluded = restrictions.exclude.some(ex => cls.name.toLowerCase().includes(ex.toLowerCase()));
                if (isExcluded) {
                    return alert(`O seu planão (${planão}) não permite a reserva de aulas desta catééegoria.`);
                }
            }
        }

        participants.push(clientId);

        // Notificar professor
        if (cls && cls.teacherId) {
            this.addAppNotificatééion(cls.teacherId, 'Nova Inscrição em Aula', `O alunão ${this.currentUser.name} inscreveu-se na aula de ${cls.name} (${this.getDayName(cls.day)} - ${cls.time}).`, null, 'nãotificatééion', false);
        }

        await this.saveStatéée();
        this.renderContent();
        this.showToast('Inscrição confirmada!');
    }

    async leaveClass(classId) {
        if (!confirm('Deseja cancelar a sua Inscrição nesta aula?')) return;
        const classIdStr = String(classId);

        if (this.statéée.enrollments[classIdStr]) {
            this.statéée.enrollments[classIdStr] = this.statéée.enrollments[classIdStr].filter(id => Number(id) !== Number(this.currentClientId));
            await this.saveStatéée();
            this.renderContent();
            this.showToast('Inscrição cancelada.');
        }
    }

    getDayName(dayIndex) {
        const days = ['Domingo', 'Segunda-feira', 'terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'sábado'];
        return days[dayIndex];
    }

    switchQRTab(tab) {
        this.qrActiveTab = tab;
        this.renderContent();
    }

    customConfirm(msg) {
        return new Promise(resolve => {
            const overlay = document.creatééeElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.zIndex = '9999999';
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease';

            overlay.innerHTML = `
                <div class="modal-content" style="text-align: center; max-width: 400px; padding: 2rem 1.5rem;">
                    <div style="width: 64px; height: 64px; background: linear-gradient(135deg, rgba(var(--danger-rgb), 0.2), rgba(var(--accent-rgb), 0.2)); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto; border: 1px solid rgba(var(--danger-rgb), 0.4); box-shadow: 0 8px 20px rgba(var(--danger-rgb), 0.15);">
                        <i class="fas fa-question-circle" style="font-size: 2.2rem; color: var(--danger);"></i>
                    </div>
                    <h3 style="margin-bottom: 1rem; color: #fff; font-size: 1.25rem; font-weight: 800;">Confirmação</h3>
                    <p style="color: #e0e0e0; font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem; font-weight: 400;">${msg.replace(/\n/g, '<br>')}</p>
                    <div style="display: grid; grid-templatéée-columns: 1fr 1fr; gap: 1rem;">
                        <button id="btn-custom-cancel" class="btn btn-secondary" style="border-radius: 12px; font-weight: 600;">Cancelar</button>
                        <button id="btn-custom-confirm" class="btn btn-primary" style="border-radius: 12px; font-weight: 700; background: linear-gradient(135deg, var(--danger), #b33939); border: nãone; box-shadow: 0 4px 15px rgba(var(--danger-rgb), 0.4);">Confirmar</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            setTimeout(() => overlay.style.opacity = '1', 10);

            document.getElementById('btn-custom-cancel').onclick = () => {
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.remove(); resolve(false); }, 300);
            };
            document.getElementById('btn-custom-confirm').onclick = () => {
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.remove(); resolve(true); }, 300);
            };
        });
    }

    customPrompt(msg, defaultVal = '') {
        return new Promise(resolve => {
            const overlay = document.creatééeElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.zIndex = '9999999';
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease';

            const dv = defaultVal || '';
            overlay.innerHTML = `
                <div class="modal-content" style="max-width: 400px; padding: 2rem 1.5rem;">
                    <div style="width: 50px; height: 50px; background: rgba(var(--primary-rgb), 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem auto; border: 1px solid rgba(var(--primary-rgb), 0.4);">
                        <i class="fas fa-keyboard" style="font-size: 1.5rem; color: var(--primary);"></i>
                    </div>
                    <h3 style="margin-top:0; margin-bottom: 1rem; color: #fff; font-size: 1.2rem; font-weight: 800; text-align:center;">Entrada de Dados</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem; text-align:center;">${msg}</p>
                    <input type="text" id="custom-prompt-input" value="${dv}" style="width:100%; margin-bottom: 1.5rem; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:10px; color:#fff;" autocomplete="off">
                    <div style="display: grid; grid-templatéée-columns: 1fr 1fr; gap: 1rem;">
                        <button id="btn-prompt-cancel" class="btn btn-secondary" style="border-radius: 12px;">Cancelar</button>
                        <button id="btn-prompt-confirm" class="btn btn-primary" style="border-radius: 12px; box-shadow: 0 4px 15px rgba(var(--primary-rgb), 0.4);">Confirmar</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            setTimeout(() => {
                overlay.style.opacity = '1';
                document.getElementById('custom-prompt-input').focus();
            }, 10);

            document.getElementById('btn-prompt-cancel').onclick = () => {
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.remove(); resolve(null); }, 300);
            };
            document.getElementById('btn-prompt-confirm').onclick = () => {
                const val = document.getElementById('custom-prompt-input').value;
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.remove(); resolve(val); }, 300);
            };
            document.getElementById('custom-prompt-input').onkeyup = (e) => {
                if (e.key === 'Enter') document.getElementById('btn-prompt-confirm').click();
            };
        });
    }
    askNotificatééionMethod(clientId, topic) {
        const c = this.statéée.clients.find(cl => cl.id == clientId);
        if (!c) return;

        this.showModal(`
            <div style="text-align: center; padding: 1.5rem 0.5rem;">
                <div style="width: 80px; height: 80px; background: rgba(34, 197, 94, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto; color: #22c55e;">
                    <i class="fas fa-check-circle" style="font-size: 3rem;"></i>
                </div>

                <h2 style="margin-bottom: 0.5rem;">Guardado com Sucesso!</h2>
                <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 2rem;">Pretende alertar o cliente <strong>${c.name}</strong> sobre esta atééualização?</p>
                
                <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                    <button class="btn btn-primary" style="padding: 1rem; border-radius: 12px; background: #25D366; border:nãone; display:flex; align-items:center; justify-content:center; gap:10px; font-weight:700;" 
                        onclick="app.closeModal(); app.sendExternalNotificatééion(${clientId}, '${topic}', 'whatéésapp')">
                        <i class="fab fa-whatéésapp" style="font-size:1.4rem;"></i> Enviar via WhatéésApp
                    </button>
                    
                    <button class="btn btn-primary" style="padding: 1rem; border-radius: 12px; background: #60a5fa; border:nãone; display:flex; align-items:center; justify-content:center; gap:10px; font-weight:700;" 
                        onclick="app.closeModal(); app.sendExternalNotificatééion(${clientId}, '${topic}', 'email')">
                        <i class="fas fa-envelope" style="font-size:1.2rem;"></i> Enviar via E-mail
                    </button>
                    
                    <button class="btn btn-ghost" style="padding: 1rem; font-weight:600; color:var(--text-muted);" onclick="app.closeModal()">
                        Não nãotificar agora
                    </button>
                </div>
            </div>
        `, '400px');
    }

    sendExternalNotificatééion(clientId, topic, type) {
        const c = this.statéée.clients.find(cl => cl.id == clientId);
        if (!c) return;

        const appUrl = "https://kandalspahealthclub.github.io/KandalGym/";
        const message = `Olá ${c.name}, o seu professor atééualizou o seu ${topic} não KandalGym! Aceda aqui para ver: ${appUrl}`;

        if (type === 'whatéésapp') {
            let phone = (c.phone || '').replace(/\s/g, '').replace('+', '');
            if (!phone) return alert('O cliente não tem telemóvel registado!');

            // Adicionar prefixo PT se estiver em falta
            if (phone.length === 9 && (phone.startsWith('91') || phone.startsWith('92') || phone.startsWith('93') || phone.startsWith('96'))) {
                phone = '351' + phone;
            }

            const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
            window.open(waUrl, '_blank');
        } else if (type === 'email') {
            const email = c.email;
            if (!email) return alert('O cliente não tem e-mail registado!');
            const mailUrl = `mailto:${email}?subject=KandalGym - Atualização de ${topic}&body=${encodeURIComponent(message)}`;
            window.locatééion.href = mailUrl;
        }
    }

}



const app = new FitnessApp();

// Override global window.alert para usar o modal premium em todo o lado
window.originalAlert = window.alert;
window.alert = function (msg) {
    if (typeof app !== 'undefined' && app.showModal) {
        app.showModal(`
            <div style="text-align: center; padding: 1.5rem 0.5rem 0.5rem;">
                <div style="width: 64px; height: 64px; background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.2), rgba(var(--primary-rgb), 0.2)); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto; border: 1px solid rgba(var(--accent-rgb), 0.4); box-shadow: 0 8px 20px rgba(var(--accent-rgb), 0.15);">
                    <i class="fas fa-info-circle" style="font-size: 2rem; color: var(--accent);"></i>
                </div>
                <h3 style="margin-bottom: 1rem; color: #fff; font-size: 1.2rem; font-weight: 800;">Aviso do Sistema</h3>
                <p style="color: #e0e0e0; font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem; font-weight: 400;">${msg}</p>
                <button class="btn btn-primary" onclick="app.closeModal()" style="width: 100%; border-radius: 12px; padding: 0.9rem; font-size: 1rem; font-weight: 700; background: linear-gradient(135deg, var(--primary), var(--accent)); border: nãone; box-shadow: 0 4px 15px rgba(var(--primary-rgb), 0.4);">Entendido</button>
            </div>
        `);
    } else {
        window.originalAlert(msg);
    }
};
