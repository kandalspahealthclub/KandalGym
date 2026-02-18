---
description: Como enviar o projeto KandalGym para o GitHub
---

Este guia explica como colocar os seus ficheiros no GitHub para que o site fique online com **HTTPS** e a câmara funcione corretamente.

### 1. Criar o Repositório no GitHub
1. Vá a [github.com](https://github.com) e faça login.
2. Clique no botão **"+"** no topo direito e escolha **"New repository"**.
3. Nome do repositório: `kandalgym` (ou outro à escolha).
4. Deixe como **Public**.
5. **NÃO** marque as opções "Add a README", "Add .gitignore" ou "Choose a license".
6. Clique em **"Create repository"**.

### 2. Configurar o Git no seu Computador
Abra o seu terminal (Powershell ou CMD) na pasta do projeto e execute estes comandos:

// turbo
```powershell
# Inicializar o git
git init

# Adicionar todos os ficheiros (exceto os grandes como o backup zip)
git add .
git reset fitness-pro-backup-2026-02-18.zip

# Criar o primeiro registo
git commit -m "Primeiro envio KandalGym"

# Configurar o ramo principal
git branch -M main
```

### 3. Ligar ao GitHub e Enviar
No GitHub, após criar o repositório, verá um link que termina em `.git`. Copie esse link e use-o no comando abaixo:

```powershell
# Substitua o link abaixo pelo link que copiou do seu GitHub
git remote add origin https://github.com/SEU_UTILIZADOR/kandalgym.git

# Enviar os ficheiros (será pedido o login/token do GitHub)
git push -u origin main
```

### 4. Ativar o Site (GitHub Pages)
1. No seu repositório no GitHub, vá a **Settings** (topo).
2. No menu lateral, clique em **Pages**.
3. Em **Build and deployment** > **Source**, escolha **Deploy from a branch**.
4. Em **Branch**, escolha `main` e a pasta `/ (root)`. Clique em **Save**.
5. Aguarde 1 minuto e o seu link aparecerá no topo dessa página (ex: `https://utilizador.github.io/kandalgym/`).

---
**Nota:** O ficheiro `database.json` será enviado para o GitHub. Se este ficheiro contiver dados sensíveis, tenha em conta que o repositório é público. Para um sistema profissional de subscrição, no futuro seria ideal mover os dados para uma base de dados externa (Firebase/Supabase).
