window.onerror = function (message, source, lineno, colno, error) {
    console.error("Erro detectado:", message, "em", source, ":", lineno);
    
    // Se o erro for "Script error." com linha 0, é um erro de CORS ou falha de carregamento de CDN
    let diagnosticMsg = "A página não conseguiu carregar corretamente ou um componente externo falhou.";
    if (message === "Script error." && lineno === 0) {
        diagnosticMsg = "Erro de carregamento (CORS/CDN). Verifique a sua ligação à internet ou tente limpar a cache do navegador.";
    }

    const container = document.getElementById('main-content') || document.body;
    // Só mostramos o ecrã de erro se a página estiver em branco ou for um erro crítico inicial
    if (container && (container.innerHTML === '' || container.innerText.length < 100 || container.querySelector('.loader'))) {
        container.innerHTML = `
            <div class="glass-card" style="margin:2rem auto; padding:2rem; border:2px solid var(--danger); text-align:center; max-width:600px;">
                <i class="fas fa-exclamation-triangle" style="font-size:3rem; color:var(--danger); margin-bottom:1rem;"></i>
                <h2 style="color:#fff;">Erro de Carregamento</h2>
                <p style="color:var(--text-muted);">${diagnosticMsg}</p>
                <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; margin:1.5rem 0; text-align:left; font-family:monospace; font-size:0.75rem; color:var(--danger); overflow-x:auto; border:1px solid rgba(239, 68, 68, 0.2);">
                    <strong>Detalhes Técnicos:</strong><br>
                    Erro: ${message}<br>
                    Arquivo: ${source || 'N/A'}<br>
                    Linha: ${lineno} | Col: ${colno}<br>
                    ${error ? `Pilha: ${error.stack.substring(0, 200)}...` : ''}
                </div>
                <div style="display:grid; gap:10px;">
                    <button class="btn btn-primary" onclick="localStorage.removeItem('kandalgym_session'); localStorage.removeItem('kandalgym_state'); localStorage.removeItem('kg_v'); location.reload()">Reset & Recarregar (Recomendado)</button>
                    <button class="btn btn-secondary" onclick="location.reload()">Tentar Novamente</button>
                </div>
                <p style="font-size:0.7rem; color:var(--text-muted); margin-top:1.5rem;">Dica: Se o erro persistir, tente abrir o link em modo anónimo ou limpe a cache do navegador.</p>
            </div>
        `;
    }
    return false;
};

class FitnessApp {
    constructor() {
        this.appVersion = '2026.05.06.v90'; // Versão de controlo para Hard Reset v90
        this.viewingDayIdx = Number(localStorage.getItem('kandalgym_vIdx') || 0); // Recuperar plano ativo
        this.checkForForceUpdate();

        this.role = 'client';
        this.currentClientId = null;
        this.activeView = 'dashboard';
        this.qrActiveTab = 'alunos';
        this.adminTab = 'teachers';
        this.spySubView = 'training';
        this.dashboardMonth = new Date().toISOString().substring(0, 7);
        this.editingDayIdx = 0; // Controla qual o dia (Plano A, B...) a ser mostrado no editor
        this.editingNewsId = null; // Controla se estamos a editar uma noticia
        this.planRestrictions = {
            'Musculação': { allowClasses: false },
            'Pilates': { allowClasses: true, filter: ['Pilates'] },
            'Aulas Geral': { allowClasses: true, exclude: ['Pilates', 'Dance Kids'] },
            'Dance Kids': { allowClasses: true, filter: ['Dance Kids'] }
        };
        this.hasLoadedData = false; // Flag para evitar flickering de "Utilizador não encontrado"
        this.isCheckingClasses = false;
        this.checkInterval = null;
        this.replyingTo = null;
        this.editingPredefinedId = null;
        this.editingPredefinedName = '';
        this.editingRecipeId = null;
        this.editingRecipeData = { name: '', description: '', videoUrl: '', ingredients: [] };

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

        const vitalCollections = ['admins', 'teachers', 'clients', 'qrClients', 'foodCategories', 'exerciseCategories', 'foods', 'exercises', 'notifications', 'classes', 'news', 'recipes'];
        vitalCollections.forEach(c => { if (!this.state[c]) this.state[c] = []; });

        const vitalDicts = ['trainingPlans', 'predefinedPlans', 'mealPlans', 'evaluations', 'trainingHistory', 'messages', 'anamnesis', 'enrollments'];
        vitalDicts.forEach(d => { if (!this.state[d]) this.state[d] = {}; });

        this.shownNotifications = JSON.parse(localStorage.getItem('shown_notifications') || '[]');
        this.lastChatCheck = Number(localStorage.getItem('kg_last_chat_check') || 0);
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
            serverKey: "AIzaSyD7cf3sfJBm0YsLOagu6or2hCTd-xcjO1E" // ATENÇÃO: Está chave deve começar por AAAA...
        };

        try {
            if (!window.firebase) {
                throw new Error("O script do Firebase não foi carregado. Verifique extensões como AdBlockers.");
            }
            if (typeof firebase.auth !== 'function') {
                throw new Error("O módulo de Autenticação não carregou corretamente. Por favor limpe a cache do navegador (Ctrl+F5) ou teste noutro navegador/modo anónimo.");
            }
            if (!firebase.apps.length) {
                firebase.initializeApp(this.firebaseAppConfig);
            }
            this.db = firebase.database();
            this.auth = firebase.auth(); // Firebase Authentication
            this.currentQRMsg = null;
            this.dbRef = this.db.ref('kandalGymState');
            console.log("Firebase inicializado com autenticacao.");
        } catch (fbErr) {
            console.error("Erro ao inicializar Firebase:", fbErr);
            alert("Erro Firebase: Verifique a sua ligacao a internet. Detalhes: " + fbErr.message);
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

        // 2. Iniciar escuta do Firebase em segundo plano
        this.init();

        this.serialPort = null;
        this.serialWriter = null;

        // Auto-conectar Arduino se já foi autorizado anteriormente
        if ("serial" in navigator) {
            navigator.serial.getPorts().then(async (ports) => {
                if (ports.length > 0) {
                    console.log("Porta Serial anteriormente autorizada encontrada. Tentando auto-conectar...");
                    try {
                        this.serialPort = ports[0];
                        await this.serialPort.open({ baudRate: 9600 });
                        const writableStream = this.serialPort.writable;
                        this.serialWriter = writableStream.getWriter();
                        console.log("Arduino auto-conectado com sucesso.");
                    } catch (e) {
                        console.warn("Falha na auto-conexão Serial:", e);
                    }
                }
            });
        }

        // 3. Failsafe: Se após 8 segundos ainda estiver "Sincronizando", forçamos o carregamento
        // para não bloquear o utilizador, usando os dados do cache local se necessário.
        setTimeout(() => {
            if (!this.hasLoadedData) {
                console.warn("Failsafe: Forçando carregamento após timeout de sincronização.");
                this.hasLoadedData = true;
                if (this.isLoggedIn) {
                    this.renderContent();
                }
            }
        }, 8000);

        // --- SISTEMA DE SCANNER GLOBAL ROBUSTO ---
        this.initGlobalScanner();

        // --- CANAL DE COMUNICAÇÃO PARA MONITOR ---
        this.accessChannel = new BroadcastChannel("kandal_access");
        this.accessChannel.onmessage = (ev) => {
            if (ev.data && ev.data.type === 'access_request') {
                this.processarLeituraQR(ev.data.code);
            }
        };
    }

    initGlobalScanner() {
        // Criar um input invisível para capturar o scanner em qualquer menu
        let input = document.getElementById('global-scanner-input');
        if (!input) {
            input = document.createElement('input');
            input.id = 'global-scanner-input';
            input.type = 'text';
            input.setAttribute('inputmode', 'none'); // Previne abertura do teclado virtual em mobile
            input.style.cssText = 'position:fixed; top:-1000px; left:-1000px; opacity:0; z-index:-1;';
            document.body.appendChild(input);
        }

        input.onkeyup = (e) => {
            if (e.key === 'Enter') {
                const val = input.value.trim().toUpperCase();
                if (val.length >= 2) {
                    console.log("Scanner detetado (Global):", val);
                    this.processarLeituraQR(val);
                }
                input.value = '';
            }
        };

        // Gestor de Foco Global (apenas para Desktop/Receção)
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (!isMobile) {
            document.addEventListener('mousedown', (e) => {
                // Se clicar em algo que precise de foco (inputs, botoes), não interferimos
                const tagsNaoInterromper = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'];
                if (tagsNaoInterromper.includes(e.target.tagName) || e.target.closest('button') || e.target.closest('a')) {
                    return;
                }

                // Caso contrário, devolvemos o foco ao scanner após um pequeno delay
                setTimeout(() => {
                    const active = document.activeElement;
                    if (!active || !['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
                        input.focus({ preventScroll: true });
                    }
                }, 200);
            });

            // Foco inicial
            setTimeout(() => input.focus({ preventScroll: true }), 1000);
        }
    }

    checkForForceUpdate() {
        try {
            const targetV = 'v90'; // Forçar v90 (Template Plans & Mobile Nav Fix)
            const currentV = localStorage.getItem('kg_v');
            if (currentV !== targetV) {
                console.warn("Forçando atualização total da App (KandalGym v70)...");
                localStorage.setItem('kg_v', targetV);
                localStorage.removeItem('kandalgym_session');
                localStorage.removeItem('kandalgym_state');

                if ('caches' in window) {
                    caches.keys().then((names) => {
                        for (let name of names) caches.delete(name);
                    }).catch(e => console.warn("Cache delete failed:", e));
                }

                // Dar um tempo para o localStorage gravar antes de recarregar
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            }
        } catch (e) {
            console.error("Erro no checkUpdate:", e);
        }
    }

    normalizeText(text) {
        if (!text) return '';
        return text.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }



    async connectArduino() {
        if (!("serial" in navigator)) {
            alert("O seu navegador não suporta a Web Serial API. Use o Google Chrome ou Microsoft Edge.");
            return;
        }

        try {
            this.serialPort = await navigator.serial.requestPort();
            await this.serialPort.open({ baudRate: 9600 });

            const encoder = new TextEncoder();
            const writableStream = this.serialPort.writable;
            this.serialWriter = writableStream.getWriter();

            this.showToast("Arduino ligado com sucesso!", "success");
            this.renderContent(); // Re-render para atualizar o estado do botão
        } catch (err) {
            console.error("Erro ao ligar ao Arduino:", err);
            alert("Não foi possível conectar ao Arduino.");
        }
    }

    async sendToArduino(cmd) {
        if (this.serialWriter) {
            try {
                const encoder = new TextEncoder();
                await this.serialWriter.write(encoder.encode(cmd));
                console.log("Comando enviado ao Arduino:", cmd);
            } catch (err) {
                console.error("Erro ao enviar para o Arduino:", err);
                this.serialWriter = null;
                this.serialPort = null;
            }
        }
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

    showManageNewsModal() {
        const newsList = (this.state.news || []).slice().reverse();
        const editingItem = this.editingNewsId ? this.state.news.find(n => n.id === this.editingNewsId) : null;

        let newsHtml = newsList.map((item, idx) => `
            <div class="glass-card" style="margin-bottom:1rem; padding:1rem; border-left:3px solid var(--accent); transition: all 0.3s ease; ${this.editingNewsId === item.id ? 'border: 1px solid var(--primary); box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.2);' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex:1;">
                        <h4 style="margin:0; font-size:1rem; color:#fff;">${item.title}</h4>
                        <small style="color:var(--text-muted); display:block; margin-bottom:5px;">${item.date}</small>
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

        if (newsList.length === 0) newsHtml = '<p style="text-align:center; color:var(--text-muted); padding:2rem;">Nenhuma notícia publicada.</p>';

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
                    <input type="text" id="news-title-input" placeholder="Título da notícia..." class="search-bar" 
                        style="width:100% !important; padding-left:15px !important;" value="${editingItem ? editingItem.title : ''}">
                    <textarea id="news-content-input" placeholder="Conteúdo da novidade..." 
                        style="width:100%; height:100px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid var(--surface-border); border-radius:12px; padding:12px; outline:none; font-family:inherit; resize:none;">${editingItem ? editingItem.content : ''}</textarea>
                    
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

        if (!this.state.news) this.state.news = [];

        if (this.editingNewsId) {
            // Modo Edição
            const idx = this.state.news.findIndex(n => n.id === this.editingNewsId);
            if (idx !== -1) {
                this.state.news[idx].title = title;
                this.state.news[idx].content = content;
                // Opcionalmente atualizar a data, mas mantemos a original para historico se desejar
                this.state.news[idx].updatedAt = new Date().toLocaleDateString('pt-PT') + ' ' + new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
            }
            this.editingNewsId = null;
            this.showToast('Notícia atualizada!', 'success');
        } else {
            // Modo Criação
            const newEntry = {
                id: Date.now().toString(),
                title: title,
                content: content,
                date: new Date().toLocaleDateString('pt-PT') + ' ' + new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
            };
            this.state.news.push(newEntry);
            this.showToast('Notícia publicada com sucesso!', 'success');
        }

        this.saveState();
        this.showManageNewsModal(); // Atualizar lista no modal
    }

    deleteNews(id) {
        if (!confirm('Tem a certeza que deseja apagar esta notícia?')) return;
        this.state.news = this.state.news.filter(n => n.id !== id);
        this.saveState();
        this.showManageNewsModal();
        this.showToast('Notícia removida.', 'success');
    }

    async saveState() {
        if (!this.hasLoadedData) {
            console.warn('Tentativa de gravar antes de carregar dados do Firebase ignorada.');
            return;
        }

        if (this.isSaving) {
            this.needsAnotherSave = true;
            return;
        }

        this.isSaving = true;
        this.needsAnotherSave = false;

        try {
            // Tentar gravar no LocalStorage (cache rapido)
            try {
                localStorage.setItem('kandalgym_state', JSON.stringify(this.state));
            } catch (lsError) {
                console.warn('LocalStorage Quota exceeded');
            }

            const cleanState = JSON.parse(JSON.stringify(this.state));
            await this.dbRef.set(cleanState);
            // Backup imediato no localStorage para evitar perda de dados local
            localStorage.setItem('kandalgym_state', JSON.stringify(cleanState));
            console.log("Estado guardado com sucesso no Firebase");
        } catch (e) {
            console.error('Firebase Sync error:', e);
            // Mostrar apenas erro persistente para admins e professores
            if (this.role !== 'client') {
                alert("Erro ao guardar dados: " + (e.message || "Verifique a sua ligação ou o Console (F12) para detalhes."));
            }
        } finally {
            this.isSaving = false;
            if (this.needsAnotherSave) {
                this.needsAnotherSave = false;
                await this.saveState();
            }
        }
    }

    async init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        this.dbRef.on('value', (snapshot) => {
            try {
                // Se entrou no listener, já temos resposta do servidor
                this.hasLoadedData = true;

                const data = snapshot.val();
                // Só sobrescreve o estado local se não estivermos no meio de uma gravação nossa
                // para evitar conflitos de latência (compensation)
                if (data && !this.isSaving) {
                    this.state = data;
                }

                // 1. Integridade local
                const collections = ['admins', 'teachers', 'clients', 'qrClients', 'foodCategories', 'exerciseCategories', 'foods', 'exercises', 'notifications', 'classes', 'news', 'recipes'];
                collections.forEach(coll => {
                    if (!this.state[coll]) {
                        this.state[coll] = [];
                    } else if (typeof this.state[coll] === 'object' && !Array.isArray(this.state[coll])) {
                        // Garantir que é um Array (Firebase por vezes converte para objeto com chaves numéricas)
                        this.state[coll] = Object.values(this.state[coll]);
                    }
                });

                const dictCollections = ['trainingPlans', 'archivedTrainingPlans', 'predefinedPlans', 'mealPlans', 'evaluations', 'trainingHistory', 'messages', 'anamnesis', 'enrollments', 'planRestrictions'];
                dictCollections.forEach(coll => { if (!this.state[coll]) this.state[coll] = {}; });

                // Integridade das restrições
                if (Object.keys(this.state.planRestrictions || {}).length === 0) {
                    this.state.planRestrictions = JSON.parse(JSON.stringify(this.planRestrictions));
                }

                // 2. Conta mestre garantida
                if (!this.state.admins.some(a => a.email === 'admin@kandalgym.com')) {
                    this.state.admins.push({
                        id: 1, name: 'KandalGym Master', email: 'admin@kandalgym.com', password: 'admin', role: 'admin'
                    });
                }

                // 3. Sincronização de Utilizadores QR
                if (this.isLoggedIn) {
                    this.syncQRUsers();
                }

                // 4. Sincronização local e UI
                try {
                    localStorage.setItem('kandalgym_state', JSON.stringify(this.state));
                } catch (e) { }

                this.syncSessionWithState();

                // Atualizar UI apenas se logado, não houver modais abertas,
                // E NáÆ’O estivermos no meio de uma gravação nossa (evita reset de scroll)
                if (this.isLoggedIn && !document.querySelector('.modal-overlay') && !this.isSaving) {
                    this.renderContent();
                }

                if (!this.checkInterval) {
                    setTimeout(() => this.checkFinishedClasses(), 1000);
                    this.checkInterval = setInterval(() => this.checkFinishedClasses(), 60000);
                }
            } catch (err) {
                console.error("Critical error in Firebase listener:", err);
                // Mesmo com erro, tentamos mostrar algo
                this.hasLoadedData = true;
                if (this.isLoggedIn) this.renderContent();
            }
        });
    }


    async backgroundSync() {
        // Agora o 'init' com dbRef.on('value') já faz a sincronização automática em tempo real.
        // Não precisamos mais de intervalo.
        return;
    }

    addAppNotification(targetUserId, title, body, senderId = null, type = 'notification', shouldSave = true) {
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
            createdAt: new Date().toISOString()
        };

        this.state.notifications.push(newNotification);
        if (shouldSave) this.saveState();
    }

    hasUnreadChat() {
        if (!this.state.notifications || !this.currentUser) return false;
        const myId = Number(this.currentUser.id);
        const lastCheck = this.lastChatCheck || 0;

        return this.state.notifications.some(n => {
            const isTarget = n.targetUserId === myId || (!n.targetUserId && this.role === 'admin' && n.type === 'notification');
            const isNew = new Date(n.createdAt).getTime() > lastCheck;
            return isTarget && isNew;
        });
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
        this.renderContent();
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

        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const installButton = (!isStandalone && (this.deferredPrompt || isIOS)) ? `
                <button class="btn btn-ghost btn-sm" onclick="app.installPWA()" title="Instalar App" style="color: var(--primary); padding: 6px 10px; border: 1px solid var(--primary); border-radius: 8px;">
                    <i class="fas fa-download"></i>
                </button>` : '';

        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <div class="avatar" onclick="app.setView('profile')" style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.9rem; border: 2px solid var(--surface-border); overflow: hidden; cursor: pointer;">
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
        if (appScreen) appScreen.style.display = 'none';

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
                    <div id="login-error-msg" style="display:none; color:var(--danger); background:rgba(239, 68, 68, 0.1); padding:0.8rem; border-radius:8px; margin-bottom:1rem; font-size:0.9rem; text-align:center; border: 1px solid rgba(239, 68, 68, 0.3);"></div>
                    <div class="input-icon-group">
                        <i class="fas fa-envelope"></i>
                        <input type="email" id="login-email" placeholder="Email" value="${savedCreds.email || ''}" required>
                    </div>
                    <div class="input-icon-group">
                        <i class="fas fa-lock"></i>
                        <input type="password" id="login-pass" placeholder="Password" required>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px; margin:0.2rem 0 1.2rem 4px; cursor:pointer;">
                        <input type="checkbox" id="remember-me" style="width:16px; height:16px; cursor:pointer;" ${rememberChecked ? 'checked' : ''}>
                        <label for="remember-me" style="font-size:0.85rem; color:var(--text-muted); cursor:pointer;">Lembrar-me</label>
                    </div>

                    <button type="submit" class="btn btn-primary" style="width:100%;">
                        Entrar <i class="fas fa-arrow-right"></i>
                    </button>

                    <a href="#" onclick="app.renderForgotPassword(); return false;" style="display:block; text-align:center; margin-top:1.5rem; font-size:0.85rem; color:var(--text-muted); text-decoration:none;">
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
            <div class="login-card animate-scale-in">
                <div class="login-hero">
                    <div class="logo">
                        <img src="logo.png" alt="KandalGym Logo">
                    </div>
                    <h3>Recuperar Conta</h3>
                    <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5; margin-top:0.5rem; padding: 0 1rem;">
                        Introduza o seu email de registo. Um administrador será notificado para repor a sua conta. Se preferir, pode agilizar o processo via WhatsApp.
                    </p>
                </div>
                
                <div class="login-form">
                    <div id="recovery-msg" style="display:none; padding:1rem; border-radius:8px; margin-bottom:1rem; font-size:0.9rem; text-align:center;"></div>
                    
                    <div class="input-icon-group">
                        <i class="fas fa-envelope"></i>
                        <input type="email" id="recovery-email" placeholder="O seu email de registo" required>
                    </div>

                    <button class="btn btn-primary" style="width:100%;" onclick="app.handlePasswordRecovery()">
                        Solicitar Recuperação
                    </button>

                    <div style="margin-top:1.5rem; text-align:center;">
                        <button onclick="app.contactSupportViaWA()" class="btn btn-ghost" style="color:#25d366; font-size:0.85rem; border: 1px solid rgba(37, 211, 102, 0.2); width: 100%;">
                            <i class="fa-brands fa-whatsapp"></i> Mensagem Whatsapp
                        </button>
                        <p style="font-size:0.7rem; color:var(--text-muted); margin-top:0.5rem;">
                            * Ao enviar Whatsapp, indique o seu email para identificarmos a sua conta.
                        </p>
                    </div>

                    <a href="#" onclick="app.renderLogin(); return false;" style="display:block; text-align:center; margin-top:2rem; font-size:0.85rem; color:var(--text-muted); text-decoration: none;">
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
            msgDiv.innerText = 'Por favor, introduza um email valido.';
            return;
        }

        // Tentar Firebase Auth password reset primeiro (mais seguro)
        if (this.auth) {
            this.auth.sendPasswordResetEmail(email)
                .then(() => {
                    msgDiv.style.display = 'block';
                    msgDiv.style.background = 'rgba(34, 197, 94, 0.1)';
                    msgDiv.style.color = '#22c55e';
                    msgDiv.innerHTML = `<strong>Email de recuperacao enviado!</strong><br><br>Verifique a sua caixa de entrada (e a pasta de spam) para recuperar a sua conta.`;
                    emailInput.value = '';
                })
                .catch((err) => {
                    // Fallback: notificar administrador
                    const user = [...this.state.clients, ...this.state.teachers, ...this.state.admins]
                        .find(u => u.email && u.email.toLowerCase() === email);
                    if (user) {
                        const adminId = this.state.admins[0]?.id || 1;
                        this.addAppNotification(adminId, 'Pedido de Recuperacao', `O utilizador ${user.name} (${email}) solicitou recuperacao de password.`, null, 'notification');
                        msgDiv.style.display = 'block';
                        msgDiv.style.background = 'rgba(34, 197, 94, 0.1)';
                        msgDiv.style.color = '#22c55e';
                        msgDiv.innerHTML = `<strong>Pedido enviado!</strong><br>Um administrador foi notificado.`;
                    } else {
                        msgDiv.style.display = 'block';
                        msgDiv.style.background = 'rgba(239, 68, 68, 0.1)';
                        msgDiv.style.color = 'var(--danger)';
                        msgDiv.innerText = 'Email nao encontrado no sistema.';
                    }
                });
            return;
        }
    }

    contactSupportViaWA() {
        // Obter o email digitado, se houver
        const emailInput = document.getElementById('recovery-email');
        const email = emailInput ? emailInput.value.trim() : '';

        let user = null;
        if (email) {
            // Procurar no estado se o email pertence a alguém conhecido
            const allUsers = [...(this.state.clients || []), ...(this.state.teachers || []), ...(this.state.admins || [])];
            user = allUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        }

        let message = "Olá KandalGym! Gostaria de solicitar a recuperação da minha palavra-passe.";

        if (user) {
            // Se encontrarmos o utilizador, enviamos Nome e Email
            message = `Olá KandalGym! O meu nome é ${user.name}, o meu email é ${user.email} e gostaria de solicitar a recuperação da minha palavra-passe.`;
        } else if (email) {
            // Se só tivermos o email, enviamos só o email
            message = `Olá KandalGym! O meu email é ${email} e gostaria de solicitar a recuperação da minha palavra-passe.`;
        }

        const waUrl = `https://wa.me/351963939017?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
    }

    async handleLogin() {
        const emailInput = document.getElementById('login-email');
        const passInput = document.getElementById('login-pass');
        const errorDiv = document.getElementById('login-error-msg');
        const loginBtn = document.querySelector('.login-form button[type="submit"]');

        if (errorDiv) errorDiv.style.display = 'none';
        if (!emailInput || !passInput) return;

        const email = emailInput.value.trim().toLowerCase();
        const pass = passInput.value;
        const rememberEl = document.getElementById('remember-me');
        const rememberMe = rememberEl ? rememberEl.checked : false;

        if (!email || !pass) {
            if (errorDiv) {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Por favor, preencha todos os campos.';
                errorDiv.style.display = 'block';
            }
            return;
        }

        if (loginBtn) { loginBtn.disabled = true; loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A entrar...'; }

        try {
            // Configurar persistencia de sessao
            await this.auth.setPersistence(
                rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION
            );

            try {
                // Tentativa 1: Firebase Auth (utilizadores ja migrados)
                await this.auth.signInWithEmailAndPassword(email, pass);
            } catch (authError) {
                // Tentativa 2: Migracao automatica (primeiro login apos implementar Firebase Auth)
                const allUsers = [
                    ...(this.state.admins || []),
                    ...(this.state.teachers || []),
                    ...(this.state.clients || [])
                ];
                const legacyUser = allUsers.find(u =>
                    (u.email || '').toLowerCase() === email && u.password === pass
                );

                if (legacyUser) {
                    try {
                        // Criar conta Firebase Auth e migrar automaticamente
                        await this.auth.createUserWithEmailAndPassword(email, pass);
                        console.log('Utilizador migrado para Firebase Auth:', email);
                    } catch (createError) {
                        if (createError.code === 'auth/email-already-in-use') {
                            // Esta no Firebase Auth mas password errada
                            throw { code: 'auth/wrong-password' };
                        }
                        throw createError;
                    }
                } else {
                    throw { code: 'auth/wrong-password' };
                }
            }

            // Firebase Auth validou - encontrar dados do utilizador na base de dados
            if (!this.state) this.state = {};
            if (!this.state.admins) this.state.admins = [];
            if (!this.state.teachers) this.state.teachers = [];
            if (!this.state.clients) this.state.clients = [];

            const emailLower = email.toLowerCase();
            const admin = this.state.admins.find(a => (a.email || '').toLowerCase() === emailLower);
            const teacher = !admin && this.state.teachers.find(t => (t.email || '').toLowerCase() === emailLower);
            const client = !admin && !teacher && this.state.clients.find(c => (c.email || '').toLowerCase() === emailLower);
            const foundUser = admin || teacher || client;

            if (!foundUser) {
                await this.auth.signOut();
                throw new Error('Utilizador nao encontrado na base de dados. Contacte o administrador.');
            }

            this.role = admin ? 'admin' : (teacher ? 'teacher' : 'client');
            foundUser.lastLogin = new Date().toLocaleString('pt-PT');
            this.currentUser = foundUser;
            this.isLoggedIn = true;
            if (this.role === 'client') this.currentClientId = foundUser.id;

            // Guardar email (sem password) para conveniencia
            if (rememberMe) {
                localStorage.setItem('kg_remember', 'true');
                localStorage.setItem('kg_saved_creds', JSON.stringify({ email: email }));
            } else {
                localStorage.removeItem('kg_remember');
                localStorage.removeItem('kg_saved_creds');
            }

            this.saveState();
            this.persistLogin();
            this.renderAppInterface();

        } catch (err) {
            const isWrongPass = err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials';
            const errMsg = isWrongPass
                ? '<i class="fas fa-exclamation-circle"></i> Email ou palavra-passe incorretos.'
                : `<i class="fas fa-exclamation-triangle"></i> Erro: ${err.message || 'Tente novamente.'}`;
            if (errorDiv) { errorDiv.innerHTML = errMsg; errorDiv.style.display = 'block'; }
            else this.showToast(isWrongPass ? 'Email ou palavra-passe incorretos.' : (err.message || ''), 'error');
        } finally {
            if (loginBtn) { loginBtn.disabled = false; loginBtn.innerHTML = 'Entrar <i class="fas fa-arrow-right"></i>'; }
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
        // Guardar sessao SEM a password por seguranca
        const userSafe = this.currentUser ? { ...this.currentUser } : null;
        if (userSafe) delete userSafe.password;
        const session = {
            isLoggedIn: this.isLoggedIn,
            role: this.role,
            currentUser: userSafe,
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
            console.error("Erro ao restaurar sessão:", e);
            localStorage.removeItem('kandalgym_session');
        }
    }

    handleLogout() {
        this.isLoggedIn = false;
        this.currentUser = null;
        localStorage.removeItem('kandalgym_session');
        localStorage.removeItem('kg_saved_creds');
        if (this.auth) this.auth.signOut().catch(() => { });
        window.location.reload();
    }

    renderFAB() {
        const existingFab = document.querySelector('.fab');
        if (existingFab) existingFab.remove();
        // Botão flutuante removido a pedido do utilizador (círculo vermelho com logo)
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
                        <select id="new-user-type" onchange="const val = this.value; const isClient = val === 'client'; document.getElementById('teacher-select-container').style.display = isClient ? 'block' : 'none'; document.getElementById('client-dob-container').style.display = isClient ? 'block' : 'none';">
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
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" onclick="app.addUser()">Adicionar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    showEditUserModal(type, id) {
        const list = type === 'teacher' ? this.state.teachers : (type === 'admin' ? this.state.admins : this.state.clients);
        const user = list.find(u => String(u.id) == String(id));
        if (!user) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h2 style="margin-top:0;">Editar ${type === 'teacher' ? 'Professor' : (type === 'admin' ? 'Gestor' : 'Aluno')}</h2>
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
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
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
            const list = type === 'teacher' ? this.state.teachers : (type === 'admin' ? this.state.admins : this.state.clients);
            const idx = list.findIndex(u => String(u.id) == String(id));
            if (idx === -1) return;

            list[idx].name = document.getElementById('edit-user-name').value;
            list[idx].email = document.getElementById('edit-user-email').value;
            list[idx].phone = document.getElementById('edit-user-phone').value;

            // Atualizar também no QR se existir
            if (this.state.qrClients) {
                const qrIdx = this.state.qrClients.findIndex(q => q && String(q.clientId) == String(id));
                if (qrIdx !== -1) {
                    this.state.qrClients[qrIdx].nome = list[idx].name;
                    this.state.qrClients[qrIdx].tel = list[idx].phone;
                }
            }

            this.saveState();
            document.querySelector('.modal-overlay').remove();

            if (this.activeView === 'users') {
                this.switchAdminTab(type === 'teacher' ? 'teachers' : (type === 'admin' ? 'admins' : 'clients'));
            } else {
                this.renderContent();
            }

            this.showToast('Dados atualizados com sucesso.');
        } catch (err) {
            console.error("Erro ao guardar edições:", err);
            alert("Erro ao guardar alterações.");
        }
    }

    syncQRUsers() {
        if (!this.state.qrClients) this.state.qrClients = [];
        let changed = false;

        const hasAccess = (uid) => {
            if (!uid) return true;
            // Comparação frouxa (string/number) para garantir deteção mesmo com tipos mistos
            return this.state.qrClients.some(q => q && String(q.clientId) == String(uid));
        };

        // Staff (Admins e Professores)
        const staff = [...(this.state.admins || []), ...(this.state.teachers || [])];
        staff.forEach(s => {
            if (s && s.id && !hasAccess(s.id)) {
                console.log(`Ativando QR automático para Staff: ${s.name}`);
                this.enableQRForClient(s.id, false, true);
                changed = true;
            }
        });

        // Alunos
        (this.state.clients || []).forEach(c => {
            if (c && c.id && !c.qrDisabled && !hasAccess(c.id)) {
                this.enableQRForClient(c.id, false, false);
                changed = true;
            }
        });

        if (changed && (this.role === 'admin' || this.role === 'teacher')) {
            this.saveState();
        }
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

    async addUser() {
        try {
            const type = document.getElementById('new-user-type').value;
            const name = document.getElementById('new-user-name').value.trim();
            const email = document.getElementById('new-user-email').value.trim().toLowerCase();
            const pass = document.getElementById('new-user-pass').value.trim();
            const phone = document.getElementById('new-user-phone').value.trim();

            if (!name || !email || !pass || !phone) {
                this.showToast('Por favor, preencha todos os campos obrigatorios.', 'error');
                return;
            }

            // Garantir que as listas existem antes de verificar duplicados
            if (!this.state.clients) this.state.clients = [];
            if (!this.state.teachers) this.state.teachers = [];
            if (!this.state.admins) this.state.admins = [];

            // Verificar se já existe email
            const existsEmail = this.state.clients.some(c => c.email.toLowerCase() === email) ||
                this.state.teachers.some(t => t.email.toLowerCase() === email) ||
                this.state.admins.some(a => a.email.toLowerCase() === email);

            if (existsEmail) {
                this.showToast('Este email já está registado no sistema.', 'error');
                return;
            }

            // Verificar se já existe contacto telefonico (normalizando espacos)
            const cleanPhone = phone.replace(/\s+/g, '');
            const existsPhone = this.state.clients.some(c => (c.phone || '').replace(/\s+/g, '') === cleanPhone) ||
                this.state.teachers.some(t => (t.phone || '').replace(/\s+/g, '') === cleanPhone) ||
                this.state.admins.some(a => (a.phone || '').replace(/\s+/g, '') === cleanPhone);

            if (existsPhone) {
                this.showToast('Este contacto telefonico já está registado na base de dados.', 'error');
                return;
            }

            const newId = Date.now();
            if (type === 'admin') {
                this.state.admins.push({ id: newId, name, email, phone, password: pass });
                this.enableQRForClient(newId, false, true);
            } else if (type === 'teacher') {
                this.state.teachers.push({ id: newId, name, email, phone, password: pass });
                this.enableQRForClient(newId, false, true);
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
                    birthDate: document.getElementById('new-user-dob').value
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

            // Criar conta no Firebase Authentication
            try {
                const secondaryApp = firebase.initializeApp(this.firebaseAppConfig, 'user_creation_' + Date.now());
                await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
                await secondaryApp.auth().signOut();
                await secondaryApp.delete();
                console.log('Conta Firebase Auth criada para:', email);
            } catch (authErr) {
                if (authErr.code !== 'auth/email-already-in-use') {
                    console.warn('Aviso: nao foi possivel criar conta Firebase Auth para', email, authErr.code);
                }
            }

            document.querySelector('.modal-overlay').remove();
            this.showInviteModal(name, email, pass, type, phone);

            if (this.activeView === 'users') {
                this.switchAdminTab(type === 'client' ? 'clients' : (type === 'admin' ? 'admins' : 'teachers'));
            }
        } catch (error) {
            console.error('Erro ao adicionar utilizador:', error);
            alert('Erro ao guardar utilizador. Por favor, tente novamente ou contacte o suporte.');
        }
    }

    markInviteSent(qrId) {
        if (!qrId) return;
        const q = (this.state.qrClients || []).find(x => x.id === qrId);
        if (q) {
            q.inviteSent = new Date().toLocaleString('pt-PT');
            this.saveState();
            // Silently update if we can, or let the user see it on next render.
            // If we are in the QR Manager, the table is filtered, so we might need a refresh.
            if (this.activeView === 'admin' && this.adminActiveTab === 'qr_manager') {
                this.refreshQRTableUI();
            }
        }
    }

    showInviteModal(name, email, pass, type, phone, qrId = null) {
        const label = type === 'teacher' ? 'Professor' : 'Aluno';
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';

        const subject = `Bem-vindo a KandalGym - ${name}`;
        const body = `Olá ${name},
A sua conta de ${label} na KandalGym foi criada com sucesso!
Esta App ainda encontra-se em fase de teste, mas poderá já usufruir de várias funcionalidades como: a marcação de aulas, consulta dos seus planos de treino, avaliações físicas e planos alimentares.
Poderá aceder a plataforma através do seguinte endereço: https://kandalspahealthclub.github.io/KandalGym/

*As suas credenciais de acesso são:*
- *Email:* ${email}
- *Password:* ${pass}

⚠️ *IMPORTANTE:* Recomendamos que altere a sua palavra-passe para uma da sua preferência no menu "Perfil" após o primeiro acesso na aplicação.

Recomendamos que guarde este link nos seus favoritos ou instale a App no seu telemóvel.
Bons treinos!
Equipa KandalGym`;

        const whatsappText = `*Bem-vindo a KandalGym*\n` +
            `---------------------------------------------\n` +
            `Olá *${name}*, a sua conta de *${label}* foi criada!\n` +
            `*CREDENCIAIS DE ACESSO:*\n` +
            `*Email:* ${email}\n` +
            `*Password:* ${pass}\n` +
            `*AVISO:* Altere a sua password no menu "Perfil" após o primeiro acesso.\n\n` +
            `_A App está em fase de teste, mas já pode usar a marcação de aulas, os planos de treino e muito mais._\n` +
            `*Acesso:* https://kandalspahealthclub.github.io/KandalGym/\n` +
            `Bons treinos!`;

        const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        // Clean phone number for WhatsApp link
        const cleanPhone = phone ? phone.replace(/\s+/g, '').replace(/^00/, '').replace(/^\+/, '') : '';
        const whatsappLink = `https://wa.me/${cleanPhone.startsWith('351') || cleanPhone.length < 9 ? (cleanPhone.length === 9 ? '351' + cleanPhone : cleanPhone) : cleanPhone}?text=${encodeURIComponent(whatsappText)}`;

        modal.innerHTML = `
            <div class="modal-content animate-fade-in" style="max-width: 450px; text-align: center;">
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
                    <a href="${whatsappLink}" target="_blank" class="btn" onclick="app.markInviteSent('${qrId}')" style="text-decoration: none; background: #25D366; color: white;">
                        <i class="fab fa-whatsapp"></i> Enviar por WhatsApp
                    </a>
                    <a href="${mailtoLink}" class="btn btn-secondary" onclick="app.markInviteSent('${qrId}')" style="text-decoration: none;">
                        <i class="fas fa-envelope"></i> Enviar por Email
                    </a>
                    <button class="btn btn-ghost" onclick="app.closeModal();">
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
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        this.tempExercisePhoto = null;

        const cats = this.state.exerciseCategories || ["Geral"];
        const options = cats.map(c => `<option value="${c}">${c}</option>`).join('');

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
        const cat = document.getElementById('ex-category').value;
        if (!name) return alert('O nome do exercício é obrigatório.');

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

        // Verificar se já existe um alimento com o mesmo nome (ignorando maiusculas/minusculas)
        const normalizedName = name.toLowerCase();
        const existingFood = this.state.foods.find(f => f.name.toLowerCase() === normalizedName);

        if (existingFood) {
            alert(`O alimento "${existingFood.name}" já existe na base de dados.\n\nCategoria: ${existingFood.category}\nCalorias: ${existingFood.kcal} kcal/100g`);
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
                { id: 'notifications_manager', icon: 'fa-paper-plane', label: 'Comunic.' },
                { id: 'predefined_plans', icon: 'fa-copy', label: 'Planos' },
                { id: 'profile', icon: 'fa-user-circle', label: 'Perfil' }
            ];
        } else if (this.role === 'teacher') {
            navItems = [
                { id: 'dashboard', icon: 'fa-chart-pie', label: 'Inicio' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Aulas' },
                { id: 'predefined_plans', icon: 'fa-copy', label: 'Planos' },
                { id: 'chat', icon: 'fa-comment-alt', label: 'Msgs' },
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
                <i class="fas ${item.icon}" style="position:relative;">
                    ${(item.id === 'chat' && this.hasUnreadChat()) ? '<span class="notification-dot"></span>' : ''}
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
                { id: 'chat', icon: 'fa-comment-alt', label: 'Mensagens / Chat' },
                { id: 'qr_manager', icon: 'fa-qrcode', label: 'Gestão de Entradas' },
                { id: 'monitor', icon: 'fa-desktop', label: 'Monitor de Acesso' },
                { id: 'exercises', icon: 'fa-play-circle', label: 'Biblioteca Exercícios' },
                { id: 'foods', icon: 'fa-apple-alt', label: 'Base de Alimentos' },
                { id: 'all-clients', icon: 'fa-search', label: 'Acesso Global' },
                { id: 'notifications_manager', icon: 'fa-paper-plane', label: 'Comunicados' },
                { id: 'predefined_plans', icon: 'fa-copy', label: 'Planos Pré-Definidos' },
                { id: 'recipes', icon: 'fa-utensils', label: 'Receitas Saudáveis' },
                { id: 'profile', icon: 'fa-user-circle', label: 'O Meu Perfil' }
            ];
            if (window.innerWidth <= 768) {
                navItems = navItems.filter(item => item.id !== 'foods');
            }
        } else if (this.role === 'teacher') {
            navItems = [
                { id: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Gestão de Aulas' },
                { id: 'anamnesis', icon: 'fa-notes-medical', label: 'Anamnese' },
                { id: 'chat', icon: 'fa-comment-alt', label: 'Mensagens' },
                { id: 'predefined_plans', icon: 'fa-copy', label: 'Planos Pré-Definidos' },
                { id: 'recipes', icon: 'fa-utensils', label: 'Gestão de Receitas' },
                { id: 'profile', icon: 'fa-user-circle', label: 'O Meu Perfil' }
            ];
        } else {
            navItems = [
                { id: 'dashboard', icon: 'fa-home', label: 'Inicio' },
                { id: 'classes', icon: 'fa-calendar-alt', label: 'Horário de Aulas' },
                { id: 'training', icon: 'fa-dumbbell', label: 'Meu Treino' },
                { id: 'meal', icon: 'fa-apple-alt', label: 'Minha Dieta' },
                { id: 'evaluation', icon: 'fa-chart-line', label: 'Avaliação Física' },
                { id: 'chat', icon: 'fa-comment-alt', label: 'Mensagens' },
                { id: 'profile', icon: 'fa-user-circle', label: 'O Meu Perfil' }
            ];
        }

        sidebar.innerHTML = navItems.map(item => `
            <button class="btn btn-ghost ${this.activeView === item.id ? 'glass-card' : ''}" onclick="app.setView('${item.id}')">
                <i class="fas ${item.icon}" style="position:relative;">
                    ${(item.id === 'chat' && this.hasUnreadChat()) ? '<span class="notification-dot"></span>' : ''}
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
        if (view === 'notifications_manager') {
            this.selectedNotifyIds = new Set();
        }
        if (view === 'chat') {
            this.lastChatCheck = Date.now();
            localStorage.setItem('kg_last_chat_check', this.lastChatCheck);
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
        // Tentamos capturar a posição atual, ou usamos o backup se existir
        const scrollY = container.scrollTop || this.lastScrollY || 0;
        const windowY = window.pageYOffset || document.documentElement.scrollTop || this.lastWindowY || 0;

        // BLOQUEIO TOTAL DE LAYOUT (Previne saltos)
        const currentHeight = container.offsetHeight;
        container.style.height = currentHeight + 'px';
        container.style.minHeight = currentHeight + 'px';
        container.style.overflow = 'hidden'; // Evita scrollbars temporárias

        // Se ainda não carregamos dados frescos do Firebase, mostramos um loader
        if (!this.hasLoadedData) {
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
        else if (this.activeView === 'edit_predefined_plan') this.renderPredefinedPlanEditor();
        else if (this.activeView === 'edit_recipe') this.renderRecipeEditor();
        else if (this.activeView === 'spy_view') this.renderSpyView(container);
        else if (this.activeView === 'classes') this.renderClassesView(container);
        else if (this.activeView === 'predefined_plans') this.renderPredefinedPlans(container);
        else if (this.activeView === 'recipes') this.renderRecipes(container);
        else if (this.role === 'admin') this.renderAdminContent(container);
        else if (this.role === 'teacher') this.renderTeacherContent(container);
        else this.renderClientContent(container);

        // RESTAURAR SCROLL IMEDIATO
        container.scrollTop = scrollY;
        window.scrollTo(0, windowY);

        // DESBLOQUEAR EM FASES
        requestAnimationFrame(() => {
            container.scrollTop = scrollY;
            window.scrollTo(0, windowY);
            requestAnimationFrame(() => {
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
        const qrClientsArray = Object.values(this.state.qrClients || {});
        if (qrClientsArray.length === 0) return '';

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // Calculate hours array (from 7h to 22h gym hours)
        const hoursCount = {};
        for (let i = 7; i <= 22; i++) hoursCount[i] = 0;

        let totalHoje = 0;
        let liveOccupancy = 0;

        qrClientsArray.forEach(c => {
            if (c.histórico) {
                const histArray = Object.values(c.histórico);
                // Ordenar por data descendente para ver o movimento mais recente
                const sortedHist = histArray.map(h => ({
                    d: new Date(typeof h === 'string' ? h : h.d),
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

        const maxCount = Math.max(...Object.values(hoursCount), 1); // Avoid division by 0

        let barsHTML = '';
        for (let i = 7; i <= 22; i++) {
            const count = hoursCount[i];
            const height = (count / maxCount) * 100;
            const isCurrent = i === new Date().getHours();
            barsHTML += `
                <div style="display:flex; flex-direction:column; align-items:center; flex:1; min-width:20px;">
                    <span style="font-size:0.6rem; color:var(--text-muted); margin-bottom:4px; font-weight:bold;">${count}</span>
                    <div style="width:100%; max-width:18px; height:120px; background:rgba(0,0,0,0.2); border-radius:10px; position:relative; overflow:hidden;">
                        <div style="position:absolute; bottom:0; left:0; right:0; height:${height}%; background:${isCurrent ? 'linear-gradient(to top, var(--accent), #f368e0)' : 'linear-gradient(to top, var(--primary), var(--secondary))'}; border-radius:10px; transition:height 1s ease;"></div>
                    </div>
                    <span style="font-size:0.6rem; color:var(--text-muted); margin-top:6px; font-weight:bold; ${isCurrent ? 'color:var(--accent);' : ''}">${i}h</span>
                </div>
            `;
        }

        return `
            <div class="glass-panel animate-fade-in" style="margin-bottom:2rem; padding:1.5rem;">
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

    getCurrentPeopleInGymHTML() {
        const qrClientsArray = Array.isArray(this.state.qrClients) ? this.state.qrClients : Object.values(this.state.qrClients || {});
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const peopleInGym = [];
        qrClientsArray.forEach(c => {
            if (c.histórico) {
                const histArray = Array.isArray(c.histórico) ? c.histórico : Object.values(c.histórico);
                const sortedHist = histArray.map(h => ({
                    d: new Date(typeof h === 'string' ? h : h.d),
                    t: typeof h === 'string' ? 'in' : h.t
                })).sort((a, b) => b.d - a.d);

                const lastMoveToday = sortedHist.find(h => h.d >= todayStart && h.d <= todayEnd);
                if (lastMoveToday && lastMoveToday.t === 'in') {
                    peopleInGym.push({
                        name: c.nome,
                        shortId: c.id,
                        time: lastMoveToday.d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        photo: c.photoUrl || null,
                        id: c.clientId || c.id
                    });
                }
            }
        });

        if (peopleInGym.length === 0) {
            return `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.9rem;">
                    <i class="fas fa-door-closed" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; opacity: 0.3;"></i>
                    Não existem pessoas no ginásio neste momento.
                </div>
            `;
        }

        // DESIGN MAIS COMPACTO COM GRID E SCROLL
        return `
            <div style="max-height: 350px; overflow-y: auto; padding-right: 5px; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem;">
                ${peopleInGym.map(p => `
                    <div class="glass-card" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: rgba(255,255,255,0.03); border-left: 3px solid var(--primary); margin: 0; transition: transform 0.2s ease;">
                        <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 0; flex: 1;">
                            <div style="width: 32px; height: 32px; border-radius: 50%; overflow: hidden; background: rgba(255,255,255,0.05); flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.1);">
                                ${p.photo ? `<img src="${p.photo}" style="width: 100%; height: 100%; object-fit: cover;">` : `<i class="fas fa-user" style="font-size: 0.8rem; color: var(--text-muted);"></i>`}
                            </div>
                            <div style="min-width: 0;">
                                <div style="font-size: 0.85rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff;">
                                    <span style="color: var(--accent); font-size: 0.7rem; opacity: 0.9; margin-right: 2px;">${p.shortId}</span> ${p.name}
                                </div>
                                <div style="font-size: 0.7rem; color: var(--primary); opacity: 0.8; font-weight: 600;">Desde as ${p.time}</div>
                            </div>
                        </div>
                        <button class="btn btn-ghost btn-sm" style="padding: 5px; min-width: 30px; height: 30px;" onclick="app.setView('qr_manager')" title="Ver Entradas">
                            <i class="fas fa-arrow-right" style="font-size: 0.75rem;"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    normalizeYoutubeUrl(url) {
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
        } catch (e) { console.error("Erro ao normalizar Youtube URL:", e); }

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
        if (!this.hasLoadedData) {
            container.innerHTML = `<div style="padding:5rem; text-align:center;"><div class="loader" style="margin:0 auto;"></div></div>`;
            return;
        }
        switch (this.activeView) {
            case 'dashboard':
                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:10px;">
                        <h2 class="animate-fade-in" style="margin:0;"><i class="fas fa-user-shield"></i> Dashboard Admin</h2>
                        <button class="btn btn-secondary btn-sm" onclick="app.showManageNewsModal()" style="height:40px; padding:0 1.5rem;">
                            <i class="fas fa-bullhorn" style="color:var(--primary);"></i> Gerir Notícias
                        </button>
                    </div>
                    
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

                    ${this.getOccupancyHTML()}

                    <div style="display: grid; grid-template-columns: 1fr; gap: 2rem;">
                        <div class="glass-panel" style="padding: 1.5rem;">
                            <h3 style="margin-top: 0; color: var(--primary); display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.25rem;">
                                <i class="fas fa-walking"></i> No Ginásio Agora
                            </h3>
                            ${this.getCurrentPeopleInGymHTML()}
                        </div>

                        <div class="glass-panel" style="padding: 1.5rem;">
                            <h3 style="margin-top: 0; color: var(--secondary); display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-user-friends"></i> Últimos Alunos Registados
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
                        <h2 style="margin:0;">Gestão de Contas</h2>
                        <button class="btn btn-primary" onclick="app.showAddUserModal()"><i class="fas fa-plus"></i> Novo Utilizador</button>
                    </div>

                    <div class="search-container" style="margin-bottom:1.5rem;">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Pesquisar utilizador por nome ou email..." 
                            oninput="app.switchAdminTab(app.activeAdminTab || 'teachers', this.value)"
                            class="search-bar">
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
                        <button class="btn btn-ghost" id="tab-plans" onclick="app.switchAdminTab('plans')" style="color: #f1c40f; font-weight: 600;">
                            <i class="fas fa-file-invoice-dollar"></i> Mensalidades (Regras)
                        </button>
                    </div>

                    <div id="admin-user-list">
                        <!-- Teachers list by default -->
                        <div class="client-list">
                            ${(this.state.teachers || []).map(t => this.renderUserCard(t, 'teacher')).join('')}
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
                this.renderFoodDatabase(container);
                break;
            case 'notifications_manager':
                this.renderNotificationsManager(container);
                break;
            case 'all-clients':
                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:10px;">
                        <div>
                            <h2 style="margin-bottom:0.1rem;">Acesso Global (Admin)</h2>
                            <p style="color:var(--text-muted); font-size:0.85rem; margin:0;">Como Administrador, tem acesso total a todos os alunos registados no sistema.</p>
                        </div>
                        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                            <button class="btn btn-secondary btn-sm" onclick="app.exportClientDatabase()" title="Exportar Backup de Clientes">
                                <i class="fas fa-file-export"></i> Backup (Download)
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-client-backup-input').click()" title="Importar Backup de Clientes">
                                <i class="fas fa-file-import"></i> Backup (Upload)
                            </button>
                            <input type="file" id="import-client-backup-input" style="display:none;" accept=".json" onchange="app.importClientDatabase(this)">
                            <button class="btn btn-primary btn-sm" onclick="app.showBulkImportModal()">
                                <i class="fas fa-users"></i> Importar em Massa
                            </button>
                        </div>
                    </div>
                    
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
            case 'monitor':
                this.renderMonitorView(container);
                break;
            case 'chat':
                this.renderChat(container);
                break;
            case 'profile':
                this.renderProfileView(container);
                break;
        }
    }

    showBulkImportModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content animate-fade-in" style="max-width: 600px;">
                <h2 style="margin-top:0;"><i class="fas fa-file-import"></i> Importar Base de Dados</h2>
                
                <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                    <div style="flex: 1; padding: 1rem; background: rgba(255,255,255,0.03); border: 1px dashed var(--surface-border); border-radius: 12px; text-align: center;">
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">O meu ficheiro está em <strong>JSON</strong>:</p>
                        <button class="btn btn-primary btn-sm" onclick="document.getElementById('import-client-json').click()">
                            <i class="fas fa-upload"></i> Carregar Ficheiro JSON
                        </button>
                        <input type="file" id="import-client-json" style="display:none;" accept=".json" onchange="app.importClientJSON(this)">
                    </div>
                    <div style="flex: 1; padding: 1rem; background: rgba(255,255,255,0.03); border: 1px dashed var(--surface-border); border-radius: 12px; text-align: center;">
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Tenho uma lista de <strong>Texto</strong>:</p>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('manual-bulk-area').style.display = 'block'; this.parentElement.parentElement.style.display = 'none';">
                            <i class="fas fa-paste"></i> Colar Lista de Nomes
                        </button>
                    </div>
                </div>

                <div id="manual-bulk-area" style="display: none;">
                    <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">
                        Cole abaixo no formato: <strong>Nome Completo; Contacto</strong> (um por linha)
                    </p>
                    <textarea id="bulk-import-data" placeholder="Joao Silva; 912345678\nMaria Santos; 933445566" 
                        style="width: 100%; height: 200px; background: rgba(0,0,0,0.3); border: 1px solid var(--surface-border); border-radius: 12px; color: #fff; padding: 1rem; font-family: monospace; font-size: 0.85rem; outline: none; margin-bottom: 1.5rem;"></textarea>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
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
                const data = JSON.parse(e.target.result);
                const array = Array.isArray(data) ? data : (data.clients || data.alunos || []);
                if (array.length === 0) throw new Error("O ficheiro JSON está vazio ou não contém uma lista de clientes válida.");

                this.addClientsInBatch(array);
            } catch (err) {
                console.error("Erro no JSON:", err);
                alert("Erro ao ler JSON: " + err.message);
            }
        };
        reader.readAsText(file);
    }

    processBulkImportText() {
        const textArea = document.getElementById('bulk-import-data');
        const data = textArea ? textArea.value.trim() : "";
        if (!data) return alert("Por favor, cole os dados para importar.");

        const lines = data.split('\n');
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

        this.addClientsInBatch(clientsToImport);
    }

    async addClientsInBatch(clientsArray) {
        // ... (existing code inside addClientsInBatch) ...
        let imported = 0;
        let skipped = 0;
        let errors = 0;

        for (const raw of clientsArray) {
            // Tentar extrair nome e telefone de várias chaves possíveis
            const name = (raw.name || raw.nome || raw.Name || "").trim();
            const phone = String(raw.phone || raw.contacto || raw.tel || raw.Tel || "").trim();

            if (!name || !phone) {
                errors++;
                continue;
            }

            // Normalizar telefone para verificação de duplicados
            const cleanPhone = phone.replace(/\s+/g, '');
            const exists = (this.state.clients || []).some(c => (c.phone || '').replace(/\s+/g, '') === cleanPhone);

            if (exists) {
                skipped++;
                continue;
            }

            // Gerar dados automáticos
            const newId = Date.now() + imported;
            const email = (raw.email || raw.Email || `${cleanPhone}@kandalgym.pt`).toLowerCase().trim();
            const pass = raw.password || raw.pass || "Kandal123";

            const newClient = {
                id: newId,
                name: name,
                email: email,
                phone: phone,
                password: pass,
                status: 'Ativo',
                lastEvaluation: '-',
                goal: 'Novo Aluno (Importado)',
                teacherId: null,
                birthDate: raw.birthDate || raw.data_nascimento || ''
            };

            this.state.clients.push(newClient);
            this.enableQRForClient(newId, false);
            imported++;
        }

        if (imported > 0) {
            this.saveState();
            this.showToast(`Importação concluída! ${imported} novos clientes.`);
        }

        alert(`Resumo da Importação:\n\n✅ Sucesso: ${imported}\n⚠️ Ignorados (Já existem): ${skipped}\nÃ¢ÂÅ’ Erros (Campos em falta): ${errors}`);

        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();

        if (this.activeView === 'all-clients') {
            this.renderAdminGlobalClientsList();
        } else {
            this.renderContent();
        }
    }

    exportClientDatabase() {
        const data = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            clients: this.state.clients || [],
            qrClients: this.state.qrClients || []
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `Backup_Clientes_KandalGym_${now}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importClientDatabase(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        if (!confirm("Tem a certeza que deseja restaurar este backup? Isto irá juntar os dados do ficheiro áÂ  base de dados atual.")) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Suportar tanto o formato de exportacao novo quanto um array simples
                const newClients = Array.isArray(data) ? data : (data.clients || []);
                const newQRClients = Array.isArray(data) ? [] : (data.qrClients || []);

                if (newClients.length === 0) throw new Error("Ficheiro não contém clientes válidos.");

                // Merge seguro (evitar duplicados por ID ou email)
                let added = 0;
                newClients.forEach(nc => {
                    const exists = this.state.clients.some(c => c.id === nc.id || c.email === nc.email);
                    if (!exists) {
                        this.state.clients.push(nc);
                        added++;
                    }
                });

                // Importar QR se disponível
                newQRClients.forEach(nqr => {
                    const exists = this.state.qrClients.some(q => q.id === nqr.id);
                    if (!exists) this.state.qrClients.push(nqr);
                });

                this.saveState();
                alert(`Backup Restaurado!\n\n✅ ${added} novos clientes adicionados.`);
                this.renderContent();
            } catch (err) {
                console.error("Erro no Backup:", err);
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
                        <i class="fas fa-info-circle"></i> Após abrir, arraste a nova janela para o segundo monitor e coloque em ecrã inteiro (tecla F11).
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
            '.logo { width: 400px; opacity: 0.8; animation: pulse 3s infinite ease-in-out; } ' +
            '.user-card { display: none; flex-direction: column; align-items: center; animation: slideUp 0.6s cubic-bezier(0.23, 1, 0.32, 1); } ' +
            '.photo-frame { width: 350px; height: 350px; border-radius: 50%; border: 15px solid var(--primary); overflow: hidden; background: #1e293b; margin-bottom: 2rem; box-shadow: 0 20px 50px rgba(0,0,0,0.5); } ' +
            '.photo-frame img { width: 100%; height: 100%; object-fit: cover; } ' +
            '.photo-frame i { font-size: 8rem; margin-top: 5rem; color: #334155; } ' +
            '.name { font-size: 5rem; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; margin: 0; } ' +
            '.status { font-size: 2.5rem; font-weight: 600; padding: 1rem 3rem; border-radius: 50px; margin-top: 1.5rem; } ' +
            '.bg-valid { background: linear-gradient(135deg, #064e3b, #065f46); } ' +
            '.bg-invalid { background: linear-gradient(135deg, #7f1d1d, #991b1b); } ' +
            '.border-valid { border-color: var(--secondary) !important; color: var(--secondary); } ' +
            '.border-invalid { border-color: var(--danger) !important; color: var(--danger); } ' +
            '@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.05); opacity: 1; } } ' +
            '@keyframes slideUp { from { opacity: 0; transform: translateY(100px); } to { opacity: 1; transform: translateY(0); } }';

        let html = '<html><head><title>KandalGym - Monitor de Acesso</title>' +
            '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">' +
            '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">' +
            '<style>' + css + '</style></head><body>' +
            '<div id="display-container" class="container">' +
            '<div id="standby" class="logo"><img src="logo.png" style="width:100%; filter: drop-shadow(0 0 30px rgba(99,102,241,0.3));"></div>' +
            '<div id="user-display" class="user-card">' +
            '<div id="user-photo-frame" class="photo-frame"><img id="user-photo" src="" style="display:none;"><i id="user-icon" class="fas fa-user"></i></div>' +
            '<h1 id="user-name" class="name">NOME DO CLIENTE</h1>' +
            '<div id="user-status" class="status">ENTRADA VÁLIDA</div></div></div>' +

            '<!-- Scanner Invisivel (Replica da logica da Gestao de Entradas) -->' +
            '<input type="text" id="monitor-scanner-input" autocomplete="off" style="position:fixed; top:-100px; left:-100px; opacity:0;">' +

            '<script>' +
            'const bc = new BroadcastChannel("kandal_access"); let timeout; ' +
            'const hwInput = document.getElementById("monitor-scanner-input"); ' +

            'hwInput.onkeyup = (e) => { ' +
            '  if (e.key === "Enter") { ' +
            '    const val = hwInput.value.trim().toUpperCase(); ' +
            '    if (val.length >= 2) { ' +
            '/* Feedback visual de leitura no monitor */ ' +
            'document.body.style.border = "10px solid var(--primary)"; ' +
            'setTimeout(() => document.body.style.border = "none", 500); ' +
            '      if (window.opener && window.opener.app) { window.opener.app.processarLeituraQR(val); } ' +
            '      else { bc.postMessage({ type: "access_request", code: val }); } ' +
            '    } ' +
            '    hwInput.value = ""; ' +
            '  } ' +
            '}; ' +

            '/* Auto-foco persistente */ ' +
            'document.addEventListener("mousedown", () => { ' +
            '  setTimeout(() => hwInput.focus({ preventScroll: true }), 100); ' +
            '}); ' +
            'setTimeout(() => hwInput.focus({ preventScroll: true }), 500); ' +
            'setInterval(() => { if(document.activeElement !== hwInput) hwInput.focus({ preventScroll: true }); }, 2000); ' +

            'bc.onmessage = (ev) => { const { type, data } = ev.data; if (type === "access_event") { ' +
            'clearTimeout(timeout); document.getElementById("standby").style.display = "none"; ' +
            'document.getElementById("user-display").style.display = "flex"; ' +
            'const nameEl = document.getElementById("user-name"); const statusEl = document.getElementById("user-status"); ' +
            'const frameEl = document.getElementById("user-photo-frame"); const photoEl = document.getElementById("user-photo"); ' +
            'const iconEl = document.getElementById("user-icon"); nameEl.innerText = data.name; ' +
            'nameEl.className = "name " + (data.valid ? "border-valid" : "border-invalid"); ' +
            'statusEl.innerText = data.msg.toUpperCase(); statusEl.className = "status " + (data.valid ? "bg-valid" : "bg-invalid"); ' +
            'frameEl.className = "photo-frame " + (data.valid ? "border-valid" : "border-invalid"); ' +
            'if (data.photo) { photoEl.src = data.photo; photoEl.style.display = "block"; iconEl.style.display = "none"; } ' +
            'else { photoEl.style.display = "none"; iconEl.style.display = "block"; } ' +
            'timeout = setTimeout(() => { document.getElementById("standby").style.display = "block"; ' +
            'document.getElementById("user-display").style.display = "none"; }, 5000); } };' +
            '</script></body></html>';

        monitorWindow.document.write(html);
        monitorWindow.document.close();
    }

    renderTeacherContent(container) {
        if (!this.hasLoadedData) {
            container.innerHTML = `<div style="padding:5rem; text-align:center;"><div class="loader" style="margin:0 auto;"></div></div>`;
            return;
        }
        const teacherClients = this.state.clients.filter(c => c.teacherId === this.currentUser.id);

        // Calcular estatisticas baseadas no mês selecionado
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
                            <small style="color:var(--text-muted); font-weight:600; text-transform:uppercase; font-size:0.65rem;">Período:</small>
                            <input type="month" id="stats-month-picker" value="${this.dashboardMonth}" 
                                onchange="app.updateDashboardMonth(this.value)"
                                style="background:transparent; border:none; color:#fff; font-family:inherit; font-weight:600; font-size:0.9rem; outline:none; cursor:pointer; width:180px;">
                        </div>
                    </div>
                    
                    <div class="stats-grid">
                        <div class="glass-card" onclick="app.setView('clients')" style="border-left: 4px solid var(--primary); cursor:pointer; transition: transform 0.2s ease, background 0.2s ease;">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Meus Alunos</small>
                            <div style="font-size:1.8rem; font-weight:800; color:var(--primary);">${teacherClients.length}</div>
                        </div>
                        
                        <div class="glass-card" onclick="app.setView('clients')" style="border-left: 4px solid var(--accent); cursor:pointer;">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Avaliações</small>
                            <div style="font-size:1.8rem; font-weight:800; color:var(--accent);">${monthEvals}</div>
                        </div>

                        <div class="glass-card" onclick="app.setView('clients')" style="border-left: 4px solid var(--success); cursor:pointer;">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Planos Treino</small>
                            <div style="font-size:1.8rem; font-weight:800; color:var(--success);">${monthTraining}</div>
                        </div>

                        <div class="glass-card" onclick="app.setView('clients')" style="border-left: 4px solid #60a5fa; cursor:pointer;">
                            <small style="color:var(--text-muted); text-transform:uppercase; font-size:0.7rem; letter-spacing:1px; display:block; margin-bottom:5px;">Planos Dieta</small>
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
                        <h3>Atividade de ${new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(displayDate)}</h3>
                        <p style="color:var(--text-muted); font-size:0.9rem;">Resumo de produtividade registada por si neste período.</p>
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
                        <h2 style="margin:0;"><i class="fas fa-notes-medical"></i> Gestão de Anamneses</h2>
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
                    <p style="color:var(--text-muted);">Nenhum exercício encontrado para "${searchQuery}"</p>
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
                const yt = this.normalizeYoutubeUrl(ex.videoUrl);
                const hasVideo = !!yt.videoId;

                return `
                                <div class="glass-card" style="padding:0; overflow:hidden; position:relative; border-top: 3px solid var(--primary);">
                                    ${hasVideo ? `
                                        <div style="width:100%; height:150px; position:relative; cursor:pointer;" onclick="app.viewExerciseVideo('${ex.videoUrl}', '${ex.name}')">
                                            <img src="${yt.thumbUrl}" style="width:100%; height:100%; object-fit:cover; opacity:0.7;">
                                            <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:#fff; font-size:2.8rem; text-shadow:0 0 15px rgba(0,0,0,0.6); opacity:0.9;">
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
                                <small style="color:var(--text-muted);">${ex.category || ex.muscle || 'Geral'}</small>
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
                if (!Array.isArray(imported)) throw new Error("Formato inválido");

                if (confirm(`Deseja importar ${imported.length} exercícios? Isso irá substituir a sua lista atual.`)) {
                    this.state.exercises = imported;
                    this.saveState();
                    this.renderContent();
                    alert('Base de exercícios importada com sucesso!');
                }
            } catch (err) {
                alert('Erro ao importar: ' + err.message);
            }
            input.value = '';
        };
        reader.readAsText(file);
    }

    async importLocalBaseExercicios() {
        if (!confirm('Deseja importar a base de exercícios local (base_exercicios.json)? Novos exercícios serao adicionados aos existentes (sem duplicar nomes).')) return;

        try {
            const res = await fetch('base_exercicios.json');
            if (!res.ok) throw new Error('Não foi possível carregar base_exercicios.json');

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
                alert(`${addedCount} novos exercícios adicionados com sucesso!`);
            } else {
                alert('Nenhum exercício novo encontrado para adicionar.');
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
                <h2 style="margin-top:0;">Categorias de Exercícios</h2>
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
        if (this.state.exerciseCategories.includes(name)) return alert('Já existe.');

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

    async deleteExerciseCategory(idx) {
        const name = this.state.exerciseCategories[idx];
        if (confirm(`Tem a certeza que deseja eliminar a categoria "${name}"? Exercícios nesta categoria serao movidos para "Geral".`)) {
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
                <h2 style="margin-top:0;">Editar Exercício</h2>
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

        if (!name) return alert('O nome é obrigatório.');

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
            delete ex.muscle;

            this.saveState();
            document.querySelector('.modal-overlay').remove();
            this.renderContent();
            alert('Exercício atualizado com sucesso! ');
        }
    }

    async deleteExercise(id) {
        if (confirm('Tem a certeza que deseja eliminar este exercício da biblioteca?')) {
            this.state.exercises = this.state.exercises.filter(e => e.id !== id);
            this.saveState();
            this.renderContent();
            alert('Exercício removido. ');
        }
    }

    renderNotificationsManager(container) {
        if (!this.selectedNotifyIds) this.selectedNotifyIds = new Set();
        let clientsList = this.state.clients || [];

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap: wrap; gap: 1rem;">
                <h2><i class="fas fa-paper-plane" style="color:var(--primary);"></i> Envio de Comunicados</h2>
            </div>
            <div class="glass-panel" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem;">
                
                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 1.2rem; border-radius: 12px;">
                    <style>
                        .notify-row:hover { background: rgba(var(--primary-rgb), 0.1) !important; }
                        .notify-client-checkbox:checked + div label { color: var(--primary) !important; }
                    </style>
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 1rem; flex-wrap:wrap; gap:10px;">
                        <label style="font-weight: 600; font-size: 1rem; color: var(--primary);">1. Selecione os Destinatários:</label>
                        <div id="notify-selection-count" style="font-size: 0.8rem; background: var(--primary); color: #000; padding: 2px 10px; border-radius: 20px; font-weight: 800;">0 Selecionados</div>
                    </div>
                    
                    <div style="margin-bottom:1rem; position:relative;">
                        <i class="fas fa-search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-muted); font-size:0.9rem;"></i>
                        <input type="text" placeholder="Filtrar por nome do aluno..." onkeyup="app.filterNotifyClients(this.value)" 
                               style="width:100%; padding:10px 10px 10px 35px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; font-size:0.9rem;">
                    </div>

                    <div style="margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); display:flex; gap:10px; align-items:center;">
                        <input type="checkbox" id="selectAllToNotify" onchange="app.toggleAllNotifyClients(this.checked)" style="width:18px; height:18px; cursor:pointer;">
                        <label for="selectAllToNotify" style="font-weight:bold; cursor:pointer; font-size:0.9rem;">Selecionar Todos os Alunos</label>
                    </div>

                    <div id="notify-clients-list" style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding-right: 5px;">
                        ${this.renderNotifyClientsRows()}
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 1.2rem; border-radius: 12px;">
                    <label style="font-weight: 600; margin-bottom: 0.8rem; display: block; font-size:1rem; color:var(--primary);">2. Escreva a Mensagem:</label>
                    <textarea id="bulk-notify-message" rows="5" placeholder="Escreva aqui a sua mensagem..." 
                              style="width: 100%; border: 1px solid var(--surface-border); border-radius: 8px; padding: 12px; background: rgba(0,0,0,0.3); color: #fff; resize: none; font-size:1rem; line-height:1.5;"></textarea>
                </div>

                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="app.sendBulkNotification('whatsapp')" style="flex:1;">
                        <i class="fab fa-whatsapp"></i> Preparar envio WhatsApp
                    </button>
                    <button class="btn btn-secondary" onclick="app.sendBulkNotification('sms')" style="flex:1;">
                        <i class="fas fa-comment-alt"></i> Preparar SMS Nativo
                    </button>
                </div>
            </div>
        `;
    }

    toggleAllNotifyClients(checked) {
        const clients = this.state.clients || [];
        if (checked) {
            clients.forEach(c => this.selectedNotifyIds.add(String(c.id)));
        } else {
            this.selectedNotifyIds.clear();
        }

        // Atualizar os checkboxes que estiverem visíveis atualmente
        document.querySelectorAll('.notify-client-checkbox').forEach(cb => {
            cb.checked = checked;
        });
        this.updateNotifyCount();
    }

    updateNotifyCount() {
        const count = this.selectedNotifyIds.size;
        const countEl = document.getElementById('notify-selection-count');
        if (countEl) countEl.innerText = `${count} Selecionados`;
    }

    filterNotifyClients(query) {
        const q = query.toLowerCase().trim();
        const listEl = document.getElementById('notify-clients-list');
        if (!listEl) return;

        listEl.innerHTML = this.renderNotifyClientsRows(q);
    }

    renderNotifyClientsRows(query = '') {
        const qClean = this.normalizeText(query);

        const clients = (this.state.clients || [])
            .filter(c => !qClean || this.normalizeText(c.name).includes(qClean))
            .sort((a, b) => a.name.localeCompare(b.name));

        if (clients.length === 0) return '<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.9rem;">Nenhum aluno encontrado.</div>';

        return clients.map(c => {
            const isChecked = this.selectedNotifyIds.has(String(c.id));
            return `
                <div class="notify-row" style="display:flex; align-items:center; gap:12px; padding:8px 12px; border-radius:8px; cursor:pointer; transition:all 0.2s; background:rgba(255,255,255,0.01);"
                     onclick="app.toggleSingleNotify('${c.id}', this)">
                    <input type="checkbox" id="notify_${c.id}" class="notify-client-checkbox" value="${c.id}" 
                           data-name="${c.name}" data-email="${c.email}" data-phone="${c.phone || ''}" 
                           ${isChecked ? 'checked' : ''}
                           style="width:20px; height:20px; pointer-events:none;" onclick="event.stopPropagation()">
                    <div style="display:flex; flex-direction:column; pointer-events:none;">
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
        this.updateNotifyCount();
    }

    sendBulkNotification(type) {
        const msg = document.getElementById('bulk-notify-message').value.trim();

        if (this.selectedNotifyIds.size === 0) return alert('Selecione pelo menos um destinatário.');
        if (!msg) return alert('A mensagem não pode estar vazia.');

        const clients = (this.state.clients || []).filter(c => this.selectedNotifyIds.has(String(c.id)));

        if (type === 'email') {
            const emails = clients.map(c => c.email).filter(e => e && e !== 'undefined').join(',');
            if (!emails) return alert('Nenhum dos clientes selecionados possui email registado.');
            const mailto = `mailto:?bcc=${emails}&subject=KandalGym%20-%20Comunicado&body=${encodeURIComponent(msg)}`;
            window.location.href = mailto;
        } else if (type === 'whatsapp') {
            // Because Popup blockers prevent multiple WhatsApp tabs, handle it via a guided modal
            if (clients.length === 1) {
                const phone = clients[0].phone;
                if (!phone) return alert('O cliente selecionado não tem telemóvel registado.');
                let cleanPhone = phone.replace(/\D/g, '');
                if (!cleanPhone.startsWith('351') && cleanPhone.length === 9) cleanPhone = '351' + cleanPhone;
                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
            } else {
                this.showWhatsAppBulkModal(clients, msg);
            }
        } else if (type === 'sms') {
            this.showSMSBulkModal(clients, msg);
        }
    }

    showWhatsAppBulkModal(clients, msg) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay animate-fade-in';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <h2 style="margin-top:0;">Fila de Envio WhatsApp</h2>
                <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom: 1.5rem;">Como os navegadores bloqueiam a abertura de muitas janelas ao mesmo tempo, clique em "Enviar" um por um.</p>
                <div style="max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
                    ${clients.map(c => {
            let cleanPhone = '';
            if (c.phone) {
                cleanPhone = c.phone.replace(/\D/g, '');
                if (!cleanPhone.startsWith('351') && cleanPhone.length === 9) cleanPhone = '351' + cleanPhone;
            }
            const hasPhone = c.phone && c.phone !== 'undefined' && c.phone !== '';
            return `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                                <span style="font-weight:bold; font-size: 0.95rem;">${c.name}</span>
                                ${hasPhone
                    ? `<button class="btn btn-sm" style="background:#25D366; color:#fff;" onclick="window.open('https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}', '_blank'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Enviado'; this.style.opacity='0.6';"><i class="fab fa-whatsapp"></i> Enviar</button>`
                    : `<span style="font-size:0.8rem; color:var(--danger);"><i class="fas fa-times-circle"></i> Sem número</span>`}
                            </div>
                        `;
        }).join('')}
                </div>
                <button class="btn btn-secondary" style="width:100%; margin-top:1.5rem;" onclick="this.closest('.modal-overlay').remove()">Concluir / Fechar</button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    showSMSBulkModal(clients, msg) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
            (window.safari !== undefined);

        const allNumbers = clients.map(c => {
            if (!c.phone) return null;
            let clean = c.phone.replace(/\D/g, '');
            if (clean.length === 9) clean = '351' + clean;
            return clean;
        }).filter(n => n).join(isIOS ? ',' : ';');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay animate-fade-in';
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
                    <p style="font-size:0.7rem; color:var(--text-muted); margin-top:5px;">(Pode colá-los manualmente no campo "Para" do seu SMS)</p>
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
                    ? `<button class="btn btn-sm btn-ghost" style="color:var(--primary); border: 1px solid var(--primary);" onclick="window.location.href='sms:${cleanPhone}${isIOS ? '&' : '?'}body=${encodeURIComponent(msg)}'; this.innerHTML='<i class=\\'fas fa-check\\'></i>'; this.style.opacity='0.6';">Enviar</button>`
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
        window.location.href = smsUrl;
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
            const query = this.normalizeText(searchQuery);
            filteredFoods = this.state.foods.filter(f =>
                this.normalizeText(f.name).includes(query) ||
                (f.category && this.normalizeText(f.category).includes(query))
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

    async deleteFood(id) {
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
                if (!Array.isArray(importedFoods)) throw new Error("Formato inválido");

                if (confirm(`Deseja importar ${importedFoods.length} alimentos ? Isso irá substituir a sua lista atual.`)) {
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
                alert('Categoria já existe.');
            }
        }
    }

    editCategory(idx) {
        const oldName = this.state.foodCategories[idx];
        const newName = prompt("Novo nome para a categoria:", oldName);
        if (newName && newName.trim() && newName !== oldName) {
            const finalName = newName.trim();
            if (this.state.foodCategories.includes(finalName)) return alert('Nome já existe.');

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
            // Let's explicitly set to 'Outros' só they don't get lost
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
        if (!container) container = document.getElementById('main-content');
        if (!container) return;

        // Reset scroll position to top when changing views/plans
        window.scrollTo(0, 0);

        const c = this.state.clients.find(x => x.id == clientId);
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
                    <h2>Plano de Treino</h2>
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
            <div style="display:flex; gap:0.6rem; margin:1.5rem 0; overflow-x:auto; padding:5px 0 12px; -webkit-overflow-scrolling:touch; scrollbar-width: none;">
                ${plans.map((day, dIdx) => `
                    <button class="btn" 
                        onclick="app.setViewingDayIdx(${dIdx}, '${clientId}')"
                        style="padding:10px 22px; font-size:0.85rem; border-radius:100px; min-width:120px; display:flex; align-items:center; gap:8px; justify-content:center; flex-shrink:0; font-weight:700; transition:all 0.3s ease;
                        background:${this.viewingDayIdx === dIdx ? 'var(--primary)' : 'rgba(255,255,255,0.05)'}; 
                        color:${this.viewingDayIdx === dIdx ? '#fff' : 'var(--text-muted)'};
                        border: 1px solid ${this.viewingDayIdx === dIdx ? 'var(--primary)' : 'rgba(255,255,255,0.1)'};">
                        <i class="fas ${this.viewingDayIdx === dIdx ? 'fa-calendar-check' : 'fa-calendar-day'}" style="font-size:0.9rem;"></i>
                        <span style="text-transform:uppercase; letter-spacing:0.5px;">${day.title || `Plano ${String.fromCharCode(64 + (dIdx + 1))}`}</span>
                    </button>
                `).join('')}
            </div>
            ` : ''}

            ${plans && plans.length && plans[this.viewingDayIdx] ? (() => {
                const day = plans[this.viewingDayIdx];
                return `
                <div class="animate-fade-in" style="margin-bottom:2rem;">
                    <!-- RESUMO COMPACTO DO PLANO (PREMIUM) -->
                    <div style="background: linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01)); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); padding: 12px 16px; margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <span style="font-size:0.6rem; color:var(--primary); font-weight:800; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:2px;">Plan Details</span>
                            <h3 style="color:#fff; margin:0; font-weight:800; font-size:1.1rem; line-height:1;">
                                ${day.title || `Treino ${String.fromCharCode(65 + this.viewingDayIdx)}`}
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

                    ${day.notes ? `
                    <div style="background:rgba(196, 162, 77, 0.05); border-left:3px solid var(--accent); padding:10px 14px; border-radius:4px 10px 10px 4px; margin-bottom:1.5rem; font-size:0.85rem; color:var(--text-muted); font-style:italic;">
                        <i class="fas fa-info-circle" style="color:var(--accent); margin-right:5px; font-size:0.75rem;"></i> "${day.notes}"
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
                            let libEx = this.state.exercises.find(le => le.id == ex.id);
                            if (!libEx && ex.name) {
                                libEx = this.state.exercises.find(le => le.name.toLowerCase() === ex.name.toLowerCase());
                            }
                            const muscleColor = libEx ? this.getMuscleColor(libEx.category || libEx.muscle) : 'var(--primary)';

                            const isCurrent = isClient && exIdx === firstPendingIdx;
                            const outlineStyle = isCurrent ? `border:1px solid var(--primary); box-shadow: inset 0 0 20px rgba(0,0,0,0.5);` : `border:1px solid rgba(255,255,255,0.04);`;

                            return `
                                <div class="glass-card" style="padding:10px 12px; ${outlineStyle} background:rgba(255,255,255,0.02); min-height:75px; display:flex; flex-direction:column; gap:10px; border-radius:14px; position:relative;">
                                    ${isCurrent ? `<div style="position:absolute; top:-8px; right:12px; background:var(--primary); color:#fff; font-size:0.6rem; font-weight:800; padding:2px 8px; border-radius:10px; text-transform:uppercase; letter-spacing:1px; box-shadow:0 2px 5px rgba(0,0,0,0.5);"><i class="fas fa-play" style="font-size:0.5rem; margin-right:3px;"></i> A Realizar</div>` : ''}
                                    <div style="display:flex; align-items:center; gap:12px;">
                                        <!-- Mini Image/Icon -->
                                        <div style="width:44px; height:44px; border-radius:10px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.05); flex-shrink:0; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                                            ${libEx && libEx.photoUrl ?
                                    `<img src="${libEx.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` :
                                    `<div style="font-size:1.2rem; opacity:0.6;">${this.getExerciseIcon(libEx ? (libEx.category || libEx.muscle) : '')}</div>`
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
                                            <span style="background:${muscleColor}22; color:${muscleColor}; font-size:0.55rem; font-weight:800; padding:2px 6px; border-radius:4px; text-transform:uppercase;">${libEx?.category || libEx?.muscle || 'Geral'}</span>
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
                                                    <span style="background:rgba(16,185,129,0.1); color:var(--success); font-size:0.65rem; font-weight:800; padding:2px 6px; border-radius:4px; white-space:nowrap;">S${Number(sIdx) + 1}: ${val}kg</span>
                                                ` : '').join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>

                                <!-- Observations (Subtle Row) -->
                                ${ex.observations ? `
                                <div style="font-size:0.72rem; color:var(--text-muted); background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:6px; display:flex; gap:6px; align-items:center;">
                                    <i class="fas fa-lightbulb" style="color:var(--accent); font-size:0.6rem;"></i> <span>${ex.observations}</span>
                                </div>
                                ` : ''}

                                <!-- Input Section for Client (More Premium & Inline) -->
                                ${isClient ? `
                                <div style="border-top:1px solid rgba(255,255,255,0.03); padding-top:8px; margin-top:2px;">
                                    <div style="display:flex; overflow-x:auto; gap:8px; padding:2px 5px 8px; scrollbar-width: none;">
                                        ${Array.from({ length: numSets }).map((_, sIdx) => {
                                    const val = (ex.weightLog && ex.weightLog[sIdx]) || '';
                                    return `
                                                <div style="flex-shrink:0;">
                                                    <span style="display:block; font-size:0.55rem; color:var(--text-muted); text-align:center; font-weight:800;">S${sIdx + 1}</span>
                                                    <input type="number" value="${val}" placeholder="--" 
                                                        onblur="app.logWeight(${clientId}, ${this.viewingDayIdx}, ${exIdx}, ${sIdx}, this.value)"
                                                        class="no-spin"
                                                        style="width:62px; height:38px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); border-radius:8px; color:#fff; text-align:center; font-size:0.9rem; font-weight:800; outline:none; transition:all 0.2s; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
                                                </div>
                                            `;
                                }).join('')}
                                    </div>
                                    <div style="position:relative; margin-top:4px;">
                                        <i class="fas fa-pen" style="position:absolute; left:12px; top:11px; font-size:0.65rem; color:var(--text-muted); opacity:0.5;"></i>
                                        <input type="text" value="${ex.clientNotes || ''}" placeholder="Técnica, dificuldades..."
                                            onblur="app.saveExerciseNote(${clientId}, ${this.viewingDayIdx}, ${exIdx}, this.value)"
                                            style="width:100%; height:34px; background:rgba(255,255,255,0.02); border:1px solid transparent; border-radius:10px; color:var(--text-muted); padding:0 12px 0 32px; font-size:0.75rem; font-family:inherit; outline:none;">
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
                                <i class="fas fa-check-circle" style="color:var(--primary);"></i> Como correu o treino?
                            </h4>
                            <textarea id="workout-global-note-${clientId}-${this.viewingDayIdx}" 
                                placeholder="Notas de performance, cansaço, etc..."
                                style="width:100%; min-height:90px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:12px; color:#fff; padding:12px; font-size:0.9rem; resize:none; font-family:inherit; outline:none;"></textarea>
                            
                            <button class="btn btn-primary" onclick="app.finishWorkout('${clientId}', ${this.viewingDayIdx})" 
                                style="width:100%; height:58px; margin-top:1.5rem; font-size:1.1rem; font-weight:800; border-radius:18px; background: var(--primary); border:none; box-shadow:0 8px 30px rgba(var(--primary-rgb),0.3); display:flex; align-items:center; justify-content:center; gap:12px;">
                                FINALIZAR TREINO
                            </button>
                        </div>
                    ` : ''}
                </div>
                `;
            })() : `
                <div class="glass-panel" style="padding:4rem; text-align:center;">
                    <i class="fas fa-dumbbell" style="font-size:3rem; color:var(--text-muted); opacity:0.2; margin-bottom:1.5rem;"></i>
                    <p style="color:var(--text-muted); margin-bottom:1.5rem;">Este plano não tem exercícios definidos.</p>
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
        if (!day) { alert('Dia de treino não encontrado. Tente recarregar a página.'); return; }

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
            const modal = document.createElement('div');
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
            if (!this.state.trainingHistory) this.state.trainingHistory = {};
            if (!this.state.trainingHistory[cid] || !Array.isArray(this.state.trainingHistory[cid])) {
                this.state.trainingHistory[cid] = [];
            }

            const globalNoteEl = document.getElementById(`workout-global-note-${cid}-${dayIdx}`);
            const globalNote = globalNoteEl ? globalNoteEl.value : '';

            const session = {
                date: new Date().toLocaleDateString('pt-PT'),
                time: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
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

            this.state.trainingHistory[cid].unshift(session);
            this.saveState();

            this.showToast('Treino concluído!  As suas cargas foram gravadas no histórico.');
            setTimeout(() => this.setView('dashboard'), 1200);
        } catch (err) {
            console.error('Erro ao concluir treino:', err);
            alert('Ocorreu um erro ao guardar. Por favor tente novamente.');
        }
    }

    deleteTrainingSession(index) {
        if (confirm('Tem a certeza que deseja eliminar este treino do histórico?')) {
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
        const yt = this.normalizeYoutubeUrl(url);
        const originalUrl = url;
        const cleanUrl = yt.embedUrl || url;

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
            const draftData = JSON.parse(draft);
            if (draftData.clientId === clientId) {
                if (confirm('Detetamos um rascunho não guardado deste treino. Deseja recupera-lo?')) {
                    this.editingPlan = draftData.plan;
                    this.editingClientId = clientId;
                    this.editingDayIdx = 0;
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
        this.editingDayIdx = 0;
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

        // Garantir que o index é válido
        if (this.editingDayIdx >= this.editingPlan.length) this.editingDayIdx = 0;
        const currentDay = this.editingPlan[this.editingDayIdx];

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                <h2 style="margin:0;">Editar Treino: ${c.name}</h2>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <button class="btn btn-ghost" style="color:var(--success);" onclick="app.handleNewPlanRequest()"><i class="fas fa-file-medical"></i> Novo Plano</button>
                    <button class="btn btn-ghost" style="color:var(--accent);" onclick="app.showLoadPredefinedPlanModal()"><i class="fas fa-copy"></i> Carregar Modelo</button>
                    <button class="btn btn-ghost" style="color:var(--danger);" onclick="app.deleteTrainingPlan(app.editingClientId)"><i class="fas fa-trash"></i> Eliminar</button>
                    <button class="btn btn-secondary" onclick="app.clearTrainingDraft(); app.setView('spy_view')">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.saveTrainingPlan()"><i class="fas fa-save"></i> Guardar Plano</button>
                </div>
            </div>

            <div style="margin-bottom:1.5rem; display:flex; gap:1rem; align-items:center; flex-wrap: wrap;">
                <div>
                    <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase;">Objetivo do Plano</label>
                    <input type="text" id="edit-training-goal" value="${c.goal || ''}" placeholder="Ex: Hipertrofia, Redução de Massa Gorda..."
                        onchange="app.state.clients.find(x => x.id === app.editingClientId).goal = this.value; app.saveState();"
                        style="width:300px; height:40px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:0 12px; font-size:0.95rem;">
                </div>
            </div>

            <!-- MENU DE SELECÇÃO DE PLANO (TABS) -->
            <div id="editor-tabs-container" style="display:flex; gap:0.75rem; margin-bottom:2rem; flex-wrap:wrap; background:rgba(255,255,255,0.03); padding:12px; border-radius:15px; border:1px solid rgba(255,255,255,0.05);">
                ${this.editingPlan.map((day, dIdx) => `
                    <div style="display:flex; align-items:center; gap:4px;">
                        <button class="btn ${this.editingDayIdx === dIdx ? 'btn-primary' : 'btn-ghost'}" 
                            onclick="app.editingDayIdx = ${dIdx}; app.renderTrainingEditor();"
                            style="padding:10px 18px; font-size:0.95rem; border-radius:10px; display:flex; align-items:center; gap:10px; min-width:140px; justify-content:center; box-shadow:${this.editingDayIdx === dIdx ? '0 4px 12px rgba(var(--primary-rgb), 0.3)' : 'none'};">
                            <i class="fas ${this.editingDayIdx === dIdx ? 'fa-check-square' : 'fa-square'}" style="font-size:1.1rem; opacity:${this.editingDayIdx === dIdx ? '1' : '0.4'};"></i>
                            <span style="font-weight:700;">${day.title || `Plano ${String.fromCharCode(65 + dIdx)}`}</span>
                            <span style="opacity:0.6; font-size:0.85rem;">(${day.exercises.length})</span>
                        </button>
                    </div>
                `).join('')}
                <button class="btn btn-ghost" onclick="app.addTrainingDay()" 
                    style="color:var(--accent); border:2px dashed rgba(var(--accent-rgb), 0.3); padding:8px 18px; border-radius:10px; font-size:0.9rem; font-weight:700;">
                    <i class="fas fa-plus-circle"></i> Adicionar Dia
                </button>
            </div>

            <div id="editor-days-container">
                <div class="glass-panel" style="padding:1.5rem; margin-bottom:3rem; border-top: 4px solid var(--primary); animation: fadeIn 0.3s ease;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                        <input type="text" value="${currentDay.title || `Plano ${String.fromCharCode(65 + this.editingDayIdx)}`}" 
                            placeholder="Nome do Plano (ex: Treino A)..."
                            oninput="app.editingPlan[${this.editingDayIdx}].title = this.value; app.saveTrainingDraft();"
                            onchange="app.renderTrainingEditor();"
                            style="font-weight:800; font-size:1.3rem; background:transparent; border:none; border-bottom:2px solid var(--primary); width:100%; max-width:400px; padding:8px 0; color:#fff; outline:none; text-transform:uppercase; letter-spacing:1px;">
                        
                        <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.05); padding:5px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.1);">
                                <label style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Descanso:</label>
                                <input type="text" value="${currentDay.rest || ''}" placeholder="Ex: 60s" 
                                    onchange="app.updateEditorDayRest(${this.editingDayIdx}, this.value)"
                                    style="width:80px; height:32px; background:rgba(0,0,0,0.3); color:var(--accent); border:1px solid rgba(var(--accent-rgb), 0.3); border-radius:6px; text-align:center; font-weight:700; font-size:0.9rem;">
                            </div>
                            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.removeTrainingDay(${this.editingDayIdx})">
                                <i class="fas fa-trash"></i> Remover Plano
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
                                            <span id="ex-name-display-${this.editingDayIdx}-${eIdx}" style="word-break:break-word; white-space:normal; overflow:visible;">
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
                                        <input type="text" value="${ex.sets || ''}" placeholder="Ex: 4" onchange="app.updateEditorExercise(${this.editingDayIdx}, ${eIdx}, 'sets', this.value)"
                                            style="width:100%; height:45px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:0 10px; text-align:center; font-size:1.1rem; font-weight:600;">
                                    </div>
                                    <div style="flex:2; min-width:140px;">
                                        <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">Repetições (Reps)</label>
                                        <input type="text" value="${ex.reps || ''}" placeholder="Ex: 12-15 ou Falha" onchange="app.updateEditorExercise(${this.editingDayIdx}, ${eIdx}, 'reps', this.value)"
                                            style="width:100%; height:45px; background:rgba(255,255,255,0.05); color:#fff; border:2px solid var(--primary); border-radius:8px; padding:0 15px; text-align:center; font-size:1.1rem; font-weight:700;">
                                    </div>
                                    <div style="flex:3; min-width:200px;">
                                        <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">Observações do Exercício</label>
                                        <input type="text" value="${ex.observations || ''}" placeholder="Ex: Foco na descida" onchange="app.updateEditorExercise(${this.editingDayIdx}, ${eIdx}, 'observations', this.value)"
                                            style="width:100%; height:45px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:0 15px; font-size:1rem;">
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div style="margin-top:2rem; padding:1.5rem; background:rgba(255,255,255,0.02); border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                        <label style="display:block; font-size:0.8rem; color:var(--accent); font-weight:600; text-transform:uppercase; margin-bottom:8px;">Observações do ${currentDay.title || `Plano ${String.fromCharCode(65 + this.editingDayIdx)}`}</label>
                        <textarea oninput="app.updateEditorDayNotes(${this.editingDayIdx}, this.value)"
                            placeholder="Notas específicas para este dia de treino... (ex: Cardio no fim, focar na postura, etc.)"
                            style="width:100%; min-height:100px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:10px; padding:12px; font-size:1rem; font-family:inherit; resize:vertical;">${currentDay.notes || ''}</textarea>
                    </div>
                    
                    <div id="day-${this.editingDayIdx}-exercises-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:2.5rem; margin-bottom:1rem; padding-top:1.5rem; border-top:1px solid rgba(255,255,255,0.05); flex-wrap:wrap; gap:1.25rem;">
                        <button class="btn btn-ghost btn-sm" style="color:var(--primary); padding:6px 12px; font-size:0.85rem;" onclick="app.addExerciseToEditor(${this.editingDayIdx})">
                            <i class="fas fa-plus"></i> Adicionar Exercício
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="app.addTrainingDay(true)" style="background:rgba(var(--primary-rgb), 0.1); color:var(--primary); border:1px dashed var(--primary); font-weight:700; padding:6px 12px; font-size:0.85rem;">
                            <i class="fas fa-calendar-plus"></i> Adicionar Próximo Plano
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
            return alert('Não pode remover o único plano existente!');
        }
        if (confirm('Deseja remover este plano de treino e todos os exercícios associados?')) {
            this.editingPlan.splice(idx, 1);
            this.editingDayIdx = Math.max(0, idx - 1);
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

    updateEditorDayRest(dayIdx, value) {
        if (this.editingPlan[dayIdx]) {
            this.editingPlan[dayIdx].rest = value;
            this.saveTrainingDraft();
        }
    }

    updateEditorDayNotes(dayIdx, value) {
        if (this.editingPlan[dayIdx]) {
            this.editingPlan[dayIdx].notes = value;
            this.saveTrainingDraft();
        }
    }

    handleNewPlanRequest() {
        const clientId = this.editingClientId;
        const archives = (this.state.archivedTrainingPlans && this.state.archivedTrainingPlans[clientId]) ? this.state.archivedTrainingPlans[clientId] : [];
        const hasExercises = this.editingPlan.some(day => day.exercises.length > 0);

        let archivesHtml = archives.map((plan, idx) => `
            <div class="glass-card" style="margin-bottom:0.75rem; padding:0.75rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03);">
                <div style="text-align:left;">
                    <div style="font-size:0.85rem; font-weight:700; color:#fff;">Arquivado em: ${plan.archivedAt}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${plan.days ? plan.days.length : 0} Planos / ${(plan.days || []).reduce((acc, d) => acc + (d.exercises ? d.exercises.length : 0), 0)} Exercícios</div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="app.reuseArchivedPlan(${idx})" style="padding:6px 12px; font-size:0.8rem;">
                    <i class="fas fa-undo"></i> Usar
                </button>
            </div>
        `).reverse().join('');

        if (archives.length === 0) archivesHtml = '<p style="color:var(--text-muted); font-size:0.85rem; padding:1rem;">Nenhum plano arquivado anteriormente.</p>';

        const content = `
            <div style="text-align:center; padding:0.5rem;">
                <h2 style="margin-bottom:1.5rem;"><i class="fas fa-file-medical"></i> Novo Plano de Treino</h2>
                
                <div class="glass-panel" style="padding:1.5rem; margin-bottom:1.5rem; border:1px solid rgba(var(--primary-rgb), 0.2);">
                    <p style="color:var(--text-muted); margin-bottom:1rem; font-size:0.9rem; line-height:1.4;">
                        Recomendamos <strong>arquivar</strong> o plano atual para manter o histórico do aluno.
                    </p>
                    <button class="btn btn-primary" onclick="app.archiveAndStartNew()" style="width:100%; padding:1rem; font-weight:700;">
                        <i class="fas fa-archive"></i> Arquivar e Criar Novo
                    </button>
                    ${!hasExercises ? `
                        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:10px;">
                            (O rascunho atual está vazio, pode apenas carregar um modelo abaixo)
                        </p>
                    ` : ''}
                </div>

                <div style="text-align:left; margin-bottom:1rem;">
                    <h3 style="font-size:1rem; margin-bottom:0.75rem;"><i class="fas fa-history" style="color:var(--accent);"></i> Aproveitar Plano Arquivado</h3>
                    <div style="max-height:250px; overflow-y:auto; padding-right:5px;">
                        ${archivesHtml}
                    </div>
                </div>

                <button class="btn btn-ghost" onclick="app.closeModal()" style="width:100%; margin-top:1rem; color:var(--text-muted);">
                    Fechar
                </button>
            </div>
        `;
        this.showModal(content, '450px');
    }

    reuseArchivedPlan(idx) {
        const clientId = this.editingClientId;
        const archives = this.state.archivedTrainingPlans[clientId];
        if (!archives || !archives[idx]) return;

        if (this.editingPlan.some(day => day.exercises.length > 0)) {
            if (!confirm("Isso irá substituir o rascunho atual pelo plano arquivado selecionado. Deseja continuar?")) return;
        }

        const planToReuse = JSON.parse(JSON.stringify(archives[idx]));
        // Remover metadados de arquivo para o rascunho
        delete planToReuse.archivedAt;

        if (planToReuse.days) {
            this.editingPlan = planToReuse.days;
        } else if (Array.isArray(planToReuse)) {
            this.editingPlan = planToReuse;
        }

        this.editingDayIdx = 0;
        this.saveTrainingDraft();
        this.closeModal();
        this.renderTrainingEditor();
        this.showToast("Plano arquivado carregado para edição.");
    }

    archiveAndStartNew() {
        const clientId = this.editingClientId;
        if (!clientId) return;

        // 1. Arquivar o plano que está atualmente na base de dados (o plano ativo)
        const currentPlan = this.state.trainingPlans[clientId];
        if (currentPlan && (Array.isArray(currentPlan) ? currentPlan.length > 0 : (currentPlan.days && currentPlan.days.length > 0))) {
            if (!this.state.archivedTrainingPlans) this.state.archivedTrainingPlans = {};
            if (!this.state.archivedTrainingPlans[clientId]) this.state.archivedTrainingPlans[clientId] = [];

            const archiveEntry = {
                ...currentPlan,
                archivedAt: new Date().toLocaleDateString('pt-PT') + ' ' + new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
            };

            this.state.archivedTrainingPlans[clientId].push(archiveEntry);
            console.log("Plano arquivado com sucesso.");
        }

        this.startFreshPlan();
        this.showToast("Plano arquivado e novo iniciado.", "success");
    }

    startFreshPlan() {
        this.editingPlan = [{ title: 'Plano A', exercises: [], notes: '', rest: '' }];
        this.editingDayIdx = 0;
        this.saveTrainingDraft();
        this.closeModal();
        this.renderTrainingEditor();
        this.showToast("Novo rascunho de plano iniciado.");
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
        // Filtrar exercícios sem ID (linhas em branco que o utilizador não preencheu)
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

        // Notificar o aluno do novo plano de treino (App)
        this.addAppNotification(this.editingClientId, 'Novo Plano de Treino!', 'O seu professor atualizou o seu plano de treino.');

        // Perguntar método de notificação externa
        this.askNotificationMethod(this.editingClientId, 'Plano de Treino');


        this.clearTrainingDraft();
        this.setView('spy_view');
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
            container.innerHTML = '<p class="text-muted">Erro: Cliente não encontrado.</p>';
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
                                <div style="font-size:0.9rem; white-space: pre-wrap; line-height: 1.5; color: #e2e8f0;">${(() => {
                            let cleanText = m.items;
                            const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
                            const match = m.items.match(youtubeRegex);

                            if (match) {
                                // Remover a linha que contém o link do YouTube para não repetir com o card
                                const lines = cleanText.split('\n');
                                cleanText = lines.filter(line => !line.includes(match[0]) && !line.toLowerCase().includes('vídeo tutorial')).join('\n').trim();
                            }

                            // Remover a linha técnica de macros de receita (Valores: ...) para o aluno não ver
                            cleanText = cleanText.split('\n').filter(line => !line.includes('(Valores:')).join('\n').trim();

                            return this.linkify(cleanText);
                        })()}</div>
                                
                                ${(() => {
                            const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
                            const match = m.items.match(youtubeRegex);
                            if (match && match[1]) {
                                const videoId = match[1];
                                return `
                                            <div class="glass-card" style="margin-top:1rem; padding: 0.5rem; border:1px solid rgba(255,0,0,0.3); background:rgba(255,0,0,0.05); display:flex; align-items:center; cursor:pointer; gap:12px;" onclick="window.open('https://www.youtube.com/watch?v=${videoId}', '_blank')">
                                                <div style="width:70px; height:45px; border-radius:8px; background:url('https://img.youtube.com/vi/${videoId}/mqdefault.jpg') center/cover; position:relative; flex-shrink:0;">
                                                    <i class="fab fa-youtube" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:#fff; font-size:1rem; text-shadow: 0 0 5px rgba(0,0,0,0.5);"></i>
                                                </div>
                                                <div style="flex:1;">
                                                    <div style="font-size:0.85rem; font-weight:700; color:#fff;">Vídeo da Receita</div>
                                                    <div style="font-size:0.7rem; color:var(--text-muted);">Clique para ver o tutorial passo-a-passo</div>
                                                </div>
                                                <i class="fas fa-chevron-right" style="margin-right:0.5rem; color:rgba(255,255,255,0.2);"></i>
                                            </div>
                                        `;
                            }
                            return '';
                        })()}

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
                            <p style="color:var(--text-muted); margin-bottom:1.5rem;">Ainda não tem plano alimentar atribuído.</p>
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
        // Se o clientId vier vazio, tenta usar o currentClientId (o aluno que está a ser visto)
        const finalId = clientId || this.currentClientId;
        if (!finalId) return alert("Erro: Não foi possível identificar o aluno.");

        const cid = String(finalId);
        this.editingClientId = Number(finalId);
        this.currentClientId = Number(finalId); // Sincroniza ambos

        if (!this.state.mealPlans) this.state.mealPlans = {};

        let existing = this.state.mealPlans[cid];
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
            existing = { title: 'Plano Alimentar', meals: [] };
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
            // Se o ID de edição sumiu, tenta recuperar do ID atual da ficha
            if (!this.editingClientId && this.currentClientId) {
                this.editingClientId = this.currentClientId;
            }

            if (!this.editingClientId) {
                throw new Error("ID do aluno não identificado. Por favor, volte a ficha do aluno e tente novamente.");
            }

            const c = this.state.clients.find(x => Number(x.id) === Number(this.editingClientId));
            if (!c) throw new Error(`Aluno com ID ${this.editingClientId} não encontrado.`);

            // Garantir que a estrutura basica existe
            if (!this.editingMeal.meals) this.editingMeal.meals = [];
            this.editingMeal.meals = this.editingMeal.meals.filter(m => m !== null);
            if (!this.state.foods) this.state.foods = [];

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
                                        <input type="text" value="${m.name}" placeholder="Nome (Ex: Pequeno almoço)" oninput="app.editingMeal.meals[${idx}].name = this.value"
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
                                            <button class="btn btn-secondary food-search-btn" onclick="app.showFoodSelectionModal(${idx})" style="flex: 1 1 auto; min-width: 120px; font-size:0.85rem;">
                                                <i class="fas fa-apple-alt"></i> Alimento
                                            </button>
                                            <button class="btn btn-secondary" onclick="app.showRecipeSelectionForMeal(${idx})" style="flex: 1 1 auto; min-width: 120px; background:rgba(var(--accent-rgb), 0.1); border:1px solid var(--accent); color:var(--accent); font-size:0.85rem;">
                                                <i class="fas fa-utensils"></i> Receita
                                            </button>
                                            <input type="hidden" id="selected-food-${idx}" value="">
                                            
                                            <div class="food-qty-group" style="flex: 1 1 auto; min-width: 140px;">
                                                <input type="number" id="food-qty-${idx}" placeholder="Qtd" min="0" class="food-qty">
                                                <select id="food-unit-${idx}" class="food-unit">
                                                    <option value="g" style="background:#1e293b; color:#fff;">gramas</option>
                                                    <option value="ml" style="background:#1e293b; color:#fff;">ml</option>
                                                    <option value="l" style="background:#1e293b; color:#fff;">litros</option>
                                                    <option value="un" style="background:#1e293b; color:#fff;">unidades</option>
                                                    <option value="copo" style="background:#1e293b; color:#fff;">copo</option>
                                                    <option value="chavena" style="background:#1e293b; color:#fff;">chávena</option>
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
                                            <i class="fas fa-plus"></i> Adicionar à Refeição
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
                    <i class="fas fa-plus"></i> Adicionar Refeição
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

    getExerciseIcon(cat) {
        const iconMap = {
            // Categorias reais do utilizador
            'Perna': '🦵',
            'Costas': '👊',
            'Peito': '💪',
            'Ombros': '🤷',
            'Cárdio': '❤️',
            'Abdominais': '🔥',
            'Alongamentos': '🧘',
            'Geral': '🏋️',
            'Bicep': '💪',
            'Tricep': '💪',
            // Músculos específicos (retrocompatibilidade)
            'Bíceps': '💪',
            'Deltoides': '🤷',
            'Dorsal': '👊',
            'Isquiotibiais': '🦵',
            'Quadríceps': '🦵'
        };
        return iconMap[cat] || '🏋️';
    }

    getMuscleColor(cat) {
        const colors = {
            // Categorias reais do utilizador
            'Perna': '#10b981', // Emerald
            'Costas': '#8b5cf6', // Violet
            'Peito': '#3b82f6', // Blue
            'Ombros': '#06b6d4', // Cyan
            'Cárdio': '#ef4444', // Red
            'Abdominais': '#f59e0b', // Amber
            'Alongamentos': '#84cc16', // Lime
            'Geral': '#94a3b8', // Slate
            'Bicep': '#f43f5e', // Rose
            'Tricep': '#ec4899', // Pink
            // Músculos específicos (retrocompatibilidade)
            'Bíceps': '#f43f5e',
            'Deltoides': '#06b6d4',
            'Dorsal': '#8b5cf6',
            'Isquiotibiais': '#059669',
            'Quadríceps': '#10b981'
        };
        return colors[cat] || 'var(--primary)';
    }

    showExerciseSelectionModal(dayIdx, exIdx) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';

        // Obter todas as categorias únicas de exercícios
        const categories = this.state.exerciseCategories || [];

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
                            oninput="app.filterExercisesInModal(this.value, document.getElementById('exercise-category-filter').value)"
                            class="search-bar" autofocus>
                    </div>
                    
                    <select id="exercise-category-filter" onchange="app.filterExercisesInModal(document.getElementById('exercise-search-input').value, this.value)"
                        style="width:200px; height:45px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:0 12px; font-size:0.9rem; outline:none; transition:border-color 0.2s;">
                        <option value="">Todas as Categorias</option>
                        ${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                    </select>
                </div>

                <div id="exercise-grid-container" style="overflow-y:auto; flex:1; padding-right:5px;">
                    ${this.renderExerciseGrid()}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.currentSelectionState = { dayIdx, exIdx };
    }

    renderExerciseGrid(searchQuery = '', categoryFilter = '') {
        const baseEx = this.state.exercises || [];
        let exercises = [...baseEx].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        // Filtro por Categoria (Exato)
        if (categoryFilter) {
            exercises = exercises.filter(ex => ex.category === categoryFilter);
        }

        // Filtro por Texto
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
                    <p>Nenhum exercício encontrado</p>
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

    filterExercisesInModal(query, category) {
        const container = document.getElementById('exercise-grid-container');
        if (container) {
            container.innerHTML = this.renderExerciseGrid(query, category);
        }
    }

    selectExerciseFromModal(exId) {
        if (!this.currentSelectionState) return;
        const { dayIdx, exIdx } = this.currentSelectionState;

        this.updateEditorExercise(dayIdx, exIdx, 'id', exId);

        // Fechar modal
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();

        // Renderizar novamente para atualizar o nome no botão
        if (this.activeView === 'edit_predefined_plan') {
            this.renderPredefinedPlanEditor();
        } else {
            this.renderTrainingEditor();
        }
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
            const query = this.normalizeText(searchQuery);
            foods = foods.filter(f =>
                this.normalizeText(f.name).includes(query) ||
                (f.category && this.normalizeText(f.category).includes(query))
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
        const cid = String(this.editingClientId);
        this.state.mealPlans[cid] = this.editingMeal;
        this.saveState();

        // Notificar o aluno
        this.addAppNotification(this.editingClientId, 'Nova Dieta Disponível!', 'O seu professor atualizou o seu plano alimentar.');

        // Perguntar método de notificação externa
        this.askNotificationMethod(this.editingClientId, 'Plano Alimentar');


        this.setView('spy_view');
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

    renderEvaluationView(container, clientId) {
        const c = this.state.clients.find(x => x.id == clientId);
        if (!c) {
            container.innerHTML = '<p class="text-muted">Erro: Cliente não encontrado.</p>';
            return;
        }
        const cid = String(clientId); // Firebase usa chaves de string
        const evals = this.state.evaluations[cid] || [];
        const isTeacher = this.role === 'teacher' || this.role === 'admin';

        container.innerHTML = `
            <div class="page-header" style="margin-bottom: 2rem;">
                <div>
                    <h2 style="margin:0;">Avaliação Física</h2>
                    <h3 class="client-name">${c.name}</h3>
                </div>
                <div class="header-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${isTeacher ? `<button class="btn btn-ghost btn-sm" onclick="app.showIdealParametersModal()" title="Parâmetros Ideais" style="color: var(--accent); border: 1px solid rgba(196, 162, 77, 0.3);"><i class="fas fa-info-circle"></i> <span class="hide-mobile">Parâmetros</span></button>` : ''}
                    ${evals.length ? `<button class="btn btn-secondary btn-sm" onclick="app.downloadEvaluationPDF(${clientId})"><i class="fas fa-file-pdf"></i> <span class="hide-mobile">Exportar PDF</span></button>` : ''}
                    ${isTeacher ? `<button class="btn btn-primary btn-sm" onclick="app.showEvaluationModal(${clientId})"><i class="fas fa-plus"></i> <span class="hide-mobile">Nova Avaliação</span></button>` : ''}
                    ${this.role !== 'client' && container.id === 'main-content' ? `<button class="btn btn-secondary btn-sm" onclick="app.setView(app.role === 'admin' ? 'all-clients' : 'clients')"><i class="fas fa-arrow-left"></i> <span class="hide-mobile">Voltar</span></button>` : ''}
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 1.5rem;" id="evals-list">
                ${evals.length ? evals.map((ev, idx) => this.renderEvaluationCard(ev, idx, clientId, isTeacher)).join('') : `
                    <div class="glass-panel" style="padding: 4rem 1rem; text-align: center; color: var(--text-muted);">
                        <i class="fas fa-chart-line" style="font-size: 3rem; opacity: 0.2; margin-bottom: 1.5rem; display: block;"></i>
                        Ainda não existem avaliações registadas.
                    </div>
                `}
            </div>
        `;
    }

    renderEvaluationCard(ev, idx, clientId, isTeacher) {
        return `
            <div class="glass-panel" style="padding: 1.5rem; position: relative; border-left: 4px solid var(--primary);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 1.5rem; border-bottom: 1px solid var(--surface-border); padding-bottom: 1rem;">
                    <div style="display: flex; align-items: center; gap: 12px; min-width: 150px;">
                        <div style="background: rgba(145, 27, 43, 0.1); width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--primary);">
                            <i class="fas fa-calendar-alt"></i>
                        </div>
                        <div>
                            <strong style="font-size: 1.1rem; display: block;">${ev.date}</strong>
                            <small style="color: var(--text-muted);">Realizada em ${ev.date}</small>
                            ${ev.author ? `<small style="color: var(--accent); display:block; margin-top:2px;">Por: ${ev.author}</small>` : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; justify-content: flex-end; flex-grow: 1;">
                        <button class="btn btn-ghost btn-sm" style="color: var(--text-muted);" onclick="app.downloadEvaluationPDF(${clientId}, ${idx})" title="Exportar está Avaliação">
                            <i class="fas fa-file-pdf"></i>
                        </button>
                        ${isTeacher ? `
                            <button class="btn btn-ghost btn-sm" style="color: var(--accent);" onclick="app.showEvaluationModal(${clientId}, ${idx})"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-ghost btn-sm" style="color: var(--danger);" onclick="app.deleteEvaluation(${clientId}, ${idx})"><i class="fas fa-trash-alt"></i></button>
                        ` : ''}
                        <span class="badge badge-blue">Bioimpedância</span>
                    </div>
                </div>

                <div style="margin-bottom: 1.5rem;">
                    <h4 style="font-size: 0.8rem; color: var(--accent); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1rem; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-bolt"></i> Bioimpedância
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
                            <small>Água</small>
                            <strong style="color: #60a5fa;">${ev.water || '-'} <span style="font-size: 0.65rem; font-weight: normal; color: var(--text-muted);">%</span></strong>
                        </div>
                        <div class="macro-box">
                            <small>Massa Óssea</small>
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
                dateVal = `${y}-${m}-${d}`;
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
                        <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 5px;">Registe os dados da bioimpedância e medidas.</p>
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
                            <i class="fas fa-bolt"></i> Bioimpedância
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

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; align-items: center;">
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
        const dateFormatted = `${d}/${m}/${y}`;

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
            alert('O peso é obrigatório para registar a Avaliação.');
            return;
        }

        const cid = String(clientId);
        if (!this.state.evaluations[cid]) this.state.evaluations[cid] = [];

        if (index === null) {
            this.state.evaluations[cid].unshift(entry);
        } else {
            this.state.evaluations[cid][index] = entry;
        }

        // Atualizar o último peso/data no perfil do cliente se necessário
        const client = this.state.clients.find(c => c.id == clientId);
        if (client) {
            client.lastEvaluation = dateRaw;
        }

        this.saveState();

        // Notificar aluno (App interna)
        this.addAppNotification(clientId, 'Nova Avaliação Física!', 'A sua avaliação física foi atualizada.', null, 'evaluation', false);


        // Perguntar método de notificação externa
        this.askNotificationMethod(clientId, 'Avaliação Física');

        this.closeModal();
        this.renderContent();
    }



    showIdealParametersModal() {
        const content = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h2 style="margin: 0;"><i class="fas fa-info-circle" style="color: var(--accent);"></i> Parâmetros de Referência</h2>
                <button class="btn btn-ghost" onclick="app.closeModal()"><i class="fas fa-times"></i></button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2rem; max-height: 70vh; overflow-y: auto; padding-right: 10px;">
                <!-- Gordura Corporal -->
                <div class="glass-card" style="padding: 1.25rem; border-left: 4px solid var(--primary);">
                    <h4 style="color: var(--primary); margin-top: 0; display: flex; align-items: center; gap: 8px; margin-bottom: 1rem;">
                        <i class="fas fa-percent"></i> % Gordura Corporal
                    </h4>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <tr style="border-bottom: 1px solid var(--surface-border);">
                            <th style="text-align: left; padding: 8px; color: var(--text-muted);">Categoria</th>
                            <th style="text-align: center; padding: 8px; color: var(--text-muted);">Homens</th>
                            <th style="text-align: center; padding: 8px; color: var(--text-muted);">Mulheres</th>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 8px;">Atleta</td>
                            <td style="text-align: center; padding: 8px; color: var(--success); font-weight: 600;">6 - 13%</td>
                            <td style="text-align: center; padding: 8px; color: var(--success); font-weight: 600;">14 - 20%</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 8px;">Fitness</td>
                            <td style="text-align: center; padding: 8px; color: #60a5fa; font-weight: 600;">14 - 17%</td>
                            <td style="text-align: center; padding: 8px; color: #60a5fa; font-weight: 600;">21 - 24%</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 8px;">Aceitável</td>
                            <td style="text-align: center; padding: 8px;">18 - 24%</td>
                            <td style="text-align: center; padding: 8px;">25 - 31%</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px;">Obeso</td>
                            <td style="text-align: center; padding: 8px; color: var(--danger); font-weight: 600;">> 25%</td>
                            <td style="text-align: center; padding: 8px; color: var(--danger); font-weight: 600;">> 32%</td>
                        </tr>
                    </table>
                </div>

                <!-- Gordura Visceral -->
                <div class="glass-card" style="padding: 1.25rem; border-left: 4px solid var(--accent);">
                    <h4 style="color: var(--accent); margin-top: 0; display: flex; align-items: center; gap: 8px; margin-bottom: 1rem;">
                        <i class="fas fa-fire"></i> Gordura Visceral
                    </h4>
                    <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.9rem;">
                        <div style="display: flex; justify-content: space-between; padding: 10px; background: rgba(16, 185, 129, 0.1); border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.2);">
                            <span style="color: var(--success); font-weight: 600;">Saudável</span>
                            <strong>1 - 9</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px; background: rgba(245, 158, 11, 0.1); border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.2);">
                            <span style="color: #f59e0b; font-weight: 600;">Elevado</span>
                            <strong>10 - 14</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px; background: rgba(239, 68, 68, 0.1); border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.2);">
                            <span style="color: var(--danger); font-weight: 600;">Muito Elevado</span>
                            <strong>15 - 30</strong>
                        </div>
                    </div>
                </div>

                <!-- Percentagem de Água -->
                <div class="glass-card" style="padding: 1.25rem; border-left: 4px solid #60a5fa;">
                    <h4 style="color: #60a5fa; margin-top: 0; display: flex; align-items: center; gap: 8px; margin-bottom: 1rem;">
                        <i class="fas fa-tint"></i> % Água Corporal
                    </h4>
                    <div style="display: flex; gap: 1rem;">
                        <div style="flex: 1; text-align: center; padding: 1.25rem; background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid var(--surface-border);">
                            <small style="display: block; color: var(--text-muted); margin-bottom: 5px; text-transform: uppercase;">Homens</small>
                            <strong style="font-size: 1.2rem; color: #60a5fa;">50 - 65%</strong>
                        </div>
                        <div style="flex: 1; text-align: center; padding: 1.25rem; background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid var(--surface-border);">
                            <small style="display: block; color: var(--text-muted); margin-bottom: 5px; text-transform: uppercase;">Mulheres</small>
                            <strong style="font-size: 1.2rem; color: #60a5fa;">45 - 60%</strong>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.showModal(content, '550px');
    }

    async deleteEvaluation(clientId, index) {
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
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:5px;">
                        ${c.birthDate ? `<small style="color:var(--text-muted); font-size:0.85rem;"><i class="fas fa-birthday-cake"></i> ${this.calculateAge(c.birthDate)} anos (${this.formatDate(c.birthDate)})</small>` : ''}
                        ${c.profession ? `<small style="color:var(--accent); font-size:0.85rem; font-weight:600;"><i class="fas fa-briefcase"></i> ${c.profession}</small>` : ''}
                    </div>
                    <div style="font-size:0.8rem; color:var(--primary); margin-top:5px; font-weight:500;">
                        <i class="fas fa-user-tie" style="font-size:0.8rem; margin-right:5px;"></i> 
                        ${(() => {
                const t = this.state.teachers.find(teacher => teacher.id === Number(c.teacherId));
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

            <div style="display:flex; gap:0.5rem; margin-bottom:1.5rem; background:rgba(255,255,255,0.02); padding:4px; border-radius:12px; border:1px solid rgba(255,255,255,0.05); overflow-x: auto; scrollbar-width: none;">
                ${[
                { id: 'training', icon: 'fa-dumbbell', label: 'Treino' },
                { id: 'meal', icon: 'fa-apple-alt', label: 'Dieta' },
                { id: 'evaluation', icon: 'fa-chart-line', label: 'Aval.' },
                { id: 'anamnesis', icon: 'fa-notes-medical', label: 'Anamn.' }
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
        } else if (this.spySubView === 'evaluation') {
            this.renderEvaluationView(área, this.currentClientId);
        } else if (this.spySubView === 'anamnesis') {
            this.renderAnamnesisView(área, this.currentClientId);
        } else {
            this.renderClientNotificationsView(área, this.currentClientId);
        }

        // O cabecalho agora e mantido para dar acesso ao botão de edição
    }

    renderClientNotificationsView(container, clientId) {
        const notifications = (this.state.notifications || []).filter(n => n.targetUserId == clientId).reverse();

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h3 style="margin:0;"><i class="fas fa-comment-dots"></i> Histórico de Mensagens</h3>
                <p style="margin:0; font-size:0.85rem; color:var(--text-muted);">${notifications.length} registos</p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${notifications.length === 0 ? `
                    <div class="glass-card" style="text-align:center; padding:3rem; opacity:0.6;">
                        <i class="fas fa-bell-slash" style="font-size:3rem; margin-bottom:1rem; display:block;"></i>
                        <p>Ainda não foram enviadas notificações personalizadas para este aluno.</p>
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
        // Mostrar loader apenas se não houver dados nenhuns (nem cache nem servidor)
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
        const c = (this.state.clients || []).find(x => String(x.id) === String(this.currentClientId));

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
                        <button class="btn btn-secondary" onclick="location.reload()" style="width: 100%;">
                            <i class="fas fa-sync-alt"></i> Tentar Novamente
                        </button>
                    </div>
                </div>`;
            return;
        }
        switch (this.activeView) {
            case 'dashboard':
                container.innerHTML = `
                    <h2 class="animate-fade-in">Bem-vindo, ${c.name} </h2>
                    <p style="color:var(--text-muted); margin-bottom:1rem;">Este é o seu painel de acompanhamento KandalGym.</p>
                    
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
                            <small>Ver exercícios e series</small>
                        </div>
                        <div class="glass-card" onclick="app.setView('meal')" style="cursor:pointer;">
                            <i class="fas fa-apple-alt" style="font-size:1.5rem; color:var(--success); margin-bottom:1rem;"></i>
                            <h3>Minha Dieta</h3>
                            <small>Ver plano alimentar</small>
                        </div>
                        <div class="glass-card" onclick="app.setView('evaluation')" style="cursor:pointer;">
                            <i class="fas fa-chart-line" style="font-size:1.5rem; color:var(--accent); margin-bottom:1rem;"></i>
                            <h3>Avaliação Física</h3>
                            <small>Ver peso e medidas</small>
                        </div>
                    </div>

                    <div style="margin-top: 2rem;">
                        ${this.getOccupancyHTML(false)}
                    </div>

                    ${(this.state.news && this.state.news.length > 0) ? `
                    <div style="margin-top: 2rem;" class="animate-fade-in">
                        <h3 style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem;">
                            <i class="fas fa-bullhorn" style="color: var(--primary);"></i> Notícias & Novidades
                        </h3>
                        <div style="display: flex; flex-direction: column; gap: 1rem;">
                            ${[...this.state.news].reverse().slice(0, 5).map(item => `
                                <div class="glass-panel" style="padding: 1.25rem; border-left: 4px solid var(--accent);">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                                        <h4 style="margin: 0; color: #fff; font-size: 1.1rem;">${item.title}</h4>
                                        <small style="color: var(--text-muted);">${item.date || ''}</small>
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
                <h2 style="margin:0;"><i class="fas fa-history"></i> Histórico de Treinos</h2>
                <button class="btn btn-secondary" onclick="app.setView('training')">Voltar</button>
            </div>

            ${history.length === 0 ? `
                <div class="glass-panel" style="padding:4rem 1rem; text-align:center; color:var(--text-muted);">
                    <div style="width:80px; height:80px; background:rgba(255,255,255,0.03); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 1.5rem;">
                        <i class="fas fa-calendar-times" style="font-size:2rem; opacity:0.3;"></i>
                    </div>
                    <p style="font-size:1.1rem; font-weight:600; color:#fff; margin-bottom:0.5rem;">Sem Histórico</p>
                    Ainda não concluiu nenhum treino.
                </div>
            ` : history.map(session => `
                <div class="glass-panel" style="padding:1.5rem; margin-bottom:1.5rem; border-left:4px solid var(--primary); position:relative; overflow:hidden;">
                    <div style="position:absolute; right:-20px; top:-20px; font-size:6rem; color:var(--primary); opacity:0.03; pointer-events:none;">
                        <i class="fas fa-dumbbell"></i>
                    </div>
                    
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.25rem;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                <span style="background:var(--primary); color:#fff; font-size:0.65rem; font-weight:800; padding:2px 8px; border-radius:4px; text-transform:uppercase;">${session.date}</span>
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

                    <div style="display:grid; grid-template-columns: 1fr; gap:0.75rem;">
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
                                        <i class="fas fa-sticky-note" style="margin-top:2px; font-size:0.7rem; opacity:0.6;"></i>
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
            <h2 class="animate-fade-in"><i class="fas fa-user-circle"></i> O Meu Perfil</h2>
            <p style="color:var(--text-muted); margin-bottom:0.5rem;">Atualize os seus dados de contacto e palavra-passe.</p>
            <p style="color:var(--warning); font-size:0.82rem; margin-bottom:2rem;">Sempre que efetuar alterações, clique em "Guardar Alteracoes" no final da pagina.</p>

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
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Contacto Telefónico</label>
                    <input type="tel" id="edit-phone" value="${user.phone || ''}" placeholder="Ex: 912345678"
                        style="width:100%; height:45px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 15px;">
                </div>

                ${this.role === 'client' ? `
                <div style="margin-bottom:1.5rem;">
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Data de Nascimento</label>
                    <input type="date" id="edit-dob" value="${user.birthDate || ''}" 
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
                    <div style="position:relative;">
                        <input type="password" id="edit-pass" value="${user.password}" 
                            style="width:100%; height:45px; background:rgba(0,0,0,0.2); border:1px solid var(--surface-border); border-radius:8px; color:#fff; padding:0 15px;">
                        <i class="fas fa-eye" style="position:absolute; right:15px; top:15px; cursor:pointer; color:var(--text-muted);" 
                            onclick="const i = this.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'"></i>
                    </div>
                    <small style="color:var(--text-muted);">Mantenha ou altere para uma nova.</small>
                </div>

                ${(() => {
                const qrInfo = (this.state.qrClients || []).find(q => q.clientId === user.id || q.nome === user.name);
                if (!qrInfo && this.role === 'client') return ''; // Só mostra pros clientes se já tiverem QR

                const displayId = qrInfo ? qrInfo.id : "A" + user.id; // Fallback prefixo A para Admin/Prof se não tiver QR?
                // Na verdade, se for staff e não tiver QR, talvez não devamos mostrar nada ou mostrar um botão?
                // O utilizador pediu para apresentar como nos clientes.

                if (!qrInfo && (this.role === 'teacher' || this.role === 'admin')) {
                    return `
                        <div class="glass-card" style="margin-top:2rem; padding:1.5rem; text-align:center; border: 1px dashed var(--text-muted); background: rgba(255,255,255,0.02);">
                            <h4 style="margin-bottom:1rem; color:var(--text-muted); opacity:0.8;"><i class="fas fa-qrcode"></i> Acesso QR Não Ativado</h4>
                            <p style="font-size:0.8rem; color:var(--text-muted);">Como Staff, pode ativar o seu acesso na aba de Gestão de Entradas.</p>
                        </div>
                     `;
                }

                return `
                    <div class="glass-card" style="margin-top:2rem; padding:1.5rem; text-align:center; border: 1px dashed var(--accent); background: rgba(196, 162, 77, 0.05);">
                        <h4 style="margin-bottom:1rem; color:var(--accent);"><i class="fas fa-qrcode"></i> O Meu Código de Acesso</h4>
                        <div id="profile-qr-container" style="background: white; padding: 12px; border-radius: 12px; display: inline-block; margin-bottom: 1rem; box-shadow: 0 4px 15px rgba(0,0,0,0.2);"></div>
                        <p style="font-size:0.8rem; color:var(--text-muted);">Apresente este código na receção para registar a sua entrada.</p>
                        <div style="font-size: 0.7rem; color: var(--accent); opacity: 0.8; font-family: monospace; font-weight: 700;">ID: ${qrInfo ? qrInfo.id : 'N/A'}</div>
                    </div>
                `;
            })()}

                <button class="btn btn-primary" onclick="app.updateProfile()" style="width:100%; height:50px; font-size:1.1rem; margin-top:2rem;">
                    <i class="fas fa-save"></i> Guardar Alterações
                </button>
            </div>
        `;

        // Gerar o QR Code se for aluno
        // Gerar o QR Code para qualquer Role que tenha QR configurado
        const qrInfo = (this.state.qrClients || []).find(q => q.clientId === user.id || q.nome === user.name);
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
            reader.readAsDataURL(file);
        }
    }

    showCropModal(imgSrc, callback) {
        const modalHtml = `
            <div style="text-align: center; width: 100%;">
                <h3 style="margin-top:0; margin-bottom:1rem;">Ajustar Foto</h3>
                <div style="height: 60vh; margin-bottom: 1.5rem; background:#000; position:relative; width: 100%; display: flex; align-items:center; justify-content:center;">
                    <img id="cropper-image" src="${imgSrc}" style="max-width: 100%; max-height: 100%; display:block;">
                </div>
                <div style="display:flex; justify-content:center; gap:10px;">
                    <button class="btn btn-secondary" onclick="app.closeModal()">Cancelar</button>
                    <button class="btn btn-primary" id="btn-crop-confirm"><i class="fas fa-crop"></i> Recortar e Guardar</button>
                </div>
            </div>
        `;
        this.showModal(modalHtml, '500px'); // Ensure modal has enough width

        setTimeout(() => {
            const image = document.getElementById('cropper-image');
            if (window.cropperInstance) {
                window.cropperInstance.destroy();
            }
            window.cropperInstance = new Cropper(image, {
                aspectRatio: 1, // Quadrado
                viewMode: 1,
                autoCropArea: 0.9,
                background: false,
                movable: true,
                zoomable: true,
                rotatable: false,
                scalable: false,
            });

            document.getElementById('btn-crop-confirm').onclick = () => {
                const canvas = window.cropperInstance.getCroppedCanvas({
                    width: 500, // Aumentada a resolução
                    height: 500,
                    imageSmoothingEnabled: true,
                    imageSmoothingQuality: 'high',
                });
                const base64 = canvas.toDataURL('image/jpeg', 0.85); // Maior qualidade em 85%
                window.cropperInstance.destroy();
                app.closeModal();
                callback(base64);
            };
        }, 150);
    }

    async updateProfile() {
        const name = document.getElementById('edit-name').value.trim();
        const email = document.getElementById('edit-email').value.trim();
        const phone = document.getElementById('edit-phone').value.trim();
        const pass = document.getElementById('edit-pass').value;
        const btn = document.querySelector('button[onclick="app.updateProfile()"]');

        if (!name || !email || !pass) {
            return alert('Nome, Email e Palavra-passe são obrigatórios.');
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
                user.password = pass;

                const dobInput = document.getElementById('edit-dob');
                if (dobInput) user.birthDate = dobInput.value;
                const profInput = document.getElementById('edit-profession');
                if (profInput) user.profession = profInput.value;
                if (this.currentUser.photoUrl) user.photoUrl = this.currentUser.photoUrl;

                // Atualizar utilizador atual na sessão
                this.currentUser = { ...user };
                await this.saveState();

                // Atualizar Firebase Auth (email e password)
                const firebaseUser = this.auth ? this.auth.currentUser : null;
                if (firebaseUser) {
                    try {
                        if (firebaseUser.email !== email) await firebaseUser.updateEmail(email);
                        if (pass && pass !== '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') await firebaseUser.updatePassword(pass);
                    } catch (authErr) {
                        console.warn('Aviso Firebase Auth update:', authErr.code);
                        // Se requerer re-login recente, ignorar silenciosamente (nao e critico)
                    }
                }

                this.persistLogin();
                this.renderUserProfile(); // Atualizar avatar no topo

                alert('Perfil atualizado com sucesso!');
                this.setView('dashboard');
            }
        } catch (err) {
            console.error("Erro ao atualizar perfil:", err);
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

        const q = this.normalizeText(query);
        const filterFn = u => !q || this.normalizeText(u.name || '').includes(q) || this.normalizeText(u.email || '').includes(q);

        // Reset all tabs style
        const tabs = ['teachers', 'clients', 'admins', 'plans'];
        tabs.forEach(t => {
            const btn = document.getElementById('tab-' + t);
            if (btn) btn.style.borderBottom = 'none';
        });

        const activeBtn = document.getElementById('tab-' + tab);
        if (activeBtn) {
            activeBtn.style.borderBottom = '2px solid ' + (tab === 'teachers' ? 'var(--primary)' : tab === 'clients' ? 'var(--secondary)' : tab === 'admins' ? 'var(--accent)' : '#f1c40f');
        }

        if (tab === 'teachers') {
            const filtered = (this.state.teachers || []).filter(filterFn);
            listContainer.innerHTML = `<div class="client-list animate-fade-in">${filtered.map(t => this.renderUserCard(t, 'teacher')).join('')}</div>`;
        } else if (tab === 'admins') {
            const filtered = (this.state.admins || []).filter(filterFn);
            listContainer.innerHTML = `<div class="client-list animate-fade-in">${filtered.map(a => this.renderUserCard(a, 'admin')).join('')}</div>`;
        } else if (tab === 'clients') {
            const filtered = (this.state.clients || []).filter(filterFn);
            listContainer.innerHTML = `<div class="client-list animate-fade-in">${filtered.map(c => this.renderUserCard(c, 'client')).join('')}</div>`;
        } else if (tab === 'plans') {
            this.renderPlanRestrictions(listContainer);
        }
    }

    renderPlanRestrictions(container) {
        if (!this.state.planRestrictions) {
            this.state.planRestrictions = JSON.parse(JSON.stringify(this.planRestrictions));
        }

        const plans = Object.keys(this.state.planRestrictions);
        const uniqueClasses = [...new Set((this.state.classes || []).map(c => c.name).filter(n => n))].sort();

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 2rem;">
                <div>
                    <h3 style="margin:0;"><i class="fas fa-crown" style="color:#f1c40f;"></i> Regras de Mensalidades</h3>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin-top:5px;">Configure os acessos exclusivos de cada plano.</p>
                </div>
                <button class="btn btn-primary" onclick="app.addNewPlanRestriction()" style="font-size:0.85rem; padding: 0.6rem 1rem; height:fit-content;"><i class="fas fa-plus"></i> Novo Plano</button>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1.5rem;">
                ${plans.map(p => {
            const r = this.state.planRestrictions[p];
            if (typeof r.filter === 'string') r.filter = r.filter ? [r.filter] : [];
            if (!r.exclude) r.exclude = [];
            if (typeof r.exclude === 'string') r.exclude = r.exclude ? [r.exclude] : [];

            return `
                        <div class="glass-card animate-fade-in" style="padding: 1.5rem; position: relative; display: flex; flex-direction: column; gap: 1.2rem; border-top: 4px solid var(--accent);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <h4 style="margin: 0; font-size: 1.3rem; display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-id-card" style="color: var(--accent); opacity: 0.8;"></i> ${p}
                                </h4>
                                <div style="display:flex; gap:8px;">
                                    <button class="btn-icon" style="background: rgba(255,255,255,0.1); color:#fff;" onclick="app.renamePlanRestriction('${p}')" title="Editar Nome do Plano"><i class="fas fa-edit"></i></button>
                                    <button class="btn-icon danger" style="background: rgba(255,71,87,0.1);" onclick="app.deletePlanRestriction('${p}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>

                            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); margin-bottom:0.5rem;">
                                <div>
                                    <span style="font-weight: 600; display: block; margin-bottom: 3px;">Permite Aulas?</span>
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">Acesso geral a reservas</span>
                                </div>
                                <label class="switch" style="margin: 0;">
                                    <input type="checkbox" ${r.allowClasses ? 'checked' : ''} onchange="app.updatePlanRestriction('${p}', 'allowClasses', this.checked); app.switchAdminTab('plans')">
                                    <span class="slider round"></span>
                                </label>
                            </div>

                            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 0.5rem;">
                                <div>
                                    <span style="font-weight: 600; display: block; margin-bottom: 3px;">Créditos Fixos</span>
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">No momento do reset</span>
                                </div>
                                <input type="number" min="0" value="${r.maxCredits !== undefined ? r.maxCredits : 30}" onchange="app.updatePlanRestriction('${p}', 'maxCredits', parseInt(this.value) || 0)" style="width: 70px; text-align: center; border-radius: 8px; padding: 6px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; font-weight: bold; outline:none;">
                            </div>

                            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                                <div>
                                    <span style="font-weight: 600; display: block; margin-bottom: 3px;">Acessos Diários</span>
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">Limite de passagens na catraca/dia</span>
                                </div>
                                <input type="number" min="1" value="${r.maxDailyEntrances !== undefined ? r.maxDailyEntrances : 2}" onchange="app.updatePlanRestriction('${p}', 'maxDailyEntrances', parseInt(this.value) || 2)" style="width: 70px; text-align: center; border-radius: 8px; padding: 6px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; font-weight: bold; outline:none;">
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
                                    <span style="font-size: 0.9rem;">Este plano não tem permissão para usar o sistema de reservas online.</span>
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
                    <small style="color: var(--text-muted); font-size:0.85rem; line-height: 1.4;">As regras são aplicadas no momento exato em que o aluno tenta marcar a aula. Pode configurar planos exclusivos para Pilates ou impedir a marcação de aulas Premium num plano Básico, bloqueando automaticamente a app do cliente.</small>
                </div>
            </div>
        `;
    }

    updatePlanRestriction(plan, field, value) {
        if (!this.state.planRestrictions) this.state.planRestrictions = {};
        if (!this.state.planRestrictions[plan]) return;

        this.state.planRestrictions[plan][field] = value;
        this.saveState();
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
                            <span style="font-size: 0.8rem; color: ${isChecked ? '#fff' : 'var(--text-muted)'}; font-weight: ${isChecked ? '600' : '400'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;" title="${name}">${name}</span>
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
                                style="display: none;">
                            <i class="fas ${isChecked ? 'fa-check-circle' : 'fa-circle'}" style="color: ${isChecked ? color : 'rgba(255,255,255,0.1)'}; font-size: 1rem; transition: all 0.2s ease;"></i>
                        </label>
                    `;
        }).join('')}
            </div>
        `;
    }

    togglePlanClassRestriction(plan, field, className, isChecked) {
        if (!this.state.planRestrictions[plan]) return;
        if (!this.state.planRestrictions[plan][field]) this.state.planRestrictions[plan][field] = [];

        const current = this.state.planRestrictions[plan][field];
        if (isChecked) {
            if (!current.includes(className)) current.push(className);
        } else {
            this.state.planRestrictions[plan][field] = current.filter(c => c !== className);
        }
        this.saveState();
        // UI is handled inline inside the label onchange attributes for instant slick feedback.
    }

    addNewPlanRestriction() {
        const name = prompt('Nome da nova Mensalidade (exatamente como aparece no QR):');
        if (!name) return;
        if (!this.state.planRestrictions) this.state.planRestrictions = {};
        this.state.planRestrictions[name] = { allowClasses: true, filter: '', exclude: [] };
        this.saveState();
        this.switchAdminTab('plans');
    }

    async renamePlanRestriction(oldName) {
        const newName = await this.customPrompt(`Introduza o novo nome para o plano "${oldName}":`, oldName);
        if (!newName || newName.trim() === '' || newName === oldName) return;

        if (this.state.planRestrictions[newName]) {
            return alert("Já existe um plano com esse nome. Escolha um nome diferente.");
        }

        // Transferir todas as definições (créditos, regras das aulas, etc) para a nova chave
        this.state.planRestrictions[newName] = this.state.planRestrictions[oldName];
        delete this.state.planRestrictions[oldName];

        // Atualizar nos clientes que tinham o plano antigo para não desconfigurar na lista de alunos
        let updatedCount = 0;
        if (this.state.qrClients) {
            this.state.qrClients.forEach(c => {
                if (c.plano === oldName) {
                    c.plano = newName;
                    updatedCount++;
                }
            });
        }

        this.saveState();
        this.switchAdminTab('plans');
        this.showToast(`Plano renomeado. ${updatedCount} aluno(s) atualizado(s).`, 'success');
    }

    deletePlanRestriction(plan) {
        if (!confirm(`Deseja eliminar as regras para o plano "${plan}"?`)) return;
        delete this.state.planRestrictions[plan];
        this.saveState();
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
            <div class="glass-card animate-fade-in" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; border-left: 4px solid ${color}; padding: 1.2rem; background: rgba(255,b255,255,0.02);">
                <div style="display: flex; align-items: center; gap: 1.2rem;">
                    <div style="position: relative;">
                        <div style="color: ${color}; background: rgba(255,255,255,0.05); width: 55px; height: 55px; border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 2px solid ${color}33;">
                            ${user.photoUrl ? `<img src="${user.photoUrl}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas ${icon}" style="font-size:1.4rem;"></i>`}
                        </div>
                        <div style="position: absolute; bottom: -2px; right: -2px; width: 14px; height: 14px; border-radius: 50%; background: ${user.status === 'Ativo' ? '#26de81' : '#eb4d4b'}; border: 2px solid var(--background);"></div>
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
                                <select onchange="app.assignTeacher(${user.id}, this.value)" style="font-size: 0.8rem; background: transparent; border: none; color: var(--text-base); outline: none; cursor: pointer;">
                                    <option value="">Sem Professor Tradicional</option>
                                    ${(this.state.teachers || []).map(t => `<option value="${t.id}" ${user.teacherId === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
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

    renderChat(container) {
        const myId = Number(this.currentUser.id);
        const notifications = (this.state.notifications || []).filter(n => n.targetUserId === myId || n.senderId === myId);

        // Agrupar conversas por utilizador
        const threads = {};

        // 1. Adicionar contatos proativos baseados no papel (role)
        if (this.role === 'client') {
            // Aluno: Sempre ter o seu professor disponível
            const tid = this.currentUser.teacherId;
            if (tid) {
                const teacher = this.state.teachers.find(t => t.id === tid);
                if (teacher) {
                    threads[tid] = { id: tid, messages: [], user: teacher, lastMsg: { body: 'Sem mensagens anteriores.', createdAt: new Date(0).toISOString() } };
                }
            }
            // Também incluir Admin se houve conversas
        } else if (this.role === 'teacher') {
            // Professor: Ver todos os seus alunos por omissao
            const myClients = this.state.clients.filter(c => c.teacherId === myId);
            myClients.forEach(c => {
                threads[c.id] = { id: c.id, messages: [], user: c, lastMsg: { body: 'Inicie uma conversa...', createdAt: new Date(0).toISOString() } };
            });
        } else if (this.role === 'admin') {
            // Admin: Ver todos os professores e outros administradores como contactos iniciais
            this.state.teachers.forEach(t => {
                if (Number(t.id) !== myId) {
                    threads[t.id] = { id: t.id, messages: [], user: t, lastMsg: { body: 'Equipa técnica / Staff', createdAt: new Date(0).toISOString() } };
                }
            });
            this.state.admins.forEach(a => {
                if (Number(a.id) !== myId) {
                    threads[a.id] = { id: a.id, messages: [], user: a, lastMsg: { body: 'Administrador', createdAt: new Date(0).toISOString() } };
                }
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

        // 4. Ordenar threads: Sistema KandalGym primeiro (para admin), depois por data, depois alfabetico
        const sortedThreads = Object.values(threads).sort((a, b) => {
            if (this.role === 'admin') {
                if (a.id === 'system') return -1;
                if (b.id === 'system') return 1;
            }
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
                    <p>Selecione uma conversa para começar.</p>
                </div>
            `;
        }

        let thread = threads.find(t => t.id == activeChatId);
        // Fallback: se a thread não existe (ex: aluno <-> professor novo), cria objeto temporario
        if (!thread) {
            // Tentar encontrar user info
            const uid = Number(activeChatId);
            const user = this.state.clients.find(c => c.id === uid) ||
                this.state.teachers.find(tr => tr.id === uid) ||
                this.state.admins.find(a => a.id === uid);

            if (user) {
                thread = { id: uid, user: user, messages: [] };
            } else {
                return '<div class="chat-empty-state">Utilizador não encontrado.</div>';
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
                <!-- Actions could go here -->
            </div>

            <div class="chat-messages">
                ${msgs.length === 0 ? '<div style="text-align:center; color:var(--text-muted); margin-top:2rem;">Inicio da conversa.</div>' : ''}
                ${msgs.map(m => {
                        const isMe = String(m.senderId) === String(this.currentUser.id);
                        const isSystem = !m.senderId;
                        const bubbleClass = isSystem ? 'message-received' : (isMe ? 'message-sent' : 'message-received');

                        return `
                        <div class="message-bubble ${bubbleClass}" style="${isSystem ? 'background: #334155; width:100%; max-width:100%; text-align:center; font-size:0.85rem;' : ''}">
                            ${isSystem ? `<strong style="display:block; margin-bottom:4px; color:var(--accent);">${m.title}</strong>` : ''}
                            ${!isSystem && !isMe ? `<div style="font-size:0.7rem; color:var(--primary); font-weight:bold; margin-bottom:5px; padding-left:35px;">${thread.user.name}</div>` : ''}
                            
                            ${!isSystem && !m.isDeleted ? `<i class="fas fa-reply" onclick="event.stopPropagation(); app.startReply(${m.id})" style="position:absolute; top:8px; left:8px; font-size:0.8rem; opacity:1; color:var(--primary); cursor:pointer; background:rgba(0,0,0,0.25); width:22px; height:22px; display:flex; align-items:center; justify-content:center; border-radius:50%;" title="Responder"></i>` : ''}
                            
                            ${isMe && !m.isDeleted ? `<i class="fas fa-trash" onclick="event.stopPropagation(); app.deleteMessage(${m.id})" style="position:absolute; top:8px; right:8px; font-size:0.8rem; opacity:1; color:#ff4444; cursor:pointer; background:rgba(0,0,0,0.25); width:22px; height:22px; display:flex; align-items:center; justify-content:center; border-radius:50%;" title="Apagar Mensagem"></i>` : ''}
                            
                            ${m.replyToBody ? `
                                <div style="background:rgba(0,0,0,0.2); border-left:3px solid var(--primary); padding:5px 8px; margin-bottom:8px; font-size:0.8rem; border-radius:4px; opacity:0.8; margin-top:${!isSystem && !isMe ? '5px' : '15px'};">
                                    <div style="font-weight:bold; color:var(--primary); font-size:0.7rem;">${m.replyToSenderName || 'Resposta'}</div>
                                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.replyToBody}</div>
                                </div>
                            ` : ''}

                            <div style="${!isSystem ? 'padding: 5px 25px;' : ''} ${m.isDeleted ? 'font-style:italic; opacity:0.7;' : ''}">
                                ${m.body}
                            </div>
                            
                            <span class="message-time">
                                ${new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    `;
                    }).join('')}
            </div>

            ${activeChatId !== 'system' ? `
            <div class="chat-input-area" style="flex-direction:column; align-items:stretch; padding:10px;">
                ${this.replyingTo ? `
                    <div style="background:rgba(255,255,255,0.05); border-left:3px solid var(--primary); padding:8px 12px; margin-bottom:10px; border-radius:8px; position:relative; display:flex; flex-direction:column;">
                        <i class="fas fa-times" onclick="app.cancelReply()" style="position:absolute; top:8px; right:10px; cursor:pointer; opacity:0.5;"></i>
                        <span style="font-size:0.7rem; color:var(--primary); font-weight:bold; margin-bottom:2px;">A responder a ${this.replyingTo.senderName || 'Mensagem'}</span>
                        <span style="font-size:0.8rem; opacity:0.7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:20px;">${this.replyingTo.body}</span>
                    </div>
                ` : ''}
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="text" id="chat-input-text" placeholder="Escreva uma mensagem..." onkeypress="app.handleChatInput(event, '${activeChatId}')">
                    <button class="btn btn-primary btn-sm" style="border-radius:50%; width:40px; height:40px; padding:0; display:flex; align-items:center; justify-content:center;" 
                        onclick="app.sendMessageInChat('${activeChatId}')">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
            ` : '<div style="padding:1rem; text-align:center; color:var(--text-muted); background:rgba(0,0,0,0.2);">Este é um canal de notificações do sistema.</div>'}
        `;
    }

    openChat(userId) {
        this.activeChatUserId = userId;
        document.body.classList.add('chat-open'); // Esconder nav mobile se necessário
        this.renderContent(); // Re-render to show chat view
    }

    closeChat() {
        this.activeChatUserId = null;
        document.body.classList.remove('chat-open');
        this.renderContent();
    }

    handleChatInput(e, targetId) {
        if (e.key === 'Enter') {
            this.sendMessageInChat(targetId);
        }
    }

    deleteMessage(msgId) {
        if (!confirm('Deseja sinalizar esta mensagem como eliminada?')) return;
        const msg = (this.state.notifications || []).find(n => n.id === msgId);
        if (msg) {
            msg.body = '🚫 Esta mensagem foi eliminada';
            msg.isDeleted = true;
            this.saveState();
            this.renderContent();
            this.showToast('Mensagem sinalizada como eliminada.');
        }
    }

    startReply(msgId) {
        const msg = (this.state.notifications || []).find(n => n.id === msgId);
        if (msg) {
            // Encontrar nome do sender
            let senderName = 'Mensagem';
            if (msg.senderId) {
                const user = this.state.clients.find(c => c.id == msg.senderId) ||
                    this.state.teachers.find(t => t.id == msg.senderId) ||
                    this.state.admins.find(a => a.id == msg.senderId);
                if (user) senderName = user.name;
            } else if (String(msg.senderId) === String(this.currentUser.id)) {
                senderName = 'Eu';
            }

            this.replyingTo = { ...msg, senderName };
            this.renderContent();
            // Focar input
            setTimeout(() => document.getElementById('chat-input-text')?.focus(), 50);
        }
    }

    cancelReply() {
        this.replyingTo = null;
        this.renderContent();
    }

    sendMessageInChat(targetId) {
        const input = document.getElementById('chat-input-text');
        const text = input.value.trim();
        if (!text) return;

        // Metadata para Resposta (WhatsApp Style)
        const replyMeta = this.replyingTo ? {
            replyToId: this.replyingTo.id,
            replyToBody: this.replyingTo.body,
            replyToSenderName: this.replyingTo.senderName
        } : {};

        // Add message
        const newMsg = {
            id: Date.now() + Math.random(),
            targetUserId: Number(targetId),
            senderId: this.currentUser.id,
            type: 'message',
            title: `Nova mensagem`,
            body: text,
            createdAt: new Date().toISOString(),
            ...replyMeta
        };

        if (!this.state.notifications) this.state.notifications = [];
        this.state.notifications.push(newMsg);

        // Limpar estado de resposta
        this.replyingTo = null;
        this.saveState();

        // Refresh view
        input.value = '';
        this.renderContent();

        // Timeout to ensure scroll happens after render
        setTimeout(() => {
            const msgsContainer = document.querySelector('.chat-messages');
            if (msgsContainer) msgsContainer.scrollTop = msgsContainer.scrollHeight;
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

        if (!subject || !body) return alert('Preencha o assunto é a mensagem.');

        this.addAppNotification(targetId, subject, body, this.currentUser.id, 'message');

        this.closeModal();
        alert('Resposta enviada com sucesso!');
    }

    showSendMessageModal() {
        const teacherId = this.currentUser.teacherId;
        const teacher = this.state.teachers.find(t => t.id === teacherId);

        if (!teacher) return alert('Não tem professor atribuído.');

        this.showModal(`
            <h3 style="margin-top:0;">Nova Mensagem</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">Para: <strong>${teacher.name}</strong></p>
            
            <div style="display:flex; flex-direction:column; gap:1rem;">
                <div>
                    <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:5px;">Assunto</label>
                    <input type="text" id="msg-subject" class="search-bar" placeholder="Ex: Dúvida no treino...">
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

        // Enviar notificação para o professor
        this.addAppNotification(teacherId, `Mensagem de ${this.currentUser.name}`, `${subject}\n\n${body}`, this.currentUser.id, 'message');

        this.closeModal();
        alert('Mensagem enviada com sucesso!');
    }

    deleteNotification(createdAt, userId) {
        if (!confirm('Eliminar está mensagem?')) return;

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
            alert('Professor atribuído com sucesso!');
            this.switchAdminTab('clients');
        }
    }

    async deleteUser(type, id, name) {
        if (confirm(`Tem a certeza que deseja eliminar o utilizador ${name}?\nAVISO: Todos os planos, histórico e avaliações associados serão removidos permanentemente.`)) {
            if (type === 'admin') {
                if (id === 1) return alert('O administrador principal não pode ser removido.');
                if (id === this.currentUser.id) return alert('Não pode remover a sua própria conta enquanto estiver logado.');
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
            alert('Utilizador e todos os seus dados eliminados com sucesso!');

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

        if (otherTeachers.length === 0) return alert('Não existem outros professores para transferir.');

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
                    <i class="fas fa-info-circle"></i> O histórico, planos e avaliações serão mantidos. Os administradores serão notificados desta transferência.
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

        const client = this.state.clients.find(c => c.id == clientId);
        const newTeacher = this.state.teachers.find(t => t.id == newTeacherId);

        if (client && newTeacher) {
            const oldTeacherName = this.currentUser.name;
            client.teacherId = Number(newTeacherId);

            // Notify Admins
            const msgText = ` TRANSFERÊNCIAÅ NCIA DE ALUNO: O aluno ${client.name} foi transferido de ${oldTeacherName} para ${newTeacher.name} em ${new Date().toLocaleString()}.`;

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
            // 1. Verificar se é uma linha de resumo de macros de receita (Valores: ...kcal | ...g P | ...)
            const recipeMatch = line.match(/\(Valores:\s*(\d+(?:\.\d+)?)\s*kcal\s*\|\s*(\d+(?:\.\d+)?)\s*g\s*P\s*\|\s*(\d+(?:\.\d+)?)\s*g\s*C\s*\|\s*(\d+(?:\.\d+)?)\s*g\s*G\)/i);
            if (recipeMatch) {
                total.kcal += parseFloat(recipeMatch[1]);
                total.prot += parseFloat(recipeMatch[2]);
                total.carb += parseFloat(recipeMatch[3]);
                total.fat += parseFloat(recipeMatch[4]);
                return;
            }

            // 2. Alimento individual: Regex melhorado para suportar ":" ou "-" como separador e unidades extras como "L"
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
                <h3 style="margin:0;"><i class="fas fa-history"></i> Histórico de Anamneses</h3>
                ${isTeacher ? `<button class="btn btn-primary btn-sm" onclick="app.showAnamnesisModal(${clientId})"><i class="fas fa-plus"></i> Novo Registo</button>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${entries.length === 0 ? `
                    <div class="glass-card animate-fade-in" style="text-align:center; padding:3rem; opacity: 0.7;">
                        <i class="fas fa-notes-medical" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
                        <p style="margin:0;">Nenhum registo de anamnese disponível.</p>
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
        const myClients = this.state.clients.filter(c => c.teacherId === this.currentUser.id);
        if (myClients.length === 0) return alert('Ainda não tem alunos atribuídos.');

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
            activityLevel: 'Sedentário',
            isSmoker: 'Não',
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
                <!-- Sidebar/Nav áÂrea -->
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
                        <i class="fas fa-heartbeat" style="width: 20px;"></i> <span>Histórico Saúde</span>
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
                                <input type="text" id="anam-meds" value="${anam.medications}" class="search-bar" placeholder="Liste medicamentos em uso..." style="background: rgba(255,255,255,0.03);">
                            </div>
                            <div class="input-group" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
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
                                <textarea id="anam-obs" class="search-bar" style="height:100px; padding: 15px; background: rgba(255,255,255,0.03);">${anam.observations}</textarea>
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

            // Notificação App Interna
            this.addAppNotification(clientId, 'Resumo Clínico!', 'A sua anamnese foi atualizada.', null, 'notes-medical', false);

            // Perguntar método de notificação externa
            this.askNotificationMethod(clientId, 'Anamnese / Resumo Clínico');

            this.closeModal();
            this.renderContent();
            this.showToast('Anamnese guardada com sucesso!');


        } catch (err) {
            console.error('Error saving anamnesis:', err);
            alert('Erro ao guardar os dados. Verifique a consola.');
        }
    }

    async deleteAnamnesis(clientId, index) {
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
        return `${day}/${month}/${year}`;
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

            // Limpar o texto para o PDF (remover links e linha tecnica de macros)
            let displayItems = m.items || '';
            displayItems = displayItems.split('\n')
                .filter(line => !line.includes('youtube.com') && !line.includes('youtu.be') && !line.includes('(Valores:'))
                .join('\n').trim();

            htmlContent += `
                <div style="margin-bottom: 20px; page-break-inside: avoid;">
                    <div style="background: #911B2B; color: white; padding: 8px 12px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                        <span>${m.time} - ${m.name}</span>
                        ${mN.kcal > 0 ? `<span style="font-size: 12px;">${Math.round(mN.kcal)} kcal</span>` : ''}
                    </div>
                    <div style="padding: 12px; border: 1px solid #eee; border-top: none; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${displayItems || 'Sem alimentos adicionados'}</div>
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
            return alert('Ainda não existem avaliações para exportar.');
        }

        const evalsToPrint = index !== null ? [evals[index]] : evals;

        let html = `
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #911B2B; padding-bottom: 10px;">
                <h1 style="color: #911B2B; margin: 0;">KandalGym</h1>
                <p style="color: #666; margin: 5px 0;">Relatório de Avaliação Física</p>
            </div>

            <div style="margin-bottom: 25px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h2 style="margin: 0; font-size: 18px; color: #333;">Aluno: ${client.name}</h2>
                <p style="margin: 5px 0; font-size: 14px;"><strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-PT')}</p>
            </div>
        `;

        evalsToPrint.forEach((ev) => {
            html += `
                <div style="margin-bottom: 30px; border: 1px solid #ddd; border-radius: 10px; overflow: hidden; page-break-inside: avoid;">
                    <div style="background: #911B2B; color: white; padding: 10px 15px; font-weight: bold; font-size: 16px; display: flex; justify-content: space-between;">
                        <span>Avaliação de ${ev.date}</span>
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

        // 3. Imprimir usando o navegador (Reset para nativo)
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
        const client = this.state.clients.find(c => c.id == clientId);
        const entries = this.state.anamnesis[clientId] || [];
        const entry = entries[index];

        if (!client || !entry) return alert('Registo não encontrado.');

        const html = `
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #911B2B; padding-bottom: 10px;">
                <h1 style="color: #911B2B; margin: 0;">KandalGym</h1>
                <p style="color: #666; margin: 5px 0;">Relatório de Anamnese Física</p>
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
                <div style="font-size:13px; line-height:1.5;">${entry.medications || 'Nenhuma.'}</div>
            </div>

            <div style="margin-top:20px; border:1px solid #eee; padding:15px; border-radius:8px;">
                <h4 style="color:#911B2B; margin-top:0; border-bottom:1px solid #eee; padding-bottom:5px; text-transform:uppercase; font-size:12px;">Observações</h4>
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
        if (!container) return;

        // --- PRESERVAR SCROLL DO CONTENTOR (CSS garante scroll interno no PC) ---
        const scrollPosCont = container.scrollTop;

        // Bloquear altura mínima para evitar colapso durante o re-render
        container.style.minHeight = container.scrollHeight + 'px';

        // Preservar o estado do status box se ja houver algo lá
        const prevStatusEl = document.getElementById('scan-status');
        const prevHTML = prevStatusEl ? prevStatusEl.innerHTML : '';
        const prevClass = prevStatusEl ? prevStatusEl.className : '';

        try {
            container.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
                    <h2 style="margin: 0;"><i class="fas fa-qrcode"></i> Gestão de Entradas</h2>
                </div>

                <div class="dashboard" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px; margin-top: 20px;">
                    <div class="glass-panel" style="padding: 1.5rem; border-left: 4px solid var(--accent);">
                        <h3 style="margin-top: 0; color: var(--primary); display: flex; align-items: center; gap: 10px; font-size: 1.1rem;">
                            <i class="fas fa-barcode"></i> Scanner de Hardware Ativo
                        </h3>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 20px;">Utilize o leitor físico para ler os códigos QR dos alunos.</p>
                        
                        <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                            <div style="flex: 1; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px; padding: 10px; display: flex; align-items: center; gap: 10px;">
                                <span class="pulse-green" style="width:10px; height:10px; background:#10b981; border-radius:50%;"></span>
                                <span style="font-size:0.85rem; color:#10b981; font-weight:700;">Pronto para leitura</span>
                            </div>
                            <button class="btn ${this.serialWriter ? 'btn-success' : 'btn-secondary'}" 
                                style="flex: 1; border: 1px solid ${this.serialWriter ? 'var(--success)' : 'var(--primary)'}; color: ${this.serialWriter ? '#fff' : 'var(--primary)'}; background: ${this.serialWriter ? 'var(--success)' : 'rgba(145, 27, 43, 0.05)'}; height: 44px;" 
                                onclick="app.connectArduino()">
                                <i class="fas fa-plug"></i> ${this.serialWriter ? 'Arduino Conetado' : 'Ligar Arduino'}
                            </button>
                        </div>

                        <div style="background: rgba(0,0,0,0.2); border: 1px dashed var(--surface-border); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 20px;">
                            <i class="fas fa-qrcode" style="font-size: 3rem; color: rgba(255,255,255,0.05); margin-bottom: 10px; display: block;"></i>
                            <input type="text" id="hardware-scanner-input" 
                                placeholder="Aguardando QR..." 
                                onkeyup="if(event.key === 'Enter') { app.processarLeituraQR(this.value); this.value=''; }"
                                autocomplete="off"
                                style="width: 100%; height: 50px; background: rgba(0,0,0,0.4); border: 2px solid var(--primary); border-radius: 10px; color: #fff; text-align: center; font-size: 1.2rem; font-weight: 700; letter-spacing: 2px; outline: none; box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.1);">
                        </div>

                        <div id="scan-status" style="min-height: 50px;">
                            ${this.renderQRMsgHTML()}
                        </div>
                    </div>

                    <div class="glass-panel" style="padding: 1.5rem;">
                        <h3 style="margin-top: 0; color: var(--success); display: flex; align-items: center; gap: 10px; font-size: 1.1rem;">
                            <i class="fas fa-ticket-alt"></i> Novo Treino Avulso
                        </h3>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">Crie um acesso rápido para clientes temporários.</p>
                        
                        <div style="display: grid; gap: 10px;">
                            <input type="text" id="casual-name" placeholder="Nome do Cliente" class="qr-input-sleek">
                            <input type="tel" id="casual-phone" placeholder="Contacto (ex: 912 345 678)" class="qr-input-sleek">
                            <div style="display: flex; gap: 8px;">
                                <select id="casual-type" class="qr-input-sleek" style="flex: 2; height: 42px;">
                                    <option value="Semanal">🗓️ Semanal (7 Dias)</option>
                                    <option value="Mensal">📅 Mensal (30 Dias)</option>
                                </select>
                                <button class="btn btn-primary" onclick="app.createCasualPass()" style="flex: 1; height: 42px; border-radius: 6px;">
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
                    <button class="btn ${this.qrActiveTab === 'alunos' ? 'btn-primary' : 'btn-secondary'}" onclick="app.switchQRTab('alunos')" style="padding: 6px 12px; font-size:0.8rem;">
                        <i class="fas fa-user-friends"></i> Alunos
                    </button>
                    <button class="btn ${this.qrActiveTab === 'teachers' ? 'btn-primary' : 'btn-secondary'}" onclick="app.switchQRTab('teachers')" style="padding: 6px 12px; font-size:0.8rem;">
                        <i class="fas fa-user-tie"></i> Staff (Adm/Prof)
                    </button>
                </div>

                <div style="margin-bottom: 2rem;">
                    <div style="position: relative;">
                        <i class="fas fa-search" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); opacity: 0.6;"></i>
                        <input type="text" id="qr-search-input" placeholder="Pesquisar por nome, telemóvel ou código..." 
                            oninput="app.filterQRList(this.value)" 
                            style="width: 100%; padding: 1rem 1rem 1rem 3rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 14px; outline: none; transition: all 0.3s ease; font-size: 0.95rem;">
                    </div>
                </div>

                <div class="glass-panel" style="padding: 0; background: transparent; border:none; box-shadow:none;">
                    ${this.qrActiveTab === 'alunos' ? `
                    <div style="background: rgba(255,255,255,0.02); padding: 10px 15px; border-radius: 8px; margin-bottom: 15px; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <input type="checkbox" id="selectAllQR" onchange="app.toggleAllQRSelection(this.checked)" style="width:16px; height:16px; accent-color: var(--primary); cursor:pointer;">
                            <label for="selectAllQR" style="font-size: 0.85rem; cursor: pointer; color: var(--text-muted); font-weight:600;">Selecionar Todos Visíveis</label>
                        </div>
                        <div style="margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Nova Validade:</span>
                            <input type="date" id="bulkCustomDate" title="Selecione o Dia para Aplicar em Massa" style="background:rgba(0,0,0,0.3); border:1px solid var(--surface-border); border-radius:6px; padding:4px 8px; color:#fff; font-size:0.85rem; cursor:pointer; font-weight:600;">
                            <button class="btn btn-primary btn-sm" onclick="app.applyBulkValidity()" style="padding: 6px 12px; font-size: 0.8rem; background: var(--success);"><i class="fas fa-check"></i> Aplicar a Todos</button>
                        </div>
                    </div>
                    ` : ''}

                    <div style="overflow-x:auto; padding-top: 0.5rem;">
                        <table class="qr-modern-table">
                            <thead>
                                <tr>
                                    ${this.qrActiveTab === 'alunos' ? '<th style="width: 40px; text-align:center;"><i class="fas fa-check-square"></i></th>' : ''}
                                    <th style="min-width: 200px;">${this.qrActiveTab === 'alunos' ? 'Aluno (Nome / Tel)' : 'Staff (Nome / Tel)'}</th>
                                    <th style="width: 140px;">Plano</th>
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
                const newStatusEl = document.getElementById('scan-status');
                if (newStatusEl) newStatusEl.className = prevClass;
            }

            // Confirmar no próximo frame e libertar a trava de altura
            requestAnimationFrame(() => {
                container.scrollTop = scrollPosCont;
                requestAnimationFrame(() => {
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

        } catch (error) {
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
        const customDateInput = document.getElementById('bulkCustomDate');
        const newDateStr = customDateInput ? customDateInput.value : '';

        if (!newDateStr) return alert('Por favor, escolha uma data no calendário indicando a nova validade.');

        const checkboxes = document.querySelectorAll('.qr-bulk-checkbox:checked');
        if (checkboxes.length === 0) return alert('Por favor selecione pelo menos um aluno (caixa áÂ  esquerda do ID).');

        if (!confirm(`Tem a certeza que deseja definir a validade para o dia ${newDateStr} de forma permanente aos ${checkboxes.length} alunos selecionados?`)) return;

        checkboxes.forEach(cb => {
            const qrId = cb.value;
            const client = this.state.qrClients.find(q => q.id === qrId);
            if (client) {
                client.validade = newDateStr;
                // Auto-reset de créditos inteligente
                const planoStr = client.plano || '';
                let defaultEnt = 30;

                // 1º Prioridade: Verificar se o admin configurou os créditos fixos nas regras do plano
                const regras = (this.state.planRestrictions || {})[planoStr];
                if (regras && typeof regras.maxCredits === 'number') {
                    defaultEnt = regras.maxCredits;
                } else {
                    // Fallback para nomes de planos antigos caso não estejam mapeados
                    if (planoStr.includes('Staff')) defaultEnt = 999;
                    else if (planoStr.includes('Semanal')) defaultEnt = 99;
                    else if (planoStr.includes('Mensal') || planoStr.includes('Livre')) defaultEnt = 100;
                    else if (planoStr.includes('Pontual') || planoStr.includes('1 Dia')) defaultEnt = 1;
                    else if (planoStr.includes('2x Semana')) defaultEnt = 8;
                    else if (planoStr.includes('3x Semana')) defaultEnt = 12;
                }

                client.ent = defaultEnt;
            }
        });

        this.saveState();
        this.refreshQRTableUI();
        this.showToast(`Validade atualizada para ${checkboxes.length} alunos!`);
    }

    renderQRClientCards(filter = '') {
        const qrList = (this.state.qrClients || []).filter(c => {
            const isStaff = (this.state.teachers || []).some(t => Number(t.id) === Number(c.clientId)) ||
                (this.state.admins || []).some(a => Number(a.id) === Number(c.clientId));
            const matchesRole = this.qrActiveTab === 'teachers' ? isStaff : !isStaff;
            if (!matchesRole) return false;

            const f = this.normalizeText(filter);
            const nomeNormal = this.normalizeText(c.nome);
            const telNormal = this.normalizeText(c.tel || "");
            const idNormal = this.normalizeText(c.id);

            return nomeNormal.includes(f) ||
                telNormal.includes(f) ||
                idNormal.includes(f);
        });

        if (qrList.length === 0) {
            return `<tr><td colspan="8" style="padding: 2rem; text-align: center; color: var(--text-muted); font-size:0.85rem;"><i class="fas fa-info-circle"></i> Nenhum registo encontrado nesta categoria.</td></tr>`;
        }

        const hoje = new Date().toISOString().split('T')[0];

        return qrList.map((c, idx) => {
            const entHj = (c.histórico || []).filter(l => {
                const dateStr = typeof l === 'string' ? l : l.d;
                const type = typeof l === 'string' ? 'in' : l.t;
                return dateStr.startsWith(hoje) && type === 'in';
            }).length;

            const limitDiario = (this.state.planRestrictions && c.plano && this.state.planRestrictions[c.plano] && this.state.planRestrictions[c.plano].maxDailyEntrances !== undefined)
                ? this.state.planRestrictions[c.plano].maxDailyEntrances
                : 2;

            const statusColor = c.ativo ? 'var(--success)' : 'var(--danger)';

            const isStaff = (this.state.teachers || []).some(t => Number(t.id) === Number(c.clientId)) ||
                (this.state.admins || []).some(a => Number(a.id) === Number(c.clientId));

            // Obter utilizador real para dados mestres (foto, login, atividade)
            const realUser = c.clientId ? [...(this.state.clients || []), ...(this.state.teachers || []), ...(this.state.admins || [])]
                .find(u => Number(u.id) === Number(c.clientId)) : null;

            if (realUser) {
                c.photoUrl = realUser.photoUrl || null;
            }
            let userPhoto = c.photoUrl;
            const avatarLetra = c.nome ? c.nome.substring(0, 1).toUpperCase() : '?';

            // Deteção inteligente de envio/atividade (manual, login ou treinos registados)
            const hasLastLogin = realUser && realUser.lastLogin;
            const hasHistory = c.clientId && this.state.trainingHistory && this.state.trainingHistory[c.clientId] && this.state.trainingHistory[c.clientId].length > 0;
            const showIcon = c.inviteSent || hasLastLogin || hasHistory;

            let tooltipText = "";
            if (hasLastLogin) tooltipText = `Acedeu à App em: ${realUser.lastLogin}`;
            else if (hasHistory) tooltipText = "Atividade detetada (Registou treinos/pesos)";
            else if (c.inviteSent) tooltipText = `App Enviada em: ${c.inviteSent}`;

            return `
                <tr class="qr-modern-row">
                    ${this.qrActiveTab === 'alunos' && !isStaff ? `
                    <td style="text-align:center;">
                        <div style="display: flex; justify-content:center; align-items:center; height:100%;">
                            <input type="checkbox" class="qr-bulk-checkbox" value="${c.id}" style="width:18px; height:18px; accent-color: var(--primary); cursor:pointer;">
                        </div>
                    </td>
                    ` : (this.qrActiveTab === 'alunos' ? '<td></td>' : '')}
                    <td>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="position:relative;">
                                <div style="width: 45px; height: 45px; border-radius: 50%; background: ${userPhoto ? 'none' : 'linear-gradient(135deg, rgba(var(--primary-rgb),0.8), rgba(var(--accent-rgb),0.8))'}; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; color: #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.2); overflow:hidden; border: 2px solid rgba(255,255,255,0.1);">
                                    ${userPhoto ? `<img src="${userPhoto}" style="width:100%; height:100%; object-fit:cover;">` : avatarLetra}
                                </div>
                                <div style="position: absolute; bottom: -4px; right: -8px; background: #2a2a2a; border-radius: 6px; padding: 2px 4px; border: 1px solid rgba(255,255,255,0.1); font-size: 0.55rem; font-weight: 800; color: var(--accent); white-space: nowrap;">
                                    ${c.id}
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <input type="text" value="${c.nome}" onchange="app.updateQRClientField('${c.id}', 'nome', this.value)" class="qr-input-sleek" style="font-weight:800; font-size:1.1rem; padding:0.6rem 0.8rem !important; flex:1; letter-spacing: 0.2px;">
                                    ${showIcon ? `<i class="fas fa-paper-plane" title="${tooltipText}" style="color:${(hasLastLogin || hasHistory) ? '#26de81' : 'var(--success)'}; font-size:0.8rem;"></i>` : ''}
                                </div>
                                <input type="text" value="${c.tel}" onchange="app.updateQRClientField('${c.id}', 'tel', this.value)" class="qr-input-sleek" style="color:var(--text-muted); font-size:0.75rem; padding:0.3rem 0.6rem !important;" placeholder="Telemóvel...">
                                <span style="font-size:0.6rem; color:var(--text-muted);">Ref: ${c.clientId || '-'}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <select onchange="app.updateQRClientField('${c.id}', 'plano', this.value)"
                            style="background:rgba(var(--primary-rgb), 0.1); color:var(--primary); font-weight:600; border:1px solid rgba(var(--primary-rgb), 0.3); border-radius:20px; padding:6px 12px; outline:none; cursor:pointer; width:100%; font-size:0.8rem; appearance:none; text-align:center;">
                            ${isStaff ? '<option value="Staff">Staff / Vitalício</option>' : (() => {
                    const plans = Object.keys(this.state.planRestrictions || {});
                    if (plans.length === 0) {
                        return `
                                        <option value="Livre Trânsito" ${c.plano === 'Livre Trânsito' ? 'selected' : ''}>Livre Trânsito</option>
                                        <option value="3x Semana" ${c.plano === '3x Semana' ? 'selected' : ''}>3x Semana</option>
                                        <option value="2x Semana" ${c.plano === '2x Semana' ? 'selected' : ''}>2x Semana</option>
                                        <option value="Pontual" ${c.plano === 'Pontual' ? 'selected' : ''}>Pontual</option>
                                     `;
                    }
                    return plans.map(p => `<option value="${p}" ${c.plano === p ? 'selected' : ''}>${p}</option>`).join('');
                })()}
                        </select>
                    </td>
                    <td style="text-align:center;">
                        <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
                            <input type="checkbox" ${c.ativo ? 'checked' : ''} onchange="app.toggleQRClientStatus('${c.id}')" style="opacity: 0; width: 0; height: 0;">
                            <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${c.ativo ? 'var(--success)' : 'rgba(255,255,255,0.1)'}; transition: .4s; border-radius: 24px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);"></span>
                            <span style="position: absolute; content: ''; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transform: ${c.ativo ? 'translateX(20px)' : 'translateX(0)'};"></span>
                        </label>
                    </td>
                    <td>
                        ${isStaff ? '<div style="text-align:center; font-weight:800; color:var(--accent); font-size:1.5rem;">∞</div>' : `
                        <div style="background:rgba(0,0,0,0.2); border-radius:8px; display:flex; align-items:center; justify-content:space-between; padding:4px; border:1px solid rgba(255,255,255,0.05);">
                            <button onclick="app.editQRCredit('${c.id}', -1)" style="width:28px; height:28px; border-radius:6px; border:none; background:rgba(255,255,255,0.05); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:0.2s;"><i class="fas fa-minus"></i></button>
                            <input type="number" value="${c.ent}" onchange="app.updateQRClientField('${c.id}', 'ent', parseInt(this.value) || 0)" class="no-spin" style="background:transparent; border:none; color:#fff; font-weight:800; width:35px; text-align:center; outline:none; font-size:1rem; padding:0;">
                            <button onclick="app.editQRCredit('${c.id}', 1)" style="width:28px; height:28px; border-radius:6px; border:none; background:var(--primary); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:0.2s; box-shadow:0 2px 8px rgba(var(--primary-rgb),0.4);"><i class="fas fa-plus"></i></button>
                        </div>
                        `}
                    </td>
                    <td>
                        ${isStaff ? '<div style="text-align:center; color:var(--primary);"><i class="fas fa-infinity"></i></div>' : `
                        <div style="display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); padding: 3px; border-radius: 8px; gap: 2px; width: fit-content; margin: 0 auto; border: 1px solid rgba(255,255,255,0.05);">
                            <button onclick="app.editQREntryHj('${c.id}', -1)" style="width: 24px; height: 24px; border-radius: 6px; border: none; background: rgba(255,255,255,0.05); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.background='rgba(255,71,87,0.4)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'"><i class="fas fa-minus" style="font-size: 0.65rem;"></i></button>
                            <div style="padding: 0 6px; display: flex; align-items: center; gap: 4px; min-width: 45px; justify-content: center;">
                                <span style="font-weight: 800; font-size: 0.95rem; color: ${entHj >= limitDiario ? 'var(--danger)' : '#fff'};">${entHj}</span>
                                <span style="color: var(--text-muted); font-size: 0.7rem; font-weight: 600; opacity: 0.6;">/ ${limitDiario}</span>
                            </div>
                            <button onclick="app.editQREntryHj('${c.id}', 1)" style="width: 24px; height: 24px; border-radius: 6px; border: none; background: rgba(255,255,255,0.05); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.background='rgba(38,222,129,0.4)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'"><i class="fas fa-plus" style="font-size: 0.65rem;"></i></button>
                        </div>
                        `}
                    </td>
                    <td style="text-align:center;">
                        ${isStaff ? '<span style="font-weight:800; color:var(--accent); font-size:0.75rem; background:rgba(var(--accent-rgb),0.1); padding:5px 10px; border-radius:6px; letter-spacing:0.5px;">VITALÍCIO</span>' : `
                        <input type="date" value="${c.validade}" onchange="app.updateQRClientField('${c.id}', 'validade', this.value)" class="qr-input-sleek"
                            style="color:${hoje > c.validade ? 'var(--danger)' : '#fff'} !important; border-color:${hoje > c.validade ? 'rgba(var(--danger-rgb),0.5)' : ''} !important;">
                        `}
                    </td>
                    <td style="text-align: right; width: 90px; vertical-align: middle;">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; justify-content: flex-end; width: 82px; margin-left: auto;">
                            <!-- Linha 1 -->
                            <button class="btn-icon" onclick="app.showUserQRLogs('${c.id}')" title="Ver Histórico de Acessos" style="background:rgba(255,255,255,0.05); color:var(--text-muted); width: 38px; height: 38px;">
                                <i class="fas fa-history"></i>
                            </button>
                            ${c.clientId ? `
                            <button class="btn-icon" onclick="app.resendInviteFromQR('${c.id}')" title="Reenviar Convite (WhatsApp/Email)" style="background:rgba(var(--primary-rgb), 0.1); color:var(--primary); width: 38px; height: 38px;">
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
                <tr id="qr-row-area-${idx}" style="display:none;">
                    <td colspan="8" style="padding: 1.5rem; text-align: center; border-radius: 12px; background: rgba(0,0,0,0.2);">
                        <div id="canvas-${idx}" style="background: white; padding: 15px; border-radius: 12px; display: inline-block; margin: 10px 0; box-shadow: 0 4px 20px rgba(0,0,0,0.5);"></div>
                        <div style="font-size: 0.85rem; font-weight:700; color: var(--accent); margin-bottom: 12px;">Código de Acesso: ${c.id}</div>
                        <div style="display: flex; justify-content: center; gap: 10px;">
                            <button class="btn btn-secondary btn-sm download-btn-qr" onclick="app.downloadQRCode('canvas-${idx}', '${c.nome.replace(/'/g, "\\'")}_QR', this)" style="background: white; color: black; border-color: #ddd;">
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
        const qrClient = (this.state.qrClients || []).find(q => q.id === qrId);
        if (!qrClient || !qrClient.clientId) return alert("Não foi possível encontrar o ID original deste cliente.");

        // Procurar o utilizador real em todas as coleções
        const allUsers = [...(this.state.clients || []), ...(this.state.teachers || []), ...(this.state.admins || [])];
        const user = allUsers.find(u => Number(u.id) === Number(qrClient.clientId));

        if (!user) return alert("Os dados da conta original não foram encontrados.");

        // Determinar o tipo para o modal
        const isStaff = (this.state.teachers || []).some(t => Number(t.id) === Number(user.id));
        const type = isStaff ? 'teacher' : 'client';

        this.showInviteModal(user.name, user.email, user.password || 'Kandal123', type, user.phone, qrId);
    }

    filterQRList(val) {
        const body = document.getElementById("gridQRClientes");
        if (body) body.innerHTML = this.renderQRClientCards(val);
    }

    createCasualPass() {
        const nameEl = document.getElementById('casual-name');
        const typeEl = document.getElementById('casual-type');
        const phoneEl = document.getElementById('casual-phone');
        if (!nameEl || !typeEl) return;

        const name = nameEl.value.trim();
        const type = typeEl.value;
        const phone = phoneEl ? phoneEl.value.trim() : '';

        if (!name) return alert('Por favor, insira o nome do cliente.');

        if (!this.state.qrClients) this.state.qrClients = [];

        // Generar novo código K
        const usedIds = this.state.qrClients.map(c => {
            const m = c.id.match(/^K(\d+)$/);
            return m ? parseInt(m[1]) : 0;
        });
        const maxId = usedIds.length > 0 ? Math.max(...usedIds) : 0;
        const qrId = "K" + (maxId + 1);

        const validDate = new Date();
        let credits = 1;

        if (type === 'Diária') {
            validDate.setDate(validDate.getDate() + 1);
            credits = 1;
        } else if (type === 'Semanal') {
            validDate.setDate(validDate.getDate() + 7);
            credits = 99; // Praticamente ilimitado na semana
        } else if (type === 'Mensal') {
            validDate.setDate(validDate.getDate() + 30);
            credits = 99;
        }

        this.state.qrClients.push({
            id: qrId,
            clientId: 0, // 0 indica cliente avulso sem conta na app
            nome: `AVULSO: ${name}`,
            tel: phone || 'Visitante',
            ativo: true,
            ent: credits,
            plano: type,
            validade: validDate.toISOString().split('T')[0],
            histórico: []
        });

        this.saveState();
        this.refreshQRTableUI();
        nameEl.value = '';
        if (phoneEl) phoneEl.value = '';
        this.showToast(`Passe ${type} criado para ${name}! Código: ${qrId}`);
    }

    enableQRForClient(clientId, autoRedirect = true, isStaff = false) {
        if (!this.state.qrClients) this.state.qrClients = [];

        const client = isStaff
            ? [...(this.state.teachers || []), ...(this.state.admins || [])].find(t => Number(t.id) === Number(clientId))
            : (this.state.clients || []).find(c => Number(c.id) === Number(clientId));
        if (!client) return;

        const exists = this.state.qrClients.find(qc => Number(qc.clientId) === Number(clientId));
        if (exists) {
            if (autoRedirect) {
                this.setView('qr_manager');
                this.showToast('Este utilizador já tem acesso QR ativo.');
            }
            return;
        }

        const usedIds = this.state.qrClients.map(c => {
            const m = c.id.match(/^K(\d+)$/);
            return m ? parseInt(m[1]) : 0;
        });
        const maxId = usedIds.length > 0 ? Math.max(...usedIds) : 0;
        const qrId = "K" + (maxId + 1);

        const validDate = new Date();
        if (isStaff) {
            validDate.setFullYear(2099);
        } else {
            validDate.setDate(validDate.getDate() + 30);
        }

        this.state.qrClients.push({
            id: qrId,
            clientId: Number(clientId),
            nome: client.name,
            tel: client.phone || "Sem contacto",
            ativo: true,
            ent: isStaff ? 999 : 30,
            plano: isStaff ? 'Staff' : 'Novo QR',
            validade: validDate.toISOString().split('T')[0],
            histórico: []
        });

        if (autoRedirect) {
            this.saveState();
            this.showToast(`Acesso QR ativado para ${client.name}!`);
            if (this.activeView !== 'qr_manager' && this.activeView !== 'dashboard') {
                this.setView('qr_manager');
            }
        }
    }

    toggleQRClientStatus(id) {
        const idx = this.state.qrClients.findIndex(c => c.id === id);
        if (idx !== -1) {
            this.state.qrClients[idx].ativo = !this.state.qrClients[idx].ativo;
            this.saveState();
            this.refreshQRTableUI();
        }
    }

    editQRCredit(id, val) {
        const idx = this.state.qrClients.findIndex(c => c.id === id);
        if (idx !== -1) {
            // Backup de scroll
            const container = document.getElementById('main-content');
            if (container) this.lastScrollY = container.scrollTop;
            this.lastWindowY = window.pageYOffset || document.documentElement.scrollTop;

            this.state.qrClients[idx].ent = Math.max(0, (this.state.qrClients[idx].ent || 0) + val);
            this.saveState();
            this.refreshQRTableUI();
        }
    }

    editQREntryHj(id, v) {
        const idx = this.state.qrClients.findIndex(c => c.id === id);
        if (idx === -1) return;

        // Backup de segurança para o scroll 
        const container = document.getElementById('main-content');
        if (container) this.lastScrollY = container.scrollTop;
        this.lastWindowY = window.pageYOffset || document.documentElement.scrollTop;

        // Usar data LOCAL para correspondência fiel ao que o utilizador vê
        const agora = new Date();
        const hjLocal = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0') + '-' + String(agora.getDate()).padStart(2, '0');

        if (v === 1) {
            if (!this.state.qrClients[idx].histórico) this.state.qrClients[idx].histórico = [];
            // Adicionar no início (mais recente)
            this.state.qrClients[idx].histórico.unshift({ d: agora.toISOString(), t: 'in' });
        } else {
            // Remover a entrada mais RECENTE de hoje (priorizando IN para limpar a ocupação)
            const hist = this.state.qrClients[idx].histórico || [];
            let targetIdx = -1;

            // 1. Procurar primeiro o IN mais recente de hoje (o que está a contar para o gráfico)
            targetIdx = hist.findIndex(h => {
                const dateStr = typeof h === 'string' ? h : h.d;
                const type = typeof h === 'string' ? 'in' : h.t;
                // Converter a data do log para local para comparar
                const logDate = new Date(dateStr);
                const logLocal = logDate.getFullYear() + '-' + String(logDate.getMonth() + 1).padStart(2, '0') + '-' + String(logDate.getDate()).padStart(2, '0');
                return logLocal === hjLocal && type === 'in';
            });

            // 2. Se não houver IN, remover qualquer movimento de hoje (OUT ou log simples)
            if (targetIdx === -1) {
                targetIdx = hist.findIndex(h => {
                    const dateStr = typeof h === 'string' ? h : h.d;
                    const logDate = new Date(dateStr);
                    const logLocal = logDate.getFullYear() + '-' + String(logDate.getMonth() + 1).padStart(2, '0') + '-' + String(logDate.getDate()).padStart(2, '0');
                    return logLocal === hjLocal;
                });
            }

            if (targetIdx !== -1) {
                this.state.qrClients[idx].histórico.splice(targetIdx, 1);
            }
        }
        this.saveState();
        this.refreshQRTableUI();
    }

    updateQRClientField(id, field, value) {
        const idx = this.state.qrClients.findIndex(c => c.id === id);
        if (idx !== -1) {
            // Backup de scroll antes de salvar e refrescar
            const container = document.getElementById('main-content');
            if (container) this.lastScrollY = container.scrollTop;
            this.lastWindowY = window.pageYOffset || document.documentElement.scrollTop;

            this.state.qrClients[idx][field] = value;

            if (field === 'validade') {
                const planoStr = this.state.qrClients[idx].plano || '';
                let defaultEnt = 30;

                const regras = (this.state.planRestrictions || {})[planoStr];
                if (regras && typeof regras.maxCredits === 'number') {
                    defaultEnt = regras.maxCredits;
                } else {
                    if (planoStr.includes('Staff')) defaultEnt = 999;
                    else if (planoStr.includes('Semanal')) defaultEnt = 99;
                    else if (planoStr.includes('Mensal') || planoStr.includes('Livre')) defaultEnt = 100;
                    else if (planoStr.includes('Pontual') || planoStr.includes('1 Dia')) defaultEnt = 1;
                    else if (planoStr.includes('2x Semana')) defaultEnt = 8;
                    else if (planoStr.includes('3x Semana')) defaultEnt = 12;
                }

                this.state.qrClients[idx].ent = defaultEnt;
            }

            this.saveState();
            // Nome, telemóvel e PLANO não precisam de refresh:
            // o input/select já mostra o novo valor Ã¢â‚¬â€ refrescar destruiria o elemento focado e causaria salto de ecrã
            if (field === 'ent' || field === 'validade' || field === 'ativo') {
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

        // EXTRA: Se existir um contentor de ocupação/estatísticas no topo (Dashboard), atualizá-lo também
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

        // Se houver widgets de estatísticas isolados (como no Inicio)
        const statsWidgets = document.querySelectorAll('.dashboard .glass-panel');
        statsWidgets.forEach(w => {
            if (w.innerHTML.includes('getOccupancyHTML') || w.innerHTML.includes('No Ginásio')) {
                // Infelizmente getOccupancyHTML gera um div completo, mas podemos tentar refrescar a área
                // Como não queremos re-renderizar tudo, isto é um fallback
            }
        });

        // 4. Restaurar imediatamente
        container.scrollTop = scrollY;
        window.scrollTo(0, windowY);

        // 5. Confirmar nos próximos frames
        requestAnimationFrame(() => {
            container.scrollTop = scrollY;
            window.scrollTo(0, windowY);
            requestAnimationFrame(() => {
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

    editQRClientData(id) {
        // Obsoleto - Usando edição inline agora
    }

    async deleteQRClient(id) {
        const qrClient = this.state.qrClients.find(c => String(c.id).trim().toLowerCase() === String(id).trim().toLowerCase());
        if (!qrClient) return;

        if (confirm(`Deseja eliminar o acesso QR de ${qrClient.nome} permanentemente?`)) {
            const targetId = String(id).trim().toLowerCase();
            const clientId = qrClient.clientId;

            // Se for um aluno real (clientId != 0)
            if (clientId && clientId != 0) {
                const deleteMain = confirm("Este utilizador tem uma conta ativa na App. Deseja ELIMINAR TAMBÉMâ€°M a conta do aluno e todo o seu histórico?");
                if (deleteMain) {
                    // Eliminar do sistema principal (clientes, professores ou admins)
                    this.state.clients = (this.state.clients || []).filter(c => String(c.id) !== String(clientId));
                    this.state.teachers = (this.state.teachers || []).filter(t => String(t.id) !== String(clientId));
                    this.state.admins = (this.state.admins || []).filter(a => String(a.id) !== String(clientId));
                } else {
                    // Manter aluno mas impedir que o auto-sync o traga de volta
                    const mainUser = [...(this.state.clients || []), ...(this.state.teachers || []), ...(this.state.admins || [])]
                        .find(u => String(u.id) === String(clientId));
                    if (mainUser) mainUser.qrDisabled = true;
                }
            }

            // Remover da lista de QR
            this.state.qrClients = this.state.qrClients.filter(c => String(c.id).trim().toLowerCase() !== targetId);

            this.saveState();
            this.refreshQRTableUI();
            this.showToast('Registo QR removido com sucesso.');
        }
    }

    toggleQRCodeDisplay(areaId, val) {
        const el = document.getElementById(areaId);
        const suffix = areaId.split('-').pop();
        const canvas = document.getElementById('canvas-' + suffix);

        if (el.style.display !== 'none') {
            el.style.display = 'none';
        } else {
            // Hide any other visible QR codes first
            document.querySelectorAll('[id^="qr-row-area-"]').forEach(área => área.style.display = 'none');

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
            const link = document.createElement('a');
            link.download = filename + '.png';
            link.href = canvas.toDataURL("image/png");
            link.click();
            success = true;
        } else {
            const img = container.querySelector('img');
            if (img) {
                const link = document.createElement('a');
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
            const scanStatus = document.getElementById("scan-status");
            const btnCam = document.getElementById("btnCam");

            if (typeof jsQR === 'undefined') {
                throw new Error("A biblioteca de leitura de QR não foi carregada. Verifique a sua ligação áÂ  internet.");
            }

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                let errorMsg = "O seu navegador não suporta acesso áÂ  câmara.";
                if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
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
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }

            this.qrStreamGlobal = stream; // Guardar globalmente para persistência
            video.srcObject = stream;

            // Tentar play imediato
            try {
                await video.play();
            } catch (pErr) {
                console.warn("Erro ao iniciar play:", pErr);
            }

            container.style.display = "block";
            btnCam.innerHTML = '<i class="fas fa-stop"></i> Parar câmara';
            btnCam.onclick = () => this.pararLeitorQR(stream);

            this.qrScannerAtivo = true;
            this.qrRequestAnimationFrameId = setTimeout(() => this.loopLeitorQR(video), 50);

            scanStatus.innerHTML = "<span style='color: var(--success)'> Scanner Ativo</span><br>Modo Rápido";
            scanStatus.className = "";
        } catch (e) {
            console.error(e);
            let msg = "Erro ao aceder áÂ  câmara: ";
            if (e.name === 'NotAllowedError') msg = " Permissão Negada: Por favor, autorize o acesso áÂ  câmara nas definições do seu navegador.";
            else if (e.name === 'NotFoundError') msg = " câmara não encontrada no dispositivo.";
            else msg = e.message;

            this.showQRMsg(msg, "bg-qr-danger");
            alert(msg);
        } finally {
            this.isRequestingcâmara = false;
        }
    }

    escanearPorFoto() {
        if (typeof jsQR === 'undefined') {
            return alert("A biblioteca de leitura de QR não está pronta. Tente novamente em instantes.");
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
                        // Tentar com inversao se falhar (para alguns códigos)
                        const code2 = jsQR(imageData.data, imageData.width, imageData.height, {
                            inversionAttempts: "attemptBoth",
                        });
                        if (code2) {
                            this.processarLeituraQR(code2.data);
                        } else {
                            this.showQRMsg(" Não detetado", "bg-qr-danger");
                            alert("Não foi possível encontrar um código QR na foto. Certifique-se de que o código está bem visível, focado e iluminado.");
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

        // Se houver vídeo, forçamos o preto para não carregar a última imagem
        if (video) video.style.background = "#000";

        this.qrScannerAtivo = false;
        this.qrStreamGlobal = null;
        clearTimeout(this.qrRequestAnimationFrameId);

        if (btnCam) {
            btnCam.innerHTML = '<i class="fas fa-video"></i> Ativar câmara';
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

            // Desenhar imagem pura para o scanner (filtros desativados para compatibilidade)
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth"
            });

            if (code) {
                this.processarLeituraQR(code.data);
            }
        }

        if (this.qrScannerAtivo) {
            // Aumentando a performance: scanning a cada 50ms (20 vezes por segundo)
            this.qrRequestAnimationFrameId = setTimeout(() => this.loopLeitorQR(v), 50);
        }
    }

    processarLeituraQR(id) {
        const st = document.getElementById("scan-status");
        const formattedId = String(id).trim().toUpperCase();

        // Prevent multiple processing of the same scan within 3 seconds
        if (this.lastProcessedQR === formattedId && (Date.now() - this.lastProcessedTime < 3000)) return;

        const c = this.state.qrClients.find(cli => String(cli.id).toUpperCase() === formattedId);

        if (c) {
            // Sincronizar foto mais recente antes de enviar para o ecrã
            const realUser = c.clientId ? [...(this.state.clients || []), ...(this.state.teachers || []), ...(this.state.admins || [])]
                .find(u => Number(u.id) === Number(c.clientId)) : null;
            if (realUser) {
                c.photoUrl = realUser.photoUrl || null;
            }
        }

        if (!c) {
            this.showQRMsg(" Codigo não reconhecido", "bg-qr-danger");
            new BroadcastChannel('kandal_access').postMessage({
                type: 'access_event',
                data: { name: 'INVÁLIDOÂLIDO', msg: 'Cáâ€œDIGO DESCONHECIDO', valid: false, photo: null }
            });
            this.sendToArduino('B');
            this.lastProcessedQR = formattedId;
            this.lastProcessedTime = Date.now();
            return;
        }

        if (!c.ativo) {
            this.showQRMsg(` ${c.nome}: Conta Inativa`, "bg-qr-danger");
            new BroadcastChannel('kandal_access').postMessage({
                type: 'access_event',
                data: { name: c.nome, msg: 'CONTA INATIVA', valid: false, photo: c.photoUrl || null }
            });
            this.sendToArduino('B');
            this.lastProcessedQR = formattedId;
            this.lastProcessedTime = Date.now();
            return;
        }

        const agora = new Date();
        const hj = agora.toISOString().split('T')[0];

        // Determinar se é ENTRADA ou SAÍDA
        const lastLog = (c.histórico && c.histórico.length > 0) ? c.histórico[0] : null;
        let isExit = false;

        if (lastLog) {
            const lastDateStr = typeof lastLog === 'string' ? lastLog : lastLog.d;
            const lastEntry = new Date(lastDateStr);
            const lastType = typeof lastLog === 'string' ? 'in' : lastLog.t;

            // Se foi hoje e a última foi Entrada, agora é Saída
            if (lastEntry.toDateString() === agora.toDateString() && lastType === 'in') {
                isExit = true;
            }
        }

        // Determinar se é Staff (Teacher ou Admin) para ignorar limites
        const isStaffMember = (this.state.teachers || []).some(t => Number(t.id) === Number(c.clientId)) ||
            (this.state.admins || []).some(a => Number(a.id) === Number(c.clientId)) ||
            c.plano === 'Staff';


        // Validar cooldown (20 segundos) - Para operações consecutivas
        if (lastLog) {
            const lastDateStr = typeof lastLog === 'string' ? lastLog : lastLog.d;
            const lastEntry = new Date(lastDateStr);
            const diffSec = (agora - lastEntry) / 1000;
            if (diffSec < 20) {
                const waitSec = Math.ceil(20 - diffSec);
                this.showQRMsg(`${c.nome}: Aguarde ${waitSec}s`, "bg-qr-warning");
                this.lastProcessedQR = formattedId;
                this.lastProcessedTime = Date.now();
                return;
            }
        }


        if (isExit) {
            // --- LOGICA DE SAáÂDA ---
            if (!c.histórico) c.histórico = [];
            c.histórico.unshift({ d: agora.toISOString(), t: 'out' });

            this.showQRMsg(`Até amanhã, ${c.nome}! Saída registada.`, "bg-qr-warning");
            this.showToast(`Saída registada: ${c.nome}`, "info");

            new BroadcastChannel('kandal_access').postMessage({
                type: 'access_event',
                data: { name: c.nome, msg: 'ATÉ AMANHÃ! (SAÍDA)', valid: true, photo: c.photoUrl || null }
            });
            this.sendToArduino('A');

        } else {
            // --- LOGICA DE ENTRADA ---
            if (!isStaffMember) {
                // Validar data
                if (hj > (c.validade || '')) {
                    this.showQRMsg(`${c.nome}: Validade Expirada`, "bg-qr-warning");
                    new BroadcastChannel('kandal_access').postMessage({
                        type: 'access_event',
                        data: { name: c.nome, msg: 'VALIDADE EXPIRADA', valid: false, photo: c.photoUrl || null }
                    });
                    this.sendToArduino('B');
                    return;
                }

                // Validar créditos
                if ((c.ent || 0) <= 0) {
                    this.showQRMsg(`${c.nome}: Sem créditos`, "bg-qr-danger");
                    new BroadcastChannel('kandal_access').postMessage({
                        type: 'access_event',
                        data: { name: c.nome, msg: 'SEM CRÉDITOS', valid: false, photo: c.photoUrl || null }
                    });
                    this.sendToArduino('B');
                    return;
                }
            }


            // Validar limite diario - Apenas para Alunos
            if (!isStaffMember) {
                const entriesHj = (c.histórico || []).filter(l => {
                    const d = typeof l === 'string' ? l : l.d;
                    const t = typeof l === 'string' ? 'in' : l.t;
                    return d.startsWith(hj) && t === 'in';
                }).length;

                const limitDiario = (this.state.planRestrictions && c.plano && this.state.planRestrictions[c.plano] && this.state.planRestrictions[c.plano].maxDailyEntrances !== undefined)
                    ? this.state.planRestrictions[c.plano].maxDailyEntrances
                    : 2;

                if (entriesHj >= limitDiario) {
                    this.showQRMsg(`${c.nome}: Limite diário atingido`, "bg-qr-warning");
                    new BroadcastChannel('kandal_access').postMessage({
                        type: 'access_event',
                        data: { name: c.nome, msg: 'LIMITE DIÁRIO', valid: false, photo: c.photoUrl || null }
                    });
                    this.sendToArduino('B');
                    return;
                }
            }

            // Processar sucesso Entrada
            c.ent--;
            if (!c.histórico) c.histórico = [];
            c.histórico.unshift({ d: agora.toISOString(), t: 'in' });

            this.showQRMsg(`Bem-vindo, ${c.nome}! Entrada validada.`, "bg-qr-success");
            this.showToast(`Entrada validada: ${c.nome}`, "success");

            new BroadcastChannel('kandal_access').postMessage({
                type: 'access_event',
                data: { name: c.nome, msg: 'BEM-VINDO!', valid: true, photo: c.photoUrl || null }
            });
            this.sendToArduino('A');
        }

        this.lastProcessedQR = formattedId;
        this.lastProcessedTime = Date.now();
        this.saveState();

        // ATUALIZAÇÃO SEGURA: Apenas a tabela, não a página toda para não desligar a câmara
        const grid = document.getElementById("gridQRClientes");
        if (grid) {
            grid.innerHTML = this.renderQRClientCards();
        }
    }


    showUserQRLogs(id) {
        const client = (this.state.qrClients || []).find(c => c.id === id);
        if (!client) return;

        const logs = client.histórico || [];
        const content = `
            <div style="padding: 0.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
                    <h3 style="margin:0; display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-history" style="color:var(--accent);"></i> Histórico: ${client.nome}
                    </h3>
                    <button class="btn-icon" onclick="app.closeModal()"><i class="fas fa-times"></i></button>
                </div>
                
                <div style="max-height: 50vh; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); scrollbar-width: thin;">
                    <table style="width:100%; border-collapse: collapse;">
                        <thead style="position: sticky; top: 0; background: #222; z-index: 10;">
                            <tr>
                                <th style="text-align:left; padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Data e Hora</th>
                                <th style="text-align:center; padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Tipo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logs.length === 0 ? '<tr><td colspan="2" style="padding: 4rem 2rem; text-align: center; color: var(--text-muted);"><i class="fas fa-ghost" style="font-size:2rem; display:block; margin-bottom:1rem; opacity:0.3;"></i> Sem registos de acesso para este utilizador.</td></tr>' : logs.map(l => {
            const dateStr = typeof l === 'string' ? l : l.d;
            const type = typeof l === 'string' ? 'in' : l.t;
            const d = new Date(dateStr);
            const isIn = type === 'in';

            return `
                                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                                        <td style="padding: 12px 15px;">
                                            <div style="font-weight:600; font-size:0.9rem; color:#fff;">${d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
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
                    <p style="font-size:0.7rem; color:var(--text-muted); margin-bottom: 1rem;">Mostrando os últimos ${logs.length} acessos.</p>
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
        else if (cls.includes('warning')) { bg = 'rgba(255,159,67,0.15)'; color = '#ff9f43'; icon = 'fa-exclamation-triangle'; }
        else if (cls.includes('danger')) { bg = 'rgba(235,77,75,0.15)'; color = '#eb4d4b'; icon = 'fa-times-circle'; }

        return `
            <div class="glass-card animate-scale-in" style="padding: 1rem; background:${bg}; color:${color}; border: 1px solid ${color}44; text-align:center; font-weight:700; display:flex; align-items:center; justify-content:center; gap:10px; border-radius:12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);">
                <i class="fas ${icon}" style="font-size:1.2rem;"></i>
                <span>${text}</span>
            </div>
        `;
    }

    showQRMsg(text, cls) {
        const timestamp = Date.now();
        this.currentQRMsg = { text, cls, timestamp };

        const s = document.getElementById("scan-status");
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
            setTimeout(() => { if (container) { container.style.border = '2px solid var(--surface-border)'; container.style.boxShadow = 'none'; } }, 1000);
        }

        // Clear message after 4.5 seconds only if it's the same message
        setTimeout(() => {
            if (this.currentQRMsg && this.currentQRMsg.timestamp === timestamp) {
                this.currentQRMsg = null;
                const sRefresh = document.getElementById("scan-status");
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
        if (!id) return alert('Por favor, introduza um ID de aluno.');

        this.processarLeituraQR(id);
        input.value = ''; // Limpar apos processar
    }


    shortenExistingQRIds() {
        if (!this.state.qrClients || this.state.qrClients.length === 0) return;
        let changed = false;

        // 1. Garantir que todos os registos QR estão ligados a um ID de cliente interno (timestamp)
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
                            <p style="margin:0;"><strong>1.</strong> Toque no botão <strong>Partilhar</strong>  na barra do Safari</p>
                            <p style="margin:0;"><strong>2.</strong> Toque em <strong>"Adicionar ao ecrã Principal"</strong> </p>
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
        // SEGURANÇA: Apenas Admins ou Professores devem realizar a manutenção do horário.
        // Isto evita que clientes com relógios desajustados arquivem aulas prematuramente para todos.
        if (this.role !== 'admin' && this.role !== 'teacher') return;

        // SEGURANÇA: Garantir que o estado existe e temos dados carregados
        if (!this.state || !this.state.classes || !this.hasLoadedData || this.isCheckingClasses) return;

        this.isCheckingClasses = true;
        try {
            const now = new Date();
            const gracePeriod = 180 * 60 * 1000; // 3h de tolerância após o início (evita limpar listas durante a aula ou logo a seguir)

            // IMPORTANTE: Firebase RTDB pode converter arrays com buracos em objetos. 
            // Converter sempre para array para iterar com segurança.
            const rawClasses = Array.isArray(this.state.classes) ? this.state.classes : Object.values(this.state.classes);
            if (rawClasses.length === 0) return;

            let changed = false;
            const updatedClasses = [];

            for (const c of rawClasses) {
                if (!c || !c.date || !c.time) {
                    if (c) updatedClasses.push(c);
                    continue;
                }

                const classDateTime = new Date(`${c.date}T${c.time}`);
                if (isNaN(classDateTime.getTime())) {
                    updatedClasses.push(c);
                    continue;
                }

                const threshold = classDateTime.getTime() + gracePeriod;

                if (now.getTime() > threshold) {
                    changed = true;
                    console.log(`A processar aula terminada: ${c.name} (${c.date})`);

                    // 1. Arquivar histórico
                    const participantsIds = this.state.enrollments[String(c.id)] || [];
                    const teacher = (this.state.teachers || []).find(t => Number(t.id) === Number(c.teacherId));

                    participantsIds.forEach(pid => {
                        const clientId = Number(pid);
                        if (!this.state.trainingHistory) this.state.trainingHistory = {};
                        if (!this.state.trainingHistory[clientId]) this.state.trainingHistory[clientId] = [];

                        const exists = this.state.trainingHistory[clientId].some(h => h.date === c.date && h.title === c.name);
                        if (!exists) {
                            this.state.trainingHistory[clientId].push({
                                date: c.date, time: c.time, type: 'class', title: c.name,
                                teacher: teacher ? teacher.name : 'N/A', completedAt: now.toISOString()
                            });
                        }
                    });

                    if (c.isRecurring) {
                        // 2. Avançar data até ao futuro
                        let nextDate = new Date(classDateTime.getTime());
                        let safety = 0;
                        while (nextDate.getTime() + gracePeriod < now.getTime() && safety < 100) {
                            nextDate.setDate(nextDate.getDate() + 7);
                            safety++;
                        }

                        const y = nextDate.getFullYear();
                        const m = String(nextDate.getMonth() + 1).padStart(2, '0');
                        const d = String(nextDate.getDate()).padStart(2, '0');

                        c.date = `${y}-${m}-${d}`;
                        c.day = nextDate.getDay();
                        this.state.enrollments[String(c.id)] = [];
                        updatedClasses.push(c);
                    } else {
                        // Não é recorrente: remover do horário
                        delete this.state.enrollments[String(c.id)];
                    }
                } else {
                    updatedClasses.push(c);
                }
            }

            if (changed) {
                this.state.classes = updatedClasses;
                this.isSaving = true;

                await this.dbRef.update({
                    classes: this.state.classes,
                    enrollments: this.state.enrollments,
                    trainingHistory: this.state.trainingHistory
                }).catch(err => {
                    console.error("Erro na sync de fundo:", err);
                    throw err;
                });

                localStorage.setItem('kandalgym_state', JSON.stringify(this.state));
                if (this.role !== 'client') {
                    this.showToast('Horário das aulas atualizado com sucesso.', 'success');
                }
                this.renderContent();
            }
        } catch (err) {
            console.error("Falha na manutenção de aulas:", err);
        } finally {
            this.isCheckingClasses = false;
            // Dar tempo ao Firebase echo antes de permitir nova gravação
            setTimeout(() => { this.isSaving = false; }, 1200);
        }
    }

    isClassFinished(c) {
        if (!c.date || !c.time) return false;
        try {
            const now = new Date();
            // Formato ISO seguro para todos os browsers
            const start = new Date(`${c.date}T${c.time}:00`);
            if (isNaN(start.getTime())) return false; // Falha no parsing

            // Bloquear inscrições mal a hora passa (com 1 min de tolerancia apenas)
            return now.getTime() > (start.getTime() + 60000);
        } catch (e) {
            return false;
        }
    }

    getPortugalHolidays(year) {
        const holidays = {
            [`${year}-01-01`]: "Ano Novo",
            [`${year}-04-25`]: "Dia da Liberdade",
            [`${year}-05-01`]: "Dia do Trabalhador",
            [`${year}-06-10`]: "Dia de Portugal",
            [`${year}-08-15`]: "Assunção de Nossa Senhora",
            [`${year}-10-05`]: "Implantação da República",
            [`${year}-11-01`]: "Todos os Santos",
            [`${year}-12-01`]: "Restauração da Independência",
            [`${year}-12-08`]: "Imaculada Conceição",
            [`${year}-12-24`]: "Véspera de Natal",
            [`${year}-12-25`]: "Natal",
            [`${year}-12-31`]: "Passagem de Ano",
            [`${year}-06-23`]: "Véspera de São João",
            [`${year}-06-24`]: "São João"
        };

        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;

        const easter = new Date(year, month - 1, day);
        const goodFriday = new Date(easter); goodFriday.setDate(easter.getDate() - 2);
        const corpusChristi = new Date(easter); corpusChristi.setDate(easter.getDate() + 60);

        const formatDate = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        holidays[formatDate(goodFriday)] = "Sexta-feira Santa";
        holidays[formatDate(easter)] = "Páscoa";
        holidays[formatDate(corpusChristi)] = "Corpo de Deus";
        return holidays;
    }

    isHoliday(dateStr) {
        if (!dateStr) return false;
        const year = Number(dateStr.split('-')[0]);
        const holidays = this.getPortugalHolidays(year);
        return holidays[dateStr] || false;
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
                    <h2>Horário de Aulas</h2>
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
                                <th style="padding:1rem;">Data</th>
                                <th style="padding:1rem;">Hora</th>
                                <th style="padding:1rem;">Classe</th>
                                <th style="padding:1rem;">Professor</th>
                                <th style="padding:1rem;">Inscritos</th>
                                <th style="padding:1rem; text-align:right;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedClasses.map(c => {
            const teacher = (this.state.teachers || []).find(t => Number(t.id) === Number(c.teacherId));
            const classIdStr = String(c.id);
            const participants = this.state.enrollments[classIdStr] || this.state.enrollments[c.id] || [];
            const trials = (this.state.trialParticipants || {})[classIdStr] || [];
            const totalCount = participants.length + trials.length;
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
                    `<span class="badge ${totalCount >= (c.capacity || 20) ? 'badge-purple' : 'badge-green'}">
                                                ${participants.length > 0 || trials.length === 0 ? participants.length : ''}${trials.length > 0 ? (participants.length > 0 ? `<span style="color:#ffaa00;">+${trials.length}</span>` : `<span style="color:#ffaa00;">${trials.length}exp</span>`) : ''} / ${c.capacity || 20}
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
        const myClasses = (this.state.classes || []).filter(c => Number(c.teacherId) === currentUserid).sort((a, b) => {
            if (a.date && b.date) return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
            if (a.day !== b.day) return a.day - b.day;
            return a.time.localeCompare(b.time);
        });

        if (myClasses.length === 0) {
            container.innerHTML = `
                <div class="glass-card" style="text-align:center; padding:3rem;">
                    <i class="fas fa-calendar-day" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                    <p>Não tem aulas atribuidas ao seu nome (ID: ${currentUserid}).</p>
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
            const trials = (this.state.trialParticipants || {})[classIdStr] || [];
            const totalCount = participants.length + trials.length;

            return `
                        <div class="glass-card" style="display:flex; flex-direction:column; padding:0.8rem;">
                            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.4rem;">
                                <span style="font-size:1rem; font-weight:800; color:var(--primary);">${c.time}</span>
                                <div style="display:flex; gap:4px; align-items:center;">
                                    ${trials.length > 0 ? `<div class="badge" style="background:rgba(255,165,0,0.15); color:#ffaa00; border:1px solid rgba(255,165,0,0.4); font-size:0.6rem; padding:0.1rem 0.4rem;">${trials.length} exp</div>` : ''}
                                    ${participants.length > 0 || trials.length === 0 ? `<div class="badge badge-blue" style="font-size:0.6rem; padding:0.1rem 0.4rem;">${participants.length} alunos</div>` : ''}
                                </div>
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
        const participantsIds = this.state.enrollments[classIdStr] || [];
        const participants = participantsIds.map(pid => {
            const clientId = Number(pid);
            return (this.state.clients || []).find(cl => Number(cl.id) === clientId);
        }).filter(x => x);

        // Trial / experimental participants
        if (!this.state.trialParticipants) this.state.trialParticipants = {};
        const trials = this.state.trialParticipants[classIdStr] || [];

        const totalCount = participants.length + trials.length;

        const content = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2 style="margin:0;">Inscritos na Aula</h2>
                <button class="btn btn-ghost" onclick="app.closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">Aula: <strong>${cls ? cls.name : 'N/A'}</strong></p>
            
            ${this.role !== 'client' ? `
                <div style="margin-bottom: 1rem; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 8px;">
                    <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 0.5rem;">Adicionar aluno manualmente:</label>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" id="manualEnrollSearch" placeholder="Pesquisar..." onkeyup="app.filterManualEnrollSearch()" style="width: 100px; background: rgba(0,0,0,0.3); border: 1px solid var(--surface-border); border-radius: 6px; padding: 6px 10px; color: #fff; font-size: 0.85rem;">
                        <select id="manualEnrollSelect" style="flex: 1; min-width: 0; background: rgba(0,0,0,0.3); border: 1px solid var(--surface-border); border-radius: 6px; padding: 6px 10px; color: #fff; font-size: 0.85rem;">
                            <option value="">Selecione um aluno...</option>
                            ${(this.state.clients || []).filter(c => !participantsIds.includes(String(c.id)) && !participantsIds.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.id}">${c.name} (Ref: ${c.id})</option>`).join('')}
                        </select>
                        <button class="btn btn-primary btn-sm" onclick="app.enrollManualStudent('${classIdStr}')" style="white-space: nowrap;"><i class="fas fa-plus"></i> Ingresso</button>
                    </div>
                </div>
                <div style="margin-bottom: 1rem;">
                    <button class="btn btn-sm" onclick="app.showAddTrialModal('${classIdStr}')" style="width:100%; background: rgba(255, 165, 0, 0.15); border: 1px solid rgba(255,165,0,0.4); color: #ffaa00; font-size:0.85rem;">
                        <i class="fas fa-user-clock"></i> Registar Visitante / Aula Experimental
                    </button>
                </div>
            ` : ''}

            <div style="display:flex; flex-direction:column; gap:0.8rem; max-height:45vh; overflow-y:auto;">
                ${totalCount === 0 ? '<p style="text-align:center; color:var(--text-muted);">Nenhum inscrito ainda.</p>' : ''}

                ${participants.map(p => `
                    <div style="display:flex; align-items:center; gap:0.75rem; padding:0.8rem; background:rgba(255,255,255,0.03); border-radius:12px;">
                        <div style="width:36px; height:36px; border-radius:50%; background:var(--primary); display:flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:bold;">
                            ${p.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div style="flex:1;">
                            <div style="font-size:0.95rem; font-weight:600;">${p.name}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted);">${p.phone || 'Sem telefone'}</div>
                        </div>
                        <button class="btn btn-ghost btn-sm" onclick="app.closeModal(); app.openChat(${p.id})" title="Enviar Mensagem"><i class="fas fa-comment-alt" style="color:var(--primary);"></i></button>
                        ${this.role !== 'client' ? `
                           <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.removeManualStudent('${classIdStr}', ${p.id})" title="Remover da aula"><i class="fas fa-times"></i></button>
                        ` : ''}
                    </div>
                `).join('')}

                ${trials.map(t => `
                    <div style="display:flex; align-items:center; gap:0.75rem; padding:0.8rem; background:rgba(255,165,0,0.07); border-radius:12px; border:1px solid rgba(255,165,0,0.2);">
                        <div style="width:36px; height:36px; border-radius:50%; background:#ffaa00; display:flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:bold; color:#000;">
                            ${t.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div style="flex:1;">
                            <div style="font-size:0.95rem; font-weight:600;">${t.name} <span style="font-size:0.65rem; background:rgba(255,165,0,0.25); color:#ffaa00; padding:2px 6px; border-radius:4px; font-weight:700; vertical-align:middle;">EXPERIMENTAL</span></div>
                            <div style="font-size:0.8rem; color:var(--text-muted);">${t.phone || 'Sem contacto'} ${t.notes ? '· ' + t.notes : ''}</div>
                        </div>
                        ${this.role !== 'client' ? `
                            <button class="btn btn-ghost btn-sm" onclick="app.convertTrialToClient('${classIdStr}', '${t.id}')" title="Converter em Cliente" style="color:#ffaa00;"><i class="fas fa-user-plus"></i></button>
                            <button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="app.removeTrialParticipant('${classIdStr}', '${t.id}')" title="Remover"><i class="fas fa-times"></i></button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        this.showModal(content);
    }


    async enrollManualStudent(classId) {
        const select = document.getElementById('manualEnrollSelect');
        if (!select || !select.value) return alert('Por favor, selecione um aluno da lista.');

        const clientId = Number(select.value);
        const classIdStr = String(classId);

        if (!this.state.enrollments[classIdStr]) this.state.enrollments[classIdStr] = [];
        const participants = this.state.enrollments[classIdStr];

        if (participants.includes(String(clientId)) || participants.includes(clientId)) {
            return alert('O aluno já está inscrito nesta aula.');
        }

        const cls = this.state.classes.find(x => String(x.id) === classIdStr);

        // Validate plan restrictions
        const qrInfo = (this.state.qrClients || []).find(q => Number(q.clientId) === clientId);
        const plano = qrInfo ? qrInfo.plano : null;
        const restrictions = plano ? (this.state.planRestrictions || {})[plano] : null;

        if (restrictions) {
            if (!restrictions.allowClasses) {
                const force = confirm(`⚠️ AVISO: O plano "${plano}" deste aluno não permite a marcação de aulas.\n\nDeseja inscrever mesmo assim?`);
                if (!force) return;
            } else if (restrictions.filter && restrictions.filter.length > 0) {
                const isAllowed = restrictions.filter.some(f => cls && this.normalizeText(cls.name).includes(this.normalizeText(f)));
                if (!isAllowed) {
                    const force = confirm(`⚠️ AVISO: O plano "${plano}" deste aluno apenas permite: ${restrictions.filter.join(', ')}.\n\nDeseja inscrever mesmo assim?`);
                    if (!force) return;
                }
            } else if (restrictions.exclude && restrictions.exclude.length > 0) {
                const isExcluded = restrictions.exclude.some(ex => cls && this.normalizeText(cls.name).includes(this.normalizeText(ex)));
                if (isExcluded) {
                    const force = confirm(`⚠️ AVISO: O plano "${plano}" deste aluno não permite reservar aulas desta categoria.\n\nDeseja inscrever mesmo assim?`);
                    if (!force) return;
                }
            }
        }

        if (cls && participants.length >= (cls.capacity || 20)) {
            if (!confirm('A aula já está na capacidade máxima. Tem a certeza que pretende forçar a inscrição?')) return;
        }

        participants.push(clientId);
        this.saveState();
        this.showToast('Aluno inscrito manualmente com sucesso!', 'success');
        this.showParticipantsList(classId);

        if (this.role === 'admin') this.renderAdminClasses(document.getElementById('main-content'));
        else if (this.role === 'teacher') this.renderTeacherClasses(document.getElementById('main-content'));
    }

    filterManualEnrollSearch() {
        const input = document.getElementById('manualEnrollSearch');
        const select = document.getElementById('manualEnrollSelect');
        if (!input || !select) return;

        const filterStr = this.normalizeText(input.value);
        Array.from(select.options).forEach(opt => {
            if (opt.value === "") return;
            const text = this.normalizeText(opt.text);
            opt.style.display = text.includes(filterStr) ? "" : "none";
        });
        select.value = "";
    }

    async removeManualStudent(classId, clientId) {
        if (!confirm('Deseja realmente remover o aluno desta aula?')) return;
        const classIdStr = String(classId);
        if (this.state.enrollments[classIdStr]) {
            this.state.enrollments[classIdStr] = this.state.enrollments[classIdStr].filter(id => Number(id) !== Number(clientId));
            this.saveState();
            this.showToast('Aluno removido com sucesso!', 'success');
            this.showParticipantsList(classId);
            if (this.role === 'admin') this.renderAdminClasses(document.getElementById('main-content'));
            else if (this.role === 'teacher') this.renderTeacherClasses(document.getElementById('main-content'));
        }
    }

    showAddTrialModal(classId) {
        const classIdStr = String(classId);
        const cls = (this.state.classes || []).find(c => String(c.id) === classIdStr);
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content animate-fade-in" style="max-width:420px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                    <h2 style="margin:0;"><i class="fas fa-user-clock" style="color:#ffaa00; margin-right:8px;"></i>Visitante / Experimental</h2>
                    <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
                </div>
                <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:1.5rem;">Registe um visitante ou prospect para a aula <strong>${cls ? cls.name : ''}</strong>. Não é necessário ter conta.</p>
                <div style="display:flex; flex-direction:column; gap:1rem;">
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Nome *</label>
                        <input type="text" id="trial-name" placeholder="Nome do visitante" style="width:100%;">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Contacto (Telemóvel)</label>
                        <input type="tel" id="trial-phone" placeholder="Ex: 912 345 678" style="width:100%;">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:0.4rem; font-size:0.8rem; color:var(--text-muted);">Notas (opcional)</label>
                        <input type="text" id="trial-notes" placeholder="Ex: Interessado em Pilates, Referido por..." style="width:100%;">
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-top:0.5rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button class="btn btn-primary" style="background:#ffaa00; border-color:#ffaa00; color:#000;" onclick="app.addTrialParticipant('${classIdStr}')"><i class="fas fa-check"></i> Registar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    addTrialParticipant(classId) {
        const classIdStr = String(classId);
        const name = (document.getElementById('trial-name') || {}).value?.trim();
        const phone = (document.getElementById('trial-phone') || {}).value?.trim();
        const notes = (document.getElementById('trial-notes') || {}).value?.trim();

        if (!name) {
            this.showToast('O nome do visitante é obrigatório.', 'error');
            return;
        }

        if (!this.state.trialParticipants) this.state.trialParticipants = {};
        if (!this.state.trialParticipants[classIdStr]) this.state.trialParticipants[classIdStr] = [];

        const trial = {
            id: String(Date.now()),
            name,
            phone: phone || '',
            notes: notes || '',
            addedAt: new Date().toLocaleString('pt-PT')
        };

        this.state.trialParticipants[classIdStr].push(trial);
        this.saveState();

        // Close the trial modal
        const trialModal = document.querySelector('.modal-overlay:last-of-type');
        if (trialModal) trialModal.remove();

        this.showToast(`${name} registado como visitante!`, 'success');
        this.showParticipantsList(classId);
    }

    removeTrialParticipant(classId, trialId) {
        if (!confirm('Deseja remover este visitante da aula?')) return;
        const classIdStr = String(classId);
        if (this.state.trialParticipants && this.state.trialParticipants[classIdStr]) {
            this.state.trialParticipants[classIdStr] = this.state.trialParticipants[classIdStr].filter(t => t.id !== String(trialId));
            this.saveState();
            this.showToast('Visitante removido.', 'success');
            this.showParticipantsList(classId);
        }
    }

    convertTrialToClient(classId, trialId) {
        const classIdStr = String(classId);
        const trial = (this.state.trialParticipants?.[classIdStr] || []).find(t => t.id === String(trialId));
        if (!trial) return;

        // Close participant modal and open add user modal with pre-filled name/phone
        this.closeModal();
        this.showAddUserModal();

        // Pre-fill after a short delay (DOM needs to render)
        setTimeout(() => {
            const nameEl = document.getElementById('new-user-name');
            const phoneEl = document.getElementById('new-user-phone');
            if (nameEl) nameEl.value = trial.name;
            if (phoneEl) phoneEl.value = trial.phone;
            this.showToast('Dados do visitante pré-preenchidos. Complete o formulário.', 'info');
        }, 200);
    }

    renderClientClasses(container) {
        const classes = this.state.classes || [];
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
                                                ${(() => {
                        const hn = this.isHoliday(c.date);
                        if (!hn) return '';
                        let msg = "Horário 08h30-13h00, sem aulas";
                        if (hn === "Ano Novo" || hn === "Natal" || hn === "São João") msg = "Encerrado";
                        else if (hn === "Véspera de São João" || hn === "Véspera de Natal" || hn === "Passagem de Ano") msg = "Abertos até às 16h30";
                        return `<span style="color:var(--warning); font-weight:bold; margin-left:5px; display:block; margin-top:2px;">(${hn}: ${msg})</span>`;
                    })()}
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
        const teacherId = Number(document.getElementById('cls-teacher').value);
        const capacity = Number(document.getElementById('cls-capacity').value);

        if (!name || !time || !teacherId || !date) {
            return alert('Preencha os campos obrigatorios (Nome, Data, Hora e Professor).');
        }

        const isRecurring = document.getElementById('cls-recurring').checked;
        const classDate = new Date(`${date}T${time}`);
        const now = new Date();

        // Permitir guardar mesmo que seja no passado (útil para mover datas manualmente sem bloquear o admin)
        // Apenas enviamos um aviso no log se for no passado
        if (classDate < now) {
            console.warn('A gravar aula com data no passado.');
        }

        // Usar meio-dia para evitar desvios de fuso horário ao calcular o dia da semana
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
        this.showToast('Horário atualizado com sucesso!');
    }

    async deleteClass(classId) {
        if (!confirm('Tem a certeza que deseja eliminar está aula?')) return;

        const idToDelete = Number(classId);
        this.state.classes = this.state.classes.filter(x => Number(x.id) !== idToDelete);
        delete this.state.enrollments[idToDelete];

        await this.saveState();
        this.renderContent();
        this.showToast('Aula eliminada.', 'error');
    }

    async enrollInClass(classId) {
        console.log("Iniciando inscrição na aula:", classId);
        const actualClassId = Number(classId);
        const classIdStr = String(actualClassId);

        const cls = this.state.classes.find(x => Number(x.id) === actualClassId);

        if (cls && cls.date) {
            const holidayName = this.isHoliday(cls.date);
            if (holidayName) {
                let shouldBlock = false;
                let blockMessage = '';

                if (holidayName === "Ano Novo" || holidayName === "Natal" || holidayName === "São João") {
                    shouldBlock = true;
                    blockMessage = `Informação de Feriado (${holidayName}):\n\nNeste dia o ginásio encontra-se totalmente encerrado.`;
                } else if (holidayName === "Véspera de São João" || holidayName === "Véspera de Natal" || holidayName === "Passagem de Ano") {
                    if (cls.time) {
                        const timeParts = cls.time.split(':');
                        if (timeParts.length === 2) {
                            const timeInMinutes = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
                            const closeTimeInMinutes = 16 * 60 + 30; // 16:30
                            if (timeInMinutes >= closeTimeInMinutes) {
                                shouldBlock = true;
                                blockMessage = `Informação Especial (${holidayName}):\n\nNeste dia o ginásio encerra às 16h30.\nNão há aulas de grupo a partir desta hora.`;
                            }
                        }
                    }
                } else {
                    shouldBlock = true;
                    blockMessage = `Informação de Feriado (${holidayName}):\n\nNeste dia o ginásio terá horário reduzido (08h30 às 13h00) apenas para musculação.\n\nAs aulas de grupo estão suspensas. Obrigado pela compreensão!`;
                }

                if (shouldBlock) {
                    return alert(blockMessage);
                }
            }
        }

        if (cls && this.isClassFinished(cls)) {
            console.warn("Inscrição recusada: Aula já terminou.");
            return alert('Está aula já terminou e não aceita mais inscrições.');
        }

        if (!this.state.enrollments[classIdStr]) this.state.enrollments[classIdStr] = [];

        const participants = this.state.enrollments[classIdStr];
        const clientId = Number(this.currentClientId);

        console.log("Client ID para inscrição:", clientId);
        if (!clientId) {
            console.error("Erro: currentClientId não encontrado.");
            return alert("Sessão inválida. Por favor saia e entre novamente na conta.");
        }

        if (participants.map(id => Number(id)).includes(clientId)) return;

        if (cls && participants.length >= (cls.capacity || 20)) {
            return alert('Está aula já atingiu a lotação máxima.');
        }

        // VALIDAR RESTRIçáâ€¢ES DE PLANO
        const qrInfo = (this.state.qrClients || []).find(q => Number(q.clientId) === Number(clientId));
        const plano = qrInfo ? qrInfo.plano : 'Livre Trânsito';
        const restrictions = (this.state.planRestrictions || {})[plano];

        if (restrictions) {
            if (!restrictions.allowClasses) {
                return alert(`O plano ${plano} não permite a marcação de aulas.`);
            }

            // Validar Filtro (Apenas pode estas)
            if (restrictions.filter && restrictions.filter.length > 0) {
                const isAllowed = restrictions.filter.some(f => this.normalizeText(cls.name).includes(this.normalizeText(f)));
                if (!isAllowed) {
                    return alert(`O seu plano (${plano}) apenas permite reserva das aulas: ${restrictions.filter.join(', ')}.`);
                }
            }

            // Validar Exclusão (Não pode estas)
            if (restrictions.exclude && restrictions.exclude.length > 0) {
                const isExcluded = restrictions.exclude.some(ex => this.normalizeText(cls.name).includes(this.normalizeText(ex)));
                if (isExcluded) {
                    return alert(`O seu plano (${plano}) não permite a reserva de aulas desta categoria.`);
                }
            }
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
        const days = ['Domingo', 'Segunda-feira', 'terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'sábado'];
        return days[dayIndex];
    }

    switchQRTab(tab) {
        this.qrActiveTab = tab;
        this.renderContent();
    }

    customConfirm(msg) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
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
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <button id="btn-custom-cancel" class="btn btn-secondary" style="border-radius: 12px; font-weight: 600;">Cancelar</button>
                        <button id="btn-custom-confirm" class="btn btn-primary" style="border-radius: 12px; font-weight: 700; background: linear-gradient(135deg, var(--danger), #b33939); border: none; box-shadow: 0 4px 15px rgba(var(--danger-rgb), 0.4);">Confirmar</button>
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
            const overlay = document.createElement('div');
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
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
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
    askNotificationMethod(clientId, topic) {
        const c = this.state.clients.find(cl => cl.id == clientId);
        if (!c) return;

        this.showModal(`
            <div style="text-align: center; padding: 1.5rem 0.5rem;">
                <div style="width: 80px; height: 80px; background: rgba(34, 197, 94, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto; color: #22c55e;">
                    <i class="fas fa-check-circle" style="font-size: 3rem;"></i>
                </div>

                <h2 style="margin-bottom: 0.5rem;">Guardado com Sucesso!</h2>
                <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 2rem;">Pretende alertar o cliente <strong>${c.name}</strong> sobre esta atualização?</p>
                
                <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                    <button class="btn btn-primary" style="padding: 1rem; border-radius: 12px; background: #25D366; border:none; display:flex; align-items:center; justify-content:center; gap:10px; font-weight:700;" 
                        onclick="app.closeModal(); app.sendExternalNotification(${clientId}, '${topic}', 'whatsapp')">
                        <i class="fab fa-whatsapp" style="font-size:1.4rem;"></i> Enviar via WhatsApp
                    </button>
                    
                    <button class="btn btn-primary" style="padding: 1rem; border-radius: 12px; background: #60a5fa; border:none; display:flex; align-items:center; justify-content:center; gap:10px; font-weight:700;" 
                        onclick="app.closeModal(); app.sendExternalNotification(${clientId}, '${topic}', 'email')">
                        <i class="fas fa-envelope" style="font-size:1.2rem;"></i> Enviar via E-mail
                    </button>
                    
                    <button class="btn btn-ghost" style="padding: 1rem; font-weight:600; color:var(--text-muted);" onclick="app.closeModal()">
                        Não notificar agora
                    </button>
                </div>
            </div>
        `, '400px');
    }

    sendExternalNotification(clientId, topic, type) {
        const c = this.state.clients.find(cl => cl.id == clientId);
        if (!c) return;

        const appUrl = "https://kandalspahealthclub.github.io/KandalGym/";
        const message = `Olá ${c.name}, o seu professor atualizou o seu ${topic} no KandalGym! Aceda aqui para ver: ${appUrl}`;

        if (type === 'whatsapp') {
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
            window.location.href = mailUrl;
        }
    }


    // --- SISTEMA DE PLANOS PRÉ-DEFINIDOS ---

    renderPredefinedPlans(container) {
        const plans = Object.entries(this.state.predefinedPlans || {}).map(([id, plan]) => ({ id, ...plan }));
        const isMobile = window.innerWidth <= 768;

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:${isMobile ? '1rem' : '2rem'}; flex-wrap:wrap; gap:1rem;">
                <h2 style="margin:0; font-size:${isMobile ? '1.2rem' : '1.5rem'};"><i class="fas fa-copy" style="color:var(--primary); margin-right:10px;"></i> Modelos</h2>
                <button class="btn btn-primary" onclick="app.startNewPredefinedPlan()" style="${isMobile ? 'padding: 8px 12px; font-size: 0.85rem;' : ''}">
                    <i class="fas fa-plus"></i> Novo Modelo
                </button>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(${isMobile ? '150px' : '300px'}, 1fr)); gap:${isMobile ? '0.75rem' : '1.5rem'};">
                ${plans.length === 0 ? `
                    <div class="glass-panel" style="grid-column: 1/-1; padding:3rem; text-align:center;">
                        <i class="fas fa-info-circle" style="font-size:3rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                        <p style="color:var(--text-muted);">Ainda não existem planos pré-definidos.</p>
                    </div>
                ` : plans.map(plan => `
                    <div class="glass-card animate-scale-in" style="padding:${isMobile ? '1rem' : '1.5rem'}; display:flex; flex-direction:column; gap:${isMobile ? '0.5rem' : '1rem'}; border-top: 3px solid var(--primary); height: 100%;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <h3 style="margin:0; font-size:${isMobile ? '1rem' : '1.2rem'}; color:#fff; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${plan.name}</h3>
                            <div style="display:flex; gap:0.25rem;">
                                <button class="btn btn-ghost" style="color:var(--primary); padding:4px;" onclick="app.editPredefinedPlan('${plan.id}')" title="Editar">
                                    <i class="fas fa-edit" style="font-size:${isMobile ? '0.85rem' : '1rem'};"></i>
                                </button>
                                <button class="btn btn-ghost" style="color:var(--danger); padding:4px;" onclick="app.deletePredefinedPlan('${plan.id}')" title="Eliminar">
                                    <i class="fas fa-trash-alt" style="font-size:${isMobile ? '0.85rem' : '1rem'};"></i>
                                </button>
                            </div>
                        </div>
                        <div style="color:var(--text-muted); font-size:${isMobile ? '0.75rem' : '0.9rem'}; flex:1;">
                            <p style="margin:0;"><i class="fas fa-calendar-day" style="width:16px; color:var(--primary);"></i> <strong>${plan.days ? plan.days.length : 0}</strong> Dias</p>
                            <p style="margin:0;"><i class="fas fa-dumbbell" style="width:16px; color:var(--primary);"></i> <strong>${(plan.days || []).reduce((acc, d) => acc + (d.exercises ? d.exercises.length : 0), 0)}</strong> Ex.</p>
                        </div>
                        <div style="margin-top:${isMobile ? '0.5rem' : '1rem'}; padding-top:${isMobile ? '0.5rem' : '1rem'}; border-top: 1px solid rgba(255,255,255,0.05);">
                            <button class="btn btn-secondary btn-sm" style="width:100%; justify-content:center; font-size:${isMobile ? '0.75rem' : '0.85rem'}; padding: 6px;" onclick="app.applyPredefinedPlanToClientModal('${plan.id}')">
                                <i class="fas fa-user-plus"></i> Atribuir
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    startNewPredefinedPlan() {
        this.editingPredefinedId = null;
        this.editingPlan = [{ title: 'Treino A', exercises: [] }];
        this.editingDayIdx = 0;
        this.editingPredefinedName = '';
        this.setView('edit_predefined_plan');
    }

    editPredefinedPlan(id) {
        const plan = this.state.predefinedPlans[id];
        if (!plan) return alert('Plano não encontrado.');

        this.editingPredefinedId = id;
        this.editingPlan = JSON.parse(JSON.stringify(plan.days || []));
        this.editingPredefinedName = plan.name || '';
        this.editingDayIdx = 0;
        this.setView('edit_predefined_plan');
    }

    deletePredefinedPlan(id) {
        if (confirm('Tem a certeza que deseja eliminar este plano modelo?')) {
            delete this.state.predefinedPlans[id];
            this.saveState();
            this.renderContent();
            this.showToast('Plano modelo eliminado.', 'success');
        }
    }

    renderPredefinedPlanEditor() {
        const container = document.getElementById('main-content');
        if (!container) return;

        if (this.editingDayIdx >= this.editingPlan.length) this.editingDayIdx = 0;
        const currentDay = this.editingPlan[this.editingDayIdx];
        const isMobile = window.innerWidth <= 768;

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:${isMobile ? '0.75rem' : '1.5rem'}; flex-wrap:wrap; gap:1rem;">
                <h2 style="margin:0; font-size:${isMobile ? '1.2rem' : '1.5rem'};">${this.editingPredefinedId ? 'Editar Modelo' : 'Novo Modelo'}</h2>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <button class="btn btn-secondary" onclick="app.setView('predefined_plans')" style="${isMobile ? 'padding: 6px 12px; font-size: 0.8rem;' : ''}">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.savePredefinedPlan()" style="${isMobile ? 'padding: 6px 12px; font-size: 0.8rem;' : ''}"><i class="fas fa-save"></i> Guardar</button>
                </div>
            </div>

            <div class="glass-panel" style="margin-bottom:${isMobile ? '0.75rem' : '1.5rem'}; padding:${isMobile ? '0.75rem' : '1.5rem'};">
                <label style="display:block; font-size:0.7rem; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase; font-weight:700;">Nome do Plano</label>
                <input type="text" id="edit-predefined-name" value="${this.editingPredefinedName || ''}" 
                    placeholder="Ex: Hipertrofia..."
                    oninput="app.editingPredefinedName = this.value"
                    style="width:100%; max-width:500px; height:${isMobile ? '38px' : '45px'}; background:rgba(0,0,0,0.4); color:#fff; border:1px solid var(--surface-border); border-radius:10px; padding:0 12px; font-size:${isMobile ? '0.95rem' : '1.1rem'}; font-weight:600;">
            </div>

            <div id="editor-tabs-container" style="display:flex; gap:0.5rem; margin-bottom:${isMobile ? '1rem' : '2rem'}; flex-wrap:wrap; background:rgba(255,255,255,0.03); padding:${isMobile ? '8px' : '12px'}; border-radius:15px; border:1px solid rgba(255,255,255,0.05);">
                ${this.editingPlan.map((day, dIdx) => `
                    <div style="display:flex; align-items:center; gap:4px;">
                        <button class="btn ${this.editingDayIdx === dIdx ? 'btn-primary' : 'btn-ghost'}" 
                            onclick="app.editingDayIdx = ${dIdx}; app.renderPredefinedPlanEditor();"
                            style="padding:${isMobile ? '6px 10px' : '10px 18px'}; font-size:${isMobile ? '0.8rem' : '0.95rem'}; border-radius:10px; display:flex; align-items:center; gap:${isMobile ? '4px' : '10px'}; min-width:${isMobile ? '80px' : '140px'}; justify-content:center;">
                            <span style="font-weight:700;">${day.title || 'Plano ' + String.fromCharCode(65 + dIdx)}</span>
                            <span style="opacity:0.6; font-size:0.75rem;">(${day.exercises.length})</span>
                        </button>
                    </div>
                `).join('')}
                <button class="btn btn-ghost" onclick="app.addPredefinedTrainingDay()" 
                    style="color:var(--accent); border:2px dashed rgba(var(--accent-rgb), 0.3); padding:${isMobile ? '6px 10px' : '8px 18px'}; border-radius:10px; font-size:${isMobile ? '0.8rem' : '0.9rem'}; font-weight:700;">
                    <i class="fas fa-plus-circle"></i> Novo
                </button>
            </div>

            <div id="editor-days-container">
                <div class="glass-panel" style="padding:${isMobile ? '1rem' : '1.5rem'}; margin-bottom:3rem; border-top: 4px solid var(--primary);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                        <input type="text" value="${currentDay.title || 'Plano ' + String.fromCharCode(65 + this.editingDayIdx)}" 
                            placeholder="Nome do Plano..."
                            oninput="app.editingPlan[${this.editingDayIdx}].title = this.value"
                            onchange="app.renderPredefinedPlanEditor()"
                            style="font-weight:800; font-size:${isMobile ? '1.1rem' : '1.3rem'}; background:transparent; border:none; border-bottom:2px solid var(--primary); width:100%; max-width:250px; padding:4px 0; color:#fff; outline:none;">
                        
                        <div style="display:flex; gap:0.5rem; align-items:center;">
                            <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.05); padding:5px 12px; border-radius:10px;">
                                <label style="font-size:0.7rem; color:var(--text-muted);">Descanso:</label>
                                <input type="text" value="${currentDay.rest || ''}" placeholder="60s" 
                                    onchange="app.editingPlan[${this.editingDayIdx}].rest = this.value"
                                    style="width:50px; height:28px; background:rgba(0,0,0,0.3); color:var(--accent); border:1px solid rgba(var(--accent-rgb), 0.3); border-radius:6px; text-align:center; font-size:0.8rem;">
                            </div>
                            <button class="btn btn-ghost btn-sm" style="color:var(--danger); padding:4px;" onclick="app.removePredefinedTrainingDay(${this.editingDayIdx})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>

                    <div id="day-${this.editingDayIdx}-exercises">
                        ${currentDay.exercises.map((ex, eIdx) => `
                            <div class="glass-card" style="padding:${isMobile ? '0.75rem' : '1.2rem'}; margin-bottom:0.75rem; background:rgba(255,255,255,0.02); border-left:3px solid var(--secondary);">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:${isMobile ? '0.75rem' : '1rem'};">
                                    <button class="btn btn-secondary btn-sm" onclick="app.showExerciseSelectionModal(${this.editingDayIdx}, ${eIdx})" 
                                        style="flex:1; text-align:left; justify-content:flex-start; font-size:${isMobile ? '0.8rem' : '0.9rem'}; padding: 6px 10px;">
                                        <i class="fas fa-search"></i> <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${ex.name || "-- Selecionar --"}</span>
                                    </button>
                                    <div style="display:flex; gap:0.1rem; margin-left:0.5rem;">
                                        <button class="btn btn-ghost btn-sm" onclick="app.movePredefinedExercise(${this.editingDayIdx}, ${eIdx}, -1)" ${eIdx === 0 ? "disabled" : ""} style="padding:4px;"><i class="fas fa-arrow-up" style="font-size:0.8rem;"></i></button>
                                        <button class="btn btn-ghost btn-sm" onclick="app.movePredefinedExercise(${this.editingDayIdx}, ${eIdx}, 1)" ${eIdx === currentDay.exercises.length - 1 ? "disabled" : ""} style="padding:4px;"><i class="fas fa-arrow-down" style="font-size:0.8rem;"></i></button>
                                        <button class="btn btn-ghost btn-sm" style="color:var(--danger); padding:4px;" onclick="app.removePredefinedExercise(${this.editingDayIdx}, ${eIdx})"><i class="fas fa-trash-alt" style="font-size:0.8rem;"></i></button>
                                    </div>
                                </div>
                                <div style="display:flex; flex-wrap:wrap; gap:${isMobile ? '5px' : '10px'};">
                                    <div style="width:${isMobile ? '50px' : '80px'};">
                                        <label style="display:block; font-size:0.65rem; color:var(--text-muted); margin-bottom:2px;">Sets</label>
                                        <input type="text" value="${ex.sets || ""}" onchange="app.editingPlan[${this.editingDayIdx}].exercises[${eIdx}].sets = this.value"
                                            style="width:100%; height:32px; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:6px; text-align:center; font-size:0.85rem;">
                                    </div>
                                    <div style="width:${isMobile ? '60px' : '100px'};">
                                        <label style="display:block; font-size:0.65rem; color:var(--text-muted); margin-bottom:2px;">Reps</label>
                                        <input type="text" value="${ex.reps || ""}" onchange="app.editingPlan[${this.editingDayIdx}].exercises[${eIdx}].reps = this.value"
                                            style="width:100%; height:32px; background:rgba(0,0,0,0.3); color:#fff; border:1px solid var(--primary); border-radius:6px; text-align:center; font-size:0.85rem;">
                                    </div>
                                    <div style="flex:1; min-width:${isMobile ? '100px' : '150px'};">
                                        <label style="display:block; font-size:0.65rem; color:var(--text-muted); margin-bottom:2px;">Obs</label>
                                        <input type="text" value="${ex.observations || ""}" onchange="app.editingPlan[${this.editingDayIdx}].exercises[${eIdx}].observations = this.value"
                                            style="width:100%; height:32px; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:0 8px; font-size:0.85rem;">
                                    </div>
                                </div>
                            </div>
                        `).join("")}
                    </div>
                    
                    <button class="btn btn-ghost btn-sm" style="color:var(--primary); margin-top:0.5rem; font-size:0.8rem;" onclick="app.addExerciseToPredefinedEditor(${this.editingDayIdx})">
                        <i class="fas fa-plus"></i> Adicionar Exercício
                    </button>
                </div>
            </div>
        `;
    }

    addPredefinedTrainingDay() {
        this.editingPlan.push({ title: '', exercises: [] });
        this.editingDayIdx = this.editingPlan.length - 1;
        this.renderPredefinedPlanEditor();
    }

    removePredefinedTrainingDay(idx) {
        if (this.editingPlan.length <= 1) return alert('O modelo deve ter pelo menos um dia.');
        if (confirm('Remover este dia do modelo?')) {
            this.editingPlan.splice(idx, 1);
            this.editingDayIdx = Math.max(0, idx - 1);
            this.renderPredefinedPlanEditor();
        }
    }

    addExerciseToPredefinedEditor(dayIdx) {
        this.editingPlan[dayIdx].exercises.push({ id: '', name: '', sets: '', reps: '', observations: '' });
        this.renderPredefinedPlanEditor();
    }

    removePredefinedExercise(dayIdx, exIdx) {
        this.editingPlan[dayIdx].exercises.splice(exIdx, 1);
        this.renderPredefinedPlanEditor();
    }

    movePredefinedExercise(dayIdx, exIdx, dir) {
        const exs = this.editingPlan[dayIdx].exercises;
        const target = exIdx + dir;
        if (target >= 0 && target < exs.length) {
            [exs[exIdx], exs[target]] = [exs[target], exs[exIdx]];
            this.renderPredefinedPlanEditor();
        }
    }

    savePredefinedPlan() {
        const name = this.editingPredefinedName ? this.editingPredefinedName.trim() : '';
        if (!name) return alert('Por favor, dê um nome ao plano modelo.');

        const cleanDays = this.editingPlan.map(day => ({
            ...day,
            exercises: day.exercises.filter(ex => ex.id)
        })).filter(day => day.exercises.length > 0 || this.editingPlan.length === 1);

        const id = this.editingPredefinedId || Date.now().toString();

        this.state.predefinedPlans[id] = {
            name: name,
            days: cleanDays,
            updatedAt: new Date().toLocaleDateString('pt-PT')
        };

        this.saveState();
        this.setView('predefined_plans');
        this.showToast('Plano modelo guardado com sucesso!', 'success');
    }

    applyPredefinedPlanToClientModal(planId) {
        const plan = this.state.predefinedPlans[planId];
        const clients = (this.state.clients || []).sort((a, b) => a.name.localeCompare(b.name));

        let clientOptions = clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        const content = `
            <h3>Atribuir Plano Modelo</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">
                Está prestes a aplicar o plano <strong>"${plan.name}"</strong> a um aluno. 
                Isto irá sobrescrever o plano de treino atual do aluno selecionado.
            </p>
            
            <div class="glass-panel" style="padding:1rem; margin-bottom:1.5rem;">
                <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Selecionar Aluno</label>
                <select id="apply-plan-client-select" class="search-bar" style="width:100% !important; padding-left:15px !important;">
                    <option value="">-- Selecione um Aluno --</option>
                    ${clientOptions}
                </select>
            </div>
            
            <div style="display:flex; gap:1rem; justify-content:flex-end;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancelar</button>
                <button class="btn btn-primary" onclick="app.applyPredefinedPlanToClient('${planId}')">Confirmar Atribuição</button>
            </div>
        `;
        this.showModal(content, '500px');
    }

    applyPredefinedPlanToClient(planId) {
        const clientId = document.getElementById('apply-plan-client-select').value;
        if (!clientId) return alert('Por favor, selecione um aluno.');

        const plan = this.state.predefinedPlans[planId];
        const client = this.state.clients.find(c => c.id == clientId);

        if (!confirm(`Confirmar atribuição do plano "${plan.name}" ao aluno ${client.name}?`)) return;

        const newPlan = {
            days: JSON.parse(JSON.stringify(plan.days)),
            author: this.currentUser.name,
            updatedAt: new Date().toLocaleDateString('pt-PT')
        };

        this.state.trainingPlans[clientId] = newPlan;

        this.addAppNotification(clientId, 'Novo Plano de Treino!', `O seu professor atribuiu-lhe o plano: ${plan.name}`);

        this.saveState();
        this.closeModal();
        this.showToast(`Plano atribuído a ${client.name}!`, 'success');

        this.askNotificationMethod(clientId, 'Novo Plano de Treino (' + plan.name + ')');
    }

    showLoadPredefinedPlanModal() {
        const plans = Object.entries(this.state.predefinedPlans || {}).map(([id, plan]) => ({ id, ...plan }));

        if (plans.length === 0) {
            return alert('Ainda não criou nenhum plano modelo. Vá à aba "Planos Pré-Definidos" para criar um.');
        }

        const content = `
            <h3>Carregar Plano Modelo</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">
                Escolha um modelo para aplicar a este aluno. 
                <strong>Atenção:</strong> Isto irá substituir o rascunho atual que está a editar.
            </p>
            
            <div style="display:grid; grid-template-columns:1fr; gap:0.75rem; max-height:400px; overflow-y:auto; padding:5px;">
                ${plans.map(plan => `
                    <button class="glass-card" onclick="app.loadPredefinedPlanIntoEditor('${plan.id}')" 
                        style="text-align:left; padding:1rem; cursor:pointer; border:1px solid rgba(255,255,255,0.05); transition:all 0.2s ease; width: 100%;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="color:var(--primary);">${plan.name}</strong>
                            <span style="font-size:0.8rem; color:var(--text-muted);">${plan.days.length} Dias</span>
                        </div>
                    </button>
                `).join('')}
            </div>
            
            <div style="display:flex; justify-content:flex-end; margin-top:1.5rem;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancelar</button>
            </div>
        `;
        this.showModal(content, '500px');
    }

    loadPredefinedPlanIntoEditor(planId) {
        const plan = this.state.predefinedPlans[planId];
        if (!plan) return;

        if (!confirm(`Deseja carregar o modelo "${plan.name}"? Isto substituirá o treino que está a editar.`)) return;

        this.editingPlan = JSON.parse(JSON.stringify(plan.days));
        this.editingDayIdx = 0;
        this.closeModal();
        this.renderTrainingEditor();
        this.showToast('Modelo carregado com sucesso!');
    }

    // --- GESTÃO DE RECEITAS ---

    renderRecipes(container) {
        const recipes = this.state.recipes || [];
        const isMobile = window.innerWidth <= 768;

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                <h2 style="margin:0; font-size:${isMobile ? '1.2rem' : '1.5rem'};"><i class="fas fa-utensils" style="color:var(--primary); margin-right:10px;"></i> Receitas</h2>
                <button class="btn btn-primary btn-sm" onclick="app.startNewRecipe()" style="${isMobile ? 'padding:6px 12px; font-size:0.8rem;' : ''}">
                    <i class="fas fa-plus"></i> Nova Receita
                </button>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(${isMobile ? '160px' : '260px'}, 1fr)); gap:${isMobile ? '0.75rem' : '1.5rem'};">
                ${recipes.length === 0 ? `
                    <div class="glass-panel" style="grid-column: 1/-1; padding:3rem; text-align:center;">
                        <i class="fas fa-utensils" style="font-size:2.5rem; color:var(--text-muted); margin-bottom:1rem;"></i>
                        <p style="color:var(--text-muted);">Ainda não existem receitas.</p>
                    </div>
                ` : recipes.map(recipe => {
            const videoId = this.extractYoutubeId(recipe.videoUrl);
            const thumb = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;

            return `
                    <div class="glass-card animate-scale-in" style="overflow:hidden; display:flex; flex-direction:column; height:100%; border-top: 3px solid var(--primary);">
                        ${thumb ? `
                            <div style="width:100%; height:${isMobile ? '100px' : '140px'}; background:url('${thumb}') center/cover; position:relative;">
                                <div style="position:absolute; inset:0; background:rgba(0,0,0,0.2); display:flex; align-items:center; justify-content:center;">
                                    <i class="fab fa-youtube" style="font-size:${isMobile ? '1.5rem' : '2.5rem'}; color:red; opacity:0.8;"></i>
                                </div>
                            </div>
                        ` : `
                            <div style="width:100%; height:${isMobile ? '60px' : '80px'}; background:rgba(255,255,255,0.03); display:flex; align-items:center; justify-content:center;">
                                <i class="fas fa-utensils" style="font-size:${isMobile ? '1.2rem' : '1.5rem'}; color:var(--text-muted);"></i>
                            </div>
                        `}
                        <div style="padding:${isMobile ? '0.75rem' : '1.2rem'}; flex:1; display:flex; flex-direction:column; gap:0.5rem;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                <h3 style="margin:0; font-size:${isMobile ? '0.9rem' : '1.1rem'}; color:#fff; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${recipe.name}</h3>
                                <div style="display:flex; gap:2px;">
                                    <button class="btn btn-ghost btn-sm" onclick="app.editRecipe('${recipe.id}')" style="color:var(--primary); padding:3px;"><i class="fas fa-edit" style="font-size:0.8rem;"></i></button>
                                    <button class="btn btn-ghost btn-sm" onclick="app.deleteRecipe('${recipe.id}')" style="color:var(--danger); padding:3px;"><i class="fas fa-trash-alt" style="font-size:0.8rem;"></i></button>
                                </div>
                            </div>
                            <div style="margin-top:auto; padding-top:0.75rem; display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05);">
                                <span style="font-size:${isMobile ? '0.65rem' : '0.75rem'}; color:var(--accent); font-weight:700;">
                                    <i class="fas fa-mortar-pestle"></i> ${recipe.ingredients ? recipe.ingredients.length : 0} Ing.
                                </span>
                                ${recipe.videoUrl ? `
                                    <a href="${recipe.videoUrl}" target="_blank" style="color:red; font-size:${isMobile ? '0.75rem' : '0.85rem'}; text-decoration:none; font-weight:bold;">
                                        <i class="fab fa-youtube"></i> Vídeo
                                    </a>
                                ` : ''}
                            </div>
                            ${recipe.ingredients && recipe.ingredients.length > 0 ? `
                                <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-top: 0.5rem; background: rgba(0,0,0,0.2); padding: 5px 8px; border-radius: 6px;">
                                    ${recipe.ingredients.slice(0, 3).map(i => `${i.name} (${i.amount || 'qtd.'})`).join(', ')}${recipe.ingredients.length > 3 ? '...' : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `}).join('')}
            </div>
        `;
    }

    startNewRecipe() {
        this.editingRecipeId = null;
        this.editingRecipeData = {
            name: '',
            description: '',
            videoUrl: '',
            ingredients: []
        };
        this.setView('edit_recipe');
    }

    editRecipe(id) {
        const recipe = this.state.recipes.find(r => r.id === id);
        if (!recipe) return;
        this.editingRecipeId = id;
        this.editingRecipeData = JSON.parse(JSON.stringify(recipe));
        this.setView('edit_recipe');
    }

    deleteRecipe(id) {
        if (!confirm('Deseja eliminar esta receita permanentemente?')) return;
        this.state.recipes = this.state.recipes.filter(r => r.id !== id);
        this.saveState();
        this.renderRecipes(document.getElementById('main-content'));
        this.showToast('Receita eliminada.', 'success');
    }

    renderRecipeEditor() {
        const container = document.getElementById('main-content');
        if (!container) return;
        const isMobile = window.innerWidth <= 768;
        const recipe = this.editingRecipeData;

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                <h2 style="margin:0;">${this.editingRecipeId ? 'Editar Receita' : 'Nova Receita'}</h2>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <button class="btn btn-secondary" onclick="app.setView('recipes')">Cancelar</button>
                    <button class="btn btn-primary" onclick="app.saveRecipe()"><i class="fas fa-save"></i> Guardar Receita</button>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:${isMobile ? '1fr' : '1.5fr 1fr'}; gap:1.5rem; align-items:start;">
                
                <div class="glass-panel" style="padding:1.5rem; display:flex; flex-direction:column; gap:1.5rem;">
                    <div>
                        <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase; font-weight:700;">Nome da Receita</label>
                        <input type="text" id="recipe-name" value="${recipe.name || ''}" 
                            placeholder="Ex: Panquecas de Aveia e Banana..."
                            oninput="app.editingRecipeData.name = this.value"
                            style="width:100%; height:45px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid var(--surface-border); border-radius:10px; padding:0 15px; font-size:1.1rem; font-weight:600;">
                    </div>

                    <div>
                        <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase; font-weight:700;">Instruções / Descrição</label>
                        <textarea id="recipe-description" rows="10" 
                            placeholder="Descreva o passo-a-passo da receita..."
                            oninput="app.editingRecipeData.description = this.value"
                            style="width:100%; background:rgba(0,0,0,0.4); color:#fff; border:1px solid var(--surface-border); border-radius:10px; padding:15px; font-size:1rem; line-height:1.6; resize:vertical;">${recipe.description || ''}</textarea>
                    </div>

                    <div>
                        <label style="display:block; font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase; font-weight:700;">Link Vídeo YouTube (Opcional)</label>
                        <div style="display:flex; gap:10px;">
                            <div style="flex:1; position:relative;">
                                <i class="fab fa-youtube" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:red;"></i>
                                <input type="text" id="recipe-video" value="${recipe.videoUrl || ''}" 
                                    placeholder="https://www.youtube.com/watch?v=..."
                                    oninput="app.editingRecipeData.videoUrl = this.value; app.updateRecipePreview();"
                                    style="width:100%; height:40px; background:rgba(0,0,0,0.4); color:#fff; border:1px solid var(--surface-border); border-radius:10px; padding:0 15px 0 35px; font-size:0.9rem;">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="glass-panel" style="padding:1.5rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.2rem;">
                        <h3 style="margin:0; font-size:1.1rem;"><i class="fas fa-shopping-basket" style="color:var(--accent);"></i> Ingredientes</h3>
                        <button class="btn btn-ghost btn-sm" onclick="app.addIngredientToRecipe()" style="color:var(--primary); font-weight:bold;">
                            <i class="fas fa-plus"></i> Adicionar
                        </button>
                    </div>

                    <div id="recipe-ingredients-list" style="display:flex; flex-direction:column; gap:10px;">
                        ${(recipe.ingredients || []).length === 0 ? `
                            <p style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:1rem; border:1px dashed rgba(255,255,255,0.1); border-radius:10px;">Ainda não adicionou ingredientes.</p>
                        ` : recipe.ingredients.map((ing, idx) => `
                            <div class="glass-card" style="padding:10px; display:flex; flex-direction:column; gap:8px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05);">
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <button class="btn btn-secondary btn-sm" onclick="app.showFoodSelectionForRecipe(${idx})" style="flex:1; text-align:left; justify-content:flex-start; height:32px; font-size:0.8rem;">
                                        <i class="fas fa-search"></i> ${ing.name || '-- Selecionar Alimento --'}
                                    </button>
                                    <button class="btn btn-ghost btn-sm" style="color:var(--danger); padding:5px;" onclick="app.removeIngredientFromRecipe(${idx})"><i class="fas fa-trash"></i></button>
                                </div>
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <div style="flex:1;">
                                        <input type="text" placeholder="Qtd (ex: 100g, 2 colheres...)" value="${ing.amount || ''}" 
                                            oninput="app.editingRecipeData.ingredients[${idx}].amount = this.value"
                                            style="width:100%; height:28px; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:0 8px; font-size:0.75rem;">
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

            </div>
        `;
    }

    addIngredientToRecipe() {
        if (!this.editingRecipeData.ingredients) this.editingRecipeData.ingredients = [];
        this.editingRecipeData.ingredients.push({ id: '', name: '', amount: '' });
        this.renderRecipeEditor();
    }

    removeIngredientFromRecipe(idx) {
        this.editingRecipeData.ingredients.splice(idx, 1);
        this.renderRecipeEditor();
    }

    showFoodSelectionForRecipe(ingIdx) {
        this.currentRecipeIngredientIdx = ingIdx;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:700px; max-height:80vh; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                    <h2 style="margin:0;"><i class="fas fa-search"></i> Selecionar para Receita</h2>
                    <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()" style="padding:8px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="search-container" style="margin-bottom:1.5rem;">
                    <i class="fas fa-search"></i>
                    <input type="text" id="recipe-food-search" placeholder="Pesquisar alimento..." 
                        oninput="app.filterFoodsForRecipe(this.value)"
                        class="search-bar" autofocus>
                </div>
                <div id="recipe-food-grid" style="overflow-y:auto; flex:1;">
                    ${this.renderFoodGridForRecipe()}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    filterFoodsForRecipe(query) {
        const grid = document.getElementById('recipe-food-grid');
        if (grid) grid.innerHTML = this.renderFoodGridForRecipe(query);
    }

    renderFoodGridForRecipe(query = '') {
        let foods = [...this.state.foods].sort((a, b) => a.name.localeCompare(b.name));
        if (query) {
            const q = this.normalizeText(query);
            foods = foods.filter(f => this.normalizeText(f.name).includes(q) || (f.category && this.normalizeText(f.category).includes(q)));
        }
        if (foods.length === 0) return `<p style="text-align:center; padding:2rem; color:var(--text-muted);">Nenhum alimento encontrado.</p>`;

        return `
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:10px;">
                ${foods.map(f => `
                    <div class="glass-card" onclick="app.selectFoodForRecipe('${f.id}', '${f.name.replace(/'/g, "\\'")}')" 
                        style="padding:12px; cursor:pointer; text-align:center; border:1px solid transparent; transition:all 0.2s;"
                        onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='transparent'">
                        <div style="font-size:2rem; margin-bottom:5px;">${this.getFoodEmoji(f.category)}</div>
                        <div style="font-size:0.85rem; font-weight:bold; color:#fff;">${f.name}</div>
                        <div style="font-size:0.7rem; color:var(--text-muted);">${f.kcal || 0} kcal/100g</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    selectFoodForRecipe(foodId, foodName) {
        const ingIdx = this.currentRecipeIngredientIdx;
        this.editingRecipeData.ingredients[ingIdx].id = foodId;
        this.editingRecipeData.ingredients[ingIdx].name = foodName;
        this.closeModal();
        this.renderRecipeEditor();
    }

    saveRecipe() {
        const data = this.editingRecipeData;
        if (!data.name.trim()) return alert('Por favor, dê um nome à receita.');

        const id = this.editingRecipeId || Date.now().toString();
        const newRecipe = {
            id,
            name: data.name.trim(),
            description: data.description.trim(),
            videoUrl: data.videoUrl.trim(),
            ingredients: (data.ingredients || []).filter(ing => ing.name),
            updatedAt: new Date().toLocaleDateString('pt-PT')
        };

        const idx = this.state.recipes.findIndex(r => r.id === id);
        if (idx !== -1) {
            this.state.recipes[idx] = newRecipe;
        } else {
            this.state.recipes.push(newRecipe);
        }

        this.saveState();
        this.setView('recipes');
        this.showToast('Receita guardada com sucesso!', 'success');
    }

    extractYoutubeId(url) {
        if (!url) return null;
        // Adicionado suporte para /shorts/
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    updateRecipePreview() {
        // Apenas para refrescar a UI se necessário, o render já lida com isso se for re-chamado
        // Mas como estamos a usar oninput directo nos dados, o renderEditor vai mostrar o link.
    }

    // --- INTEGRAÇÃO RECEITAS NO PLANO ALIMENTAR ---

    showRecipeSelectionForMeal(mealIdx) {
        this.currentMealIdxForRecipe = mealIdx;
        const recipes = this.state.recipes || [];
        const isMobile = window.innerWidth <= 768;

        const content = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2 style="margin:0;"><i class="fas fa-utensils"></i> Escolher Receita</h2>
                <button class="btn btn-ghost" onclick="app.closeModal()" style="padding:8px;"><i class="fas fa-times"></i></button>
            </div>
            <div style="max-height:60vh; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(${isMobile ? '140px' : '200px'}, 1fr)); gap:10px;">
                ${recipes.length === 0 ? `
                    <p style="grid-column:1/-1; text-align:center; padding:2rem; color:var(--text-muted);">Não existem receitas criadas.</p>
                ` : recipes.map(r => `
                    <div class="glass-card" onclick="app.addRecipeToMeal('${r.id}')" 
                        style="padding:12px; cursor:pointer; text-align:center; border:1px solid transparent; transition:all 0.2s;"
                        onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='transparent'">
                        <div style="font-size:1.5rem; margin-bottom:5px;">${this.extractYoutubeId(r.videoUrl) ? '<i class="fab fa-youtube" style="color:red;"></i>' : '<i class="fas fa-utensils" style="color:var(--primary);"></i>'}</div>
                        <div style="font-size:0.85rem; font-weight:bold; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${r.name}</div>
                        <div style="font-size:0.7rem; color:var(--text-muted);">${r.ingredients ? r.ingredients.length : 0} Ingredientes</div>
                    </div>
                `).join('')}
            </div>
        `;
        this.showModal(content, '600px');
    }

    addRecipeToMeal(recipeId) {
        const recipe = this.state.recipes.find(r => r.id === recipeId);
        if (!recipe) return;

        const mealIdx = this.currentMealIdxForRecipe;
        const macros = this.calculateRecipeMacros(recipe);

        let textToAdd = `\n--- RECEITA: ${recipe.name.toUpperCase()} ---\n`;

        if (macros.kcal > 0) {
            textToAdd += `(Valores: ${Math.round(macros.kcal)}kcal | ${Math.round(macros.prot)}g P | ${Math.round(macros.carb)}g C | ${Math.round(macros.fat)}g G)\n\n`;
        }

        textToAdd += `INGREDIENTES:\n`;
        if (recipe.ingredients && recipe.ingredients.length > 0) {
            recipe.ingredients.forEach(ing => {
                if (ing.name && ing.amount) {
                    textToAdd += `• ${ing.name}: ${ing.amount}\n`;
                } else if (ing.name) {
                    textToAdd += `• ${ing.name}\n`;
                }
            });
        }

        if (recipe.description) {
            textToAdd += `\nPREPARAÇÃO:\n${recipe.description}\n`;
        }

        if (recipe.videoUrl) {
            textToAdd += `\nVídeo Tutorial: ${recipe.videoUrl}\n`;
        }

        textToAdd += `----------------------------\n`;

        const currentItems = this.editingMeal.meals[mealIdx].items || '';
        this.editingMeal.meals[mealIdx].items = (currentItems.trim() ? currentItems.trim() + '\n' + textToAdd : textToAdd).trim();

        this.closeModal();
        this.renderMealEditor();
        this.showToast(`Receita "${recipe.name}" adicionada!`);
    }

    calculateRecipeMacros(recipe) {
        let total = { kcal: 0, prot: 0, carb: 0, fat: 0 };
        if (!recipe.ingredients) return total;

        recipe.ingredients.forEach(ing => {
            if (!ing.amount) return;

            // Tenta extrair numero e unidade do texto de dosagem (ex: "100g" ou "2 un")
            const match = ing.amount.match(/(\d+(?:\.\d+)?)\s*(g|ml|l|un|c\. sopa|c\. sobremesa|c\. cafe|fatia(?:\(s\))?|chavena|copo)/i);
            if (match) {
                const qty = parseFloat(match[1]);
                const unit = match[2].toLowerCase();

                const food = this.state.foods.find(f => f.id == ing.id || f.name.toLowerCase() === ing.name.toLowerCase());
                if (food) {
                    const unitWeights = { 'g': 1, 'ml': 1, 'l': 1000, 'un': food.portionWeight || 50, 'fatia(s)': 30, 'c. sopa': 15, 'c. sobremesa': 10, 'c. cafe': 5, 'chavena': 200, 'copo': 200 };
                    let weight = unitWeights[unit] || (unit.includes('fatia') ? 30 : 1);
                    const multiplier = (weight * qty) / 100;

                    total.kcal += (food.kcal || 0) * multiplier;
                    total.prot += (food.protein || 0) * multiplier;
                    total.carb += (food.carbs || 0) * multiplier;
                    total.fat += (food.fat || 0) * multiplier;
                }
            }
        });
        return total;
    }

    linkify(text) {
        if (!text) return '';
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" style="color:var(--primary); text-decoration:underline; font-weight:bold;">${url}</a>`;
        });
    }
}



window.app = new FitnessApp();
const app = window.app; // Mantem compatibilidade com referencias locais

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
                <button class="btn btn-primary" onclick="app.closeModal()" style="width: 100%; border-radius: 12px; padding: 0.9rem; font-size: 1rem; font-weight: 700; background: linear-gradient(135deg, var(--primary), var(--accent)); border: none; box-shadow: 0 4px 15px rgba(var(--primary-rgb), 0.4);">Entendido</button>
            </div>
        `);
    } else {
        window.originalAlert(msg);
    }
};

